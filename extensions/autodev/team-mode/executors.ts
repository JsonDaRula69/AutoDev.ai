/**
 * team-mode tool executors — stub implementations returning structured
 * responses. The real coordination logic (mailbox, tasklist, member
 * lifecycle) arrives in a later sub-plan; these stubs make the tools
 * callable and schema-validated today.
 */
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type {
  TeamCreateInput,
  TeamDeleteInput,
  TeamShutdownRequestInput,
  TeamApproveShutdownInput,
  TeamRejectShutdownInput,
  TeamSendMessageInput,
  TeamTaskCreateInput,
  TeamTaskListInput,
  TeamTaskUpdateInput,
  TeamTaskGetInput,
  TeamStatusInput,
  TeamListInput,
} from "./schemas.js";

type ToolResult = AgentToolResult<unknown>;

function text(body: string, details?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: body }],
    details: details ?? {},
  };
}

function ok(name: string, params: Record<string, unknown>): ToolResult {
  return text(`[stub] ${name} accepted`, { name, params, status: "stub" });
}

export function teamCreateExecute(
  _id: string,
  params: TeamCreateInput,
): Promise<ToolResult> {
  return Promise.resolve(ok("team_create", { spec: params.spec, trigger: params.trigger ?? "manual" }));
}

export function teamDeleteExecute(
  _id: string,
  params: TeamDeleteInput,
): Promise<ToolResult> {
  return Promise.resolve(ok("team_delete", { runId: params.runId }));
}

export function teamShutdownRequestExecute(
  _id: string,
  params: TeamShutdownRequestInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_shutdown_request", {
      runId: params.runId,
      memberId: params.memberId,
      reason: params.reason,
    }),
  );
}

export function teamApproveShutdownExecute(
  _id: string,
  params: TeamApproveShutdownInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_approve_shutdown", { runId: params.runId, memberId: params.memberId }),
  );
}

export function teamRejectShutdownExecute(
  _id: string,
  params: TeamRejectShutdownInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_reject_shutdown", {
      runId: params.runId,
      memberId: params.memberId,
      reason: params.reason,
    }),
  );
}

export function teamSendMessageExecute(
  _id: string,
  params: TeamSendMessageInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_send_message", {
      runId: params.runId,
      to: params.to,
      kind: params.kind ?? "note",
    }),
  );
}

export function teamTaskCreateExecute(
  _id: string,
  params: TeamTaskCreateInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_task_create", {
      runId: params.runId,
      title: params.title,
      assignee: params.assignee,
      priority: params.priority ?? "medium",
    }),
  );
}

export function teamTaskListExecute(
  _id: string,
  params: TeamTaskListInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_task_list", { runId: params.runId, status: params.status ?? "all" }),
  );
}

export function teamTaskUpdateExecute(
  _id: string,
  params: TeamTaskUpdateInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_task_update", {
      runId: params.runId,
      taskId: params.taskId,
      status: params.status,
      assignee: params.assignee,
    }),
  );
}

export function teamTaskGetExecute(
  _id: string,
  params: TeamTaskGetInput,
): Promise<ToolResult> {
  return Promise.resolve(
    ok("team_task_get", { runId: params.runId, taskId: params.taskId }),
  );
}

export function teamStatusExecute(
  _id: string,
  params: TeamStatusInput,
): Promise<ToolResult> {
  return Promise.resolve(ok("team_status", { runId: params.runId }));
}

export function teamListExecute(
  _id: string,
  params: TeamListInput,
): Promise<ToolResult> {
  return Promise.resolve(ok("team_list", {}));
}