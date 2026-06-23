/**
 * T9 delegation module tests.
 *
 * Drives `executeTaskTool()` directly with a fake spawner and temp project
 * roots — no real pi session or background manager is spun up. Each test
 * plants the preconditions (models.json allowlist, categories.json override,
 * `.pi/agents/<name>.md` agent files) in a fresh temp directory.
 *
 * Covers the 8 required scenarios:
 *  1. task(category="quick") → spawned with quick model (glm-5.2:cloud)
 *  2. task(subagent_type="explore") → Explore agent session spawned
 *  3. task(category="quick", run_in_background=true) → returns task ID immediately
 *  4. task(category="invalid") → error returned
 *  5. task(category="quick", subagent_type="explore") → error (mutually exclusive)
 *  6. task(prompt="do something") → error (neither category nor subagent_type)
 *  7. Category models loaded from config (not hardcoded)
 *  8. Model validated against allowlist
 *
 * Plus supplementary tests for anti-re-delegation, load_skills acceptance,
 * custom categories, and agent-not-found.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeTaskTool, type TaskSpawner } from "../extensions/autodev/delegation/executor.js";
import { loadCategoryMap, BUILTIN_CATEGORY_NAMES } from "../extensions/autodev/delegation/categories.js";
import { loadAgent, listAgentNames } from "../extensions/autodev/delegation/agents.js";

// --- Fake spawner -----------------------------------------------------------

interface FakeTask {
  readonly id: string;
  readonly config: {
    readonly model: string;
    readonly systemPrompt: string;
    readonly tools: readonly string[];
    readonly agentName: string | undefined;
    readonly thinkingLevel: string | undefined;
  };
  status: "pending" | "running" | "completed" | "error" | "cancelled";
  result: unknown;
  error: string | undefined;
}

class FakeSpawner implements TaskSpawner {
  readonly spawns: FakeTask[] = [];
  private counter = 0;

  spawn(config: Parameters<TaskSpawner["spawn"]>[0]): string {
    this.counter += 1;
    const id = `bg-${this.counter}`;
    this.spawns.push({
      id,
      config: {
        model: config.model,
        systemPrompt: config.systemPrompt,
        tools: config.tools,
        agentName: config.agentName,
        thinkingLevel: config.thinkingLevel,
      },
      status: "pending",
      result: undefined,
      error: undefined,
    });
    return id;
  }

  getTask(id: string): FakeTask | undefined {
    return this.spawns.find((t) => t.id === id);
  }

  /** Complete a task by ID (test helper). */
  complete(id: string, result: unknown = "done"): void {
    const t = this.getTask(id);
    if (t !== undefined) {
      t.status = "completed";
      t.result = result;
    }
  }

  fail(id: string, error: string): void {
    const t = this.getTask(id);
    if (t !== undefined) {
      t.status = "error";
      t.error = error;
    }
  }
}

// --- Temp project root fixture ----------------------------------------------

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "autodev-delegation-"));
  // Standard allowlist used across tests — includes all 5 approved models.
  mkdirSync(join(projectRoot, ".autodev", "config"), { recursive: true });
  writeFileSync(
    join(projectRoot, ".autodev", "config", "models.json"),
    JSON.stringify([
      "ollama-cloud/glm-5.2:cloud",
      "ollama-cloud/glm-5.1:cloud",
      "ollama-cloud/deepseek-v4-pro",
      "ollama-cloud/deepseek-v4-flash",
      "ollama-cloud/kimi-k2.7-code",
    ]),
  );
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

/** Write a custom categories.json override into the temp project. */
function writeCategories(map: Record<string, { model: string; description: string }>): void {
  writeFileSync(
    join(projectRoot, ".autodev", "config", "categories.json"),
    JSON.stringify(map),
  );
}

