/**
 * Hyperplan — 5 hostile critics cross-examine onboarding results.
 *
 * After the Harbor Master completes onboarding and writes the Harbor Log,
 * the hyperplan runs 5 independent critic sessions that each challenge the
 * crew's understanding from a distinct adversarial perspective. This catches
 * misinterpretations before they propagate into plans and code.
 *
 * The 5 critics:
 *   1. Scope Skeptic — did the crew misread what's in vs out of scope?
 *   2. Risk Hawk — did the crew underestimate what could go wrong?
 *   3. Tech Contrarian — are the tech stack assumptions unverified?
 *   4. Process Cynic — will the crew's workflow actually work here?
 *   5. User Proxy — did the crew actually listen to what the user said?
 *
 * Each critic receives the Harbor Log summary + conversation excerpts, writes
 * a critique, and posts it to the team mailbox. The lead (Nemo) synthesizes
 * the critiques into a verdict: pass, revise, or block. The verdict is
 * written to `.autodev/onboarding/hyperplan-verdict.md`.
 *
 * Dependency injection: the session spawner is injected so tests can
 * substitute mock sessions without the real pi SDK.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import * as teamStore from "../team-mode/store.js";
import type { ConversationEntry } from "./harbor-log.js";

export type HyperplanVerdict = "pass" | "revise" | "block";

export interface CriticResult {
  readonly criticId: string;
  readonly perspective: string;
  readonly critique: string;
  readonly severity: "info" | "warning" | "error";
  readonly verdict: "pass" | "revise" | "block";
}

export interface HyperplanResult {
  readonly verdict: HyperplanVerdict;
  readonly critiques: readonly CriticResult[];
  readonly summary: string;
  readonly verdictPath: string | null;
}

export interface SpawnCriticDeps {
  readonly prompt: (criticId: string, systemPrompt: string, userPrompt: string) => Promise<string>;
}

const CRITICS: ReadonlyArray<{ id: string; perspective: string; systemPrompt: string }> = [
  {
    id: "scope-skeptic",
    perspective: "Scope Skeptic",
    systemPrompt:
      "You are the Scope Skeptic. Your job is to find where the crew misunderstood what is in scope vs out of scope. " +
      "Read the onboarding transcript and find: (1) things the user asked for that the crew didn't capture, " +
      "(2) things the crew assumed are in scope that the user never mentioned, (3) scope boundaries that are ambiguous. " +
      "Be specific — cite exact quotes from the conversation. If the scope is clear and complete, say so.",
  },
  {
    id: "risk-hawk",
    perspective: "Risk Hawk",
    systemPrompt:
      "You are the Risk Hawk. Your job is to find risks the crew underestimated or missed entirely. " +
      "Read the onboarding transcript and find: (1) production-critical risks not discussed, " +
      "(2) data loss or security concerns glossed over, (3) operational risks (deployment, monitoring, rollback), " +
      "(4) dependencies on external systems that could fail. Be specific. If the risk assessment is adequate, say so.",
  },
  {
    id: "tech-contrarian",
    perspective: "Tech Contrarian",
    systemPrompt:
      "You are the Tech Contrarian. Your job is to challenge the technology choices and architecture assumptions. " +
      "Read the onboarding transcript and find: (1) tech stack choices made without justification, " +
      "(2) assumptions about framework capabilities that may be wrong, (3) integration assumptions that need verification, " +
      "(4) scaling or performance assumptions that are untested. Be specific. If the tech choices are sound, say so.",
  },
  {
    id: "process-cynic",
    perspective: "Process Cynic",
    systemPrompt:
      "You are the Process Cynic. Your job is to challenge the crew's workflow assumptions. " +
      "Read the onboarding transcript and find: (1) CI/CD assumptions that may not hold, " +
      "(2) review and approval processes that don't match the project's needs, " +
      "(3) deployment cadence assumptions that are unrealistic, (4) testing strategy gaps. " +
      "Be specific. If the process assumptions are reasonable, say so.",
  },
  {
    id: "user-proxy",
    perspective: "User Proxy",
    systemPrompt:
      "You are the User Proxy. Your job is to check whether the crew actually listened to the user. " +
      "Read the onboarding transcript and find: (1) things the user said that the crew didn't reflect back, " +
      "(2) questions the crew didn't ask that the user's answers implied, " +
      "(3) places where the crew projected its own assumptions instead of listening, " +
      "(4) tone or context clues the crew missed. Be specific — cite exact user quotes. " +
      "If the crew listened well, say so.",
  },
];

function buildUserPrompt(
  conversationLog: readonly ConversationEntry[],
  harborLogSummaryPath: string | null,
): string {
  const userMessages = conversationLog.filter((e) => e.role === "user");
  const assistantMessages = conversationLog.filter((e) => e.role === "assistant");
  const transcript = conversationLog
    .slice(-30)
    .map((e) => `[${e.role}]: ${e.content.slice(0, 500)}`)
    .join("\n\n");

  let summary = "";
  if (harborLogSummaryPath && existsSync(harborLogSummaryPath)) {
    try {
      summary = readFileSync(harborLogSummaryPath, "utf-8");
    } catch {
      summary = "(Could not read harbor log summary)";
    }
  }

  return [
    "## Onboarding Results to Critique",
    "",
    `**Conversation entries:** ${conversationLog.length} (${userMessages.length} user, ${assistantMessages.length} assistant)`,
    "",
    "### Harbor Log Summary",
    "```",
    summary || "(No summary available)",
    "```",
    "",
    "### Recent Transcript (last 30 messages, truncated)",
    "```",
    transcript,
    "```",
    "",
    "Write your critique now. Be specific and cite evidence from the conversation. " +
      "End with one of: PASS (no issues found), REVISE (issues need addressing), or BLOCK (critical misunderstanding).",
  ].join("\n");
}

function parseVerdict(critique: string): { severity: "info" | "warning" | "error"; verdict: "pass" | "revise" | "block" } {
  const upper = critique.toUpperCase();
  if (upper.includes("BLOCK")) {
    return { severity: "error", verdict: "block" };
  }
  if (upper.includes("REVISE")) {
    return { severity: "warning", verdict: "revise" };
  }
  return { severity: "info", verdict: "pass" };
}

function synthesizeVerdict(critiques: readonly CriticResult[]): HyperplanVerdict {
  const hasBlock = critiques.some((c) => c.verdict === "block");
  const hasRevise = critiques.some((c) => c.verdict === "revise");
  if (hasBlock) return "block";
  if (hasRevise) return "revise";
  return "pass";
}

function writeVerdict(
  projectRoot: string,
  result: HyperplanResult,
): string {
  const dir = resolve(projectRoot, ".autodev", "onboarding");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "hyperplan-verdict.md");

  const lines: string[] = [
    "# Hyperplan Verdict",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Verdict:** ${result.verdict.toUpperCase()}`,
    `**Critics:** ${result.critiques.length}`,
    "",
    "## Summary",
    "",
    result.summary,
    "",
    "---",
    "",
  ];

  for (const c of result.critiques) {
    lines.push(`## ${c.perspective} (${c.criticId})`);
    lines.push("");
    lines.push(`**Severity:** ${c.severity}`);
    lines.push("");
    lines.push(c.critique);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  writeFileSync(path, lines.join("\n"), "utf-8");
  return path;
}

export async function runHyperplan(
  projectRoot: string,
  conversationLog: readonly ConversationEntry[],
  deps: SpawnCriticDeps,
): Promise<HyperplanResult> {
  const harborLogSummaryPath = resolve(projectRoot, ".autodev", "memory", "harbor-log-summary.md");
  const userPrompt = buildUserPrompt(conversationLog, existsSync(harborLogSummaryPath) ? harborLogSummaryPath : null);

  const team = teamStore.createTeam({
    name: "hyperplan",
    purpose: "Post-onboarding hostile critic review",
    trigger: "onboarding",
    members: [{ role: "nemo" }, ...CRITICS.map((c) => ({ role: c.id }))],
  });

  const critiques: CriticResult[] = [];

  for (const critic of CRITICS) {
    try {
      const critiqueText = await deps.prompt(critic.id, critic.systemPrompt, userPrompt);
      const parsed = parseVerdict(critiqueText);
      const result: CriticResult = {
        criticId: critic.id,
        perspective: critic.perspective,
        critique: critiqueText,
        severity: parsed.severity,
        verdict: parsed.verdict,
      };
      critiques.push(result);
      teamStore.addMessage({
        teamRunId: team.id,
        from: critic.id,
        to: "nemo",
        content: `[${result.severity}] ${critic.perspective}:\n${critiqueText.slice(0, 500)}`,
        kind: result.severity === "error" ? "blocker" : result.severity === "warning" ? "flag" : "note",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      critiques.push({
        criticId: critic.id,
        perspective: critic.perspective,
        critique: `Critic session failed: ${msg}`,
        severity: "warning",
        verdict: "revise",
      });
    }
  }

  const verdict = synthesizeVerdict(critiques);
  const blockCount = critiques.filter((c) => c.severity === "error").length;
  const reviseCount = critiques.filter((c) => c.severity === "warning").length;
  const summary =
    verdict === "pass"
      ? `All ${critiques.length} critics passed. The crew's understanding of the project is sound.`
      : verdict === "revise"
        ? `${reviseCount} critic(s) found issues requiring revision. The crew should address these before starting work.`
        : `${blockCount} critic(s) found critical misunderstandings. Onboarding should be revisited before any work begins.`;

  let verdictPath: string | null = null;
  try {
    verdictPath = writeVerdict(projectRoot, { verdict, critiques, summary, verdictPath: null });
  } catch {
    // Non-fatal — verdict is still returned in-memory
  }

  teamStore.deleteTeam(team.id);

  return { verdict, critiques, summary, verdictPath };
}

export function _resetHyperplanState(): void {
  // Test helper — team store has its own reset
}

export const CRITIC_IDS: readonly string[] = CRITICS.map((c) => c.id);