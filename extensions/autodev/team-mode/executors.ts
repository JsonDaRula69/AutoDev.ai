/**
 * team-mode tool executors — real coordination logic backed by the in-memory
 * team store. Each executor validates input against the store, performs the
 * operation, and returns a structured result for the calling agent.
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
import * as store from "./store.js";

type ToolResult = AgentToolResult<unknown>;

function text(body: string, details?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: body }],
    details: details ?? {},
  };
}

function err(message: string, details?: Record<string, unknown>): ToolResult {
  return text(`Error: ${message}`, { ...details, error: true });
}

export function teamCreateExecute(_id: string, params: TeamCreateInput): Promise<ToolResult> {
  let name: string;
  let purpose: string;
  let members: ReadonlyArray<{ role: string; count?: number }>;

  if (params.spec.kind === "named") {
    name = params.spec.name;
    purpose = `Named team spec: ${params.spec.name}`;
    members = [];
  } else {
    name = "inline-team";
    purpose = params.spec.purpose;
    members = params.spec.members.map((m) => ({ role: m.role, ...(m.count !== undefined ? { count: m.count } : {}) }));
  }

  const trigger = params.trigger ?? "manual";
  const team = store.createTeam({ name, purpose, trigger, members });

  const memberList = Array.from(team.members.values()).map((m) => `${m.id} (${m.role})`);
  return Promise.resolve(
    text(
      `Team "${team.name}" created with ${team.members.size} member(s): ${memberList.join(", ") || "(none)"}. Run ID: ${team.id}`,
      {
        teamRunId: team.id,
        name: team.name,
        purpose: team.purpose,
        trigger: team.trigger,
        members: Array.from(team.members.values()).map((m) => ({ id: m.id, role: m.role, status: m.status })),
      },
    ),
  );
}

export function teamDeleteExecute(_id: string, params: TeamDeleteInput): Promise<ToolResult> {
  const deleted = store.deleteTeam(params.runId);
  if (!deleted) {
    return Promise.resolve(err(`Team ${params.runId} not found or already deleted.`, { runId: params.runId }));
  }
  return Promise.resolve(
    text(`Team ${params.runId} deleted.`, { runId: params.runId, deleted: true }),
  );
}

export function teamShutdownRequestExecute(
  _id: string,
  params: TeamShutdownRequestInput,
): Promise<ToolResult> {
  const result = store.requestShutdown(params.runId, params.memberId, params.reason);
  if ("error" in result) {
    return Promise.resolve(err(result.error, { runId: params.runId, memberId: params.memberId }));
  }
  return Promise.resolve(
    text(
      `Shutdown requested for member ${params.memberId} in team ${params.runId}.${params.reason ? ` Reason: ${params.reason}` : ""}`,
      { runId: params.runId, memberId: params.memberId, status: result.status, reason: params.reason ?? null },
    ),
  );
}

export function teamApproveShutdownExecute(
  _id: string,
  params: TeamApproveShutdownInput,
): Promise<ToolResult> {
  const result = store.approveShutdown(params.runId, params.memberId);
  if ("error" in result) {
    return Promise.resolve(err(result.error, { runId: params.runId, memberId: params.memberId }));
  }
  return Promise.resolve(
    text(`Shutdown approved for member ${params.memberId} in team ${params.runId}.`, {
      runId: params.runId,
      memberId: params.memberId,
      status: result.status,
    }),
  );
}

export function teamRejectShutdownExecute(
  _id: string,
  params: TeamRejectShutdownInput,
): Promise<ToolResult> {
  const result = store.rejectShutdown(params.runId, params.memberId, params.reason);
  if ("error" in result) {
    return Promise.resolve(err(result.error, { runId: params.runId, memberId: params.memberId }));
  }
  return Promise.resolve(
    text(
      `Shutdown rejected for member ${params.memberId} in team ${params.runId}.${params.reason ? ` Reason: ${params.reason}` : ""}`,
      { runId: params.runId, memberId: params.memberId, status: result.status, reason: params.reason ?? null },
    ),
  );
}

export function teamSendMessageExecute(_id: string, params: TeamSendMessageInput): Promise<ToolResult> {
  const kind = params.kind ?? "note";
  const result = store.addMessage({
    teamRunId: params.runId,
    from: "agent",
    to: params.to,
    content: params.content,
    kind,
  });
  if ("error" in result) {
    return Promise.resolve(err(result.error, { runId: params.runId, to: params.to }));
  }
  const recipient = params.to === "broadcast" ? "all members" : params.to;
  return Promise.resolve(
    text(`Message sent to ${recipient} in team ${params.runId} (kind: ${kind}).`, {
      messageId: result.id,
      runId: params.runId,
      to: params.to,
      kind,
    }),
  );
}

export function teamTaskCreateExecute(_id: string, params: TeamTaskCreateInput): Promise<ToolResult> {
  const priority = params.priority ?? "medium";
  const result = store.createTask({
    teamRunId: params.runId,
    title: params.title,
    description: params.description ?? "",
    assignee: params.assignee ?? null,
    priority,
  });
  if ("error" in result) {
    return Promise.resolve(err(result.error, { runId: params.runId }));
  }
  return Promise.resolve(
    text(`Task "${params.title}" created in team ${params.runId} (id: ${result.id}, priority: ${priority}).`, {
      taskId: result.id,
      runId: params.runId,
      title: params.title,
      assignee: params.assignee ?? null,
      priority,
      status: "pending",
    }),
  );
}

export function teamTaskListExecute(_id: string, params: TeamTaskListInput): Promise<ToolResult> {
  const statusFilter = params.status ?? "all";
  const tasks = store.listTasks(params.runId, statusFilter);
  if (tasks.length === 0) {
    return Promise.resolve(
      text(`No tasks found in team ${params.runId} (filter: ${statusFilter}).`, {
        runId: params.runId,
        filter: statusFilter,
        tasks: [],
      }),
    );
  }
  const summary = tasks.map((t) => `[${t.status}] ${t.id}: ${t.title} (assignee: ${t.assignee ?? "none"}, priority: ${t.priority})`);
  return Promise.resolve(
    text(`${tasks.length} task(s) in team ${params.runId} (filter: ${statusFilter}):\n${summary.join("\n")}`, {
      runId: params.runId,
      filter: statusFilter,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignee: t.assignee,
        priority: t.priority,
      })),
    }),
  );
}

export function teamTaskUpdateExecute(_id: string, params: TeamTaskUpdateInput): Promise<ToolResult> {
  const result = store.updateTask({
    runId: params.runId,
    taskId: params.taskId,
    ...(params.status !== undefined ? { status: params.status } : {}),
    ...(params.assignee !== undefined ? { assignee: params.assignee } : {}),
    ...(params.note !== undefined ? { note: params.note } : {}),
  });
  if ("error" in result) {
    return Promise.resolve(err(result.error, { runId: params.runId, taskId: params.taskId }));
  }
  return Promise.resolve(
    text(`Task ${params.taskId} updated in team ${params.runId}. Status: ${result.status}, assignee: ${result.assignee ?? "none"}.`, {
      taskId: result.id,
      runId: params.runId,
      status: result.status,
      assignee: result.assignee,
      history: result.history,
    }),
  );
}

export function teamTaskGetExecute(_id: string, params: TeamTaskGetInput): Promise<ToolResult> {
  const task = store.getTask(params.runId, params.taskId);
  if (task === undefined) {
    return Promise.resolve(err(`Task ${params.taskId} not found in team ${params.runId}.`, { runId: params.runId, taskId: params.taskId }));
  }
  return Promise.resolve(
    text(
      `Task ${task.id}: "${task.title}"\nStatus: ${task.status}\nPriority: ${task.priority}\nAssignee: ${task.assignee ?? "none"}\nDescription: ${task.description || "(none)"}\nHistory: ${task.history.length} entr(y/ies)`,
      {
        taskId: task.id,
        runId: params.runId,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee,
        history: task.history,
      },
    ),
  );
}

export function teamStatusExecute(_id: string, params: TeamStatusInput): Promise<ToolResult> {
  const status = store.teamStatus(params.runId);
  if ("error" in status) {
    return Promise.resolve(err(status.error, { runId: params.runId }));
  }
  const memberLines = status.members.map((m) => `  ${m.id} (${m.role}): ${m.status}`);
  return Promise.resolve(
    text(
      `Team "${status.team.name}" (${status.team.id})\nTrigger: ${status.team.trigger}\nPurpose: ${status.team.purpose}\nMembers (${status.members.length}):\n${memberLines.join("\n")}\nTasks: ${status.taskSummary.total} (${status.taskSummary.pending} pending, ${status.taskSummary.in_progress} in_progress, ${status.taskSummary.completed} completed)\nMessages: ${status.messageCount}`,
      status,
    ),
  );
}

export function teamListExecute(_id: string, _params: TeamListInput): Promise<ToolResult> {
  const teams = store.listTeams();
  if (teams.length === 0) {
    return Promise.resolve(text("No active teams.", { teams: [] }));
  }
  const lines = teams.map((t) => `${t.id}: "${t.name}" (${t.members.size} members, ${t.tasks.size} tasks, trigger: ${t.trigger})`);
  return Promise.resolve(
    text(`${teams.length} active team(s):\n${lines.join("\n")}`, {
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        trigger: t.trigger,
        memberCount: t.members.size,
        taskCount: t.tasks.size,
      })),
    }),
  );
}