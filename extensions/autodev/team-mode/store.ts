/**
 * In-memory team store — holds all team runs, members, messages, and tasks.
 *
 * Single process, shared memory. No persistence. Teams are ephemeral: they
 * exist for the duration of a coordination need (onboarding, work session,
 * hyperplan) and are deleted when done.
 *
 * The store is a singleton module-level instance. All executors import it
 * directly. This is intentional — pi runs in-process and all tools share
 * memory. If persistence is needed later, swap this module for a SQLite
 * backend without changing the executor signatures.
 */

export type MemberStatus = "active" | "shutdown_requested" | "shutdown_approved" | "shutdown_rejected" | "stopped";
export type MessageKind = "note" | "flag" | "question" | "blocker";
export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "high" | "medium" | "low";

export interface Member {
  readonly id: string;
  readonly role: string;
  readonly teamRunId: string;
  status: MemberStatus;
  shutdownReason: string | null;
  shutdownRejectedReason: string | null;
  joinedAt: string;
}

export interface MailboxMessage {
  readonly id: string;
  readonly teamRunId: string;
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly kind: MessageKind;
  readonly createdAt: string;
}

export interface TaskHistoryEntry {
  readonly timestamp: string;
  readonly action: string;
  readonly actor: string | null;
  readonly note: string | null;
}

export interface Task {
  readonly id: string;
  readonly teamRunId: string;
  title: string;
  description: string;
  assignee: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  history: TaskHistoryEntry[];
  createdAt: string;
}

export interface TeamRun {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly trigger: string;
  members: Map<string, Member>;
  mailbox: MailboxMessage[];
  tasks: Map<string, Task>;
  createdAt: string;
  deleted: boolean;
}

let _counter = 0;
function nextId(prefix: string): string {
  _counter++;
  return `${prefix}-${Date.now().toString(36)}-${_counter}`;
}

const _teams = new Map<string, TeamRun>();

export function createTeam(params: {
  name: string;
  purpose: string;
  trigger: string;
  members: ReadonlyArray<{ role: string; count?: number }>;
}): TeamRun {
  const id = nextId("team");
  const team: TeamRun = {
    id,
    name: params.name,
    purpose: params.purpose,
    trigger: params.trigger,
    members: new Map(),
    mailbox: [],
    tasks: new Map(),
    createdAt: new Date().toISOString(),
    deleted: false,
  };
  for (const m of params.members) {
    const count = m.count ?? 1;
    for (let i = 0; i < count; i++) {
      const memberId = count > 1 ? `${m.role}-${i + 1}` : m.role;
      team.members.set(memberId, {
        id: memberId,
        role: m.role,
        teamRunId: id,
        status: "active",
        shutdownReason: null,
        shutdownRejectedReason: null,
        joinedAt: new Date().toISOString(),
      });
    }
  }
  _teams.set(id, team);
  return team;
}

export function getTeam(runId: string): TeamRun | undefined {
  return _teams.get(runId);
}

export function listTeams(): readonly TeamRun[] {
  return Array.from(_teams.values()).filter((t) => !t.deleted);
}

export function deleteTeam(runId: string): boolean {
  const team = _teams.get(runId);
  if (team === undefined) return false;
  team.deleted = true;
  _teams.delete(runId);
  return true;
}

export function addMessage(params: {
  teamRunId: string;
  from: string;
  to: string;
  content: string;
  kind: MessageKind;
}): MailboxMessage | { error: string } {
  const team = _teams.get(params.teamRunId);
  if (team === undefined) return { error: `Team ${params.teamRunId} not found` };
  if (params.to !== "broadcast" && !team.members.has(params.to)) {
    return { error: `Recipient ${params.to} is not a member of team ${params.teamRunId}` };
  }
  const msg: MailboxMessage = {
    id: nextId("msg"),
    teamRunId: params.teamRunId,
    from: params.from,
    to: params.to,
    content: params.content,
    kind: params.kind,
    createdAt: new Date().toISOString(),
  };
  team.mailbox.push(msg);
  return msg;
}

export function getMessages(runId: string, filter?: { to?: string; from?: string }): readonly MailboxMessage[] {
  const team = _teams.get(runId);
  if (team === undefined) return [];
  return team.mailbox.filter(
    (m) =>
      (filter?.to === undefined || m.to === filter.to || m.to === "broadcast") &&
      (filter?.from === undefined || m.from === filter.from),
  );
}

