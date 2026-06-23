/**
 * Continuation loops — ralph loop, ULW loop stub, todo continuation enforcer.
 *
 * Three loops drive agents to completion without stopping halfway:
 *
 * 1. Ralph loop: self-referential. The agent runs, evaluates its output, and
 *    continues until it emits a DONE signal. Max iterations default to 100.
 *    DONE detection: scan agent output for regex `/<promise>DONE<\/promise>/`
 *    OR check if the agent called the `loop_done` tool.
 *
 * 2. ULW loop: ultrawork mode stub. Maximum intensity execution.
 *
 * 3. Todo continuation enforcer: injects a system reminder when an agent has
 *    incomplete todos. The reminder surfaces at natural work boundaries.
 *
 * `/stop-continuation` stops all loops. Loops work via event injection, not
 * by blocking the session.
 */
import type { TaskState, TaskStatus } from "../background/types.js";

// ---- Types ----

export type LoopType = "ralph" | "ulw" | "todo-enforcer";

export interface LoopState {
  readonly type: LoopType;
  iteration: number;
  readonly maxIterations: number;
  readonly startedAt: number;
  readonly taskId: string | undefined;
  running: boolean;
}

export interface ContinuationState {
  readonly loops: Map<LoopType, LoopState>;
  stopped: boolean;
}

export interface TodoEnforcerResult {
  readonly injected: boolean;
  readonly reminder: string | undefined;
}

// ---- Constants ----

const DEFAULT_RALPH_MAX_ITERATIONS = 100;
const DEFAULT_ULW_MAX_ITERATIONS = 200;
const DONE_REGEX = /<promise>DONE<\/promise>/;

// ---- State ----

const state: ContinuationState = {
  loops: new Map(),
  stopped: false,
};

// ---- Public API ----

/**
 * Start a ralph loop for a given background task.
 *
 * @param taskId - The background task ID to monitor.
 * @param maxIterations - Maximum iterations before forced stop (default 100).
 * @returns The loop state.
 */
export function startRalphLoop(
  taskId: string,
  maxIterations: number = DEFAULT_RALPH_MAX_ITERATIONS,
): LoopState {
  const loop: LoopState = {
    type: "ralph",
    iteration: 0,
    maxIterations,
    startedAt: Date.now(),
    taskId,
    running: true,
  };
  state.loops.set("ralph", loop);
  state.stopped = false;
  return loop;
}

/**
 * Start a ULW loop stub for a given background task.
 *
 * @param taskId - The background task ID to monitor.
 * @param maxIterations - Maximum iterations before forced stop (default 200).
 * @returns The loop state.
 */
export function startUlwLoop(
  taskId: string,
  maxIterations: number = DEFAULT_ULW_MAX_ITERATIONS,
): LoopState {
  const loop: LoopState = {
    type: "ulw",
    iteration: 0,
    maxIterations,
    startedAt: Date.now(),
    taskId,
    running: true,
  };
  state.loops.set("ulw", loop);
  state.stopped = false;
  return loop;
}

/**
 * Check if a task's output contains the DONE signal.
 *
 * Scans the task result for the DONE regex pattern.
 * Also checks if the task completed naturally (status === "completed").
 *
 * @param task - The task state from the background manager.
 * @returns True if the DONE signal is detected.
 */
export function checkDoneSignal(task: TaskState | undefined): boolean {
  if (task === undefined) return false;

  // If the task completed naturally, that's a DONE signal
  if (task.status === "completed") return true;

  // Scan the result for the DONE regex
  if (task.result !== undefined) {
    const resultStr = typeof task.result === "string"
      ? task.result
      : JSON.stringify(task.result);
    if (DONE_REGEX.test(resultStr)) return true;
  }

  return false;
}

/**
 * Check if a message string contains the DONE signal.
 *
 * @param message - The message content to scan.
 * @returns True if the DONE regex matches.
 */
export function checkDoneInMessage(message: string): boolean {
  return DONE_REGEX.test(message);
}

/**
 * Advance the ralph loop iteration counter.
 * Returns false if the loop should stop (max iterations reached or stopped).
 *
 * @param loopType - The loop type to advance.
 * @returns True if the loop should continue, false if it should stop.
 */
export function advanceLoop(loopType: LoopType): boolean {
  if (state.stopped) return false;

  const loop = state.loops.get(loopType);
  if (loop === undefined) return false;
  if (!loop.running) return false;

  loop.iteration += 1;

  if (loop.iteration >= loop.maxIterations) {
    loop.running = false;
    return false;
  }

  return true;
}

/**
 * Get the current loop state for a given type.
 */
export function getLoopState(loopType: LoopType): LoopState | undefined {
  return state.loops.get(loopType);
}

/**
 * Get all active loop states.
 */
export function getAllLoopStates(): readonly LoopState[] {
  return [...state.loops.values()];
}

/**
 * Stop all running loops.
 */
export function stopAllLoops(): void {
  state.stopped = true;
  for (const loop of state.loops.values()) {
    loop.running = false;
  }
}

/**
 * Reset all loop state (for testing).
 */
export function resetLoops(): void {
  state.loops.clear();
  state.stopped = false;
}

/**
 * Todo continuation enforcer.
 *
 * Injects a system reminder when an agent has incomplete todos.
 * The reminder surfaces at natural work boundaries.
 *
 * @param todos - Array of todo status strings ("pending", "in_progress", "completed", "cancelled").
 * @returns A TodoEnforcerResult describing whether a reminder was injected.
 */
export function enforceTodoContinuation(
  todos: readonly string[],
): TodoEnforcerResult {
  const incomplete = todos.filter(
    (t) => t === "pending" || t === "in_progress",
  );

  if (incomplete.length === 0) {
    return { injected: false, reminder: undefined };
  }

  const reminder = [
    `## ⚠️ Incomplete Todos Reminder`,
    ``,
    `You have ${incomplete.length} incomplete todo(s) that need attention.`,
    `Please complete all pending todos before declaring the task done.`,
    `Use the todowrite tool to update todo status as you work.`,
    ``,
    `Incomplete: ${incomplete.length}`,
  ].join("\n");

  return { injected: true, reminder };
}

/**
 * Build a continuation prompt for the ralph loop.
 *
 * @param iteration - The current iteration number.
 * @param maxIterations - The maximum iterations.
 * @returns A prompt string to inject into the agent session.
 */
export function buildRalphContinuationPrompt(
  iteration: number,
  maxIterations: number,
): string {
  return [
    `## Ralph Loop Continuation (Iteration ${iteration + 1}/${maxIterations})`,
    ``,
    `Continue working on the current task.`,
    `When you have completed all work, signal completion by calling the \`loop_done\` tool.`,
    `Do NOT call loop_done until all work is truly complete.`,
  ].join("\n");
}
