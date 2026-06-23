/**
 * Tests for the autonomy module (auto-merge, boulder state, continuation loops).
 *
 * Uses mocks for `gh` CLI output, boulder.json state, and background task events.
 * No real GitHub API calls.
 */
import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// ---- Mocks ----

const mockExecSync = mock<(args: string) => string>(() => "");
const originalExecSync = require("node:child_process").execSync;

// ---- Setup / Teardown ----

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join("/tmp", `autonomy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  await mkdir(join(tmpDir, ".omo"), { recursive: true });
  await mkdir(join(tmpDir, ".omo", "evidence"), { recursive: true });
  await mkdir(join(tmpDir, ".omo", "plans"), { recursive: true });

  // Mock execSync
  (require("node:child_process") as any).execSync = mockExecSync;
  mockExecSync.mockReset();
});

afterEach(async () => {
  (require("node:child_process") as any).execSync = originalExecSync;
  await rm(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// Auto-Merge Tests
// =============================================================================

test("auto_merge_pr: all 4 gates green → merge succeeds", async () => {
  const { autoMergePr } = await import("../merge.js");

  // Mock CI checks: all passing
  mockExecSync.mockImplementation((args: string) => {
    if (args.includes("pr checks")) {
      return JSON.stringify([
        { name: "CI / test", state: "SUCCESS" },
        { name: "CI / lint", state: "SUCCESS" },
      ]);
    }
    if (args.includes("pr view") && args.includes("mergeable")) {
      return JSON.stringify({ mergeable: "MERGEABLE" });
    }
    if (args.includes("pr view") && args.includes("labels")) {
      return JSON.stringify({ labels: [{ name: "autodev-ready" }] });
    }
    if (args.includes("pr merge")) {
      return "Merged successfully";
    }
    if (args.includes("issue edit")) {
      return "";
    }
    if (args.includes("issue comment")) {
      return "";
    }
    return "";
  });

  // Create evidence file
  await writeFile(join(tmpDir, ".omo", "evidence", "task-16-test.txt"), "test evidence");

  const result = await autoMergePr(42, tmpDir);

  expect(result.merged).toBe(true);
  expect(result.error).toBeUndefined();
  expect(result.gates.length).toBe(4);
  for (const gate of result.gates) {
    expect(gate.passed).toBe(true);
  }
});

test("auto_merge_pr: CI red → blocked with reason", async () => {
  const { autoMergePr } = await import("../merge.js");

  mockExecSync.mockImplementation((args: string) => {
    if (args.includes("pr checks")) {
      return JSON.stringify([
        { name: "CI / test", state: "FAILURE" },
      ]);
    }
    if (args.includes("pr view") && args.includes("mergeable")) {
      return JSON.stringify({ mergeable: "MERGEABLE" });
    }
    if (args.includes("pr view") && args.includes("labels")) {
      return JSON.stringify({ labels: [{ name: "autodev-ready" }] });
    }
    return "";
  });

  await writeFile(join(tmpDir, ".omo", "evidence", "task-16-test.txt"), "test evidence");

  const result = await autoMergePr(42, tmpDir);

  expect(result.merged).toBe(false);
  expect(result.error).toContain("CI status");
  expect(result.gates[0]!.passed).toBe(false);
});

test("auto_merge_pr: no evidence → blocked with reason", async () => {
  const { autoMergePr } = await import("../merge.js");

  mockExecSync.mockImplementation((args: string) => {
    if (args.includes("pr checks")) {
      return JSON.stringify([
        { name: "CI / test", state: "SUCCESS" },
      ]);
    }
    if (args.includes("pr view") && args.includes("mergeable")) {
      return JSON.stringify({ mergeable: "MERGEABLE" });
    }
    if (args.includes("pr view") && args.includes("labels")) {
      return JSON.stringify({ labels: [{ name: "autodev-ready" }] });
    }
    return "";
  });

  // No evidence file created
  const result = await autoMergePr(42, tmpDir);

  expect(result.merged).toBe(false);
  expect(result.error).toContain("Evidence");
  expect(result.gates[1]!.passed).toBe(false);
});

test("auto_merge_pr: autodev-review label (not autodev-ready) → blocked", async () => {
  const { autoMergePr } = await import("../merge.js");

  mockExecSync.mockImplementation((args: string) => {
    if (args.includes("pr checks")) {
      return JSON.stringify([
        { name: "CI / test", state: "SUCCESS" },
      ]);
    }
    if (args.includes("pr view") && args.includes("mergeable")) {
      return JSON.stringify({ mergeable: "MERGEABLE" });
    }
    if (args.includes("pr view") && args.includes("labels")) {
      return JSON.stringify({ labels: [{ name: "autodev-review" }] });
    }
    return "";
  });

  await writeFile(join(tmpDir, ".omo", "evidence", "task-16-test.txt"), "test evidence");

  const result = await autoMergePr(42, tmpDir);

  expect(result.merged).toBe(false);
  expect(result.error).toContain("autodev-ready");
  expect(result.gates[2]!.passed).toBe(false);
});

test("auto_merge_pr: PR not mergeable (conflicts) → blocked", async () => {
  const { autoMergePr } = await import("../merge.js");

  mockExecSync.mockImplementation((args: string) => {
    if (args.includes("pr checks")) {
      return JSON.stringify([
        { name: "CI / test", state: "SUCCESS" },
      ]);
    }
    if (args.includes("pr view") && args.includes("mergeable")) {
      return JSON.stringify({ mergeable: "CONFLICTING" });
    }
    if (args.includes("pr view") && args.includes("labels")) {
      return JSON.stringify({ labels: [{ name: "autodev-ready" }] });
    }
    return "";
  });

  await writeFile(join(tmpDir, ".omo", "evidence", "task-16-test.txt"), "test evidence");

  const result = await autoMergePr(42, tmpDir);

  expect(result.merged).toBe(false);
  expect(result.error).toContain("merge conflicts");
  expect(result.gates[3]!.passed).toBe(false);
});

// =============================================================================
// Boulder State Tests
// =============================================================================

test("boulder: loadBoulder returns undefined when no file", async () => {
  const { loadBoulder } = await import("../boulder.js");
  const state = await loadBoulder(tmpDir);
  expect(state).toBeUndefined();
});

test("boulder: loadBoulder reads existing file", async () => {
  const { loadBoulder } = await import("../boulder.js");
  const testState = {
    schema_version: 2,
    active_work_id: "test-work-123",
    works: {},
    active_plan: "/tmp/test/.omo/plans/test-plan.md",
    plan_name: "test-plan",
    status: "active",
    started_at: "2026-06-23T10:00:00.000Z",
    updated_at: "2026-06-23T10:00:00.000Z",
    session_ids: [],
    session_origins: {},
    agent: "atlas",
    task_sessions: {},
  };
  await writeFile(join(tmpDir, ".omo", "boulder.json"), JSON.stringify(testState));
  const state = await loadBoulder(tmpDir);
  expect(state).toBeDefined();
  expect(state!.plan_name).toBe("test-plan");
  expect(state!.status).toBe("active");
});

test("boulder: saveBoulder writes file", async () => {
  const { loadBoulder, saveBoulder, createBoulderState } = await import("../boulder.js");
  const state = createBoulderState("/tmp/test/.omo/plans/test-plan.md", "test-plan", "atlas", tmpDir);
  await saveBoulder(state, tmpDir);
  const loaded = await loadBoulder(tmpDir);
  expect(loaded).toBeDefined();
  expect(loaded!.plan_name).toBe("test-plan");
  expect(loaded!.schema_version).toBe(2);
});

test("boulder: calculateProgress with mixed todos", async () => {
  const { calculateProgress } = await import("../boulder.js");
  const state = {
    schema_version: 2,
    active_work_id: "test-work",
    works: {},
    active_plan: "/plan.md",
    plan_name: "test-plan",
    status: "active",
    started_at: "2026-06-23T10:00:00.000Z",
    updated_at: "2026-06-23T10:00:00.000Z",
    session_ids: [],
    session_origins: {},
    agent: "atlas",
    task_sessions: {
      "todo:1": {
        task_key: "todo:1",
        task_label: "1",
        task_title: "Task one",
        session_id: "ses_1",
        agent: "sisyphus",
        category: "quick",
        updated_at: "2026-06-23T10:00:00.000Z",
        started_at: "2026-06-23T10:00:00.000Z",
        status: "completed",
      },
      "todo:2": {
        task_key: "todo:2",
        task_label: "2",
        task_title: "Task two",
        session_id: "ses_2",
        agent: "sisyphus",
        category: "quick",
        updated_at: "2026-06-23T10:00:00.000Z",
        started_at: "2026-06-23T10:00:00.000Z",
        status: "pending",
      },
      "todo:3": {
        task_key: "todo:3",
        task_label: "3",
        task_title: "Task three",
        session_id: "ses_3",
        agent: "sisyphus",
        category: "quick",
        updated_at: "2026-06-23T10:00:00.000Z",
        started_at: "2026-06-23T10:00:00.000Z",
        status: "completed",
      },
    },
  };
  const progress = calculateProgress(state);
  expect(progress.totalTodos).toBe(3);
  expect(progress.completedTodos).toBe(2);
  expect(progress.percentComplete).toBe(67);
  expect(progress.planName).toBe("test-plan");
});

test("boulder: determineMode returns resume when boulder.json exists and active", async () => {
  const { determineMode, createBoulderState, saveBoulder } = await import("../boulder.js");
  const state = createBoulderState("/tmp/test/.omo/plans/test-plan.md", "test-plan", "atlas", tmpDir);
  await saveBoulder(state, tmpDir);
  const result = await determineMode(tmpDir);
  expect(result.mode).toBe("resume");
  expect(result.state).toBeDefined();
  expect(result.progress).toBeDefined();
  expect(result.error).toBeUndefined();
});

test("boulder: determineMode returns init when no boulder.json", async () => {
  const { determineMode } = await import("../boulder.js");
  // Create a plan file so init mode can find it
  await writeFile(join(tmpDir, ".omo", "plans", "test-plan.md"), "# Test Plan\n\nTodo list here.");
  const result = await determineMode(tmpDir);
  expect(result.mode).toBe("init");
  expect(result.state).toBeUndefined();
  expect(result.progress).toBeDefined();
  expect(result.progress!.planName).toBe("test-plan");
});

test("boulder: determineMode returns init with error when no plans exist", async () => {
  const { determineMode } = await import("../boulder.js");
  // No plans directory or files
  const result = await determineMode(tmpDir);
  expect(result.mode).toBe("init");
  expect(result.error).toBeDefined();
});

test("boulder: buildContinuationPrompt includes progress info", async () => {
  const { buildContinuationPrompt } = await import("../boulder.js");
  const prompt = buildContinuationPrompt({
    totalTodos: 5,
    completedTodos: 2,
    percentComplete: 40,
    planName: "test-plan",
    status: "active",
  });
  expect(prompt).toContain("test-plan");
  expect(prompt).toContain("2/5");
  expect(prompt).toContain("40%");
  expect(prompt).toContain("Resuming");
});

// =============================================================================
// Continuation Loop Tests
// =============================================================================

test("continuation: checkDoneSignal detects DONE regex in result", async () => {
  const { checkDoneSignal } = await import("../continuation.js");
  const task = {
    id: "bg-1",
    status: "running" as const,
    result: "All work is complete. <promise>DONE</promise>",
    model: "test/model",
    providerKey: "test",
    systemPrompt: "",
    tools: [],
    customTools: [],
    createdAt: Date.now(),
    startedAt: Date.now(),
    completedAt: undefined,
    error: undefined,
    agentName: undefined,
    parentTaskId: undefined,
    staleTimeoutMs: undefined,
    onParentWake: undefined,
    thinkingLevel: undefined,
    triedModels: [],
    receivedTerminalEvent: undefined,
  };
  expect(checkDoneSignal(task)).toBe(true);
});

test("continuation: checkDoneSignal returns true for completed status", async () => {
  const { checkDoneSignal } = await import("../continuation.js");
  const task = {
    id: "bg-1",
    status: "completed" as const,
    result: "Some output without DONE tag",
    model: "test/model",
    providerKey: "test",
    systemPrompt: "",
    tools: [],
    customTools: [],
    createdAt: Date.now(),
    startedAt: Date.now(),
    completedAt: Date.now(),
    error: undefined,
    agentName: undefined,
    parentTaskId: undefined,
    staleTimeoutMs: undefined,
    onParentWake: undefined,
    thinkingLevel: undefined,
    triedModels: [],
    receivedTerminalEvent: undefined,
  };
  expect(checkDoneSignal(task)).toBe(true);
});

test("continuation: checkDoneSignal returns false for running task without DONE", async () => {
  const { checkDoneSignal } = await import("../continuation.js");
  const task = {
    id: "bg-1",
    status: "running" as const,
    result: "Still working on it...",
    model: "test/model",
    providerKey: "test",
    systemPrompt: "",
    tools: [],
    customTools: [],
    createdAt: Date.now(),
    startedAt: Date.now(),
    completedAt: undefined,
    error: undefined,
    agentName: undefined,
    parentTaskId: undefined,
    staleTimeoutMs: undefined,
    onParentWake: undefined,
    thinkingLevel: undefined,
    triedModels: [],
    receivedTerminalEvent: undefined,
  };
  expect(checkDoneSignal(task)).toBe(false);
});

test("continuation: checkDoneSignal returns false for undefined task", async () => {
  const { checkDoneSignal } = await import("../continuation.js");
  expect(checkDoneSignal(undefined)).toBe(false);
});

test("continuation: checkDoneInMessage detects DONE regex", async () => {
  const { checkDoneInMessage } = await import("../continuation.js");
  expect(checkDoneInMessage("Work complete. <promise>DONE</promise>")).toBe(true);
  expect(checkDoneInMessage("Still working.")).toBe(false);
  expect(checkDoneInMessage("")).toBe(false);
});

test("continuation: ralph loop advances and stops at max iterations", async () => {
  const { startRalphLoop, advanceLoop, resetLoops } = await import("../continuation.js");
  resetLoops();

  const loop = startRalphLoop("bg-1", 3);
  expect(loop.iteration).toBe(0);
  expect(loop.running).toBe(true);

  // Iteration 1
  expect(advanceLoop("ralph")).toBe(true);
  expect(loop.iteration).toBe(1);

  // Iteration 2
  expect(advanceLoop("ralph")).toBe(true);
  expect(loop.iteration).toBe(2);

  // Iteration 3 — max reached, should stop
  expect(advanceLoop("ralph")).toBe(false);
  expect(loop.iteration).toBe(3);
  expect(loop.running).toBe(false);
});

test("continuation: stopAllLoops stops all running loops", async () => {
  const { startRalphLoop, startUlwLoop, stopAllLoops, getLoopState, resetLoops } = await import("../continuation.js");
  resetLoops();

  startRalphLoop("bg-1", 100);
  startUlwLoop("bg-2", 200);

  expect(getLoopState("ralph")!.running).toBe(true);
  expect(getLoopState("ulw")!.running).toBe(true);

  stopAllLoops();

  expect(getLoopState("ralph")!.running).toBe(false);
  expect(getLoopState("ulw")!.running).toBe(false);
});

test("continuation: advanceLoop returns false after stopAllLoops", async () => {
  const { startRalphLoop, stopAllLoops, advanceLoop, resetLoops } = await import("../continuation.js");
  resetLoops();

  startRalphLoop("bg-1", 100);
  stopAllLoops();
  expect(advanceLoop("ralph")).toBe(false);
});

test("continuation: enforceTodoContinuation with incomplete todos", async () => {
  const { enforceTodoContinuation } = await import("../continuation.js");
  const result = enforceTodoContinuation(["completed", "pending", "in_progress", "completed"]);
  expect(result.injected).toBe(true);
  expect(result.reminder).toContain("2");
  expect(result.reminder).toContain("Incomplete");
});

test("continuation: enforceTodoContinuation with all completed", async () => {
  const { enforceTodoContinuation } = await import("../continuation.js");
  const result = enforceTodoContinuation(["completed", "completed", "cancelled"]);
  expect(result.injected).toBe(false);
  expect(result.reminder).toBeUndefined();
});

test("continuation: buildRalphContinuationPrompt includes iteration info", async () => {
  const { buildRalphContinuationPrompt } = await import("../continuation.js");
  const prompt = buildRalphContinuationPrompt(2, 100);
  expect(prompt).toContain("3/100");
  expect(prompt).toContain("loop_done");
});

// =============================================================================
// Loop Done Tool Tests
// =============================================================================

test("loop_done tool: registerLoopDoneTool registers a tool named loop_done", async () => {
  const { registerLoopDoneTool } = await import("../loop-done-tool.js");

  let registeredName = "";
  let registeredDesc = "";
  let registeredExecute: ((id: string, params: Record<string, unknown>) => Promise<unknown>) | undefined;

  const mockPi = {
    registerTool: (def: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
    }) => {
      registeredName = def.name;
      registeredDesc = def.description;
      registeredExecute = def.execute;
    },
  };

  registerLoopDoneTool(mockPi as never);

  expect(registeredName).toBe("loop_done");
  expect(registeredDesc).toContain("ralph loop");
  expect(registeredExecute).toBeDefined();

  // Test execution
  const result = await registeredExecute!("call-1", {});
  const r = result as { content: Array<{ text: string }>; details: Record<string, unknown> };
  expect(r.content[0]!.text).toContain("loop_done signal received");
  expect(r.details.loop_done).toBe(true);
});

// =============================================================================
// Module Registration Tests
// =============================================================================

test("autonomy register: registers auto_merge_pr tool, loop_done tool, and stop-continuation command", async () => {
  const { register } = await import("../index.js");

  const registeredTools: string[] = [];
  const registeredCommands: string[] = [];

  const mockPi = {
    registerTool: (def: { name: string; description: string; parameters: unknown; execute: unknown }) => {
      registeredTools.push(def.name);
    },
    registerCommand: (name: string, def: { description: string; handler: unknown }) => {
      registeredCommands.push(name);
    },
  };

  register(mockPi as never);

  expect(registeredTools).toContain("auto_merge_pr");
  expect(registeredTools).toContain("loop_done");
  expect(registeredCommands).toContain("stop-continuation");
});
