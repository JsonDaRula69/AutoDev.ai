/**
 * Debug logger — structured JSON-lines logging for agent sessions.
 *
 * Off by default. Enabled via `AUTODEV_DEBUG=true` env var or
 * `AUTODEV_DEBUG_LOG=stdout` / file path (default `.autodev/debug.log`).
 *
 * Features:
 *  - Structured JSON-lines format (one JSON object per line)
 *  - Log rotation: 50MB max, keep last 3 rotated files
 *  - Secret redaction using guardrail SECRET_PATTERNS
 *  - Async logging (fire-and-forget, never blocks the session)
 *  - Configurable output: file path or stdout
 */

import { appendFile, rename, mkdir, stat, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { SECRET_PATTERNS } from "../guardrails/evaluator.js";

// ---- Types ----

export interface DebugLogEntry {
  readonly timestamp: string;
  readonly level: "info" | "warn" | "error" | "debug";
  readonly event: string;
  readonly sessionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly data?: Record<string, unknown> | undefined;
  readonly error?: string | undefined;
}

export interface DebugLogger {
  /** Log a structured entry. Returns a promise but callers should not await it. */
  log(entry: DebugLogEntry): void;
  /** Check whether debug logging is currently enabled. */
  readonly enabled: boolean;
  /** The current output target (file path or "stdout"). */
  readonly target: string;
  /** Enable debug logging with the given target. */
  enable(target?: string): void;
  /** Disable debug logging. */
  disable(): void;
  /** Flush any pending writes (for shutdown). */
  flush(): Promise<void>;
}

// ---- Constants ----

const DEFAULT_LOG_PATH = ".autodev/debug.log";
const MAX_LOG_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_ROTATED_FILES = 3;

// ---- Redaction ----

/**
 * Redact known secret patterns from a string.
 * Replaces matches with `[REDACTED]`.
 */
function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * Recursively redact secrets from a value, returning a new value.
 * Strings are scanned for secret patterns. Objects/arrays are traversed.
 */
function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSecrets(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactValue(val);
    }
    return result;
  }
  return value;
}

// ---- Rotation ----

/**
 * Rotate the log file if it exceeds the max size.
 * Renames debug.log → debug.log.1, debug.log.1 → debug.log.2, etc.
 * Drops the oldest file beyond MAX_ROTATED_FILES.
 */
async function rotateIfNeeded(logPath: string): Promise<void> {
  try {
    const stats = await stat(logPath);
    if (stats.size < MAX_LOG_SIZE) return;
  } catch {
    // File doesn't exist yet — no rotation needed
    return;
  }

  // Shift rotated files: .2 → .3, .1 → .2
  for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
    const oldPath = `${logPath}.${i}`;
    const newPath = `${logPath}.${i + 1}`;
    if (existsSync(oldPath)) {
      try {
        await rename(oldPath, newPath);
      } catch {
        // Best-effort rotation
      }
    }
  }

  // Rename current → .1
  try {
    await rename(logPath, `${logPath}.1`);
  } catch {
    // Best-effort
  }
}

// ---- Logger implementation ----

class DebugLoggerImpl implements DebugLogger {
  private _enabled = false;
  private _target: string = DEFAULT_LOG_PATH;
  private _writeQueue: Promise<void> = Promise.resolve();

  get enabled(): boolean {
    return this._enabled;
  }

  get target(): string {
    return this._target;
  }

  enable(target?: string): void {
    this._enabled = true;
    if (target !== undefined) {
      this._target = target;
    }
  }

  disable(): void {
    this._enabled = false;
  }

  log(entry: DebugLogEntry): void {
    if (!this._enabled) return;

    // Redact the entry before writing
    const redacted: DebugLogEntry = {
      timestamp: entry.timestamp,
      level: entry.level,
      event: entry.event,
      sessionId: entry.sessionId,
      taskId: entry.taskId,
      data: entry.data !== undefined
        ? (redactValue(entry.data) as Record<string, unknown>)
        : undefined,
      error: entry.error !== undefined ? redactSecrets(entry.error) : undefined,
    };

    const line = JSON.stringify(redacted) + "\n";

    // Chain onto the write queue for ordering, but don't await
    this._writeQueue = this._writeQueue.then(() => this._write(line)).catch(() => {});
  }

  async flush(): Promise<void> {
    await this._writeQueue;
  }

  private async _write(line: string): Promise<void> {
    if (this._target === "stdout") {
      process.stdout.write(line);
      return;
    }

    // Ensure the directory exists
    const dir = dirname(this._target);
    if (!existsSync(dir)) {
      try {
        await mkdir(dir, { recursive: true });
      } catch {
        // Best-effort
      }
    }

    // Rotate if needed
    await rotateIfNeeded(this._target);

    // Append to the log file
    try {
      await appendFile(this._target, line, "utf-8");
    } catch {
      // Best-effort — don't crash the session on log write failure
    }
  }
}

// ---- Singleton ----

let instance: DebugLoggerImpl | undefined;

/**
 * Get the shared debug logger instance.
 * Initializes from environment variables on first call.
 */
export function getLogger(): DebugLogger {
  if (instance === undefined) {
    instance = new DebugLoggerImpl();

    // Initialize from env vars
    const debugEnv = process.env.AUTODEV_DEBUG;
    const logTarget = process.env.AUTODEV_DEBUG_LOG;

    if (debugEnv === "true" || debugEnv === "1") {
      instance.enable(logTarget);
    }
  }
  return instance;
}

/**
 * Reset the logger singleton (test-only).
 * Does NOT create a new instance — the next getLogger() call will.
 */
export function resetLogger(): void {
  instance = undefined;
}