export function createTask(params: {
  teamRunId: string;
  title: string;
  description: string;
  assignee: string | null;
  priority: TaskPriority;
}): Task | { error: string } {
  const team = _teams.get(params.teamRunId);
  if (team === undefined) return { error: `Team ${params.teamRunId} not found` };
  const id = nextId("task");
  const task: Task = {
    id,
    teamRunId: params.teamRunId,
    title: params.title,
    description: params.description,
    assignee: params.assignee,
    status: "pending",
    priority: params.priority,
    history: [
      { timestamp: new Date().toISOString(), action: "created", actor: null, note: null },
    ],
    createdAt: new Date().toISOString(),
  };
  team.tasks.set(id, task);
  return task;
}

export function getTask(runId: string, taskId: string): Task | undefined {
  return _teams.get(runId)?.tasks.get(taskId);
}

export function listTasks(runId: string, statusFilter?: TaskStatus | "all"): readonly Task[] {
  const team = _teams.get(runId);
  if (team === undefined) return [];
  const all = Array.from(team.tasks.values());
  if (statusFilter === undefined || statusFilter === "all") return all;
  return all.filter((t) => t.status === statusFilter);
}

export function updateTask(params: {
  runId: string;
  taskId: string;
  status?: TaskStatus;
  assignee?: string;
  note?: string;
}): Task | { error: string } {
  const team = _teams.get(params.runId);
  if (team === undefined) return { error: `Team ${params.runId} not found` };
  const task = team.tasks.get(params.taskId);
  if (task === undefined) return { error: `Task ${params.taskId} not found in team ${params.runId}` };

  const changes: string[] = [];
  if (params.status !== undefined && params.status !== task.status) {
    changes.push(`status: ${task.status} → ${params.status}`);
    task.status = params.status;
  }
  if (params.assignee !== undefined && params.assignee !== task.assignee) {
    changes.push(`assignee: ${task.assignee ?? "unassigned"} → ${params.assignee}`);
    task.assignee = params.assignee;
  }
  if (changes.length > 0 || params.note !== undefined) {
    task.history.push({
      timestamp: new Date().toISOString(),
      action: changes.length > 0 ? changes.join("; ") : "note",
      actor: null,
      note: params.note ?? null,
    });
  }
  return task;
}

export function requestShutdown(runId: string, memberId: string, reason?: string): Member | { error: string } {
  const team = _teams.get(runId);
  if (team === undefined) return { error: `Team ${runId} not found` };
  const member = team.members.get(memberId);
  if (member === undefined) return { error: `Member ${memberId} not found in team ${runId}` };
  if (member.status === "stopped") return { error: `Member ${memberId} is already stopped` };
  member.status = "shutdown_requested";
  member.shutdownReason = reason ?? null;
  return member;
}

export function approveShutdown(runId: string, memberId: string): Member | { error: string } {
  const team = _teams.get(runId);
  if (team === undefined) return { error: `Team ${runId} not found` };
  const member = team.members.get(memberId);
  if (member === undefined) return { error: `Member ${memberId} not found in team ${runId}` };
  if (member.status !== "shutdown_requested") {
    return { error: `Member ${memberId} has no pending shutdown request (status: ${member.status})` };
  }
  member.status = "shutdown_approved";
  return member;
}

export function rejectShutdown(runId: string, memberId: string, reason?: string): Member | { error: string } {
  const team = _teams.get(runId);
  if (team === undefined) return { error: `Team ${runId} not found` };
  const member = team.members.get(memberId);
  if (member === undefined) return { error: `Member ${memberId} not found in team ${runId}` };
  if (member.status !== "shutdown_requested") {
    return { error: `Member ${memberId} has no pending shutdown request (status: ${member.status})` };
  }
  member.status = "shutdown_rejected";
  member.shutdownRejectedReason = reason ?? null;
  return member;
}

export function teamStatus(runId: string): {
  team: { id: string; name: string; purpose: string; trigger: string; createdAt: string };
  members: ReadonlyArray<{ id: string; role: string; status: MemberStatus }>;
  taskSummary: { pending: number; in_progress: number; completed: number; total: number };
  messageCount: number;
} | { error: string } {
  const team = _teams.get(runId);
  if (team === undefined) return { error: `Team ${runId} not found` };
  const tasks = Array.from(team.tasks.values());
  return {
    team: {
      id: team.id,
      name: team.name,
      purpose: team.purpose,
      trigger: team.trigger,
      createdAt: team.createdAt,
    },
    members: Array.from(team.members.values()).map((m) => ({ id: m.id, role: m.role, status: m.status })),
    taskSummary: {
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      total: tasks.length,
    },
    messageCount: team.mailbox.length,
  };
}

export function _resetStore(): void {
  _teams.clear();
  _counter = 0;
}