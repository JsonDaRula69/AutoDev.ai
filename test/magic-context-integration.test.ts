/**
 * T6 — Magic Context integration tests.
 *
 * Verifies the AutoDev extension's interaction with Magic Context's 5
 * ctx_* tools via the shared mock fixture, plus a config-override test
 * that reads `.cortexkit/magic-context.jsonc` and asserts the glm-5.2:cloud
 * model and related settings are wired correctly.
 *
 * Test groups (per task spec):
 *   1. ctx_memory write/read — storeLearning/storeIssue descriptors
 *   2. ctx_search — storeDecision routes to loreguard:adr, not ctx_memory
 *   3. ctx_note write — mock accepts write actions
 *   4. ctx_expand + ctx_reduce — callable, expected shapes
 *   5. Config override — .cortexkit/magic-context.jsonc field assertions
 *   6. Notepad-to-MagicContext integration — all 5 store* backends routed
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import {
  mockCtxSearch,
  mockCtxMemory,
  mockCtxNote,
  mockCtxExpand,
  mockCtxReduce,
  resetCtxMocks,
  ALL_CTX_MOCKS,
} from "./mocks/magic-context.js";
import {
  storeLearning,
  storeDecision,
  storeIssue,
  storeVerification,
  storeProblem,
  setSearchLoreAvailable,
  setSuggestLoreImpl,
  MEMORY_CATEGORY_ARCHITECTURE,
  MEMORY_CATEGORY_CONSTRAINTS,
} from "../extensions/autodev/notepad/index.js";
import { setDb, resetDb, createSchema, checkSqliteVersion, suggestDecision } from "../extensions/autodev/loreguard/index.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const CONFIG_PATH = resolve(PROJECT_ROOT, ".cortexkit", "magic-context.jsonc");

/**
 * Strip // and block comments from JSONC so JSON.parse can read it.
 * String-aware: ignores `//` and `/*` that appear inside string literals
 * (e.g. the `https://` URL in the embedding endpoint).
 */
function parseJsonc(text: string): Record<string, unknown> {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      // line comment — skip to end of line
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      // block comment — skip to closing */
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return JSON.parse(out) as Record<string, unknown>;
}

let memDb: Database;

beforeEach(() => {
  resetCtxMocks();
  memDb = new Database(":memory:");
  checkSqliteVersion(memDb);
  createSchema(memDb);
  setDb(memDb);
  // Inject suggestLore synchronously so tests don't wait for the async import.
  setSuggestLoreImpl((title, content, category) =>
    suggestDecision(memDb, title, content, (category ?? "fact") as "fact" | "onboarding" | "design"),
  );
  setSearchLoreAvailable(false);
});

afterEach(() => {
  resetDb();
  setSearchLoreAvailable(false);
  setSuggestLoreImpl(undefined);
  memDb.close();
});

// ---------------------------------------------------------------------------
// Group 1: ctx_memory write/read — notepad descriptors with correct categories
// ---------------------------------------------------------------------------

test("ctx_memory mock accepts 'write' with ARCHITECTURE category for storeLearning", async () => {
  const d = storeLearning("Postgres is the system of record.");
  expect(d.backend).toBe("ctx_memory:ARCHITECTURE");
  expect(d.written).toBe(false);

  // Simulate the caller invoking ctx_memory with the descriptor's content.
  await mockCtxMemory("write", {
    category: MEMORY_CATEGORY_ARCHITECTURE,
    content: d.content,
  });
  expect(mockCtxMemory).toHaveBeenCalledTimes(1);
  expect(mockCtxMemory).toHaveBeenCalledWith(
    "write",
    expect.objectContaining({ category: "ARCHITECTURE" }),
  );
});

test("ctx_memory mock accepts 'write' with CONSTRAINTS category for storeIssue", async () => {
  const d = storeIssue("Never push directly to project/main.");
  expect(d.backend).toBe("ctx_memory:CONSTRAINTS");
  expect(d.written).toBe(false);

  await mockCtxMemory("write", {
    category: MEMORY_CATEGORY_CONSTRAINTS,
    content: d.content,
  });
  expect(mockCtxMemory).toHaveBeenCalledTimes(1);
  expect(mockCtxMemory).toHaveBeenCalledWith(
    "write",
    expect.objectContaining({ category: "CONSTRAINTS" }),
  );
});

test("ctx_memory mock 'list' returns empty memories with total 0", async () => {
  const result = await mockCtxMemory("list");
  expect(result.success).toBe(true);
  expect(result.memories).toEqual([]);
  expect(result.total).toBe(0);
});

test("ctx_memory mock 'write' returns a fixed id of 999", async () => {
  const result = await mockCtxMemory("write", { content: "x" });
  expect(result.id).toBe(999);
  expect(result.success).toBe(true);
});

