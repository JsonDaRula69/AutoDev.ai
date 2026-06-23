/**
 * Delegation module — Nemo dispatch and work routing.
 *
 * Registers the `task` pi tool via `pi.registerTool()`. The tool accepts
 * either a `category` (model-class routing) or a `subagent_type` (specific
 * crew agent), mutually exclusive. When `run_in_background: true`, the tool
 * returns the task ID immediately; otherwise it waits for completion.
 *
 * The spawned session does NOT receive the `task` tool — anti-re-delegation
 * is enforced by stripping `task` from the spawned session's tool list.
 *
 * Module split (each file <250 pure LOC, owns one concept):
 *  - schemas.ts     : TypeBox parameter schema for the `task` tool
 *  - categories.ts  : built-in + custom category → model mapping
 *  - agents.ts      : `.pi/agents/*.md` frontmatter loader
 *  - executor.ts    : runtime routing + validation + spawn logic
 *  - index.ts       : pi.registerTool wiring (this file)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TaskSchema } from "./schemas.js";
import { executeTaskTool } from "./executor.js";
import { getBackgroundManager } from "../background/index.js";

export { executeTaskTool, type TaskExecutorOptions, type TaskSpawner } from "./executor.js";
export { loadCategoryMap, getCategory, type CategoryDefinition, type CategoryMap, BUILTIN_CATEGORY_NAMES } from "./categories.js";
export { loadAgent, listAgentNames, type AgentDefinition } from "./agents.js";
export { TaskSchema, type TaskToolInput } from "./schemas.js";

export function register(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "task",
    label: "Spawn Agent Task",
    description: "Spawn agent task with category-based or direct agent selection. category and subagent_type are mutually exclusive.",
    parameters: TaskSchema,
    execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
      return executeTaskTool(toolCallId, params, {
        projectRoot: ctx.cwd,
        spawner: getBackgroundManager(),
      });
    },
  });
}