/**
 * team-mode — parallel multi-agent coordination for AutoDev.
 *
 * Registers 12 team_* tools via `pi.registerTool()`. The tools are callable
 * and schema-validated today; real coordination (shared mailbox, tasklist,
 * member lifecycle, hyperplan/hostile-critic orchestration) arrives in a
 * later sub-plan.
 *
 * Adapted for AutoDev's three trigger points:
 *  - Hyperplan after onboarding (5 hostile critics critique onboarding results)
 *  - Always-watching during work (members observe and flag via mailbox)
 *  - Mailbox during onboarding (other agents chime in without interrupting)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  TeamCreateSchema,
  TeamDeleteSchema,
  TeamShutdownRequestSchema,
  TeamApproveShutdownSchema,
  TeamRejectShutdownSchema,
  TeamSendMessageSchema,
  TeamTaskCreateSchema,
  TeamTaskListSchema,
  TeamTaskUpdateSchema,
  TeamTaskGetSchema,
  TeamStatusSchema,
  TeamListSchema,
} from "./schemas.js";
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
} from "./executors.js";

/** Canonical list of the 12 registered team_* tool names. */
export const TEAM_TOOL_NAMES: readonly string[] = [
  "team_create",
  "team_delete",
  "team_shutdown_request",
  "team_approve_shutdown",
  "team_reject_shutdown",
  "team_send_message",
  "team_task_create",
  "team_task_list",
  "team_task_update",
  "team_task_get",
  "team_status",
  "team_list",
];

export function register(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "team_create",
    label: "Team Create",
    description: "Create a team run from a named or inline spec.",
    parameters: TeamCreateSchema,
    execute: teamCreateExecute,
  });

  pi.registerTool({
    name: "team_delete",
    label: "Team Delete",
    description: "Delete a completed team run.",
    parameters: TeamDeleteSchema,
    execute: teamDeleteExecute,
  });

  pi.registerTool({
    name: "team_shutdown_request",
    label: "Team Shutdown Request",
    description: "Request shutdown for a team member.",
    parameters: TeamShutdownRequestSchema,
    execute: teamShutdownRequestExecute,
  });

  pi.registerTool({
    name: "team_approve_shutdown",
    label: "Team Approve Shutdown",
    description: "Approve a pending shutdown for a member.",
    parameters: TeamApproveShutdownSchema,
    execute: teamApproveShutdownExecute,
  });

  pi.registerTool({
    name: "team_reject_shutdown",
    label: "Team Reject Shutdown",
    description: "Reject a pending shutdown for a member.",
    parameters: TeamRejectShutdownSchema,
    execute: teamRejectShutdownExecute,
  });

  pi.registerTool({
    name: "team_send_message",
    label: "Team Send Message",
    description: "Send a message to a team member or broadcast.",
    parameters: TeamSendMessageSchema,
    execute: teamSendMessageExecute,
  });

  pi.registerTool({
    name: "team_task_create",
    label: "Team Task Create",
    description: "Create a team task.",
    parameters: TeamTaskCreateSchema,
    execute: teamTaskCreateExecute,
  });

  pi.registerTool({
    name: "team_task_list",
    label: "Team Task List",
    description: "List team tasks, optionally filtered by status.",
    parameters: TeamTaskListSchema,
    execute: teamTaskListExecute,
  });

  pi.registerTool({
    name: "team_task_update",
    label: "Team Task Update",
    description: "Update a team task (status, assignee, note).",
    parameters: TeamTaskUpdateSchema,
    execute: teamTaskUpdateExecute,
  });

  pi.registerTool({
    name: "team_task_get",
    label: "Team Task Get",
    description: "Get a single team task.",
    parameters: TeamTaskGetSchema,
    execute: teamTaskGetExecute,
  });

  pi.registerTool({
    name: "team_status",
    label: "Team Status",
    description: "Return full status for a team run.",
    parameters: TeamStatusSchema,
    execute: teamStatusExecute,
  });

  pi.registerTool({
    name: "team_list",
    label: "Team List",
    description: "List declared and active teams.",
    parameters: TeamListSchema,
    execute: teamListExecute,
  });
}