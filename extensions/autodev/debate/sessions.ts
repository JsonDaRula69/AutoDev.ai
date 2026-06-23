/**
 * Debate session management — spawn and collect results from 6 background sessions.
 *
 * Session layout by Cynefin domain:
 *   Simple      → 0 sessions (no debate)
 *   Complicated → 5 sessions (proposer, opposer, 3 judges — skip Phase 3)
 *   Complex     → 6 sessions (proposer, opposer, 3 judges, cross-examination)
 *   Chaotic     → 0 sessions (route to Watch Officer)
 *
 * All sessions are spawned via BackgroundManager.spawn() for circuit breaker
 * protection and concurrency control. Results are collected via getTask() or
 * the onParentWake callback.
 *
 * Judge session error handling: retry once on first error. If the retry also
 * errors, mark the debate as blocked and surface to Harbor Master.
 */

import type { BackgroundManager } from "../background/manager.js";
import type { TaskState, TaskStatus } from "../background/types.js";
import {
  type CynefinDomain,
  type DebatePhase,
  type DebateState,
  type StructuredArgument,
  type CrossExaminationEntry,
  type JudgeVerdict,
  type PhaseResult,
  buildParticipantPrompt,
  needsCrossExamination,
  shouldRetryJudgeSession,
} from "./protocol.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "ollama-cloud/deepseek-v4-pro";
const DEFAULT_TOOLS: readonly string[] = ["read", "write", "search"];

const PARTICIPANT_ROLES: Record<string, string> = {
  proposer: "Aronnax (Professor/Proposer)",
  opposer: "Momus (Critic/Opposer)",
  judge1: "Nemo (Captain/Judge-1)",
  judge2: "Oracle (Seer/Judge-2)",
  judge3: "Conseil (Steward/Judge-3)",
};

// ─── Session spawn helpers ────────────────────────────────────────────────────

export interface SessionSpawnConfig {
  readonly model?: string;
  readonly tools?: readonly string[];
  readonly agentName?: string;
}

/**
 * Spawn a single debate session and return the task ID.
 */
function spawnDebateSession(
  manager: BackgroundManager,
  role: string,
  systemPrompt: string,
  config?: SessionSpawnConfig,
): string {
  return manager.spawn({
    model: config?.model ?? DEFAULT_MODEL,
    systemPrompt,
    tools: config?.tools ?? DEFAULT_TOOLS,
    agentName: config?.agentName ?? role,
  });
}

/**
 * Wait for a session to reach a terminal state by polling getTask().
 * Returns the completed TaskState or undefined if timeout.
 */
async function awaitSession(
  manager: BackgroundManager,
  taskId: string,
  timeoutMs: number = 60_000,
): Promise<TaskState | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = manager.getTask(taskId);
    if (task === undefined) return undefined;
    if (task.status === "completed" || task.status === "error" || task.status === "cancelled") {
      return task;
    }
    // Wait a bit before polling again
    await new Promise((r) => setTimeout(r, 100));
  }
  return manager.getTask(taskId);
}

// ─── Phase executors ─────────────────────────────────────────────────────────

export interface Phase1Result {
  readonly proposerTaskId: string;
  readonly opposerTaskId: string;
  readonly judge1TaskId: string;
  readonly judge2TaskId: string;
  readonly judge3TaskId: string;
}

/**
 * Phase 1: Independent preparation.
 * Spawn 5 parallel sessions (proposer, opposer, 3 judges).
 * Each participant develops their position independently.
 */
