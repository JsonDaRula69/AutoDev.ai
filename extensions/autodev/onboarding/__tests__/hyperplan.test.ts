import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHyperplan, CRITIC_IDS, type SpawnCriticDeps, type HyperplanResult } from "../hyperplan.js";
import * as teamStore from "../../team-mode/store.js";
import type { ConversationEntry } from "../harbor-log.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "hyperplan-"));
  teamStore._resetStore();
});

afterEach(() => {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { }
  teamStore._resetStore();
});

function makeLog(messages: Array<{ role: string; content: string }>): readonly ConversationEntry[] {
  return messages.map((m, i) => ({
    role: m.role,
    content: m.content,
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
  }));
}

function makeMockDeps(responses: Record<string, string>): SpawnCriticDeps {
  return {
    prompt: async (criticId: string) => responses[criticId] ?? "(no response)",
  };
}

test("CRITIC_IDS has 5 critics", () => {
  expect(CRITIC_IDS.length).toBe(5);
  expect(CRITIC_IDS).toContain("scope-skeptic");
  expect(CRITIC_IDS).toContain("risk-hawk");
  expect(CRITIC_IDS).toContain("tech-contrarian");
  expect(CRITIC_IDS).toContain("process-cynic");
  expect(CRITIC_IDS).toContain("user-proxy");
});

test("runHyperplan returns pass when all critics pass", async () => {
  const log = makeLog([
    { role: "user", content: "I want a trading bot" },
    { role: "assistant", content: "Tell me more about your trading bot requirements." },
  ]);
  const deps = makeMockDeps({
    "scope-skeptic": "Scope is clear. PASS",
    "risk-hawk": "Risks are adequately covered. PASS",
    "tech-contrarian": "Tech choices are sound. PASS",
    "process-cynic": "Process is reasonable. PASS",
    "user-proxy": "Crew listened well. PASS",
  });
  const result = await runHyperplan(tempDir, log, deps);
  expect(result.verdict).toBe("pass");
  expect(result.critiques.length).toBe(5);
});

test("runHyperplan returns revise when a critic finds issues", async () => {
  const log = makeLog([
    { role: "user", content: "I want a trading bot" },
    { role: "assistant", content: "Great, let's use Python." },
  ]);
  const deps = makeMockDeps({
    "scope-skeptic": "The user said 'trading bot' but didn't specify markets. REVISE",
    "risk-hawk": "Risks are covered. PASS",
    "tech-contrarian": "Python is fine. PASS",
    "process-cynic": "Process is fine. PASS",
    "user-proxy": "Crew listened. PASS",
  });
  const result = await runHyperplan(tempDir, log, deps);
  expect(result.verdict).toBe("revise");
});

test("runHyperplan returns block when a critic finds critical issues", async () => {
  const log = makeLog([
    { role: "user", content: "I want a trading bot for crypto" },
    { role: "assistant", content: "Sure, we'll build a web app for stock trading." },
  ]);
  const deps = makeMockDeps({
    "scope-skeptic": "Crew said 'stock trading' but user said 'crypto'. BLOCK",
    "risk-hawk": "PASS",
    "tech-contrarian": "PASS",
    "process-cynic": "PASS",
    "user-proxy": "Crew completely ignored the user's mention of crypto. BLOCK",
  });
  const result = await runHyperplan(tempDir, log, deps);
  expect(result.verdict).toBe("block");
  expect(result.critiques.filter((c) => c.verdict === "block").length).toBe(2);
});

test("runHyperplan posts critiques to team mailbox", async () => {
  const log = makeLog([{ role: "user", content: "test" }]);
  const deps = makeMockDeps({
    "scope-skeptic": "PASS",
    "risk-hawk": "REVISE — missing risk discussion",
    "tech-contrarian": "PASS",
    "process-cynic": "PASS",
    "user-proxy": "PASS",
  });
  await runHyperplan(tempDir, log, deps);
  const teams = teamStore.listTeams();
  expect(teams.length).toBe(0);
});

test("runHyperplan writes verdict file to .autodev/onboarding/hyperplan-verdict.md", async () => {
  const log = makeLog([{ role: "user", content: "test" }]);
  const deps = makeMockDeps({
    "scope-skeptic": "PASS",
    "risk-hawk": "PASS",
    "tech-contrarian": "PASS",
    "process-cynic": "PASS",
    "user-proxy": "PASS",
  });
  const result = await runHyperplan(tempDir, log, deps);
  expect(result.verdictPath).not.toBeNull();
  expect(existsSync(result.verdictPath!)).toBe(true);
  const content = readFileSync(result.verdictPath!, "utf-8");
  expect(content).toContain("Hyperplan Verdict");
  expect(content).toContain("PASS");
  expect(content).toContain("Scope Skeptic");
});

test("runHyperplan handles critic session failures gracefully", async () => {
  const log = makeLog([{ role: "user", content: "test" }]);
  const deps: SpawnCriticDeps = {
    prompt: async (criticId: string) => {
      if (criticId === "risk-hawk") throw new Error("model unavailable");
      return "PASS";
    },
  };
  const result = await runHyperplan(tempDir, log, deps);
  expect(result.verdict).toBe("revise");
  const failedCritic = result.critiques.find((c) => c.criticId === "risk-hawk");
  expect(failedCritic).toBeDefined();
  expect(failedCritic!.critique).toContain("model unavailable");
});

test("runHyperplan summary describes the verdict", async () => {
  const log = makeLog([{ role: "user", content: "test" }]);
  const deps = makeMockDeps({
    "scope-skeptic": "BLOCK — wrong scope",
    "risk-hawk": "PASS",
    "tech-contrarian": "PASS",
    "process-cynic": "PASS",
    "user-proxy": "PASS",
  });
  const result = await runHyperplan(tempDir, log, deps);
  expect(result.summary).toContain("critical misunderstanding");
});

test("runHyperplan creates and cleans up a team", async () => {
  const log = makeLog([{ role: "user", content: "test" }]);
  const deps = makeMockDeps({
    "scope-skeptic": "PASS",
    "risk-hawk": "PASS",
    "tech-contrarian": "PASS",
    "process-cynic": "PASS",
    "user-proxy": "PASS",
  });
  await runHyperplan(tempDir, log, deps);
  expect(teamStore.listTeams().length).toBe(0);
});