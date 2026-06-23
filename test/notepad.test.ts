/**
 * T5 notepad tests.
 *
 * Verifies the 5 storage mappings route to the correct backend and that
 * the file-writing backends (verification, problem) actually persist.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  storeLearning,
  storeDecision,
  storeIssue,
  storeVerification,
  storeProblem,
  MEMORY_CATEGORY_ARCHITECTURE,
  MEMORY_CATEGORY_CONSTRAINTS,
} from "../extensions/autodev/notepad/index.js";
import { setDb, resetDb, createSchema, checkSqliteVersion } from "../extensions/autodev/loreguard/index.js";

let tempRoot: string;

function setup(): string {
  tempRoot = mkdtempSync(join(tmpdir(), "autodev-notepad-"));
  return tempRoot;
}

function teardown(): void {
  rmSync(tempRoot, { recursive: true, force: true });
}

let memDb: Database;

beforeEach(() => {
  memDb = new Database(":memory:");
  checkSqliteVersion(memDb);
  createSchema(memDb);
  setDb(memDb);
});

afterEach(() => {
  resetDb();
  memDb.close();
});

test("storeLearning routes to ctx_memory ARCHITECTURE", () => {
  const d = storeLearning("Postgres is the system of record.");
  expect(d.kind).toBe("learning");
  expect(d.backend).toBe("ctx_memory:ARCHITECTURE");
  expect(d.written).toBe(false);
  expect(d.content).toBe("Postgres is the system of record.");
});

test("storeDecision writes a draft ADR to Loreguard via suggest_lore", () => {
  const d = storeDecision("Use Bun as runtime", "Bun ships faster than Node for our workload.");
  expect(d.kind).toBe("decision");
  expect(d.backend).toBe("loreguard:adr");
  expect(d.written).toBe(true);
  expect(d.content).toContain("ADR: Use Bun as runtime");
  expect(d.content).toContain("Draft (suggest_lore)");
  expect(d.target).toMatch(/^loreguard decision #\d+$/);
  expect(d.note).toContain("ratify_lore");
});

test("storeIssue routes to ctx_memory CONSTRAINTS", () => {
  const d = storeIssue("Never push directly to project/main.");
  expect(d.kind).toBe("issue");
  expect(d.backend).toBe("ctx_memory:CONSTRAINTS");
  expect(d.written).toBe(false);
});

test("storeVerification writes a file to .omo/evidence/", () => {
  const root = setup();
  try {
    const d = storeVerification(root, "task-x", "evidence body\n");
    expect(d.kind).toBe("verification");
    expect(d.backend).toBe("evidence-file");
    expect(d.written).toBe(true);
    expect(existsSync(d.target)).toBe(true);
    expect(readFileSync(d.target, "utf8")).toBe("evidence body\n");
    expect(d.target).toContain(".omo");
    expect(d.target).toContain("evidence");
  } finally {
    teardown();
  }
});

test("storeVerification appends .txt when missing", () => {
  const root = setup();
  try {
    const d = storeVerification(root, "no-ext", "x");
    expect(d.target.endsWith(".txt")).toBe(true);
  } finally {
    teardown();
  }
});

test("storeProblem writes a file to .autodev/research/", () => {
  const root = setup();
  try {
    const d = storeProblem(root, "perf-investigation", "# Perf\n\nsomething\n");
    expect(d.kind).toBe("problem");
    expect(d.backend).toBe("research-note");
    expect(d.written).toBe(true);
    expect(existsSync(d.target)).toBe(true);
    expect(readFileSync(d.target, "utf8")).toBe("# Perf\n\nsomething\n");
    expect(d.target).toContain(".autodev");
    expect(d.target).toContain("research");
  } finally {
    teardown();
  }
});

test("storeProblem appends .md when missing", () => {
  const root = setup();
  try {
    const d = storeProblem(root, "notes", "x");
    expect(d.target.endsWith(".md")).toBe(true);
  } finally {
    teardown();
  }
});

test("category constants are exported and stable", () => {
  expect(MEMORY_CATEGORY_ARCHITECTURE).toBe("ARCHITECTURE");
  expect(MEMORY_CATEGORY_CONSTRAINTS).toBe("CONSTRAINTS");
});