export function executePhase1(
  manager: BackgroundManager,
  state: DebateState,
  config?: SessionSpawnConfig,
): Phase1Result {
  state.phase = "phase-1-preparation";
  state.startedAt = Date.now();

  const proposerTaskId = spawnDebateSession(
    manager,
    "proposer",
    buildParticipantPrompt("Aronnax (Professor/Proposer)", "phase-1-preparation", state.topic),
    config,
  );
  const opposerTaskId = spawnDebateSession(
    manager,
    "opposer",
    buildParticipantPrompt("Momus (Critic/Opposer)", "phase-1-preparation", state.topic),
    config,
  );
  const judge1TaskId = spawnDebateSession(
    manager,
    "judge1",
    buildParticipantPrompt("Nemo (Captain/Judge-1)", "phase-1-preparation", state.topic),
    config,
  );
  const judge2TaskId = spawnDebateSession(
    manager,
    "judge2",
    buildParticipantPrompt("Oracle (Seer/Judge-2)", "phase-1-preparation", state.topic),
    config,
  );
  const judge3TaskId = spawnDebateSession(
    manager,
    "judge3",
    buildParticipantPrompt("Conseil (Steward/Judge-3)", "phase-1-preparation", state.topic),
    config,
  );

  state.sessionIds.proposer = proposerTaskId;
  state.sessionIds.opposer = opposerTaskId;
  state.sessionIds.judge1 = judge1TaskId;
  state.sessionIds.judge2 = judge2TaskId;
  state.sessionIds.judge3 = judge3TaskId;

  return { proposerTaskId, opposerTaskId, judge1TaskId, judge2TaskId, judge3TaskId };
}

/**
 * Phase 2: Structured arguments.
 * Collect arguments from proposer and opposer sessions.
 * Every claim must follow Claim → Evidence → Warrant format.
 */
export async function executePhase2(
  manager: BackgroundManager,
  state: DebateState,
  phase1: Phase1Result,
): Promise<PhaseResult> {
  state.phase = "phase-2-arguments";

  // Wait for all 5 Phase 1 sessions to complete
  const sessionIds = [
    phase1.proposerTaskId,
    phase1.opposerTaskId,
    phase1.judge1TaskId,
    phase1.judge2TaskId,
    phase1.judge3TaskId,
  ];

  for (const id of sessionIds) {
    const task = await awaitSession(manager, id);
    if (task === undefined || task.status === "error") {
      return {
        phase: "phase-2-arguments",
        success: false,
        error: task?.error ?? `Session ${id} timed out or not found`,
      };
    }
  }

  // Extract structured arguments from proposer and opposer results
  const proposerTask = manager.getTask(phase1.proposerTaskId);
  const opposerTask = manager.getTask(phase1.opposerTaskId);

  state.proposerArguments = extractArguments(proposerTask?.result);
  state.opposerArguments = extractArguments(opposerTask?.result);

  return { phase: "phase-2-arguments", success: true };
}

/**
 * Phase 3: Cross-examination (Complex only).
 * Spawn a shared session for proposer and opposer to question each other.
 */
export async function executePhase3(
  manager: BackgroundManager,
  state: DebateState,
  config?: SessionSpawnConfig,
): Promise<PhaseResult> {
  if (!needsCrossExamination(state.classification.domain)) {
    return { phase: "phase-3-cross-examination", success: true };
  }

  state.phase = "phase-3-cross-examination";

  const context = buildCrossExaminationContext(state);
  const crossTaskId = spawnDebateSession(
    manager,
    "cross-examination",
    buildParticipantPrompt(
      "Aronnax and Momus (Cross-Examination)",
      "phase-3-cross-examination",
      state.topic,
      context,
    ),
    config,
  );

  state.sessionIds.crossExamination = crossTaskId;

  const task = await awaitSession(manager, crossTaskId);
  if (task === undefined || task.status === "error") {
    return {
      phase: "phase-3-cross-examination",
      success: false,
      error: task?.error ?? "Cross-examination session failed",
    };
  }

  state.crossExamination = extractCrossExamination(task.result);
  return { phase: "phase-3-cross-examination", success: true };
}

/**
 * Phase 4: Verdict.
 * Spawn 3 independent judge sessions. Each judge votes independently.
 * Judge session error → retry once. Second error → mark debate blocked.
 */
