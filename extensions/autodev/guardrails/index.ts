/**
 * Guardrails module — hard-stop enforcement engine.
 *
 * Enforces programmatic hard stops: no direct deploy, no secrets in code,
 * evidence-required, one-task-at-a-time, follow-the-plan, CI-is-the-gate.
 * Implemented in sub-plan 2 (T7).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function register(_pi: ExtensionAPI): void {
  /* implemented in T7 */
}