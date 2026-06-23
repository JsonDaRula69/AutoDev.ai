/**
 * Error classifier for background agent failures.
 *
 * Distinguishes retryable failures (transient: rate limits, server errors,
 * timeouts) from fatal ones (auth, context overflow). The classifier never
 * throws — it always returns a classification, defaulting to non-retryable
 * for unrecognized errors so the manager surfaces unknowns rather than
 * retrying blindly.
 */
import type { ErrorClassification } from "./types.js";

/** HTTP status codes considered retryable. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** HTTP status codes considered fatal (non-retryable). */
const FATAL_STATUS = new Set([401, 403]);

/**
 * Normalize an error-like value into a best-effort { status, message } shape.
 *
 * Accepts Error, { status, message }, string, or unknown. Never throws.
 */
function normalizeError(error: unknown): { status: number | undefined; message: string } {
  if (error instanceof Error) {
    const status = extractStatus(error as unknown as Record<string, unknown>);
    return { status, message: error.message };
  }
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    const status = typeof e["status"] === "number" ? e["status"] : extractStatus(e);
    const message = typeof e["message"] === "string" ? e["message"] : JSON.stringify(error);
    return { status, message };
  }
  if (typeof error === "string") {
    return { status: undefined, message: error };
  }
  return { status: undefined, message: String(error) };
}

/** Extract an HTTP status from a record (status, statusCode, httpStatus). */
function extractStatus(obj: Record<string, unknown>): number | undefined {
  for (const key of ["status", "statusCode", "httpStatus"]) {
    const v = obj[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

/** Check if a message string indicates a timeout. */
function isTimeoutMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("deadline exceeded") ||
    lower.includes("etimedout") ||
    lower.includes("aborted")
  );
}

/** Check if a message string indicates context overflow. */
function isContextOverflowMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("context overflow") ||
    lower.includes("context_length_exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("prompt is too long") ||
    lower.includes("context window")
  );
}

/**
 * Classify an error as retryable or fatal.
 *
 * Retryable: HTTP 429, 500, 502, 503, 504, or timeout-style messages.
 * Fatal: HTTP 401, 403, or context-overflow-style messages.
 * Unknown errors default to non-retryable (fatal) to avoid blind retry loops.
 */
export function classifyError(error: unknown): ErrorClassification {
  const { status, message } = normalizeError(error);

  // Context overflow is fatal regardless of status.
  if (isContextOverflowMessage(message)) {
    return { retryable: false, reason: "context-overflow" };
  }

  // Auth errors are fatal.
  if (status !== undefined && FATAL_STATUS.has(status)) {
    return { retryable: false, reason: `auth-error-${status}` };
  }

  // Retryable HTTP statuses.
  if (status !== undefined && RETRYABLE_STATUS.has(status)) {
    return { retryable: true, reason: `retryable-http-${status}` };
  }

  // Timeout messages are retryable.
  if (isTimeoutMessage(message)) {
    return { retryable: true, reason: "timeout" };
  }

  // Unknown error: non-retryable by default.
  return { retryable: false, reason: "unknown-non-retryable" };
}