export async function executePhase4(
  manager: BackgroundManager,
  state: DebateState,
  config?: SessionSpawnConfig,
): Promise<PhaseResult> {
  state.phase = "phase-4-verdict";

  const debateContext = buildVerdictContext(state);
  const judgeRoles = ["judge1", "judge2", "judge3"];
  const judgeNames = ["Nemo (Captain/Judge-1)", "Oracle (Seer/Judge-2)", "Conseil (Steward/Judge-3)"];

  const verdicts: JudgeVerdict[] = [];

  for (let i = 0; i < judgeRoles.length; i++) {
    const role = judgeRoles[i]!;
    const name = judgeNames[i]!;
    const prompt = buildParticipantPrompt(name, "phase-4-verdict", state.topic, debateContext);

    let taskId = spawnDebateSession(manager, role, prompt, config);
    let task = await awaitSession(manager, taskId);

    // Retry once on error
    if (task !== undefined && task.status === "error" && shouldRetryJudgeSession(role, 0)) {
      taskId = spawnDebateSession(manager, role, prompt, config);
      task = await awaitSession(manager, taskId);
    }

    if (task === undefined || task.status === "error") {
      // Second error — mark debate as blocked
      state.error = `Judge session ${role} failed after retry: ${task?.error ?? "unknown"}`;
      state.phase = "blocked";
      return {
        phase: "phase-4-verdict",
        success: false,
        error: state.error,
      };
    }

    const verdict = extractVerdict(task.result, name);
    verdicts.push(verdict);
  }

  state.verdicts = verdicts;
  return { phase: "phase-4-verdict", success: true };
}

/**
 * Phase 5: Implementation verification.
 * 3-judge panel verifies implementation matches approved plan.
 */
export async function executePhase5(
  manager: BackgroundManager,
  state: DebateState,
  config?: SessionSpawnConfig,
): Promise<PhaseResult> {
  state.phase = "phase-5-implementation-verification";

  const planContext = buildVerificationContext(state);
  const judgeRoles = ["judge1", "judge2", "judge3"];
  const judgeNames = ["Nemo (Captain/Judge-1)", "Oracle (Seer/Judge-2)", "Conseil (Steward/Judge-3)"];

  const results: boolean[] = [];

  for (let i = 0; i < judgeRoles.length; i++) {
    const role = judgeRoles[i]!;
    const name = judgeNames[i]!;
    const prompt = buildParticipantPrompt(
      name,
      "phase-5-implementation-verification",
      state.topic,
      planContext,
    );

    const taskId = spawnDebateSession(manager, `verify-${role}`, prompt, config);
    const task = await awaitSession(manager, taskId);

    if (task === undefined || task.status === "error") {
      return {
        phase: "phase-5-implementation-verification",
        success: false,
        error: task?.error ?? `Verification session ${role} failed`,
      };
    }

    results.push(extractVerificationResult(task.result));
  }

  // Majority rules for verification
  const approved = results.filter(Boolean).length >= 2;
  state.implementationVerified = approved;

  return { phase: "phase-5-implementation-verification", success: true };
}

// ─── Result extraction helpers ───────────────────────────────────────────────

/**
 * Extract structured arguments from a session result.
 * Attempts to parse JSON from the result; falls back to treating the
 * entire result as a single argument.
 */
function extractArguments(result: unknown): readonly StructuredArgument[] {
  if (result === undefined || result === null) return [];

  // If result is an array of messages, try the last one
  const text = typeof result === "string"
    ? result
    : Array.isArray(result)
      ? String((result as readonly unknown[]).at(-1) ?? "")
      : String(result);

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (a: unknown): a is StructuredArgument =>
          typeof a === "object" &&
          a !== null &&
          "claim" in a &&
          "evidence" in a &&
          "warrant" in a,
      );
    }
    if (typeof parsed === "object" && parsed !== null && "claim" in parsed) {
      return [parsed as StructuredArgument];
    }
  } catch {
    // Not JSON — treat as a single unstructured argument
  }

  return [{ claim: text, evidence: "(see full text)", warrant: "(see full text)" }];
}

/**
 * Extract cross-examination entries from a session result.
 */
