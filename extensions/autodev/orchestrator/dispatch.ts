/**
 * Crew dispatch — issue → backgroundManager.spawn() for Nemo triage.
 *
 * For each new `autodev-request` issue, creates a Nemo triage session via
 * the background agent manager. Dedup is handled by the heartbeat (work-items
 * file check). This module handles the actual session creation and label
 * transitions.
 *
 * Dispatch rules are loaded from `~/.AutoDev/config/dispatch-rules.yaml` by
 * default, with a project-level `.autodev/config/dispatch-rules.yaml` file
 * override (file-level, not deep merge). Hardcoded defaults are used when
 * neither file exists.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getBackgroundManager } from "../background/index.js";
import type { ProjectEntry } from "./projects.js";
import { transitionLabel } from "./heartbeat.js";

// ---- Types ----

export interface DispatchConfig {
  readonly issueNumber: number;
  readonly title: string;
  readonly body: string;
  readonly project: ProjectEntry;
  readonly model?: string;
}

export interface DispatchResult {
  readonly taskId: string;
  readonly issueNumber: number;
  readonly project: string;
}

/** A single dispatch rule from dispatch-rules.yaml. */
export interface DispatchRule {
  readonly trigger: string;
  readonly from: string;
  readonly to: string;
  readonly condition: string;
  readonly evidence?: string | undefined;
  readonly route?: Record<string, string> | undefined;
}

/** Parsed dispatch-rules.yaml shape. */
export interface DispatchRulesConfig {
  readonly dispatch_rules: readonly DispatchRule[];
}

/**
 * Hardcoded default dispatch rules — used when neither central
 * `~/.AutoDev/config/dispatch-rules.yaml` nor project
 * `.autodev/config/dispatch-rules.yaml` exists. Mirrors the route table in
 * the immutable reference YAML so dispatch still routes correctly when no
 * config file is present.
 */
export const DEFAULT_DISPATCH_CONFIG: DispatchRulesConfig = {
  dispatch_rules: [
    { trigger: "triage_new_issue", from: "nemo", to: "aronnax OR ned_land", condition: "issue_exists AND scope_assessed", route: { simple: "ned_land", complicated: "aronnax", complex: "aronnax", chaotic: "watch_officer" } },
    { trigger: "plan_complete", from: "aronnax", to: "ned_land", condition: "plan_exists AND (debate_verdict == 'approved' OR debate_not_required)", evidence: ".autodev/plans/<slug>.md" },
    { trigger: "implementation_complete", from: "ned_land", to: "oracle", condition: "evidence_exists AND tests_pass", evidence: ".autodev/evidence/<date>-<slug>/" },
    { trigger: "review_clean", from: "oracle", to: "navigator", condition: "review_approved AND ci_green", evidence: "PR review comments" },
    { trigger: "deployment_verified", from: "navigator", to: "nemo", condition: "deployment_healthy", evidence: "deployment verification logs" },
    { trigger: "blocker_detected", from: "any", to: "watch_officer", condition: "NOT resolvable_by_current_agent", evidence: "blocker description" },
  ],
};

/**
 * Minimal YAML loader for dispatch-rules.yaml.
 *
 * The dispatch config is a flat `dispatch_rules:` list with per-item
 * `trigger`, `from`, `to`, `condition`, `evidence`, and `route` fields. This
 * focused parser reads exactly that shape and nothing more — a full YAML
 * parser is not a dependency of this repo.
 */
export function parseDispatchYaml(text: string): DispatchRulesConfig {
  const rules: DispatchRule[] = [];
  let inRules = false;
  let current: {
    trigger?: string;
    from?: string;
    to?: string;
    condition?: string;
    evidence?: string;
    route?: Record<string, string>;
  } | null = null;

  const flush = (): void => {
    if (current === null) return;
    if (current.trigger !== undefined) {
      rules.push({
        trigger: current.trigger,
        from: current.from ?? "",
        to: current.to ?? "",
        condition: current.condition ?? "",
        evidence: current.evidence,
        route: current.route,
      });
    }
    current = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    if (/^dispatch_rules:\s*$/.test(line)) {
      flush();
      inRules = true;
      continue;
    }
    // Other top-level sections (e.g. state_machine:) are ignored.
    if (/^[a-z_]+:\s*$/.test(line) && !/^\s/.test(line)) {
      flush();
      inRules = false;
      continue;
    }

    if (!inRules) continue;

    // New list item: "  - trigger: foo"
    const itemMatch = /^(\s*)-\s+trigger:\s*(\S+)\s*$/.exec(line);
    if (itemMatch !== null) {
      flush();
      current = { trigger: itemMatch[2] ?? "" };
      continue;
    }

    if (current !== null) {
      const fromMatch = /^\s+from:\s*"?([^"]*)"?\s*$/.exec(line);
      if (fromMatch !== null && fromMatch[1] !== undefined) {
        current.from = fromMatch[1];
        continue;
      }
      const toMatch = /^\s+to:\s*"?([^"]*)"?\s*$/.exec(line);
      if (toMatch !== null && toMatch[1] !== undefined) {
        current.to = toMatch[1];
        continue;
      }
      const condMatch = /^\s+condition:\s*"?(.*?)"?\s*$/.exec(line);
      if (condMatch !== null && condMatch[1] !== undefined) {
        current.condition = condMatch[1];
        continue;
      }
      const evMatch = /^\s+evidence:\s*"?([^"]*)"?\s*$/.exec(line);
      if (evMatch !== null && evMatch[1] !== undefined) {
        current.evidence = evMatch[1];
        continue;
      }
      // route: sub-map — collect key: value pairs until dedent.
      if (/^\s+route:\s*$/.test(line)) {
        if (current.route === undefined) current.route = {};
        continue;
      }
      const routeMatch = /^\s+([a-z_]+):\s*(\S+)\s*$/.exec(line);
      if (routeMatch !== null && routeMatch[1] !== undefined && routeMatch[2] !== undefined && current.route !== undefined) {
        current.route[routeMatch[1]] = routeMatch[2];
        continue;
      }
    }
  }
  flush();

  return { dispatch_rules: rules };
}

