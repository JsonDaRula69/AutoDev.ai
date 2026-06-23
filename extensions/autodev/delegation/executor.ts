/**
 * Task tool executor — the runtime logic for the `task` pi tool.
 *
 * Responsibilities:
 *  1. Validate mutual exclusivity of `category` and `subagent_type`.
 *  2. Route to the right model + system prompt:
 *     - category → look up in category map (built-in + custom config override)
 *     - subagent_type → load agent definition from `.pi/agents/<name>.md`
 *  3. Validate the resolved model against `.autodev/config/models.json` allowlist.
 *  4. Enforce anti-re-delegation: the `task` tool is NOT in the spawned
 *     session's tool list, so delegated sessions cannot re-delegate.
 *  5. Honor `run_in_background: true` — return the task ID immediately.
 *  6. Accept `load_skills` (type-validated) but silently ignore it — no skill
 *     context is injected into the system prompt.
 *
 * The executor depends on a `BackgroundManager`-compatible spawner. Tests
 * inject a fake; production wires the shared singleton from background/index.
 */
import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { TaskToolInput } from "./schemas.js";
import { getCategory, type CategoryDefinition } from "./categories.js";
import { loadAgent, type AgentDefinition } from "./agents.js";
import { loadModelAllowlist } from "../background/fallback.js";
import type { SpawnConfig } from "../background/types.js";

/**
 * Minimal spawner interface the executor depends on.
 * `BackgroundManager` satisfies this; tests inject a fake.
 */
export interface TaskSpawner {
  spawn(config: SpawnConfig): string;
  getTask(id: string): { readonly status: string; readonly result: unknown; readonly error: string | undefined } | undefined;
}

/** Options for executeTaskTool. */
export interface TaskExecutorOptions {
  readonly projectRoot: string;
  readonly spawner: TaskSpawner;
}

/** Error result shape — `isError: true` flag set so pi surfaces it to the LLM. */
type ToolResult = AgentToolResult<unknown>;

function ok(text: string, details?: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], details: details ?? {} };
}

function err(message: string, details?: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: message }], details: details ?? {}, terminate: true };
}

/**
 * Build the system prompt for a category-routed task.
 *
 * The prompt wraps the user's task in a delegation envelope. The category
 * description provides context about what kind of work is expected.
 */
function buildCategoryPrompt(category: CategoryDefinition, userPrompt: string): string {
  return [
    `You are a delegated AutoDev crew member spawned under the "${category.model}" model.`,
    `Category: ${category.description}`,
    "",
    "Task:",
    userPrompt,
  ].join("\n");
}

/**
 * Build the system prompt for a subagent-routed task.
 *
 * Uses the agent's own system prompt (from `.pi/agents/<name>.md` body) as the
 * base, with the user's task appended.
 */
function buildAgentPrompt(agent: AgentDefinition, userPrompt: string): string {
  return [
    agent.systemPrompt,
    "",
    "Task:",
    userPrompt,
  ].join("\n");
}

/**
 * Build the tool list for a spawned session. Anti-re-delegation: the `task`
 * tool is intentionally NOT included, so a delegated session cannot spawn
 * further sub-tasks.
 */
function buildTools(baseTools: readonly string[]): readonly string[] {
  return baseTools.filter((t) => t !== "task");
}

/** Check that a model is in the allowlist. Empty allowlist = allow anything. */
function isModelAllowed(model: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.includes(model);
}

/** Polling interval for foreground (run_in_background=false) waits. */
const FOREGROUND_POLL_MS = 10;
/** Maximum wait for a foreground task before returning current state (ms). */
const FOREGROUND_MAX_WAIT_MS = 30_000;

/** Sleep helper that works in both sync test fakes and real runtimes. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wait for a spawned task to reach a terminal state, then return its result.
 * Used when `run_in_background` is false (the default). Bounded by
 * FOREGROUND_MAX_WAIT_MS to avoid hanging forever on a stuck session.
 */
