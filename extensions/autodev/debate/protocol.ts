/**
 * Debate protocol — Cynefin classification and 5-phase orchestration.
 *
 * Cynefin framework determines protocol depth:
 *   Simple      → no debate (direct to Ned Land)
 *   Complicated → single-round debate (5 sessions, skip Phase 3)
 *   Complex     → full 5-phase protocol (6 sessions)
 *   Chaotic     → route to Watch Officer (stub/team message)
 *
 * Phase 1: Independent preparation (5 parallel sessions)
 * Phase 2: Structured arguments (Claim → Evidence → Warrant)
 * Phase 3: Cross-examination (Complex only, shared session)
 * Phase 4: Verdict (3 judges, independent)
 * Phase 5: Implementation verification (3-judge panel)
 */

import type { TaskState, TaskStatus } from "../background/types.js";

// ─── Cynefin classification ──────────────────────────────────────────────────

export type CynefinDomain = "simple" | "complicated" | "complex" | "chaotic";

export interface CynefinClassification {
  readonly domain: CynefinDomain;
  readonly reason: string;
}

/**
 * Classify a decision topic using the Cynefin framework.
 * Simple: known knowns, best practice applies.
 * Complicated: known unknowns, expert analysis needed.
 * Complex: unknown unknowns, probe-sense-respond.
 * Chaotic: crisis, act-sense-respond.
 */
export function classifyTopic(topic: string): CynefinClassification {
  const lower = topic.toLowerCase();

  // Chaotic indicators: crisis, incident, corruption, emergency, breach
  if (
    /crisis|incident|corruption|emergency|breach|outage|data loss/i.test(lower)
  ) {
    return { domain: "chaotic", reason: "Crisis indicators detected — route to Watch Officer" };
  }

  // Simple indicators: bug fix, standard, trivial, minor, obvious, fix
  if (
    /bug fix|standard|trivial|minor|obvious|simple|known|best practice|^fix\b/i.test(lower)
  ) {
    return { domain: "simple", reason: "Known knowns — best practice applies, no debate needed" };
  }

  // Complex indicators: new feature, design, refactor, architecture, security, cross-cutting
  if (
    /new feature|design|refactor|architecture|security|cross-cutting|unknown|novel|explor/i.test(lower)
  ) {
    return { domain: "complex", reason: "Unknown unknowns — full 5-phase debate protocol required" };
  }

  // Default to complicated (known unknowns, expert analysis)
  return {
    domain: "complicated",
    reason: "Known unknowns — single-round debate with expert analysis",
  };
}

// ─── Debate phases ───────────────────────────────────────────────────────────

export type DebatePhase =
  | "idle"
  | "phase-1-preparation"
  | "phase-2-arguments"
  | "phase-3-cross-examination"
  | "phase-4-verdict"
  | "phase-5-implementation-verification"
  | "completed"
  | "blocked";

export type Verdict = "approve" | "reject" | "needs-revision";

export interface JudgeVerdict {
  readonly judge: string;
  readonly verdict: Verdict;
  readonly reasoning: string;
  readonly confidence: "high" | "medium" | "low";
}

export interface StructuredArgument {
  readonly claim: string;
  readonly evidence: string;
  readonly warrant: string;
}

export interface CrossExaminationEntry {
  readonly asker: string;
  readonly question: string;
  readonly answer: string;
}

export interface DebateState {
  readonly topic: string;
  readonly slug: string;
  readonly classification: CynefinClassification;
  phase: DebatePhase;
  readonly createdAt: number;
  startedAt: number | undefined;
  completedAt: number | undefined;
  error: string | undefined;

  // Session task IDs
  readonly sessionIds: {
    proposer: string | undefined;
    opposer: string | undefined;
    judge1: string | undefined;
    judge2: string | undefined;
    judge3: string | undefined;
    crossExamination: string | undefined;
  };

  // Phase results
  proposerArguments: readonly StructuredArgument[];
  opposerArguments: readonly StructuredArgument[];
  crossExamination: readonly CrossExaminationEntry[];
  verdicts: readonly JudgeVerdict[];
  implementationVerified: boolean;
}