/**
 * Load dispatch rules with central-then-project-then-defaults resolution.
 *
 * Precedence (file-level override, NOT deep merge):
 *   1. Project  `<projectRoot>/.autodev/config/dispatch-rules.yaml`  (if present)
 *   2. Central  `~/.AutoDev/config/dispatch-rules.yaml`              (if present)
 *   3. Hardcoded `DEFAULT_DISPATCH_CONFIG`
 */
export function loadDispatchConfig(projectRoot: string): DispatchRulesConfig {
  const projectPath = resolve(projectRoot, ".autodev/config/dispatch-rules.yaml");
  if (existsSync(projectPath)) {
    return parseDispatchYaml(readFileSync(projectPath, "utf8"));
  }
  const centralPath = join(getAgentDir(), "..", "config", "dispatch-rules.yaml");
  if (existsSync(centralPath)) {
    return parseDispatchYaml(readFileSync(centralPath, "utf8"));
  }
  return DEFAULT_DISPATCH_CONFIG;
}

// ---- Dispatch ----

/**
 * Dispatch an issue to a Nemo triage session via the background manager.
 * Returns the background task ID.
 */
export async function dispatchIssue(config: DispatchConfig): Promise<string> {
  const manager = getBackgroundManager();

  const systemPrompt = buildNemoPrompt(config);

  const taskId = manager.spawn({
    model: config.model ?? "ollama-cloud/glm-5.2",
    systemPrompt,
    tools: ["read", "write", "edit", "bash", "grep", "find", "ls"],
    agentName: "nemo",
  });

  // Transition label from autodev-request to autodev-planned
  await transitionLabel(
    config.issueNumber,
    "autodev-request",
    "autodev-planned",
    config.project.path,
  );

  return taskId;
}

// ---- Prompt building ----

function buildNemoPrompt(config: DispatchConfig): string {
  return `You are Captain Nemo, commander of AutoDev — a self-sustaining engineering team.

## Task
Triage the following GitHub issue. Your job is to:
1. Classify the issue using the Cynefin framework: Simple / Complicated / Complex / Chaotic
2. Assess scope (small / medium / large)
3. Determine the route:
   - Simple → Ned Land (implementer) with task(category="quick")
   - Complicated → Aronnax (architect) for single-round plan, then Ned Land
   - Complex → Full 5-phase debate protocol, then Aronnax plans, then Ned Land
   - Chaotic → Watch Officer emergency response
4. Provide a brief triage summary

## Issue
**#${config.issueNumber} — ${config.title}**

${config.body}

## Response format
Respond with a JSON object:
{
  "classification": "simple|complicated|complex|chaotic",
  "scope": "small|medium|large",
  "route": "ned-land|aronnax|debate|watch-officer",
  "summary": "Brief triage summary"
}`;
}

// ---- Triage result parsing ----

export interface TriageResult {
  readonly classification: "simple" | "complicated" | "complex" | "chaotic";
  readonly scope: "small" | "medium" | "large";
  readonly route: "ned-land" | "aronnax" | "debate" | "watch-officer";
  readonly summary: string;
}

/**
 * Parse a triage result from a Nemo session's output.
 * Returns undefined if the output cannot be parsed.
 */
export function parseTriageResult(output: string): TriageResult | undefined {
  try {
    // Try to find a JSON block in the output
    const jsonMatch = output.match(/\{[\s\S]*"classification"[\s\S]*"summary"[\s\S]*\}/);
    if (jsonMatch === null) return undefined;
    const parsed = JSON.parse(jsonMatch[0]) as TriageResult;
    if (!["simple", "complicated", "complex", "chaotic"].includes(parsed.classification)) {
      return undefined;
    }
    if (!["small", "medium", "large"].includes(parsed.scope)) {
      return undefined;
    }
    if (!["ned-land", "aronnax", "debate", "watch-officer"].includes(parsed.route)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}
