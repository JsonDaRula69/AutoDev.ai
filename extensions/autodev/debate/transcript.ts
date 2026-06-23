/**
 * Debate transcript writer — writes structured transcript files to
 * `.autodev/debates/<slug>/`.
 *
 * Files written:
 *   metadata.yaml          — Decision classification, participants, timestamps
 *   proposer-arguments.md  — Phase 2: Claim → Evidence → Warrant
 *   opposer-arguments.md   — Phase 2: Counter-arguments
 *   cross-examination.md   — Phase 3: Questions and answers (Complex only)
 *   verdict.md             — Phase 4: Each judge's verdict, reasoning, confidence
 *   implementation-verification.md — Phase 5: Verification evidence
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DebateState, StructuredArgument, CrossExaminationEntry, JudgeVerdict } from "./protocol.js";

// ─── Path resolution ──────────────────────────────────────────────────────────

const DEBATES_ROOT = ".autodev/debates";

function debateDir(slug: string): string {
  return join(process.cwd(), DEBATES_ROOT, slug);
}

// ─── YAML helpers ────────────────────────────────────────────────────────────

function yamlValue(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (typeof value === "string") {
    // Quote if it contains special characters
    if (/[:#{}[\],&*?|>!%@`\n]/.test(value)) {
      return `${pad}"${value.replace(/"/g, '\\"')}"`;
    }
    return `${pad}${value}`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `${pad}${String(value)}`;
  }
  if (value === null || value === undefined) {
    return `${pad}null`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value.map((v) => `\n${pad}- ${yamlValue(v, indent + 1).trimStart()}`).join("");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([k, v]) => `\n${pad}${k}: ${yamlValue(v, indent + 1).trimStart()}`)
      .join("");
  }
  return `${pad}${String(value)}`;
}

function toYaml(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${yamlValue(v, 0)}`)
    .join("\n") + "\n";
}

// ─── Markdown helpers ─────────────────────────────────────────────────────────

function argumentsToMarkdown(
  title: string,
  args: readonly StructuredArgument[],
): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    `*Generated: ${new Date().toISOString()}*`,
    "",
  ];

  if (args.length === 0) {
    lines.push("*No structured arguments recorded.*");
    return lines.join("\n");
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    lines.push(`## Argument ${i + 1}`);
    lines.push("");
    lines.push(`**Claim:** ${arg.claim}`);
    lines.push("");
    lines.push(`**Evidence:** ${arg.evidence}`);
    lines.push("");
    lines.push(`**Warrant:** ${arg.warrant}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function crossExaminationToMarkdown(
  entries: readonly CrossExaminationEntry[],
): string {
  const lines: string[] = [
    "# Cross-Examination",
    "",
    `*Generated: ${new Date().toISOString()}*`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("*No cross-examination recorded.*");
    return lines.join("\n");
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    lines.push(`## Exchange ${i + 1}`);
    lines.push("");
    lines.push(`**Asker:** ${entry.asker}`);
    lines.push("");
    lines.push(`**Question:** ${entry.question}`);
    lines.push("");
    lines.push(`**Answer:** ${entry.answer}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function verdictsToMarkdown(verdicts: readonly JudgeVerdict[]): string {
  const lines: string[] = [
    "# Verdict",
    "",
    `*Generated: ${new Date().toISOString()}*`,
    "",
  ];

  if (verdicts.length === 0) {
    lines.push("*No verdicts recorded.*");
    return lines.join("\n");
  }

  for (const v of verdicts) {
    lines.push(`## ${v.judge}`);
    lines.push("");
    lines.push(`**Verdict:** ${v.verdict}`);
    lines.push("");
    lines.push(`**Confidence:** ${v.confidence}`);
    lines.push("");
    lines.push(`**Reasoning:**`);
    lines.push("");
    lines.push(v.reasoning);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function implementationVerificationToMarkdown(
  state: DebateState,
): string {
  const lines: string[] = [
    "# Implementation Verification",
    "",
    `*Generated: ${new Date().toISOString()}*`,
    "",
    `**Topic:** ${state.topic}`,
    "",
    `**Classification:** ${state.classification.domain}`,
    "",
    `**Verified:** ${state.implementationVerified ? "Yes" : "No"}`,
    "",
    "## Verdicts",
    "",
  ];

  for (const v of state.verdicts) {
    lines.push(`- **${v.judge}**: ${v.verdict} (confidence: ${v.confidence})`);
    lines.push(`  - ${v.reasoning}`);
    lines.push("");
  }

  lines.push("## Evidence Checkpoints");
  lines.push("");
  lines.push("- Phase 1 (Independent Preparation): Completed");
  lines.push("- Phase 2 (Structured Arguments): Completed");
  lines.push(`- Phase 3 (Cross-Examination): ${state.crossExamination.length > 0 ? "Completed" : "Skipped"}`);
  lines.push("- Phase 4 (Verdict): Completed");
  lines.push(`- Phase 5 (Implementation Verification): ${state.implementationVerified ? "Passed" : "Failed"}`);

  return lines.join("\n");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface TranscriptFiles {
  readonly metadata: string;
  readonly proposerArguments: string;
  readonly opposerArguments: string;
  readonly crossExamination: string;
  readonly verdict: string;
  readonly implementationVerification: string;
}

/**
 * Build all transcript content in memory (does not write to disk).
 */
export function buildTranscripts(state: DebateState): TranscriptFiles {
  const metadata = toYaml({
    topic: state.topic,
    slug: state.slug,
    classification: {
      domain: state.classification.domain,
      reason: state.classification.reason,
    },
    participants: {
      proposer: "Aronnax (Professor/Proposer)",
      opposer: "Momus (Critic/Opposer)",
      judge1: "Nemo (Captain/Judge-1)",
      judge2: "Oracle (Seer/Judge-2)",
      judge3: "Conseil (Steward/Judge-3)",
    },
    phase: state.phase,
    created_at: new Date(state.createdAt).toISOString(),
    started_at: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    completed_at: state.completedAt ? new Date(state.completedAt).toISOString() : null,
    error: state.error ?? null,
    session_count: Object.values(state.sessionIds).filter(Boolean).length,
  });

  return {
    metadata,
    proposerArguments: argumentsToMarkdown("Proposer Arguments", state.proposerArguments),
    opposerArguments: argumentsToMarkdown("Opposer Arguments", state.opposerArguments),
    crossExamination: crossExaminationToMarkdown(state.crossExamination),
    verdict: verdictsToMarkdown(state.verdicts),
    implementationVerification: implementationVerificationToMarkdown(state),
  };
}

/**
 * Write all transcript files to `.autodev/debates/<slug>/`.
 * Creates the directory if it doesn't exist.
 */
export async function writeTranscripts(state: DebateState): Promise<string> {
  const dir = debateDir(state.slug);
  await mkdir(dir, { recursive: true });

  const files = buildTranscripts(state);

  await Promise.all([
    writeFile(join(dir, "metadata.yaml"), files.metadata, "utf-8"),
    writeFile(join(dir, "proposer-arguments.md"), files.proposerArguments, "utf-8"),
    writeFile(join(dir, "opposer-arguments.md"), files.opposerArguments, "utf-8"),
    writeFile(join(dir, "cross-examination.md"), files.crossExamination, "utf-8"),
    writeFile(join(dir, "verdict.md"), files.verdict, "utf-8"),
    writeFile(join(dir, "implementation-verification.md"), files.implementationVerification, "utf-8"),
  ]);

  return dir;
}
