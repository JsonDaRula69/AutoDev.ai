/**
 * T5 extension load verification.
 *
 * Verifies the AutoDev extension entry point exports a default function,
 * all 15 module directories export a `register()` function, and the
 * team-mode module declares exactly 12 team_* tool names.
 */
import { test, expect } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

const MODULES = [
  "guardrails",
  "background",
  "delegation",
  "loreguard",
  "docs",
  "tools",
  "team-mode",
  "comment-checker",
  "notepad",
  "intent-gate",
  "mcp-integrations",
  "lsp",
  "tmux",
  "rules-injection",
  "watch-officer-monitor",
] as const;

test("extensions/autodev/index.ts exists", () => {
  expect(existsSync(join(ROOT, "extensions", "autodev", "index.ts"))).toBe(true);
});

test("extension entry point exports a default function", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "index.ts"));
  expect(typeof mod.default).toBe("function");
});

test("entry point exports MODULE_NAMES with 15 entries", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "index.ts"));
  expect(mod.MODULE_NAMES).toBeDefined();
  expect(Array.isArray(mod.MODULE_NAMES)).toBe(true);
  expect(mod.MODULE_NAMES.length).toBe(15);
});

for (const name of MODULES) {
  test(`${name}/index.ts exports register()`, async () => {
    const mod = await import(join(ROOT, "extensions", "autodev", name, "index.ts"));
    expect(typeof mod.register).toBe("function");
  });
}

test("team-mode exports TEAM_TOOL_NAMES with 12 entries", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "team-mode", "index.ts"));
  expect(mod.TEAM_TOOL_NAMES).toBeDefined();
  expect(mod.TEAM_TOOL_NAMES.length).toBe(12);
});

test("all 12 team_* tool names follow the team_ prefix", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "team-mode", "index.ts"));
  for (const name of mod.TEAM_TOOL_NAMES) {
    expect(name.startsWith("team_")).toBe(true);
  }
});

test("comment-checker exports stripSlop function", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "comment-checker", "index.ts"));
  expect(typeof mod.stripSlop).toBe("function");
});

test("intent-gate exports analyzeOnboardingIntent and analyzeIssueIntent", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "intent-gate", "index.ts"));
  expect(typeof mod.analyzeOnboardingIntent).toBe("function");
  expect(typeof mod.analyzeIssueIntent).toBe("function");
});

test("notepad exports 5 store* functions", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "notepad", "index.ts"));
  expect(typeof mod.storeLearning).toBe("function");
  expect(typeof mod.storeDecision).toBe("function");
  expect(typeof mod.storeIssue).toBe("function");
  expect(typeof mod.storeVerification).toBe("function");
  expect(typeof mod.storeProblem).toBe("function");
});

test("context.ts exports loadContextFiles and augmentSystemPrompt", async () => {
  const mod = await import(join(ROOT, "extensions", "autodev", "context.ts"));
  expect(typeof mod.loadContextFiles).toBe("function");
  expect(typeof mod.augmentSystemPrompt).toBe("function");
});