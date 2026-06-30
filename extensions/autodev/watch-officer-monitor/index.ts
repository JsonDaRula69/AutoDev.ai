/**
 * Watch Officer monitor module — proactive deviation detection.
 *
 * Registers a `tool_call` event handler via `pi.on("tool_call")` that
 * inspects tool calls for:
 *   - Plan deviations: write targets outside the active plan's scope
 *   - API mismatches: incorrect API usage vs documented patterns
 *   - Wrong assumptions: agent assumptions that don't match the codebase
 *
 * Flags are surfaced three ways:
 *   1. `ctx.ui.notify` — immediate non-blocking notification to the session
 *   2. Observation log — accumulated list queryable via `watch_officer_status`
 *   3. Team mailbox — posted to the active team's mailbox so other agents
 *      can see Watch Officer observations during multi-agent work
 *
 * Does NOT block the tool call — only flags.
 */
import type { ExtensionAPI, ToolCallEvent, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as teamStore from "../team-mode/store.js";

type ToolResult = AgentToolResult<unknown>;

function text(body: string, details?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: body }],
    details: details ?? {},
  };
}

export interface WatchFlag {
  readonly id: string;
  readonly type: "plan_deviation" | "api_mismatch" | "wrong_assumption";
  readonly toolName: string;
  readonly detail: string;
  readonly severity: "info" | "warning" | "error";
  readonly timestamp: string;
}

let _flagCounter = 0;
const _observationLog: WatchFlag[] = [];

export function _resetObservationLog(): void {
  _observationLog.length = 0;
  _flagCounter = 0;
}

export function getObservations(filter?: {
  type?: WatchFlag["type"];
  severity?: WatchFlag["severity"];
}): readonly WatchFlag[] {
  return _observationLog.filter(
    (f) =>
      (filter?.type === undefined || f.type === filter.type) &&
      (filter?.severity === undefined || f.severity === filter.severity),
  );
}

export function clearObservations(): number {
  const count = _observationLog.length;
  _observationLog.length = 0;
  return count;
}

function recordFlag(flag: Omit<WatchFlag, "id" | "timestamp">): WatchFlag {
  _flagCounter++;
  const full: WatchFlag = {
    ...flag,
    id: `wf-${_flagCounter}`,
    timestamp: new Date().toISOString(),
  };
  _observationLog.push(full);
  return full;
}

function postToTeamMailbox(flag: WatchFlag): void {
  const teams = teamStore.listTeams();
  if (teams.length === 0) return;
  for (const team of teams) {
    if (team.deleted) continue;
    teamStore.addMessage({
      teamRunId: team.id,
      from: "watch-officer",
      to: "broadcast",
      content: `[${flag.severity}] ${flag.type} on ${flag.toolName}: ${flag.detail}`,
      kind: flag.severity === "error" ? "blocker" : flag.severity === "warning" ? "flag" : "note",
    });
  }
}

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

function isWithinPlanScope(
  targetPath: string,
  planContent: string | undefined,
): boolean {
  if (!planContent) return true;
  return planContent.includes(targetPath) || planContent.includes("all files");
}

function checkApiMismatch(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
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

function inspectToolCall(
  event: ToolCallEvent,
  projectRoot: string,
): Omit<WatchFlag, "id" | "timestamp"> | undefined {
  const input = event.input as Record<string, unknown> | undefined;
  if (!input) return undefined;

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

  const apiIssue = checkApiMismatch(event.toolName, input);
  if (apiIssue) {
    return {
      type: "api_mismatch",
      toolName: event.toolName,
      detail: apiIssue,
      severity: "info",
    };
  }

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

export function executeWatchOfficerStatus(params: {
  type?: "plan_deviation" | "api_mismatch" | "wrong_assumption";
  severity?: "info" | "warning" | "error";
}): ToolResult {
  const observations = getObservations({
    ...(params.type !== undefined ? { type: params.type } : {}),
    ...(params.severity !== undefined ? { severity: params.severity } : {}),
  });
  if (observations.length === 0) {
    return text("Watch Officer: no observations recorded.", {
      count: 0,
      observations: [],
    });
  }
  const lines = observations.map(
    (f) => `[${f.severity}] ${f.type} (${f.toolName}): ${f.detail}`,
  );
  return text(
    `Watch Officer: ${observations.length} observation(s):\n${lines.join("\n")}`,
    {
      count: observations.length,
      observations: observations.map((f) => ({
        id: f.id,
        type: f.type,
        toolName: f.toolName,
        detail: f.detail,
        severity: f.severity,
        timestamp: f.timestamp,
      })),
    },
  );
}

export function executeWatchOfficerClear(): ToolResult {
  const cleared = clearObservations();
  return text(`Watch Officer: cleared ${cleared} observation(s).`, {
    cleared,
  });
}

export function _inspectForTesting(
  event: { toolName: string; input: Record<string, unknown> | undefined },
  projectRoot: string,
): WatchFlag | undefined {
  const flag = inspectToolCall(event as ToolCallEvent, projectRoot);
  if (flag === undefined) return undefined;
  const full = recordFlag(flag);
  postToTeamMailbox(full);
  return full;
}

export function register(pi: ExtensionAPI): void {
  const projectRoot = process.cwd();

  pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
    const flagData = inspectToolCall(event, projectRoot);
    if (flagData === undefined) return undefined;

    const flag = recordFlag(flagData);
    const message = `[Watch Officer] ${flag.type}: ${flag.detail}`;
    ctx.ui.notify(message, flag.severity);

    postToTeamMailbox(flag);

    return undefined;
  });

  pi.registerTool({
    name: "watch_officer_status",
    label: "Watch Officer Status",
    description:
      "Read the Watch Officer's accumulated observations. " +
      "Optionally filter by type (plan_deviation, api_mismatch, wrong_assumption) " +
      "or severity (info, warning, error). Returns all observations when no filter is given.",
    parameters: Type.Object({
      type: Type.Optional(
        Type.Union(
          [
            Type.Literal("plan_deviation"),
            Type.Literal("api_mismatch"),
            Type.Literal("wrong_assumption"),
          ],
          { description: "Filter by observation type" },
        ),
      ),
      severity: Type.Optional(
        Type.Union(
          [
            Type.Literal("info"),
            Type.Literal("warning"),
            Type.Literal("error"),
          ],
          { description: "Filter by severity" },
        ),
      ),
    }),
    execute: async (_id, params) => {
      const p = params as { type?: string; severity?: string };
      return executeWatchOfficerStatus({
        ...(p.type !== undefined ? { type: p.type as "plan_deviation" | "api_mismatch" | "wrong_assumption" } : {}),
        ...(p.severity !== undefined ? { severity: p.severity as "info" | "warning" | "error" } : {}),
      });
    },
  });

  pi.registerTool({
    name: "watch_officer_clear",
    label: "Watch Officer Clear",
    description:
      "Clear the Watch Officer's observation log. Call this when starting " +
      "a new work session or after acknowledging all flags.",
    parameters: Type.Object({}),
    execute: async () => executeWatchOfficerClear(),
  });
}