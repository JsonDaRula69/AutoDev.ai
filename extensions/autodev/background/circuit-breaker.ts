/**
 * Circuit breaker — sliding-window stale timer per task.
 *
 * Extracted from BackgroundManager to stay under the 250 LOC ceiling.
 * The breaker is a thin wrapper around a timer factory: arm() schedules a
 * trip callback, clear() cancels it. The manager owns the trip-side-effect
 * (abort + finish + free-slot) via the `onTrip` callback passed to the
 * constructor, keeping this module free of task-state knowledge.
 */
import { isTerminal, type TaskState } from "./types.js";

/** Timer handle returned by the timer factory. */
export interface TimerHandle {
  clear(): void;
}

/** Timer factory — injectable for fake timers in tests. */
export type TimerFactory = (fn: () => void, ms: number) => TimerHandle;

/** Default stale timeout: 180 seconds (3 minutes) since last event. */
export const DEFAULT_STALE_TIMEOUT_MS = 180_000;

/** Per-task circuit breaker state. */
export class CircuitBreaker {
  private readonly timers = new Map<string, TimerHandle>();
  private readonly timerFactory: TimerFactory;
  private readonly defaultTimeoutMs: number;
  private readonly onTrip: (taskId: string) => void;
  private readonly getTask: (id: string) => TaskState | undefined;

  constructor(options: {
    timerFactory: TimerFactory;
    defaultTimeoutMs?: number;
    onTrip: (taskId: string) => void;
    getTask: (id: string) => TaskState | undefined;
  }) {
    this.timerFactory = options.timerFactory;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
    this.onTrip = options.onTrip;
    this.getTask = options.getTask;
  }

  /** Arm (or re-arm) the breaker for a task. No-op if the task is terminal. */
  arm(id: string, staleTimeoutMs: number | undefined): void {
    const state = this.getTask(id);
    if (state === undefined || isTerminal(state.status)) return;

    const existing = this.timers.get(id);
    if (existing !== undefined) existing.clear();

    const timeout = staleTimeoutMs ?? this.defaultTimeoutMs;
    const handle = this.timerFactory(() => this.trip(id), timeout);
    this.timers.set(id, handle);
  }

  /** Trip the breaker for a stuck task. Idempotent — event wins. */
  private trip(id: string): void {
    const state = this.getTask(id);
    if (state === undefined || isTerminal(state.status)) return;
    this.clear(id);
    this.onTrip(id);
  }

  /** Clear a task's breaker timer without tripping. */
  clear(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      timer.clear();
      this.timers.delete(id);
    }
  }

  /** Clear all timers. */
  dispose(): void {
    for (const timer of this.timers.values()) {
      timer.clear();
    }
    this.timers.clear();
  }
}