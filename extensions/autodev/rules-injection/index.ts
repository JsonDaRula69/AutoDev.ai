/**
 * Rules injection module — dynamic guardrail rule loading.
 *
 * Loads `.autodev/config/guardrails.yaml` and dispatch rules, injecting them
 * as system-prompt context and tool-call gates. Implemented in sub-plan 4.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function register(_pi: ExtensionAPI): void {
  /* implemented in sub-plan 4 */
}