/**
 * Harbor Log writers — transcript + summary persistence.
 *
 * Called by `scripts/onboard.ts` after the onboarding session ends.
 * - `writeHarborLog(conversationLog)` → `.autodev/onboarding/harbor-log.md` (full transcript)
 * - `writeHarborLogSummary(conversationLog, coverage)` → `.autodev/memory/harbor-log-summary.md`
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** A single entry in the conversation log. */
export interface ConversationEntry {
  readonly role: string;
  readonly content: string;
  readonly timestamp: string;
}

/** Coverage result from analyzeCoverage(). */
export interface CoverageResult {
  readonly covered: readonly string[];
  readonly gaps: readonly string[];
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write the full onboarding transcript to `.autodev/onboarding/harbor-log.md`.
 * The full transcript lives outside `memory/` to avoid context bloat.
 */
export function writeHarborLog(
  projectRoot: string,
  log: readonly ConversationEntry[],
): string {
  const dir = resolve(projectRoot, ".autodev", "onboarding");
  ensureDir(dir);
  const path = resolve(dir, "harbor-log.md");

  const lines: string[] = [
    "# Harbor Log — Onboarding Transcript",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Entries:** ${log.length}`,
    "",
    "---",
    "",
  ];

  for (const entry of log) {
    lines.push(`### [${entry.role}] ${entry.timestamp}`);
    lines.push("");
    lines.push(entry.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  writeFileSync(path, lines.join("\n"), "utf-8");
  return path;
}

/**
 * Write the harbor log summary to `.autodev/memory/harbor-log-summary.md`.
 * This is what downstream agents read — project identity, constraints,
 * architecture snapshot, coverage status.
 */
export function writeHarborLogSummary(
  projectRoot: string,
  log: readonly ConversationEntry[],
  coverage: CoverageResult,
): string {
  const dir = resolve(projectRoot, ".autodev", "memory");
  ensureDir(dir);
  const path = resolve(dir, "harbor-log-summary.md");

  // Extract key information from the conversation
  const userMessages = log.filter((e) => e.role === "user");
  const assistantMessages = log.filter((e) => e.role === "assistant");

  const lines: string[] = [
    "# Harbor Log Summary",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Total messages:** ${log.length} (${userMessages.length} user, ${assistantMessages.length} assistant)`,
    "",
    "## Coverage Status",
    "",
    `**Covered phases:** ${coverage.covered.length > 0 ? coverage.covered.join(", ") : "None"}`,
    `**Gaps:** ${coverage.gaps.length > 0 ? coverage.gaps.join(", ") : "None"}`,
    "",
    "## Project Identity",
    "",
    "Extracted from conversation:",
    "",
    "> (Summary of what the project is and its purpose — populated during onboarding)",
    "",
    "## Constraints Discovered",
    "",
    "- (Constraints identified during onboarding)",
    "",
    "## Architecture Snapshot",
    "",
    "- (Technologies and architecture decisions discussed)",
    "",
    "## Knowledge Gaps",
    "",
    "- (Areas requiring further exploration)",
    "",
    "---",
    "",
    "*This summary is auto-generated. Full transcript: `.autodev/onboarding/harbor-log.md`*",
  ];

  writeFileSync(path, lines.join("\n"), "utf-8");
  return path;
}
