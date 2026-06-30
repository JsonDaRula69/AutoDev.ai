// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T15 — doctor orchestrator-mode `/dev/tty` reopen integration tests.
 *
 * Covers the two branches added in doctor.ts orchestrator mode:
 *  - Happy: `process.stdin` is not a TTY but `/dev/tty` reopens successfully
 *    → doctor builds a prompter from the reopened TTY and runs `runConfig`.
 *  - Failure: `/dev/tty` reopen fails (ENOENT, CI) → doctor warns and skips
 *    config (existing non-interactive behavior).
 *
 * These tests run with `launchConfigFlow: true` and at least one failing
 * health check so the orchestrator branch executes. Under `bun test`,
 * `process.stdin.isTTY` is `false` (piped), so the non-interactive path is
 * taken; `reopenTtyOverride` controls the reopen outcome.
 */
import { test, expect } from "bun:test";
import { join } from "node:path";
import { runDoctor } from "../doctor.js";
import { MockPrompter } from "../prompts.js";
import type { ReopenTtyDeps } from "../tty.js";
import {
  createTempDir,
  cleanupTempDir,
  STUB_EXEC,
  AGENT_NAMES,
  createMockPackage,
} from "../../../../test/mocks/doctor-fixture.js";

const mockProviderInstall = async () => ({ ok: true, detail: "mocked", alreadyInstalled: false });
const mockFetch = async () => ({ status: 200 } as Response);

test("doctor orchestrator opens /dev/tty and runs config when stdin is non-interactive", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const notifications: Array<{ msg: string; level: string }> = [];
  const notify = (message: string, level: "info" | "warning" | "error") => {
    notifications.push({ msg: message, level });
  };

  // reopenTtyOverride that returns a MockPrompter (simulates successful reopen).
  const mockPrompter = new MockPrompter();
  mockPrompter.selectAnswers = ["ollama-cloud"];
  mockPrompter.answers = ["sk-via-tty", "y", "", "", ""];
  const reopenTtyOverride: ReopenTtyDeps = {
    openSyncOverride: () => 42,
    prompterOverride: mockPrompter,
  };

  try {
    createMockPackage(packageRoot);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      launchConfigFlow: true,
      notify,
      packageRoot,
      reopenTtyOverride,
      providerInstallOverride: mockProviderInstall,
      fetchOverride: mockFetch,
    });
    expect(result.configFlowLaunched).toBe(true);
    const ttyNotice = notifications.find((n) => n.msg.includes("/dev/tty"));
    expect(ttyNotice).toBeDefined();
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("doctor orchestrator warns and skips config when /dev/tty reopen fails", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const notifications: Array<{ msg: string; level: string }> = [];
  const notify = (message: string, level: "info" | "warning" | "error") => {
    notifications.push({ msg: message, level });
  };

  // reopenTtyOverride that simulates ENOENT (no controlling terminal, CI).
  const reopenTtyOverride: ReopenTtyDeps = {
    openSyncOverride: () => {
      const err = new Error("ENOENT: no such file") as Error & { code: string };
      err.code = "ENOENT";
      throw err;
    },
  };

  try {
    createMockPackage(packageRoot);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      launchConfigFlow: true,
      notify,
      packageRoot,
      reopenTtyOverride,
      providerInstallOverride: mockProviderInstall,
      fetchOverride: mockFetch,
    });
    expect(result.configFlowLaunched).toBe(true);
    const warning = notifications.find((n) =>
      n.msg.includes("Non-interactive environment") &&
      n.msg.includes("no controlling terminal")
    );
    expect(warning).toBeDefined();
    expect(warning!.level).toBe("warning");
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});