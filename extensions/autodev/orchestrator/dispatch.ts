/**
 * Crew dispatch — issue → backgroundManager.spawn() for Nemo triage.
 *
 * For each new `autodev-request` issue, creates a Nemo triage session via
 * the background agent manager. Dedup is handled by the heartbeat (work-items
 * file check). This module handles the actual session creation and label
 * transitions.
 */
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

// ---- Dispatch ----

/**
 * Dispatch an issue to a Nemo triage session via the background manager.
 * Returns the background task ID.
 */
export async function dispatchIssue(config: DispatchConfig): Promise<string> {
  const manager = getBackgroundManager();

  const systemPrompt = buildNemoPrompt(config);

  const taskId = manager.spawn({
    model: config.model ?? "ollama-cloud/glm-5.2:cloud",
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
