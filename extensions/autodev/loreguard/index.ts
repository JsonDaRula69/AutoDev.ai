/**
 * Loreguard module — ratified decision store.
 *
 * Wraps the Loreguard FTS5 store so agents can search_lore / suggest_lore
 * before any decision that touches production integrity. Implemented in
 * sub-plan 3 (T10).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function register(_pi: ExtensionAPI): void {
  /* implemented in T10 */
}