// ---------------------------------------------------------------------------
// Group 2: ctx_search — storeDecision routes to loreguard:adr when
// search_lore is available, and to ctx_memory:ARCHITECTURE as a fallback
// ---------------------------------------------------------------------------

test("storeDecision produces a loreguard:adr descriptor when search_lore is available", () => {
  setSearchLoreAvailable(true);
  const d = storeDecision("Use Bun as runtime", "Bun ships faster than Node.");
  expect(d.backend).toBe("loreguard:adr");
  expect(d.backend).not.toMatch(/^ctx_memory/);
  expect(d.content).toContain("ADR: Use Bun as runtime");
  expect(d.note).toContain("ratify_lore");
  expect(d.written).toBe(true);
});

test("storeDecision falls back to ctx_memory:ARCHITECTURE when search_lore is unavailable", () => {
  setSearchLoreAvailable(false);
  const d = storeDecision("Use Bun as runtime", "Bun ships faster than Node.");
  expect(d.backend).toBe("ctx_memory:ARCHITECTURE");
  expect(d.written).toBe(false);
  expect(d.content).toContain("ADR: Use Bun as runtime");
  expect(d.note).toContain("ctx_memory(action='write'");
  expect(d.note).not.toContain("ratify_lore");
});

test("ctx_search mock returns memory + message hits echoing the query", async () => {
  const result = await mockCtxSearch("bun runtime decision");
  expect(result.total).toBe(2);
  expect(result.results[0]?.source).toBe("memory");
  expect(result.results[0]?.content).toContain("bun runtime decision");
  expect(result.results[1]?.source).toBe("message");
  expect(mockCtxSearch).toHaveBeenCalledTimes(1);
});

test("ctx_search mock accepts sources and limit options without error", async () => {
  await mockCtxSearch("decision", { sources: ["memory"], limit: 5 });
  expect(mockCtxSearch).toHaveBeenCalledWith("decision", { sources: ["memory"], limit: 5 });
});

// ---------------------------------------------------------------------------
// Group 3: ctx_note write — mock accepts write actions
// ---------------------------------------------------------------------------

test("ctx_note mock accepts a 'write' action and returns note_id 1", async () => {
  const result = await mockCtxNote("write", { content: "follow up on perf" });
  expect(result.success).toBe(true);
  expect(result.note_id).toBe(1);
  expect(mockCtxNote).toHaveBeenCalledTimes(1);
});

test("ctx_note mock accepts a 'dismiss' action", async () => {
  const result = await mockCtxNote("dismiss", { note_id: 42 });
  expect(result.success).toBe(true);
});

// ---------------------------------------------------------------------------
// Group 4: ctx_expand + ctx_reduce — callable, expected shapes
// ---------------------------------------------------------------------------

test("ctx_expand mock returns expanded content and messages array", async () => {
  const result = await mockCtxExpand({ start: 10, end: 20 });
  expect(result.content).toBe("Mocked expanded content");
  expect(Array.isArray(result.messages)).toBe(true);
  expect(mockCtxExpand).toHaveBeenCalledTimes(1);
});

test("ctx_expand mock accepts a single message ordinal", async () => {
  await mockCtxExpand({ message: 138 });
  expect(mockCtxExpand).toHaveBeenCalledWith({ message: 138 });
});

test("ctx_reduce mock echoes back the dropped tag range", async () => {
  const result = await mockCtxReduce({ drop: "3-5,8" });
  expect(result.success).toBe(true);
  expect(result.dropped).toBe("3-5,8");
  expect(mockCtxReduce).toHaveBeenCalledTimes(1);
});

test("ctx_reduce mock accepts a single tag id", async () => {
  const result = await mockCtxReduce({ drop: "12" });
  expect(result.dropped).toBe("12");
});

// ---------------------------------------------------------------------------
// Group 5: Config override — .cortexkit/magic-context.jsonc field assertions
// ---------------------------------------------------------------------------

test("config file exists at .cortexkit/magic-context.jsonc", () => {
  const text = readFileSync(CONFIG_PATH, "utf8");
  expect(text.length).toBeGreaterThan(0);
});

test("config: dreamer.model is ollama-cloud/glm-5.2:cloud", () => {
  const cfg = parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
  const dreamer = cfg["dreamer"] as { model: string };
  expect(dreamer.model).toBe("ollama-cloud/glm-5.2:cloud");
});

test("config: dreamer.fallback_models includes glm-5.1:cloud", () => {
  const cfg = parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
  const dreamer = cfg["dreamer"] as { fallback_models: string[] };
  expect(dreamer.fallback_models).toContain("ollama-cloud/glm-5.1:cloud");
});

