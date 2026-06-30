/**
 * T2 agent loader tests — central `~/.AutoDev/agents/` resolution.
 *
 * Verifies that `loadAgent` and `listAgentNames` read agent Markdown files
 * from the centralized agent directory derived via `getAgentDir()` (the
 * `join(getAgentDir(), "..", "agents")` path), not from
 * `projectRoot/.pi/agents/`.
 *
 * The `projectRoot` parameter is kept for API compatibility but is not
 * used for agent resolution. Tests set `PI_CODING_AGENT_DIR` to a temp
 * `<root>/agent` directory before importing the module, so
 * `getAgentDir()` resolves there and agents are planted at
 * `<root>/agents/`.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The module under test reads `getAgentDir()` at call time, which in turn
// reads `PI_CODING_AGENT_DIR` from the environment on every call. We set
// the env var to a fresh temp `agent` dir per test, plant agent files in
// the sibling `agents/` dir, and clear the env var after each test.

let tempRoot: string;
let agentDir: string;
let savedEnv: string | undefined;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "autodev-t2-agents-"));
  // `getAgentDir()` returns `<PI_CODING_AGENT_DIR>` when set (after
  // expandTildePath). Agents live at `join(getAgentDir(), "..", "agents")`,
  // so point PI_CODING_AGENT_DIR at `<tempRoot>/agent` and plant files
  // at `<tempRoot>/agents/`.
  agentDir = join(tempRoot, "agents");
  mkdirSync(agentDir, { recursive: true });
  savedEnv = process.env["PI_CODING_AGENT_DIR"];
  process.env["PI_CODING_AGENT_DIR"] = join(tempRoot, "agent");
});

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env["PI_CODING_AGENT_DIR"];
  } else {
    process.env["PI_CODING_AGENT_DIR"] = savedEnv;
  }
  rmSync(tempRoot, { recursive: true, force: true });
});

/** Write a pi agent .md file into the central `agents/` dir. */
function writeCentralAgent(name: string, model: string, tools: string, body: string): void {
  writeFileSync(
    join(agentDir, `${name}.md`),
    `---\nname: ${name}\ndescription: test agent\ntools: ${tools}\nmodel: ${model}\n---\n${body}\n`,
  );
}

// Import lazily so the env var set in beforeEach is honored at call time.
// The module re-exports `loadAgent` / `listAgentNames` and the functions
// call `getAgentDir()` on each invocation, not at module load.
import { loadAgent, listAgentNames } from "../agents.js";

// --- Happy path ------------------------------------------------------------

test("loadAgent reads from central agents dir and parses frontmatter + body", () => {
  writeCentralAgent(
    "nemo",
    "ollama-cloud/glm-5.2:cloud",
    "read, bash, grep",
    "You are Captain Nemo.\nTriage and delegate.",
  );

  // `projectRoot` is accepted for API compatibility but ignored for resolution.
  const agent = loadAgent("/unused/project/root", "nemo");
  expect(agent).toBeDefined();
  expect(agent?.name).toBe("nemo");
  expect(agent?.model).toBe("ollama-cloud/glm-5.2:cloud");
  expect(agent?.tools).toEqual(["read", "bash", "grep"]);
  expect(agent?.systemPrompt).toContain("You are Captain Nemo");
  expect(agent?.systemPrompt).toContain("Triage and delegate");
});

test("listAgentNames lists all .md filenames in the central agents dir", () => {
  writeCentralAgent("alpha", "ollama-cloud/glm-5.2:cloud", "read", "body-a");
  writeCentralAgent("beta", "ollama-cloud/glm-5.2:cloud", "read", "body-b");
  writeCentralAgent("gamma", "ollama-cloud/glm-5.2:cloud", "read", "body-g");

  const names = listAgentNames("/unused/project/root");
  expect(names).toContain("alpha");
  expect(names).toContain("beta");
  expect(names).toContain("gamma");
  expect(names.length).toBe(3);
});

test("loadAgent falls back to filename when frontmatter `name` is absent", () => {
  writeFileSync(
    join(agentDir, "unnamed.md"),
    `---\ndescription: no name field\ntools: read\nmodel: ollama-cloud/glm-5.2:cloud\n---\nBody only.`,
  );

  const agent = loadAgent("/unused", "unnamed");
  expect(agent).toBeDefined();
  expect(agent?.name).toBe("unnamed");
});

// --- Failure path ----------------------------------------------------------

test("loadAgent returns undefined when the central agents dir is missing", () => {
  // Wipe the agents dir we created in beforeEach.
  rmSync(agentDir, { recursive: true, force: true });
  expect(existsSync(agentDir)).toBe(false);

  expect(loadAgent("/unused", "nemo")).toBeUndefined();
});

test("listAgentNames returns [] when the central agents dir is missing", () => {
  rmSync(agentDir, { recursive: true, force: true });
  expect(existsSync(agentDir)).toBe(false);

  expect(listAgentNames("/unused")).toEqual([]);
});

test("loadAgent returns undefined when the agent file is absent", () => {
  // agents dir exists but no `missing.md`.
  expect(loadAgent("/unused", "missing")).toBeUndefined();
});

test("loadAgent returns undefined when frontmatter has no `model` field", () => {
  writeFileSync(
    join(agentDir, "nomodel.md"),
    `---\nname: nomodel\ndescription: no model\ntools: read\n---\nBody.`,
  );
  expect(loadAgent("/unused", "nomodel")).toBeUndefined();
});

// --- Agent tool assertions (Step 5: Conseil + Navigator frontmatter) ---------

test("Conseil tools include search_lore, ctx_search, search_docs", () => {
  writeCentralAgent(
    "conseil",
    "ollama-cloud/deepseek-v4-flash",
    "read, bash, grep, glob, search_lore, ctx_search, search_docs",
    "You are Conseil, the steward.",
  );

  const agent = loadAgent("/unused", "conseil");
  expect(agent).toBeDefined();
  expect(agent!.tools).toContain("search_lore");
  expect(agent!.tools).toContain("ctx_search");
  expect(agent!.tools).toContain("search_docs");
});

test("Navigator tools do NOT include edit or write", () => {
  writeCentralAgent(
    "navigator",
    "ollama-cloud/deepseek-v4-flash",
    "read, bash, grep, glob",
    "You are the Navigator.",
  );

  const agent = loadAgent("/unused", "navigator");
  expect(agent).toBeDefined();
  expect(agent!.tools).not.toContain("edit");
  expect(agent!.tools).not.toContain("write");
});