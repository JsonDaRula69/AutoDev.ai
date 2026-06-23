/**
 * Session error handling + fallback orchestration.
 *
 * Extracted from BackgroundManager to stay under the 250 LOC ceiling. This
 * module owns the classify → resolve-fallback → re-spawn flow. The manager
 * delegates `handleSessionError()` here and receives instructions back via
 * the `ErrorHandlerResult` discriminated union, so the manager keeps sole
 * ownership of task state mutation.
 */
import type { TaskState } from "./types.js";
import { providerKeyOf } from "./types.js";
import { classifyError } from "./classifier.js";
import { resolveFallbackModel, type ResolvedFallbackConfig } from "./fallback.js";

/** Inputs for handleSessionError. */
export interface ErrorHandlerInput {
  readonly id: string;
  readonly state: TaskState;
  readonly error: unknown;
  readonly fallbackConfig: ResolvedFallbackConfig | undefined;
}

/** The manager must mark the task terminal and surface this error. */
export interface TerminateResult {
  readonly action: "terminate";
  readonly error: string;
}

/** The manager must re-spawn with the fallback model. */
export interface RespawnResult {
  readonly action: "respawn";
  readonly model: string;
  readonly providerKey: string;
  readonly reason: string;
}

export type ErrorHandlerResult = TerminateResult | RespawnResult;

/**
 * Classify the error and decide: terminate (fatal / no fallback) or respawn
 * (retryable + fallback available). Pure — does not mutate state.
 */
export function handleSessionError(input: ErrorHandlerInput): ErrorHandlerResult {
  const { state, error, fallbackConfig } = input;
  const classification = classifyError(error);

  if (!classification.retryable) {
    return { action: "terminate", error: classification.reason };
  }

  const resolution = resolveFallbackModel({
    agentName: state.agentName ?? "",
    error,
    currentModel: state.model,
    triedModels: state.triedModels,
    config: fallbackConfig,
  });

  if (resolution === undefined) {
    return { action: "terminate", error: `no-fallback-available: ${classification.reason}` };
  }

  return {
    action: "respawn",
    model: resolution.model,
    providerKey: providerKeyOf(resolution.model),
    reason: resolution.reason,
  };
}