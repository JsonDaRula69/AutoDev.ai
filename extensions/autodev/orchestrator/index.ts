/**
 * Orchestrator module — heartbeat, crew dispatch, and CLI commands.
 *
 * Exports `register(pi)` which:
 * 1. Registers CLI subcommands (doctor, onboard, status, stop, docs, debate).
 * 2. Starts the heartbeat timer (polls GitHub for new work).
 *
 * The heartbeat runs on extension load and continues until stopped.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./cli.js";
import { startHeartbeat } from "./heartbeat.js";

export { getHeartbeatState, stopHeartbeat, startHeartbeat, setHeartbeatInterval } from "./heartbeat.js";
export { dispatchIssue, parseTriageResult } from "./dispatch.js";
export {
  loadRegistry,
  saveRegistry,
  getActiveProject,
  setActiveProject,
  addProject,
  removeProject,
  defaultRegistry,
} from "./projects.js";
export type { ProjectEntry, ProjectRegistry } from "./projects.js";
export type { HeartbeatState, GitHubIssue, WorkItem } from "./heartbeat.js";
export type { DispatchConfig, DispatchResult, TriageResult } from "./dispatch.js";

export function register(pi: ExtensionAPI): void {
  // Register CLI subcommands
  registerCommands(pi);

  // Start the heartbeat timer
  startHeartbeat();
}
