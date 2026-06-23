/**
 * team-mode schemas — TypeBox parameter schemas for the 12 team_* tools.
 *
 * Kept separate from the registration logic so the schemas are independently
 * importable and testable.
 */
import { Type, type Static } from "typebox";

// team_create ---------------------------------------------------------------

export const TeamCreateSchema = Type.Object({
  spec: Type.Union([
    Type.Object({
      kind: Type.Literal("named"),
      name: Type.String({ description: "Named team spec from team-spec.json" }),
    }),
    Type.Object({
      kind: Type.Literal("inline"),
      members: Type.Array(
        Type.Object({
          role: Type.String({ description: "Crew role slug (e.g. nemo, oracle)" }),
          count: Type.Optional(Type.Number({ description: "Member count (default 1)" })),
        }),
        { description: "Inline team member specification" },
      ),
      purpose: Type.String({ description: "Why this team is being created" }),
    }),
  ]),
  trigger: Type.Optional(
    Type.Union(
      [
        Type.Literal("onboarding"),
        Type.Literal("work"),
        Type.Literal("manual"),
      ],
      { description: "What triggered the team (default manual)" },
    ),
  ),
});
export type TeamCreateInput = Static<typeof TeamCreateSchema>;

// team_delete ----------------------------------------------------------------

export const TeamDeleteSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier to delete" }),
});
export type TeamDeleteInput = Static<typeof TeamDeleteSchema>;

// team_shutdown_request ------------------------------------------------------

export const TeamShutdownRequestSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  memberId: Type.String({ description: "Member to request shutdown for" }),
  reason: Type.Optional(Type.String({ description: "Reason for the request" })),
});
export type TeamShutdownRequestInput = Static<typeof TeamShutdownRequestSchema>;

// team_approve_shutdown ------------------------------------------------------

export const TeamApproveShutdownSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  memberId: Type.String({ description: "Member whose shutdown is approved" }),
});
export type TeamApproveShutdownInput = Static<typeof TeamApproveShutdownSchema>;

// team_reject_shutdown -------------------------------------------------------

export const TeamRejectShutdownSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  memberId: Type.String({ description: "Member whose shutdown is rejected" }),
  reason: Type.Optional(Type.String({ description: "Why the shutdown was rejected" })),
});
export type TeamRejectShutdownInput = Static<typeof TeamRejectShutdownSchema>;

// team_send_message ----------------------------------------------------------

export const TeamSendMessageSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  to: Type.Union([
    Type.String({ description: "Member id to send to" }),
    Type.Literal("broadcast"),
  ], { description: "Recipient member id or 'broadcast'" }),
  content: Type.String({ description: "Message body" }),
  kind: Type.Optional(
    Type.Union(
      [
        Type.Literal("note"),
        Type.Literal("flag"),
        Type.Literal("question"),
        Type.Literal("blocker"),
      ],
      { description: "Message classification (default note)" },
    ),
  ),
});
export type TeamSendMessageInput = Static<typeof TeamSendMessageSchema>;

// team_task_create -----------------------------------------------------------

export const TeamTaskCreateSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  title: Type.String({ description: "Short task title" }),
  description: Type.Optional(Type.String({ description: "Longer task description" })),
  assignee: Type.Optional(Type.String({ description: "Member id to assign" })),
  priority: Type.Optional(
    Type.Union(
      [
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low"),
      ],
      { description: "Task priority (default medium)" },
    ),
  ),
});
export type TeamTaskCreateInput = Static<typeof TeamTaskCreateSchema>;

// team_task_list -------------------------------------------------------------

export const TeamTaskListSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  status: Type.Optional(
    Type.Union(
      [
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed"),
        Type.Literal("all"),
      ],
      { description: "Filter by status (default all)" },
    ),
  ),
});
export type TeamTaskListInput = Static<typeof TeamTaskListSchema>;

// team_task_update -----------------------------------------------------------

export const TeamTaskUpdateSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  taskId: Type.String({ description: "Task identifier" }),
  status: Type.Optional(
    Type.Union(
      [
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed"),
      ],
      { description: "New status" },
    ),
  ),
  assignee: Type.Optional(Type.String({ description: "New assignee member id" })),
  note: Type.Optional(Type.String({ description: "Update note appended to history" })),
});
export type TeamTaskUpdateInput = Static<typeof TeamTaskUpdateSchema>;

// team_task_get --------------------------------------------------------------

export const TeamTaskGetSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
  taskId: Type.String({ description: "Task identifier" }),
});
export type TeamTaskGetInput = Static<typeof TeamTaskGetSchema>;

// team_status ----------------------------------------------------------------

export const TeamStatusSchema = Type.Object({
  runId: Type.String({ description: "Team run identifier" }),
});
export type TeamStatusInput = Static<typeof TeamStatusSchema>;

// team_list ------------------------------------------------------------------

export const TeamListSchema = Type.Object({});
export type TeamListInput = Static<typeof TeamListSchema>;