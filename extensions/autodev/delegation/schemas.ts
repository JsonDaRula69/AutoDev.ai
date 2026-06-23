/**
 * Task tool schema — TypeBox parameter schema for the `task` pi tool.
 *
 * `category` and `subagent_type` are both Optional at the schema level (so the
 * LLM can omit either), but the executor enforces mutual exclusivity at
 * runtime: exactly one MUST be present. The schema cannot express "exactly
 * one of two optional fields" so we validate in the executor.
 *
 * TypeBox v1.1.38 import: `import { Type, type Static } from "typebox"`.
 */
import { Type, type Static } from "typebox";

export const TaskSchema = Type.Object({
  category: Type.Optional(Type.String({ description: "Delegation category (e.g. quick, deep, ultrabrain). Mutually exclusive with subagent_type." })),
  subagent_type: Type.Optional(Type.String({ description: "Specific crew agent name (e.g. explore, oracle). Mutually exclusive with category." })),
  prompt: Type.String({ description: "The task prompt to send to the spawned agent." }),
  run_in_background: Type.Optional(Type.Boolean({ description: "When true, return the task ID immediately without waiting for completion. Default false." })),
  load_skills: Type.Optional(Type.Array(Type.String(), { description: "Optional skill names to load for the task. Type-validated and accepted but not injected into the system prompt." })),
});

/** Inferred parameter type for the `task` tool execute() function. */
export type TaskToolInput = Static<typeof TaskSchema>;