export function createDebateState(
  topic: string,
  classification: CynefinClassification,
): DebateState {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return {
    topic,
    slug,
    classification,
    phase: "idle",
    createdAt: Date.now(),
    startedAt: undefined,
    completedAt: undefined,
    error: undefined,
    sessionIds: {
      proposer: undefined,
      opposer: undefined,
      judge1: undefined,
      judge2: undefined,
      judge3: undefined,
      crossExamination: undefined,
    },
    proposerArguments: [],
    opposerArguments: [],
    crossExamination: [],
    verdicts: [],
    implementationVerified: false,
  };
}

// ─── Phase orchestration ────────────────────────────────────────────────────

export interface PhaseResult {
  readonly phase: DebatePhase;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Determine the required session count based on classification.
 * Simple: 0 (no debate)
 * Complicated: 5 (proposer, opposer, 3 judges — skip Phase 3)
 * Complex: 6 (proposer, opposer, 3 judges, cross-examination)
 * Chaotic: 0 (route to Watch Officer)
 */
export function requiredSessionCount(domain: CynefinDomain): number {
  switch (domain) {
    case "simple":
      return 0;
    case "complicated":
      return 5;
    case "complex":
      return 6;
    case "chaotic":
      return 0;
  }
}

/**
 * Check if cross-examination phase is needed.
 */
export function needsCrossExamination(domain: CynefinDomain): boolean {
  return domain === "complex";
}

/**
 * Resolve majority verdict from 3 judge verdicts.
 * Returns the verdict and whether a majority was reached.
 */
export function resolveMajorityVerdict(
  verdicts: readonly JudgeVerdict[],
): { verdict: Verdict | undefined; majority: boolean } {
  if (verdicts.length < 3) {
    return { verdict: undefined, majority: false };
  }

  const counts: Record<string, number> = {};
  for (const v of verdicts) {
    counts[v.verdict] = (counts[v.verdict] ?? 0) + 1;
  }

  for (const [verdict, count] of Object.entries(counts)) {
    if (count >= 2) {
      return { verdict: verdict as Verdict, majority: true };
    }
  }

  // No majority — default to needs-revision
  return { verdict: "needs-revision", majority: false };
}

/**
 * Check if a judge session error should trigger a retry.
 * Returns true on first error (retry once), false on second error.
 */
export function shouldRetryJudgeSession(
  judgeName: string,
  retryCount: number,
): boolean {
  return retryCount < 1; // Retry once
}

/**
 * Generate the system prompt for each debate participant.
 */
export function buildParticipantPrompt(
  role: string,
  phase: DebatePhase,
  topic: string,
  context?: string,
): string {
  const phaseInstructions: Record<DebatePhase, string> = {
    idle: "",
    "phase-1-preparation":
      `You are ${role} in a debate about: "${topic}".\n` +
      "Prepare your position independently. Do NOT collaborate with other participants.\n" +
      "Review standing orders, reference docs, and relevant knowledge records.\n" +
      "Develop your full argument with evidence citations.\n" +
      "Output your prepared position as structured JSON with claim, evidence, and warrant fields.",
    "phase-2-arguments":
      `You are ${role} in a debate about: "${topic}".\n` +
      "Present your structured arguments. Every claim MUST follow the format:\n" +
      "  Claim: the assertion being made\n" +
      "  Evidence: specific data point, code reference, or test result\n" +
      "  Warrant: why the evidence supports the claim\n" +
      "No unsupported claims are allowed.\n" +
      (context ? `\nContext from preparation:\n${context}\n` : ""),
    "phase-3-cross-examination":
      `You are ${role} in a cross-examination session about: "${topic}".\n` +
      "Question the other side's evidence. Provide answers to questions about your own evidence.\n" +
      "All questions and answers are logged.\n" +
      (context ? `\nContext:\n${context}\n` : ""),
    "phase-4-verdict":
      `You are ${role}, a judge in a debate about: "${topic}".\n` +
      "Vote independently. Provide:\n" +
      "  - Verdict: approve, reject, or needs-revision\n" +
      "  - Reasoning: detailed justification\n" +
      "  - Confidence: high, medium, or low\n" +
      (context ? `\nDebate context:\n${context}\n` : ""),
    "phase-5-implementation-verification":
      `You are ${role}, verifying implementation for: "${topic}".\n` +
      "Verify that the implementation matches the approved plan.\n" +
      "Check evidence checkpoints at each phase.\n" +
      "Output: verified (true/false) with reasoning.\n" +
      (context ? `\nPlan context:\n${context}\n` : ""),
    completed: "",
    blocked: "",
  };

  return phaseInstructions[phase] ?? `You are ${role} in a debate about: "${topic}".`;
}