test("config: embedding.api_key references ${VOYAGE_API_KEY}", () => {
  const cfg = parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
  const embedding = cfg["embedding"] as { api_key: string };
  expect(embedding.api_key).toBe("${VOYAGE_API_KEY}");
});

test("config: memory.git_commit_indexing.enabled is true", () => {
  const cfg = parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
  const memory = cfg["memory"] as { git_commit_indexing: { enabled: boolean } };
  expect(memory.git_commit_indexing.enabled).toBe(true);
});

test("config: dreamer.tasks has per-task schedule format", () => {
  const cfg = parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
  const dreamer = cfg["dreamer"] as { tasks: Record<string, { schedule: string }> };
  expect(dreamer.tasks).toBeDefined();
  expect(dreamer.tasks["verify"]?.schedule).toBe("0 3 * * *");
  expect(dreamer.tasks["maintain-docs"]?.schedule).toBe("");
});

test("config: sidekick.enabled is true", () => {
  const cfg = parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
  const sidekick = cfg["sidekick"] as { enabled: boolean };
  expect(sidekick.enabled).toBe(true);
});

test("config: smart_drops is false (opt-in)", () => {
  const cfg = parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
  expect(cfg["smart_drops"]).toBe(false);
});

// ---------------------------------------------------------------------------
// Group 6: Notepad-to-MagicContext integration — all 5 store* backends routed
// ---------------------------------------------------------------------------

test("storeLearning routes to ctx_memory:ARCHITECTURE backend", () => {
  const d = storeLearning("fact");
  expect(d.kind).toBe("learning");
  expect(d.backend).toBe("ctx_memory:ARCHITECTURE");
  expect(d.target).toContain("ARCHITECTURE");
  expect(d.written).toBe(false);
});

test("storeDecision routes to loreguard:adr backend when search_lore is available", () => {
  setSearchLoreAvailable(true);
  const d = storeDecision("title", "body");
  expect(d.kind).toBe("decision");
  expect(d.backend).toBe("loreguard:adr");
  expect(d.target).toContain("loreguard");
  expect(d.written).toBe(true);
});

test("storeDecision routes to ctx_memory:ARCHITECTURE backend when search_lore is unavailable", () => {
  setSearchLoreAvailable(false);
  const d = storeDecision("title", "body");
  expect(d.kind).toBe("decision");
  expect(d.backend).toBe("ctx_memory:ARCHITECTURE");
  expect(d.target).toContain("ARCHITECTURE");
  expect(d.written).toBe(false);
});

test("storeIssue routes to ctx_memory:CONSTRAINTS backend", () => {
  const d = storeIssue("constraint");
  expect(d.kind).toBe("issue");
  expect(d.backend).toBe("ctx_memory:CONSTRAINTS");
  expect(d.target).toContain("CONSTRAINTS");
  expect(d.written).toBe(false);
});

test("storeVerification routes to evidence-file backend", () => {
  const d = storeVerification(PROJECT_ROOT, "t6-intg-config", "body\n");
  expect(d.kind).toBe("verification");
  expect(d.backend).toBe("evidence-file");
  expect(d.written).toBe(true);
  expect(d.target).toContain(".omo");
  expect(d.target).toContain("evidence");
});

test("storeProblem routes to research-note backend", () => {
  const d = storeProblem(PROJECT_ROOT, "t6-intg-research", "# x\n");
  expect(d.kind).toBe("problem");
  expect(d.backend).toBe("research-note");
  expect(d.written).toBe(true);
  expect(d.target).toContain(".autodev");
  expect(d.target).toContain("research");
});

test("all 5 notepad store* functions cover 5 distinct backends", () => {
  setSearchLoreAvailable(true);
  const backends = new Set([
    storeLearning("x").backend,
    storeDecision("t", "b").backend,
    storeIssue("x").backend,
    storeVerification(PROJECT_ROOT, "t6-backends", "x").backend,
    storeProblem(PROJECT_ROOT, "t6-backends", "x").backend,
  ]);
  expect(backends.size).toBe(5);
  expect(backends.has("ctx_memory:ARCHITECTURE")).toBe(true);
  expect(backends.has("loreguard:adr")).toBe(true);
  expect(backends.has("ctx_memory:CONSTRAINTS")).toBe(true);
  expect(backends.has("evidence-file")).toBe(true);
  expect(backends.has("research-note")).toBe(true);
});

test("all 5 ctx_* mocks are independently callable after reset", async () => {
  await Promise.all([
    mockCtxSearch("q"),
    mockCtxMemory("write", { content: "x" }),
    mockCtxNote("write", {}),
    mockCtxExpand({ start: 1, end: 2 }),
    mockCtxReduce({ drop: "1" }),
  ]);
  for (const m of ALL_CTX_MOCKS) {
    expect(m).toHaveBeenCalledTimes(1);
  }
});