/** Write a pi agent .md file into the temp project's `.pi/agents/` dir. */
function writeAgent(name: string, model: string, tools: string, body: string): void {
  const dir = join(projectRoot, ".pi", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name}.md`),
    `---\nname: ${name}\ndescription: test agent\ntools: ${tools}\nmodel: ${model}\n---\n${body}\n`,
  );
}

// --- Required test 1: category="quick" spawns with quick model ---------------

test("task(category=quick) spawns background session with deepseek-v4-flash", async () => {
  const spawner = new FakeSpawner();
  // Drive the executor, but complete the task immediately via a microtask
  // so the foreground wait sees it as completed before the max wait.
  const execPromise = executeTaskTool("tc1", { category: "quick", prompt: "fix typo" }, { projectRoot, spawner });

  // Let the spawner create the task, then complete it.
  await new Promise((r) => setTimeout(r, 0));
  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  expect(task.config.model).toBe("ollama-cloud/deepseek-v4-flash");
  expect(task.config.agentName).toBe("category:quick");
  // systemPrompt should include the user's task.
  expect(task.config.systemPrompt).toContain("fix typo");

  // Complete the task so the foreground wait resolves.
  spawner.complete(task.id);
  const result = await execPromise;
  expect(result.content[0]?.type).toBe("text");
});

test("task(category=quick, run_in_background=true) returns task ID immediately", async () => {
  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { category: "quick", prompt: "fix typo", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  expect(task.config.model).toBe("ollama-cloud/deepseek-v4-flash");

  // Background mode returns immediately with the task ID.
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain(task.id);
  expect(result.details).toMatchObject({ task_id: task.id, status: "pending", run_in_background: true });
});

// --- Required test 2: subagent_type="explore" spawns Explore agent -----------

test("task(subagent_type=explore) spawns session with explore agent config", async () => {
  writeAgent(
    "explore",
    "ollama-cloud/glm-5.2:cloud",
    "read, bash, grep, glob, webfetch, websearch",
    "You are Explore, the investigator. Map the codebase and report findings with file paths.",
  );

  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { subagent_type: "explore", prompt: "find all tests", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  expect(task.config.model).toBe("ollama-cloud/glm-5.2:cloud");
  expect(task.config.agentName).toBe("explore");
  // The agent's system prompt body must be included.
  expect(task.config.systemPrompt).toContain("You are Explore");
  expect(task.config.systemPrompt).toContain("find all tests");
  // The agent's tools are passed through (minus `task` for anti-re-delegation).
  expect(task.config.tools).toContain("read");
  expect(task.config.tools).toContain("bash");
  expect(task.config.tools).toContain("websearch");

  // Returns the task ID.
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain(task.id);
});

// --- Required test 3: run_in_background returns immediately -----------------
// (Covered above by the run_in_background=true test.)

// --- Required test 4: invalid category → error ------------------------------

test("task(category=invalid) returns error for unknown category", async () => {
  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { category: "invalid", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(0);
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain("unknown category");
  expect(result.details).toMatchObject({ error: "unknown-category", category: "invalid" });
  expect(result.terminate).toBe(true);
});

// --- Required test 5: both category + subagent_type → error ------------------

test("task(category=quick, subagent_type=explore) returns mutual-exclusivity error", async () => {
  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { category: "quick", subagent_type: "explore", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(0);
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain("mutually exclusive");
  expect(result.details).toMatchObject({ error: "mutual-exclusivity-violation" });
  expect(result.terminate).toBe(true);
});

// --- Required test 6: neither category nor subagent_type → error -------------

test("task(prompt=do something) returns error for missing dispatch target", async () => {
  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { prompt: "do something", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(0);
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain("either category or subagent_type");
  expect(result.details).toMatchObject({ error: "missing-dispatch-target" });
  expect(result.terminate).toBe(true);
});

// --- Required test 7: category models loaded from config, not hardcoded ------

test("category models are loaded from config, not hardcoded — custom override changes the model", async () => {
  // Override `quick` to use deepseek instead of the built-in glm-5.2:cloud.
  writeCategories({
    quick: { model: "ollama-cloud/deepseek-v4-pro", description: "custom quick" },
  });

  const spawner = new FakeSpawner();
  await executeTaskTool(
    "tc1",
    { category: "quick", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  // The custom override wins — model is deepseek, NOT the built-in glm-5.2:cloud.
  expect(task.config.model).toBe("ollama-cloud/deepseek-v4-pro");
  expect(task.config.systemPrompt).toContain("custom quick");
});

test("custom category not in built-ins is accepted when in categories.json", async () => {
  writeCategories({
    "custom-cat": { model: "ollama-cloud/glm-5.2:cloud", description: "a custom category" },
  });

  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { category: "custom-cat", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  expect(task.config.model).toBe("ollama-cloud/glm-5.2:cloud");
  expect(task.config.agentName).toBe("category:custom-cat");
  // No error.
  expect(result.terminate).toBeUndefined();
});

test("loadCategoryMap returns all 8 built-in category names", () => {
  const map = loadCategoryMap(projectRoot);
  for (const name of BUILTIN_CATEGORY_NAMES) {
    expect(map[name]).toBeDefined();
  }
  expect(BUILTIN_CATEGORY_NAMES.length).toBe(8);
});

// --- Required test 8: model validated against allowlist ---------------------

test("model not in allowlist is rejected with error", async () => {
  // Override `quick` with a model NOT in the allowlist.
  writeCategories({
    quick: { model: "unknown-provider/bad-model", description: "bad" },
  });

  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { category: "quick", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(0);
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain("not in the allowlist");
  expect(result.details).toMatchObject({ error: "model-not-allowed", model: "unknown-provider/bad-model" });
  expect(result.terminate).toBe(true);
});

test("agent with model not in allowlist is rejected", async () => {
  writeAgent(
    "bad-agent",
    "unknown-provider/bad-model",
    "read",
    "You are a bad agent.",
  );

  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { subagent_type: "bad-agent", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(0);
  expect(result.details).toMatchObject({ error: "model-not-allowed" });
  expect(result.terminate).toBe(true);
});

// --- Anti-re-delegation: `task` tool stripped from spawned session tools ------

test("anti-re-delegation: task tool is stripped from spawned session tools", async () => {
  // Agent whose tools list includes `task`.
  writeAgent(
    "recursive",
    "ollama-cloud/glm-5.2:cloud",
    "read, bash, task",
    "You are a recursive agent.",
  );

  const spawner = new FakeSpawner();
  await executeTaskTool(
    "tc1",
    { subagent_type: "recursive", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  expect(task.config.tools).toContain("read");
  expect(task.config.tools).toContain("bash");
  // `task` must NOT be in the spawned session's tools.
  expect(task.config.tools).not.toContain("task");
});

test("anti-re-delegation: category-routed sessions also lack task tool", async () => {
  const spawner = new FakeSpawner();
  await executeTaskTool(
    "tc1",
    { category: "quick", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  const task = spawner.spawns[0]!;
  expect(task.config.tools).not.toContain("task");
});

// --- load_skills accepted but ignored --------------------------------------

test("load_skills is accepted (type-validated) but not injected into the system prompt", async () => {
  const spawner = new FakeSpawner();
  await executeTaskTool(
    "tc1",
    { category: "quick", prompt: "do work", load_skills: ["playwright", "frontend"], run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  // The skill names must NOT appear in the system prompt — they are silently ignored.
  expect(task.config.systemPrompt).not.toContain("playwright");
  expect(task.config.systemPrompt).not.toContain("frontend");
  // The task was still spawned (load_skills didn't block it).
  expect(task.config.model).toBe("ollama-cloud/deepseek-v4-flash");
});

// --- Subagent not found ------------------------------------------------------

test("task(subagent_type=nonexistent) returns error for missing agent file", async () => {
  const spawner = new FakeSpawner();
  const result = await executeTaskTool(
    "tc1",
    { subagent_type: "nonexistent", prompt: "x", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(0);
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain("unknown subagent_type");
  expect(result.details).toMatchObject({ error: "unknown-subagent", subagent_type: "nonexistent" });
  expect(result.terminate).toBe(true);
});

// --- Default model mapping for all 8 categories ------------------------------

test("default model mapping: all 8 categories resolve to their spec'd models without config override", () => {
  const map = loadCategoryMap(projectRoot);
  expect(map["quick"]?.model).toBe("ollama-cloud/deepseek-v4-flash");
  expect(map["deep"]?.model).toBe("ollama-cloud/kimi-k2.7-code");
  expect(map["ultrabrain"]?.model).toBe("ollama-cloud/deepseek-v4-pro");
  expect(map["visual-engineering"]?.model).toBe("ollama-cloud/glm-5.2:cloud");
  expect(map["artistry"]?.model).toBe("ollama-cloud/glm-5.2:cloud");
  expect(map["writing"]?.model).toBe("ollama-cloud/glm-5.2:cloud");
  expect(map["unspecified-low"]?.model).toBe("ollama-cloud/deepseek-v4-flash");
  expect(map["unspecified-high"]?.model).toBe("ollama-cloud/glm-5.2:cloud");
});

// --- thinkingLevel wiring (M5) -----------------------------------------------

test("task(category=ultrabrain) passes thinkingLevel='xhigh' through to the spawn config", async () => {
  const spawner = new FakeSpawner();
  await executeTaskTool(
    "tc-m5",
    { category: "ultrabrain", prompt: "reason hard", run_in_background: true },
    { projectRoot, spawner },
  );

  expect(spawner.spawns.length).toBe(1);
  const task = spawner.spawns[0]!;
  expect(task.config.model).toBe("ollama-cloud/deepseek-v4-pro");
  expect(task.config.thinkingLevel).toBe("xhigh");
});

test("task(category=quick) leaves thinkingLevel undefined when the category has none", async () => {
  const spawner = new FakeSpawner();
  await executeTaskTool(
    "tc-m5b",
    { category: "quick", prompt: "fix typo", run_in_background: true },
    { projectRoot, spawner },
  );

  const task = spawner.spawns[0]!;
  expect(task.config.thinkingLevel).toBeUndefined();
});

// --- Agent loader unit tests -------------------------------------------------

test("loadAgent parses frontmatter and body correctly", () => {
  writeAgent(
    "test-agent",
    "ollama-cloud/deepseek-v4-pro",
    "read, bash, grep",
    "You are a test agent.\nDo things well.",
  );

  const agent = loadAgent(projectRoot, "test-agent");
  expect(agent).toBeDefined();
  expect(agent?.name).toBe("test-agent");
  expect(agent?.model).toBe("ollama-cloud/deepseek-v4-pro");
  expect(agent?.tools).toEqual(["read", "bash", "grep"]);
  expect(agent?.systemPrompt).toContain("You are a test agent");
  expect(agent?.systemPrompt).toContain("Do things well");
});

test("loadAgent returns undefined for missing agent file", () => {
  expect(loadAgent(projectRoot, "nope")).toBeUndefined();
});

test("listAgentNames returns all .md filenames without extension", () => {
  writeAgent("alpha", "ollama-cloud/glm-5.2:cloud", "read", "body");
  writeAgent("beta", "ollama-cloud/glm-5.2:cloud", "read", "body");
  const names = listAgentNames(projectRoot);
  expect(names).toContain("alpha");
  expect(names).toContain("beta");
});

// --- Foreground completion path ---------------------------------------------

test("foreground (run_in_background=false) waits and returns completed result", async () => {
  const spawner = new FakeSpawner();
  // Drive the executor, but complete the task immediately via a microtask
  // so waitForCompletion sees it as completed before the max wait.
  const execPromise = executeTaskTool(
    "tc1",
    { category: "quick", prompt: "x" },
    { projectRoot, spawner },
  );
  // Let the spawner create the task, then complete it.
  await new Promise((r) => setTimeout(r, 0));
  expect(spawner.spawns.length).toBe(1);
  spawner.complete(spawner.spawns[0]!.id, "result-data");

  const result = await execPromise;
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain("completed");
  expect(result.details).toMatchObject({ status: "completed", result: "result-data" });
});