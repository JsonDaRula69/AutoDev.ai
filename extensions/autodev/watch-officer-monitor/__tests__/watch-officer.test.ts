import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _resetObservationLog,
  getObservations,
  clearObservations,
  executeWatchOfficerStatus,
  executeWatchOfficerClear,
  _inspectForTesting,
} from "../index.js";
import * as teamStore from "../../team-mode/store.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "watch-officer-"));
  _resetObservationLog();
  teamStore._resetStore();
});

afterEach(() => {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { }
  _resetObservationLog();
  teamStore._resetStore();
});

test("_inspectForTesting records a plan deviation flag", () => {
  mkdirSync(join(tempDir, ".omo"), { recursive: true });
  writeFileSync(
    join(tempDir, ".omo", "boulder.json"),
    JSON.stringify({ active_plan: "test-plan" }),
  );
  mkdirSync(join(tempDir, ".omo", "plans"), { recursive: true });
  writeFileSync(
    join(tempDir, ".omo", "plans", "test-plan.md"),
    "# Plan\nOnly touch src/main.ts\n",
  );

  const flag = _inspectForTesting(
    { toolName: "write", input: { filePath: "src/other.ts" } },
    tempDir,
  );
  expect(flag).toBeDefined();
  expect(flag!.type).toBe("plan_deviation");
  expect(flag!.severity).toBe("warning");
  expect(flag!.detail).toContain("src/other.ts");
});

test("_inspectForTesting records an api_mismatch flag for destructive bash", () => {
  const flag = _inspectForTesting(
    { toolName: "bash", input: { command: "rm -rf --force /something" } },
    tempDir,
  );
  expect(flag).toBeDefined();
  expect(flag!.type).toBe("api_mismatch");
  expect(flag!.detail).toContain("--force");
});

test("_inspectForTesting records a wrong_assumption flag for overly specific grep", () => {
  const flag = _inspectForTesting(
    { toolName: "grep", input: { pattern: "verylongspecificstring" } },
    tempDir,
  );
  expect(flag).toBeDefined();
  expect(flag!.type).toBe("wrong_assumption");
  expect(flag!.detail).toContain("verylongspecificstring");
});

test("_inspectForTesting returns undefined for clean tool calls", () => {
  const flag = _inspectForTesting(
    { toolName: "read", input: { filePath: "src/main.ts" } },
    tempDir,
  );
  expect(flag).toBeUndefined();
});

test("getObservations returns all recorded flags", () => {
  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  _inspectForTesting({ toolName: "grep", input: { pattern: "verylongstring" } }, tempDir);
  const all = getObservations();
  expect(all.length).toBe(2);
});

test("getObservations filters by type", () => {
  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  _inspectForTesting({ toolName: "grep", input: { pattern: "verylongstring" } }, tempDir);
  const apiOnly = getObservations({ type: "api_mismatch" });
  expect(apiOnly.length).toBe(1);
  expect(apiOnly[0]!.type).toBe("api_mismatch");
});

test("getObservations filters by severity", () => {
  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  _inspectForTesting({ toolName: "grep", input: { pattern: "verylongstring" } }, tempDir);
  const infoOnly = getObservations({ severity: "info" });
  expect(infoOnly.length).toBe(2);
  const warningOnly = getObservations({ severity: "warning" });
  expect(warningOnly.length).toBe(0);
});

test("clearObservations empties the log and returns count", () => {
  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  _inspectForTesting({ toolName: "grep", input: { pattern: "verylongstring" } }, tempDir);
  const cleared = clearObservations();
  expect(cleared).toBe(2);
  expect(getObservations().length).toBe(0);
});

test("executeWatchOfficerStatus returns formatted observations", () => {
  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  const result = executeWatchOfficerStatus({});
  const details = result.details as { count: number; observations: unknown[] };
  expect(details.count).toBe(1);
  expect(result.content[0]!.type).toBe("text");
});

test("executeWatchOfficerStatus returns empty message when no observations", () => {
  const result = executeWatchOfficerStatus({});
  const details = result.details as { count: number };
  expect(details.count).toBe(0);
});

test("executeWatchOfficerClear clears and returns count", () => {
  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  const result = executeWatchOfficerClear();
  const details = result.details as { cleared: number };
  expect(details.cleared).toBe(1);
  expect(getObservations().length).toBe(0);
});

test("flags are posted to team mailbox when a team exists", () => {
  const team = teamStore.createTeam({
    name: "work-team",
    purpose: "Implementation work",
    trigger: "work",
    members: [{ role: "nemo" }, { role: "watch-officer" }],
  });

  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);

  const msgs = teamStore.getMessages(team.id);
  expect(msgs.length).toBe(1);
  expect(msgs[0]!.from).toBe("watch-officer");
  expect(msgs[0]!.to).toBe("broadcast");
  expect(msgs[0]!.content).toContain("api_mismatch");
});

test("no mailbox posting when no team exists", () => {
  _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  const teams = teamStore.listTeams();
  expect(teams.length).toBe(0);
});

test("flags get unique ids", () => {
  const f1 = _inspectForTesting({ toolName: "bash", input: { command: "rm --force x" } }, tempDir);
  const f2 = _inspectForTesting({ toolName: "grep", input: { pattern: "verylongstring" } }, tempDir);
  expect(f1!.id).not.toBe(f2!.id);
});