async function waitForCompletion(spawner: TaskSpawner, taskId: string): Promise<ToolResult> {
  const deadline = Date.now() + FOREGROUND_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const task = spawner.getTask(taskId);
    if (task === undefined) return err(`task-not-found: ${taskId}`);
    if (task.status === "completed") {
      return ok(`Task ${taskId} completed.`, { task_id: taskId, status: "completed", result: task.result });
    }
    if (task.status === "error") {
      return err(`Task ${taskId} failed: ${task.error ?? "unknown"}`, { task_id: taskId, status: "error", error: task.error });
    }
    if (task.status === "cancelled") {
      return ok(`Task ${taskId} cancelled.`, { task_id: taskId, status: "cancelled" });
    }
    await sleep(FOREGROUND_POLL_MS);
  }
  // Timed out waiting — return the task ID so the caller can poll later.
  return ok(`Task ${taskId} still running (foreground wait timed out).`, { task_id: taskId, status: "running" });
}

/**
 * Execute the `task` tool.
 *
 * Pure-ish: reads config from disk (categories, allowlist, agent defs), then
 * spawns via the injected spawner. All I/O is read-only except the spawn
 * side effect. Deterministic given the same config + spawner.
 */
export async function executeTaskTool(
  _toolCallId: string,
  params: TaskToolInput,
  options: TaskExecutorOptions,
): Promise<ToolResult> {
  const { projectRoot, spawner } = options;
  const { category, subagent_type, prompt, run_in_background, load_skills } = params;

  // load_skills is accepted (type-validated by the schema) but NOT injected
  // into the system prompt. We reference it to satisfy noUnusedLocals.
  void load_skills;

  // 1. Mutual exclusivity: exactly one of category / subagent_type must be set.
  const hasCategory = category !== undefined;
  const hasSubagent = subagent_type !== undefined;
  if (hasCategory && hasSubagent) {
    return err("category and subagent_type are mutually exclusive — provide exactly one.", {
      error: "mutual-exclusivity-violation",
    });
  }
  if (!hasCategory && !hasSubagent) {
    return err("either category or subagent_type must be provided.", {
      error: "missing-dispatch-target",
    });
  }

  // 2. Resolve model + system prompt + base tools.
  let model: string;
  let systemPrompt: string;
  let baseTools: readonly string[];
  let agentName: string | undefined;

  if (hasCategory && category !== undefined) {
    const cat = getCategory(projectRoot, category);
    if (cat === undefined) {
      return err(`unknown category: "${category}". Not in built-ins or .autodev/config/categories.json.`, {
        error: "unknown-category",
        category,
      });
    }
    model = cat.model;
    systemPrompt = buildCategoryPrompt(cat, prompt);
    // Categories get the standard read-only tool set. No `task` (anti-re-delegation).
    baseTools = ["read", "bash", "grep", "glob"];
    agentName = `category:${category}`;
  } else if (hasSubagent && subagent_type !== undefined) {
    const agent = loadAgent(projectRoot, subagent_type);
    if (agent === undefined) {
      return err(`unknown subagent_type: "${subagent_type}". No agent file at .pi/agents/${subagent_type}.md.`, {
        error: "unknown-subagent",
        subagent_type,
      });
    }
    model = agent.model;
    systemPrompt = buildAgentPrompt(agent, prompt);
    baseTools = agent.tools;
    agentName = agent.name;
  } else {
    // Unreachable — the guards above caught both undefined. TS narrowing help.
    return err("internal-error: no dispatch target after guards.", { error: "internal" });
  }

  // 3. Validate model against allowlist.
  const allowlist = loadModelAllowlist(projectRoot);
  if (!isModelAllowed(model, allowlist)) {
    return err(`model "${model}" is not in the allowlist (.autodev/config/models.json).`, {
      error: "model-not-allowed",
      model,
      allowlist,
    });
  }

  // 4. Build spawn config. Anti-re-delegation: strip `task` from tools.
  const tools = buildTools(baseTools);
  const spawnConfig: SpawnConfig = {
    model,
    systemPrompt,
    tools,
    agentName,
  };

  // 5. Spawn.
  const taskId = spawner.spawn(spawnConfig);

  // 6. Return based on run_in_background.
  if (run_in_background === true) {
    return ok(`Task spawned in background: ${taskId}`, { task_id: taskId, status: "pending", run_in_background: true });
  }

  // Foreground: wait for completion.
  return await waitForCompletion(spawner, taskId);
}