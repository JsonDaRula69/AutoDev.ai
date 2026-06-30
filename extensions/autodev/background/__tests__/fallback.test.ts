/**
 * T2 fallback chain tests — central `~/.AutoDev/agents/` resolution.
 *
 * Verifies that `loadAgentFallbackChains` reads agent Markdown frontmatter
 * from the centralized agent directory derived via `getAgentDir()` (the
 * `join(getAgentDir(), "..", "agents")` path), not from
 * `projectRoot/.pi/agents/`.
 *
 * `projectRoot` is kept for API compatibility but is not used for agent
 * resolution. Tests set `PI_CODING_AGENT_DIR` to a temp `<root>/agent`
 * directory before each test.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempRoot: string;
let agentDir: string;
let savedEnv: string | undefined;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "autodev-t2-fallback-"));
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

function writeCentralAgent(name: string, fallbackModels: string | undefined, model: string): void {
  const lines = ["---", `name: ${name}`, "description: test agent", "tools: read"];
  if (fallbackModels !== undefined) {
    lines.push(`fallback_models: ${fallbackModels}`);
  }
  lines.push(`model: ${model}`, "---", "Body.");
  writeFileSync(join(agentDir, `${name}.md`), lines.join("\n") + "\n");
}

import { loadAgentFallbackChains } from "../fallback.js";

// --- Happy path ------------------------------------------------------------

test("loadAgentFallbackChains reads fallback_models from central agents dir", () => {
  writeCentralAgent("nemo", "ollama-cloud/glm-5.1, ollama-cloud/deepseek-v4-pro", "ollama-cloud/glm-5.2");
  writeCentralAgent("oracle", "ollama-cloud/deepseek-v4-flash", "ollama-cloud/deepseek-v4-pro");

  const chains = loadAgentFallbackChains("/unused/project/root");
  expect(chains["nemo"]).toBeDefined();
  expect(chains["nemo"]!.fallback_models).toEqual([
    "ollama-cloud/glm-5.1",
    "ollama-cloud/deepseek-v4-pro",
  ]);
  expect(chains["oracle"]).toBeDefined();
  expect(chains["oracle"]!.fallback_models).toEqual(["ollama-cloud/deepseek-v4-flash"]);
});

test("loadAgentFallbackChains skips agents without fallback_models field", () => {
  writeCentralAgent("nemo", "ollama-cloud/glm-5.1", "ollama-cloud/glm-5.2");
  writeCentralAgent("no-fallback", undefined, "ollama-cloud/glm-5.2");

  const chains = loadAgentFallbackChains("/unused");
  expect(chains["nemo"]).toBeDefined();
  expect(chains["no-fallback"]).toBeUndefined();
});

test("loadAgentFallbackChains skips agents whose fallback_models is empty after trim", () => {
  writeCentralAgent("empty-fb", " , ", "ollama-cloud/glm-5.2");
  const chains = loadAgentFallbackChains("/unused");
  expect(chains["empty-fb"]).toBeUndefined();
});

// --- Failure path ----------------------------------------------------------

test("loadAgentFallbackChains returns {} when central agents dir is missing", () => {
  rmSync(agentDir, { recursive: true, force: true });
  expect(existsSync(agentDir)).toBe(false);
  expect(loadAgentFallbackChains("/unused")).toEqual({});
});

test("loadAgentFallbackChains skips agents with no `name` frontmatter field", () => {
  writeFileSync(
    join(agentDir, "noname.md"),
    `---\ndescription: no name\ntools: read\nfallback_models: ollama-cloud/glm-5.1\nmodel: ollama-cloud/glm-5.2\n---\nBody.`,
  );
  const chains = loadAgentFallbackChains("/unused");
  // Without a `name` field the chain cannot be keyed, so it is skipped.
  expect(Object.keys(chains)).toEqual([]);
});