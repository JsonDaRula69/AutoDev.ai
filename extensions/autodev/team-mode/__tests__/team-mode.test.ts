import { test, expect, beforeEach } from "bun:test";
import * as store from "../store.js";
import {
  teamCreateExecute,
  teamDeleteExecute,
  teamShutdownRequestExecute,
  teamApproveShutdownExecute,
  teamRejectShutdownExecute,
  teamSendMessageExecute,
  teamTaskCreateExecute,
  teamTaskListExecute,
  teamTaskUpdateExecute,
  teamTaskGetExecute,
  teamStatusExecute,
  teamListExecute,
} from "../executors.js";

beforeEach(() => {
  store._resetStore();
});

test("team_create with inline spec creates team with members", async () => {
  const result = await teamCreateExecute("id", {
    spec: {
      kind: "inline",
      members: [{ role: "nemo" }, { role: "oracle" }, { role: "momus", count: 2 }],
      purpose: "Review onboarding results",
    },
    trigger: "onboarding",
  });
  expect(result.details).toHaveProperty("teamRunId");
  const runId = (result.details as { teamRunId: string }).teamRunId;
  const team = store.getTeam(runId);
  expect(team).toBeDefined();
  expect(team!.members.size).toBe(4);
  expect(team!.members.has("nemo")).toBe(true);
  expect(team!.members.has("oracle")).toBe(true);
  expect(team!.members.has("momus-1")).toBe(true);
  expect(team!.members.has("momus-2")).toBe(true);
  expect(team!.trigger).toBe("onboarding");
});

test("team_create with named spec creates empty team", async () => {
  const result = await teamCreateExecute("id", {
    spec: { kind: "named", name: "review-team" },
  });
  const runId = (result.details as { teamRunId: string }).teamRunId;
  const team = store.getTeam(runId);
  expect(team).toBeDefined();
  expect(team!.name).toBe("review-team");
  expect(team!.members.size).toBe(0);
});

test("team_delete removes the team", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "named", name: "temp" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  const delResult = await teamDeleteExecute("id", { runId });
  expect((delResult.details as { deleted: boolean }).deleted).toBe(true);
  expect(store.getTeam(runId)).toBeUndefined();
});

test("team_delete on nonexistent team returns error", async () => {
  const result = await teamDeleteExecute("id", { runId: "nonexistent" });
  expect((result.details as { error: boolean }).error).toBe(true);
});

test("team_send_message to specific member", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }, { role: "oracle" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  const msgResult = await teamSendMessageExecute("id", {
    runId,
    to: "oracle",
    content: "Please review the PR",
    kind: "flag",
  });
  expect((msgResult.details as { kind: string }).kind).toBe("flag");
  const msgs = store.getMessages(runId);
  expect(msgs.length).toBe(1);
  expect(msgs[0]!.to).toBe("oracle");
  expect(msgs[0]!.content).toBe("Please review the PR");
});

test("team_send_message broadcast reaches all", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }, { role: "oracle" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  await teamSendMessageExecute("id", {
    runId,
    to: "broadcast",
    content: "All hands on deck",
  });
  const msgs = store.getMessages(runId);
  expect(msgs.length).toBe(1);
  expect(msgs[0]!.to).toBe("broadcast");
});

test("team_send_message to nonexistent member returns error", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  const result = await teamSendMessageExecute("id", {
    runId,
    to: "ghost",
    content: "boo",
  });
  expect((result.details as { error: boolean }).error).toBe(true);
});

test("team_task_create and task_get", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  const taskResult = await teamTaskCreateExecute("id", {
    runId,
    title: "Review PR #42",
    description: "Check for security issues",
    assignee: "oracle",
    priority: "high",
  });
  const taskId = (taskResult.details as { taskId: string }).taskId;
  expect(taskId).toBeDefined();

  const getResult = await teamTaskGetExecute("id", { runId, taskId });
  const details = getResult.details as { title: string; status: string; priority: string };
  expect(details.title).toBe("Review PR #42");
  expect(details.status).toBe("pending");
  expect(details.priority).toBe("high");
});

