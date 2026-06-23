/**
 * Debug mode module — wires pi events to the structured debug logger.
 *
 * Registers event handlers for:
 *  - pi.on("tool_call") — log tool calls and results
 *  - pi.on("agent_end") — log main session completion
 *  - Background manager events (via getBackgroundManager().listTasks())
 *  - Heartbeat onTick results
 *
 * Also adds `--debug` flag support for CLI commands.
 *
 * Debug mode is OFF by default. Enable via:
 *  - `AUTODEV_DEBUG=true` env var
 *  - `autodev doctor --debug on`
 *  - `--debug` flag on CLI commands
 */

import type { ExtensionAPI, ToolCallEvent, AgentEndEvent } from "@earendil-works/pi-coding-agent";
import { getLogger, type DebugLogger } from "./logger.js";
import { getBackgroundManager } from "../background/index.js";
import { onTick, getHeartbeatState } from "../orchestrator/heartbeat.js";

// ---- Types ----

export interface DebugState {
  readonly enabled: boolean;
  readonly target: string;
}

// ---- State ----

let registered = false;
let heartbeatUnsubscribe: (() => void) | undefined;
let backgroundPollTimer: ReturnType<typeof setInterval> | undefined;

// ---- Public API ----

/**
 * Get the current debug state.
 */
export function getDebugState(): DebugState {
  const logger = getLogger();
  return {
    enabled: logger.enabled,
    target: logger.target,
  };
}

/**
 * Enable debug mode.
 */
export function enableDebug(target?: string): void {
  const logger = getLogger();
  logger.enable(target);
}

/**
 * Disable debug mode.
 */
export function disableDebug(): void {
  const logger = getLogger();
  logger.disable();
}

/**
 * Toggle debug mode on/off.
 */
export function toggleDebug(target?: string): boolean {
  const logger = getLogger();
  if (logger.enabled) {
    logger.disable();
    return false;
  }
  logger.enable(target);
  return true;
}

// ---- Event wiring ----

function wirePiEvents(pi: ExtensionAPI, logger: DebugLogger): void {
  // Log tool calls
  pi.on("tool_call", (event: ToolCallEvent, _ctx) => {
    if (!logger.enabled) return;
    logger.log({
      timestamp: new Date().toISOString(),
      level: "debug",
      event: "tool_call",
      data: {
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: event.input,
      },
    });
  });

  // Log agent end (main session completion)
  pi.on("agent_end", (event: AgentEndEvent, _ctx) => {
    if (!logger.enabled) return;
    logger.log({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "agent_end",
      data: {
        messageCount: event.messages.length,
      },
    });
  });
}

function wireBackgroundEvents(logger: DebugLogger): void {
  // Poll background manager for task state changes
  // This is a lightweight poll — the manager tracks tasks in-memory
  const pollInterval = 5_000; // 5 seconds

  backgroundPollTimer = setInterval(() => {
    if (!logger.enabled) return;

    try {
      const manager = getBackgroundManager();
      const tasks = manager.listTasks();

      for (const task of tasks) {
        // Only log non-terminal tasks that are running
        if (task.status === "running" || task.status === "pending") {
          logger.log({
            timestamp: new Date().toISOString(),
            level: "debug",
            event: "background_task_state",
            taskId: task.id,
            data: {
              status: task.status,
              model: task.model,
              agentName: task.agentName,
              startedAt: task.startedAt,
            },
          });
        }

        // Log completed/errored tasks once
        if (task.status === "completed" || task.status === "error") {
          logger.log({
            timestamp: new Date().toISOString(),
            level: task.status === "error" ? "error" : "info",
            event: "background_task_complete",
            taskId: task.id,
            data: {
              status: task.status,
              model: task.model,
              agentName: task.agentName,
              error: task.error,
            },
          });
        }
      }
    } catch {
      // Best-effort — background manager may not be initialized
    }
  }, pollInterval);
}

function wireHeartbeatEvents(logger: DebugLogger): void {
  // Subscribe to heartbeat onTick callbacks
  onTick((state) => {
    if (!logger.enabled) return;
    logger.log({
      timestamp: new Date().toISOString(),
      level: "debug",
      event: "heartbeat_tick",
      data: {
        running: state.running,
        tickCount: state.tickCount,
        errors: state.errors,
        intervalMs: state.intervalMs,
        lastTickAt: state.lastTickAt,
      },
    });
  });
}

// ---- Registration ----

/**
 * Register the debug module with the pi extension.
 *
 * Wires event handlers and initializes the logger from env vars.
 * Safe to call multiple times (idempotent).
 */
export function register(pi: ExtensionAPI): void {
  if (registered) return;
  registered = true;

  const logger = getLogger();

  // Wire pi events
  wirePiEvents(pi, logger);

  // Wire background events
  wireBackgroundEvents(logger);

  // Wire heartbeat events
  wireHeartbeatEvents(logger);

  // Log startup state
  if (logger.enabled) {
    logger.log({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "debug_mode_enabled",
      data: {
        target: logger.target,
      },
    });
  }
}

/**
 * Cleanup — stop timers and flush pending writes.
 */
export async function dispose(): Promise<void> {
  if (backgroundPollTimer !== undefined) {
    clearInterval(backgroundPollTimer);
    backgroundPollTimer = undefined;
  }

  const logger = getLogger();
  await logger.flush();
}

/**
 * Reset registration state (test-only).
 */
export function resetRegistration(): void {
  registered = false;
}
