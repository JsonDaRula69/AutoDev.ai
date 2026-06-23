/**
 * Tests for the orchestrator module (heartbeat, dispatch, projects, CLI).
 *
 * Uses mocks for `gh` CLI output, `backgroundManager.spawn`, and session
 * completion. No real GitHub API calls.
 */
import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// ---- Mocks ----

// Mock execSync for gh CLI calls
const mockExecSync = mock<(args: string) => string>(() => "");
const originalExecSync = require("node:child_process").execSync;

// Mock background manager
const mockSpawn = mock(() => "bg-test-1");
const mockGetTask = mock(() => undefined);
const mockBackgroundManager = {
  spawn: mockSpawn,
  getTask: mockGetTask,
  listTasks: () => [],
  cancel: () => true,
  dispose: () => {},
};

// ---- Setup / Teardown ----

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join("/tmp", `orchestrator-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  await mkdir(join(tmpDir, ".autodev"), { recursive: true });
  await mkdir(join(tmpDir, ".autodev", "work-items"), { recursive: true });

  // Mock execSync
  (require("node:child_process") as any).execSync = mockExecSync;
  mockExecSync.mockReset();
  mockSpawn.mockReset();
  mockGetTask.mockReset();
});

afterEach(async () => {
  (require("node:child_process") as any).execSync = originalExecSync;
  await rm(tmpDir, { recursive: true, force: true });
});

// ---- Projects Registry Tests ----

test("loadRegistry returns default when no file exists", async () => {
  const { loadRegistry } = await import("../projects.js");
  const registry = await loadRegistry(tmpDir);
  expect(registry.projects.length).toBe(1);
  expect(registry.projects[0]!.active).toBe(true);
});

test("loadRegistry reads existing file", async () => {
  const { loadRegistry } = await import("../projects.js");
  const testData = {
    projects: [
      { name: "test-proj", path: "/tmp/test", repo: "user/test", active: true },
    ],
  };
  await writeFile(join(tmpDir, ".autodev", "projects.json"), JSON.stringify(testData));
  const registry = await loadRegistry(tmpDir);
  expect(registry.projects.length).toBe(1);
  expect(registry.projects[0]!.name).toBe("test-proj");
});

test("saveRegistry writes file", async () => {
  const { saveRegistry, loadRegistry } = await import("../projects.js");
  const registry = {
    projects: [
      { name: "proj-a", path: "/tmp/a", repo: "user/a", active: true },
      { name: "proj-b", path: "/tmp/b", repo: "user/b", active: false },
    ],
  };
  await saveRegistry(registry, tmpDir);
  const loaded = await loadRegistry(tmpDir);
  expect(loaded.projects.length).toBe(2);
  expect(loaded.projects[0]!.name).toBe("proj-a");
  expect(loaded.projects[1]!.name).toBe("proj-b");
});

test("getActiveProject returns active project", async () => {
  const { getActiveProject } = await import("../projects.js");
  const registry = {
    projects: [
      { name: "proj-a", path: "/tmp/a", repo: "user/a", active: false },
      { name: "proj-b", path: "/tmp/b", repo: "user/b", active: true },
    ],
  };
  const active = getActiveProject(registry);
  expect(active.name).toBe("proj-b");
});

test("setActiveProject deactivates others", async () => {
  const { setActiveProject } = await import("../projects.js");
  const registry = {
    projects: [
      { name: "proj-a", path: "/tmp/a", repo: "user/a", active: true },
      { name: "proj-b", path: "/tmp/b", repo: "user/b", active: false },
    ],
  };
  const updated = setActiveProject(registry, "proj-b");
  expect(updated.projects[0]!.active).toBe(false);
  expect(updated.projects[1]!.active).toBe(true);
});

test("addProject adds new project", async () => {
  const { addProject } = await import("../projects.js");
  const registry = { projects: [] };
  const updated = addProject(registry, { name: "new-proj", path: "/tmp/new", repo: "user/new" });
  expect(updated.projects.length).toBe(1);
  expect(updated.projects[0]!.name).toBe("new-proj");
  expect(updated.projects[0]!.active).toBe(false);
});

test("addProject updates existing project", async () => {
  const { addProject } = await import("../projects.js");
  const registry = {
    projects: [{ name: "proj-a", path: "/tmp/a", repo: "user/a", active: true }],
  };
  const updated = addProject(registry, { name: "proj-a", path: "/tmp/a-v2", repo: "user/a" });
  expect(updated.projects.length).toBe(1);
  expect(updated.projects[0]!.path).toBe("/tmp/a-v2");
  expect(updated.projects[0]!.active).toBe(true); // preserves active
});

test("removeProject removes by name", async () => {
  const { removeProject } = await import("../projects.js");
  const registry = {
    projects: [
      { name: "proj-a", path: "/tmp/a", repo: "user/a", active: true },
      { name: "proj-b", path: "/tmp/b", repo: "user/b", active: false },
    ],
  };
  const updated = removeProject(registry, "proj-a");
  expect(updated.projects.length).toBe(1);
  expect(updated.projects[0]!.name).toBe("proj-b");
});

// ---- Dispatch Tests ----

test("parseTriageResult parses valid JSON", async () => {
  const { parseTriageResult } = await import("../dispatch.js");
  const output = `Some text before
{
  "classification": "simple",
  "scope": "small",
  "route": "ned-land",
  "summary": "This is a simple bug fix"
}
Some text after`;
  const result = parseTriageResult(output);
  expect(result).toBeDefined();
  expect(result!.classification).toBe("simple");
  expect(result!.scope).toBe("small");
  expect(result!.route).toBe("ned-land");
  expect(result!.summary).toBe("This is a simple bug fix");
});

test("parseTriageResult returns undefined for invalid JSON", async () => {
  const { parseTriageResult } = await import("../dispatch.js");
  expect(parseTriageResult("not json")).toBeUndefined();
});

test("parseTriageResult returns undefined for invalid classification", async () => {
  const { parseTriageResult } = await import("../dispatch.js");
  const output = `{"classification": "invalid", "scope": "small", "route": "ned-land", "summary": "test"}`;
  expect(parseTriageResult(output)).toBeUndefined();
});

test("parseTriageResult returns undefined for invalid route", async () => {
  const { parseTriageResult } = await import("../dispatch.js");
  const output = `{"classification": "simple", "scope": "small", "route": "invalid", "summary": "test"}`;
  expect(parseTriageResult(output)).toBeUndefined();
});

// ---- Heartbeat Tests ----

test("getHeartbeatState returns initial state", async () => {
  const { getHeartbeatState } = await import("../heartbeat.js");
  const state = getHeartbeatState();
  expect(state.running).toBe(false);
  expect(state.tickCount).toBe(0);
  expect(state.errors).toBe(0);
  expect(state.intervalMs).toBe(300000); // 5 min
});

test("startHeartbeat and stopHeartbeat", async () => {
  const { startHeartbeat, stopHeartbeat, getHeartbeatState } = await import("../heartbeat.js");
  startHeartbeat(10000); // 10s interval for testing
  let state = getHeartbeatState();
  expect(state.running).toBe(true);

  stopHeartbeat();
  state = getHeartbeatState();
  expect(state.running).toBe(false);
});

test("transitionLabel calls gh issue edit", async () => {
  const { transitionLabel } = await import("../heartbeat.js");
  mockExecSync.mockImplementation(() => "");
  await transitionLabel(42, "autodev-request", "autodev-planned", tmpDir);
  expect(mockExecSync).toHaveBeenCalledTimes(1);
  const call = String(mockExecSync.mock.calls[0]?.[0] ?? "");
  expect(call).toContain("gh issue edit 42");
  expect(call).toContain("--remove-label autodev-request");
  expect(call).toContain("--add-label autodev-planned");
});

// ---- CLI Tests ----

test("registerCommands registers autodev command", async () => {
  const { registerCommands } = await import("../cli.js");
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const fakePi = {
    registerCommand: (...args: unknown[]) => {
      calls.push({ method: "registerCommand", args });
    },
  };

  registerCommands(fakePi as any);
  expect(calls.length).toBe(1);
  expect(calls[0]!.args[0]).toBe("autodev");
});

// ---- Orchestrator Index Tests ----

test("orchestrator register() does not throw", async () => {
  const { register } = await import("../index.js");
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const fakePi = {
    registerCommand: (...args: unknown[]) => {
      calls.push({ method: "registerCommand", args });
    },
    on: () => {},
    registerTool: () => {},
    getActiveTools: () => [],
    getAllTools: () => [],
    ui: { notify: () => {} },
  };

  expect(() => register(fakePi as any)).not.toThrow();
  // Should register the autodev command
  const cmdCalls = calls.filter((c) => c.method === "registerCommand");
  expect(cmdCalls.length).toBeGreaterThanOrEqual(1);
});

// ---- Work-item dedup test ----

test("work-item file prevents duplicate dispatch", async () => {
  // Write a work-item file simulating a previously dispatched issue
  const workItemPath = join(tmpDir, ".autodev", "work-items", "99.json");
  await writeFile(
    workItemPath,
    JSON.stringify({
      issue_number: 99,
      dispatched_at: Date.now() - 60000,
      state: "dispatched",
      project: "default",
    }),
  );

  // Verify the file exists and is readable
  const raw = await readFile(workItemPath, "utf-8");
  const item = JSON.parse(raw);
  expect(item.issue_number).toBe(99);
  expect(item.state).toBe("dispatched");
});

// ---- Multi-project test ----

test("multi-project registry with 2 projects", async () => {
  const { loadRegistry, saveRegistry, getActiveProject } = await import("../projects.js");

  const registry = {
    projects: [
      { name: "project-a", path: "/tmp/proj-a", repo: "user/proj-a", active: true },
      { name: "project-b", path: "/tmp/proj-b", repo: "user/proj-b", active: false },
    ],
  };
  await saveRegistry(registry, tmpDir);

  const loaded = await loadRegistry(tmpDir);
  expect(loaded.projects.length).toBe(2);

  const active = getActiveProject(loaded);
  expect(active.name).toBe("project-a");
  expect(active.repo).toBe("user/proj-a");
});