test("team_task_list filters by status", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  await teamTaskCreateExecute("id", { runId, title: "Task A" });
  const t2 = await teamTaskCreateExecute("id", { runId, title: "Task B" });
  const t2Id = (t2.details as { taskId: string }).taskId;
  await teamTaskUpdateExecute("id", { runId, taskId: t2Id, status: "in_progress" });

  const pendingResult = await teamTaskListExecute("id", { runId, status: "pending" });
  const pending = (pendingResult.details as { tasks: unknown[] }).tasks;
  expect(pending.length).toBe(1);

  const inProgressResult = await teamTaskListExecute("id", { runId, status: "in_progress" });
  const inProgress = (inProgressResult.details as { tasks: unknown[] }).tasks;
  expect(inProgress.length).toBe(1);

  const allResult = await teamTaskListExecute("id", { runId, status: "all" });
  const all = (allResult.details as { tasks: unknown[] }).tasks;
  expect(all.length).toBe(2);
});

test("team_task_update changes status and records history", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  const taskResult = await teamTaskCreateExecute("id", { runId, title: "Build feature" });
  const taskId = (taskResult.details as { taskId: string }).taskId;

  const updateResult = await teamTaskUpdateExecute("id", {
    runId,
    taskId,
    status: "in_progress",
    assignee: "ned-land",
    note: "Started implementation",
  });
  const details = updateResult.details as { status: string; assignee: string; history: unknown[] };
  expect(details.status).toBe("in_progress");
  expect(details.assignee).toBe("ned-land");
  expect(details.history.length).toBeGreaterThanOrEqual(2);
});

test("team_shutdown_request then approve_shutdown", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }, { role: "oracle" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;

  const reqResult = await teamShutdownRequestExecute("id", {
    runId,
    memberId: "oracle",
    reason: "Work complete",
  });
  expect((reqResult.details as { status: string }).status).toBe("shutdown_requested");

  const approveResult = await teamApproveShutdownExecute("id", { runId, memberId: "oracle" });
  expect((approveResult.details as { status: string }).status).toBe("shutdown_approved");
});

test("team_shutdown_request then reject_shutdown", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }, { role: "oracle" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;

  await teamShutdownRequestExecute("id", { runId, memberId: "oracle" });
  const rejectResult = await teamRejectShutdownExecute("id", {
    runId,
    memberId: "oracle",
    reason: "Still needed for review",
  });
  expect((rejectResult.details as { status: string }).status).toBe("shutdown_rejected");
});

test("team_approve_shutdown without pending request returns error", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  const result = await teamApproveShutdownExecute("id", { runId, memberId: "nemo" });
  expect((result.details as { error: boolean }).error).toBe(true);
});

test("team_status returns full team state", async () => {
  const createResult = await teamCreateExecute("id", {
    spec: { kind: "inline", members: [{ role: "nemo" }, { role: "oracle" }], purpose: "test" },
  });
  const runId = (createResult.details as { teamRunId: string }).teamRunId;
  await teamTaskCreateExecute("id", { runId, title: "Task 1" });
  await teamSendMessageExecute("id", { runId, to: "oracle", content: "hi" });

  const statusResult = await teamStatusExecute("id", { runId });
  const details = statusResult.details as {
    members: unknown[];
    taskSummary: { total: number; pending: number };
    messageCount: number;
  };
  expect(details.members.length).toBe(2);
  expect(details.taskSummary.total).toBe(1);
  expect(details.taskSummary.pending).toBe(1);
  expect(details.messageCount).toBe(1);
});

test("team_list shows all active teams", async () => {
  await teamCreateExecute("id", { spec: { kind: "named", name: "team-a" } });
  await teamCreateExecute("id", { spec: { kind: "named", name: "team-b" } });
  const result = await teamListExecute("id", {});
  const teams = (result.details as { teams: unknown[] }).teams;
  expect(teams.length).toBe(2);
});

test("team_list is empty when no teams exist", async () => {
  const result = await teamListExecute("id", {});
  const teams = (result.details as { teams: unknown[] }).teams;
  expect(teams.length).toBe(0);
});