function extractCrossExamination(result: unknown): readonly CrossExaminationEntry[] {
  if (result === undefined || result === null) return [];

  const text = typeof result === "string"
    ? result
    : Array.isArray(result)
      ? String((result as readonly unknown[]).at(-1) ?? "")
      : String(result);

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (e: unknown): e is CrossExaminationEntry =>
          typeof e === "object" &&
          e !== null &&
          "asker" in e &&
          "question" in e &&
          "answer" in e,
      );
    }
  } catch {
    // Not JSON
  }

  return [];
}

/**
 * Extract a judge verdict from a session result.
 */
function extractVerdict(result: unknown, judgeName: string): JudgeVerdict {
  if (result === undefined || result === null) {
    return { judge: judgeName, verdict: "needs-revision", reasoning: "No result returned", confidence: "low" };
  }

  const text = typeof result === "string"
    ? result
    : Array.isArray(result)
      ? String((result as readonly unknown[]).at(-1) ?? "")
      : String(result);

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        judge: judgeName,
        verdict: (parsed as Record<string, string>).verdict as JudgeVerdict["verdict"] ?? "needs-revision",
        reasoning: (parsed as Record<string, string>).reasoning ?? text,
        confidence: (parsed as Record<string, string>).confidence as JudgeVerdict["confidence"] ?? "medium",
      };
    }
  } catch {
    // Not JSON
  }

  return { judge: judgeName, verdict: "needs-revision", reasoning: text, confidence: "medium" };
}

/**
 * Extract verification result (boolean) from a session result.
 */
function extractVerificationResult(result: unknown): boolean {
  if (result === undefined || result === null) return false;

  const text = typeof result === "string"
    ? result
    : Array.isArray(result)
      ? String((result as readonly unknown[]).at(-1) ?? "")
      : String(result);

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      return (parsed as Record<string, unknown>).verified === true;
    }
  } catch {
    // Not JSON
  }

  return text.toLowerCase().includes("verified") || text.toLowerCase().includes("approved");
}

// ─── Context builders ────────────────────────────────────────────────────────

function buildCrossExaminationContext(state: DebateState): string {
  const lines: string[] = ["## Proposer Arguments", "---"];
  for (const arg of state.proposerArguments) {
    lines.push(`Claim: ${arg.claim}`);
    lines.push(`Evidence: ${arg.evidence}`);
    lines.push(`Warrant: ${arg.warrant}`);
    lines.push("---");
  }
  lines.push("", "## Opposer Arguments", "---");
  for (const arg of state.opposerArguments) {
    lines.push(`Claim: ${arg.claim}`);
    lines.push(`Evidence: ${arg.evidence}`);
    lines.push(`Warrant: ${arg.warrant}`);
    lines.push("---");
  }
  return lines.join("\n");
}

function buildVerdictContext(state: DebateState): string {
  const lines: string[] = [
    `## Debate Topic: ${state.topic}`,
    `## Classification: ${state.classification.domain}`,
    "",
    "### Proposer Arguments",
  ];
  for (const arg of state.proposerArguments) {
    lines.push(`- Claim: ${arg.claim} | Evidence: ${arg.evidence} | Warrant: ${arg.warrant}`);
  }
  lines.push("", "### Opposer Arguments");
  for (const arg of state.opposerArguments) {
    lines.push(`- Claim: ${arg.claim} | Evidence: ${arg.evidence} | Warrant: ${arg.warrant}`);
  }
  if (state.crossExamination.length > 0) {
    lines.push("", "### Cross-Examination");
    for (const entry of state.crossExamination) {
      lines.push(`- ${entry.asker}: Q: ${entry.question} | A: ${entry.answer}`);
    }
  }
  return lines.join("\n");
}

function buildVerificationContext(state: DebateState): string {
  const lines: string[] = [
    `## Debate Topic: ${state.topic}`,
    `## Classification: ${state.classification.domain}`,
    "",
    "### Approved Verdicts",
  ];
  for (const v of state.verdicts) {
    lines.push(`- ${v.judge}: ${v.verdict} (confidence: ${v.confidence}) — ${v.reasoning}`);
  }
  lines.push("", "### Implementation must match the approved plan.");
  return lines.join("\n");
}
