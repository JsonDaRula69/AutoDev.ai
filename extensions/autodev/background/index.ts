/**
 * Background agents module — long-running crew members.
 *
 * Spawns and supervises background agent sessions (Explore, Engineer, Watch
 * Officer heartbeat). Implements:
 *  - Background agent manager with concurrency control + circuit breaker
 *  - Model fallback chains (proactive per-agent + reactive on errors)
 *  - Parent-wake notifier + error classifier
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { BackgroundManager, type BackgroundManagerOptions } from "./manager.js";

export type { BackgroundManager, BackgroundManagerOptions };
export { classifyError } from "./classifier.js";
export { resolveFallbackModel, loadFallbackConfig, loadModelAllowlist } from "./fallback.js";
export {
  type TaskState,
  type TaskStatus,
  type SpawnConfig,
  type ManagedSession,
  type SessionFactory,
  type SessionEvent,
  type ConcurrencyConfig,
  type ErrorClassification,
  providerKeyOf,
  isTerminal,
} from "./types.js";

let manager: BackgroundManager | undefined;

/**
 * Get the shared background manager instance. T9's delegation module calls
 * this to spawn background tasks.
 */
export function getBackgroundManager(): BackgroundManager {
  if (manager === undefined) {
    manager = new BackgroundManager();
  }
  return manager;
}

/**
 * Reset the shared manager (test-only). Replaces the singleton with a fresh
 * instance configured by `options`.
 */
export function resetBackgroundManager(options?: BackgroundManagerOptions): BackgroundManager {
  if (manager !== undefined) {
    manager.dispose();
  }
  manager = new BackgroundManager(options);
  return manager;
}

export function register(_pi: ExtensionAPI): void {
  // Eagerly initialize the manager singleton so T9 can access it.
  // The manager lazily loads config from disk on first spawn.
  getBackgroundManager();
}