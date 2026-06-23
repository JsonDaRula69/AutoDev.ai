/**
 * Watch Officer monitor module — proactive deviation detection.
 *
 * Registers a `tool_call` event handler via `pi.on("tool_call")` that
 * inspects tool calls for:
 *   - Plan deviations: write targets outside the active plan's scope
 *   - API mismatches: incorrect API usage vs documented patterns
 *   - Wrong assumptions: agent assumptions that don't match the codebase
 *
 * Flags are surfaced via `ctx.ui.notify` to the Harbor Master (the sole
 * user-facing contact). Does NOT block the tool call — only flags.
 */
import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flagged observation from the Watch Officer. */
interface WatchFlag {
  readonly type: "plan_deviation" | "api_mismatch" | "wrong_assumption";
  readonly toolName: string;
  readonly detail: string;
  readonly severity: "info" | "warning" | "error";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the active plan file path from `.omo/boulder.json` if it exists. */
function readActivePlan(projectRoot: string): string | undefined {
  const boulderPath = resolve(projectRoot, ".omo", "boulder.json");
  if (!existsSync(boulderPath)) return undefined;
  try {
    const boulder = JSON.parse(readFileSync(boulderPath, "utf8")) as {
      active_plan?: string;
    };
    return boulder.active_plan;
  } catch {
    return undefined;
  }
}

/** Read the active plan content to determine its scope. */
function readPlanScope(projectRoot: string): string | undefined {
  const activePlan = readActivePlan(projectRoot);
  if (!activePlan) return undefined;
  const planPath = resolve(projectRoot, ".omo", "plans", `${activePlan}.md`);
  if (!existsSync(planPath)) return undefined;
  try {
    return readFileSync(planPath, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Check if a write target path is within the active plan's scope.
 * This is a heuristic check — it looks for the target path in the plan content.
 */
function isWithinPlanScope(
  targetPath: string,
  planContent: string | undefined,
): boolean {
  if (!planContent) return true; // no active plan = no scope check
  // If the plan mentions the target path or a parent directory, it's in scope
  return planContent.includes(targetPath) || planContent.includes("all files");
}

/**
 * Check for potential API mismatches in tool calls.
 * Looks for common patterns that indicate incorrect API usage.
 */
function checkApiMismatch(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  // Check for common API misuse patterns
  if (toolName === "bash") {
    const command = input.command as string | undefined;
    if (command && command.includes("--force") && !command.includes("--dry-run")) {
      return `Destructive command without dry-run: "${command.substring(0, 100)}"`;
    }
  }
  if (toolName === "write" || toolName === "edit") {
    const content = input.content as string | undefined;
    if (content && content.includes("TODO") && !content.includes("FIXME")) {
      return "File contains TODO without FIXME — may indicate incomplete implementation";
    }
  }
  return undefined;
}

/**
 * Check for wrong assumptions in tool calls.
 * Looks for patterns that suggest the agent is making incorrect assumptions.
 */
function checkWrongAssumptions(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  if (toolName === "grep" || toolName === "glob") {
    const pattern = (input.pattern ?? input.query ?? input.include) as string | undefined;
    if (pattern && pattern.length > 0 && !pattern.includes("*") && !pattern.includes(".")) {
      return `Very specific search pattern "${pattern}" — may indicate incorrect assumption about file location`;
    }
  }
  return undefined;
}

/**
 * Inspect a tool call event and return any flags.
 */
function inspectToolCall(
  event: ToolCallEvent,
  projectRoot: string,
): WatchFlag | undefined {
  const input = event.input as Record<string, unknown> | undefined;
  if (!input) return undefined;

  // 1. Check for plan deviations on write/edit operations
  if (event.toolName === "write" || event.toolName === "edit") {
    const targetPath = (input.path ?? input.filePath) as string | undefined;
    if (targetPath) {
      const planContent = readPlanScope(projectRoot);
      if (!isWithinPlanScope(targetPath, planContent)) {
        return {
          type: "plan_deviation",
          toolName: event.toolName,
          detail: `Write target "${targetPath}" may be outside the active plan's scope`,
          severity: "warning",
        };
      }
    }
  }

  // 2. Check for API mismatches
  const apiIssue = checkApiMismatch(event.toolName, input);
  if (apiIssue) {
    return {
      type: "api_mismatch",
      toolName: event.toolName,
      detail: apiIssue,
      severity: "info",
    };
  }

  // 3. Check for wrong assumptions
  const assumptionIssue = checkWrongAssumptions(event.toolName, input);
  if (assumptionIssue) {
    return {
      type: "wrong_assumption",
      toolName: event.toolName,
      detail: assumptionIssue,
      severity: "info",
    };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI): void {
  const projectRoot = process.cwd();

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    const flag = inspectToolCall(event, projectRoot);
    if (flag === undefined) return undefined; // no issue found, allow the call

    // Surface the flag via ctx.ui.notify (non-blocking)
    const message = `[Watch Officer] ${flag.type}: ${flag.detail}`;
    ctx.ui.notify(message, flag.severity);

    // Always return undefined — the Watch Officer never blocks tool calls
    return undefined;
  });
}
