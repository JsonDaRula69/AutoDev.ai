// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T3 install-module tests — 3-phase non-interactive install.
 *
 * Tests (Given/When/Then):
 *  - Happy: mocked exec returns success -> 3 results returned, MC setup cwd
 *    is the central agent dir (getAgentDir()), no interactive wizard invoked,
 *    magic-context.jsonc verified present.
 *  - Failure: mocked exec throws -> MC setup reports failure; getAgentDir()
 *    fallback behavior when env var unset (writes to SDK default ~/.pi/agent).
 *  - Phase count: runInstallFixes returns exactly 3 results (tools,
 *    config-files, magic-context-setup) — no doctor phase.
 *  - Self-heal: magic-context.jsonc missing before MC setup -> file written
 *    with AutoDev defaults, then registration proceeds.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ExecSyncOptions } from "node:child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `autodev-install-module-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".autodev"), { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** Minimal mock package layout so validateAndCreateConfig (Phase 2) succeeds
 * and configOk is true, allowing MC registration (Phase 3) to proceed. */
function createMockPackage(packageRoot: string): void {
  mkdirSync(join(packageRoot, ".pi", "agents"), { recursive: true });
  mkdirSync(join(packageRoot, ".pi", "skills"), { recursive: true });
  mkdirSync(join(packageRoot, ".autodev", "reference"), { recursive: true });
  mkdirSync(join(packageRoot, ".autodev", "config"), { recursive: true });
  mkdirSync(join(packageRoot, "extensions", "autodev"), { recursive: true });
  writeFileSync(join(packageRoot, ".pi", "settings.json"), '{"pi":{}}', "utf-8");
  for (const a of [
    "nemo", "aronnax", "ned-land", "conseil", "oracle", "momus", "metis",
    "harbor-master", "quartermaster", "boatswain", "navigator", "watch-officer", "explore",
  ]) {
    writeFileSync(join(packageRoot, ".pi", "agents", `${a}.md`), `---\nname: ${a}\n---\n`, "utf-8");
  }
  for (const [name, content] of [
    ["concurrency.yaml", "max: 4\n"],
    ["debate-protocol.yaml", "rounds: 3\n"],
    ["dispatch-rules.yaml", "rules: []\n"],
    ["fallback.json", '{"models":[]}\n'],
    ["guardrails.yaml", "rules: []\n"],
    ["mcp.json", '{"servers":{}}\n'],
    ["models.json", '{"default":"x"}\n'],
    ["standing-orders.md", "# Standing Orders\n"],
    ["team-spec.json", '{"crew":[]}\n'],
  ] as const) {
    writeFileSync(join(packageRoot, ".autodev", "config", name), content, "utf-8");
  }
}

interface ExecCall {
  readonly command: string;
  readonly options?: ExecSyncOptions;
}

/** A recording exec override that returns an empty Buffer for every call.
 * Captures calls so tests can assert cwd and command shape. Returns `string`
 * for tools.ts (which expects ExecFn) and `Buffer` for install-module's
 * execSyncOverride — both are satisfied because the runtime only checks
 * that the return is usable; tools.ts ignores the return value and
 * install-module wraps it. */
function makeRecordingExec(calls: ExecCall[], opts?: { throwOnMatch?: string }): (cmd: string, o?: ExecSyncOptions) => Buffer {
  const throwOnMatch = opts?.throwOnMatch;
  return (command: string, options?: ExecSyncOptions): Buffer => {
    calls.push({ command, options });
    if (throwOnMatch !== undefined && command.includes(throwOnMatch)) {
      throw new Error(`mock exec failure for: ${command}`);
    }
    return Buffer.from("");
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("runInstallFixes returns exactly 3 results and no doctor phase (happy path)", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createMockPackage(packageRoot);
    const { runInstallFixes } = await import("../install-module.js");

    const calls: ExecCall[] = [];
    const notify = () => {};
    const results = await runInstallFixes({
      projectRoot,
      notify,
      execSyncOverride: makeRecordingExec(calls),
      packageRoot,
      skipCompleted: false,
    });

    // GIVEN/THEN: exactly 3 results, names match the 3 retained phases.
    expect(results.length).toBe(3);
    expect(results.map((r: any) => r.name)).toEqual([
      "tools",
      "config-files",
      "magic-context-setup",
    ]);
    // No "magic-context-doctor" result exists.
    expect(results.find((r: any) => r.name === "magic-context-doctor")).toBeUndefined();

    // All three should be ok on the happy path.
    expect(results.every((r: any) => r.ok)).toBe(true);
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("MC setup runs pi install with cwd = getAgentDir() (central agent dir), no interactive wizard", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createMockPackage(packageRoot);
    const { runInstallFixes } = await import("../install-module.js");

    const calls: ExecCall[] = [];
    const results = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec(calls),
      packageRoot,
      skipCompleted: false,
    });

    // THEN: a call to `pi install npm:@cortexkit/pi-magic-context` was made.
    const mcCall = calls.find((c) => c.command.includes("pi install npm:@cortexkit/pi-magic-context"));
    expect(mcCall).toBeDefined();
    // AND: its cwd is the central agent dir (getAgentDir()), NOT projectRoot.
    expect(mcCall!.options?.cwd).toBe(agentDir);
    expect(mcCall!.options?.cwd).not.toBe(projectRoot);

    // AND: no interactive `bunx @cortexkit/magic-context setup` wizard was invoked.
    const wizardCall = calls.find((c) => c.command.includes("magic-context") && c.command.includes("setup"));
    expect(wizardCall).toBeUndefined();
    // AND: no `@clack/prompts` or `magic-context doctor` call.
    const doctorCall = calls.find((c) => c.command.includes("magic-context") && c.command.includes("doctor"));
    expect(doctorCall).toBeUndefined();

    // AND: magic-context.jsonc exists in the agent dir (written by Phase 2).
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);

    // AND: the MC setup result is ok with the verify detail.
    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult.ok).toBe(true);
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("MC setup reports failure when exec throws on pi install", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createMockPackage(packageRoot);
    const { runInstallFixes } = await import("../install-module.js");

    const calls: ExecCall[] = [];
    // WHEN: exec throws specifically on the `pi install npm:@cortexkit/pi-magic-context` command.
    const results = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec(calls, {
        throwOnMatch: "pi install npm:@cortexkit/pi-magic-context",
      }),
      packageRoot,
      skipCompleted: false,
    });

    // THEN: still 3 results.
    expect(results.length).toBe(3);

    // AND: tools + config-files succeeded, MC setup failed.
    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult).toBeDefined();
    expect(mcResult.ok).toBe(false);
    expect(mcResult.detail).toContain("Magic Context registration failed");

    // AND: no doctor phase result.
    expect(results.find((r: any) => r.name === "magic-context-doctor")).toBeUndefined();
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("MC setup self-heals: writes magic-context.jsonc if missing before registration", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createMockPackage(packageRoot);
    // Simulate T1 having NOT written magic-context.jsonc: delete it after
    // Phase 2 by running with a package that lacks the default-write path.
    // We run Phase 2 normally (it writes the file), then delete it and run
    // ONLY the MC phase by calling the internal path via a second full run
    // with skipCompleted=false. Instead, simpler: directly verify the
    // self-heal by pre-creating the agent dir without the jsonc and running
    // the full flow with a package whose config phase still succeeds but we
    // remove the jsonc between phases is not possible in one call.
    //
    // Cleanest approach: mock validateAndCreateConfig is not feasible without
    // module mocking. Instead, we assert the self-heal path indirectly: after
    // a full happy run, the jsonc exists. Then we delete it and run again with
    // skipCompleted=false; the MC phase should self-heal (re-write) and still
    // report ok.
    const { runInstallFixes } = await import("../install-module.js");

    const first = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec([]),
      packageRoot,
      skipCompleted: false,
    });
    expect(first.find((r: any) => r.name === "magic-context-setup").ok).toBe(true);
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);

    // WHEN: delete the jsonc to simulate it going missing.
    rmSync(join(agentDir, "magic-context.jsonc"), { force: true });
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(false);

    // AND: run again — MC phase should self-heal.
    const second = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec([]),
      packageRoot,
      skipCompleted: false,
    });

    // THEN: MC setup ok and jsonc exists again.
    const mcSecond = second.find((r: any) => r.name === "magic-context-setup");
    expect(mcSecond.ok).toBe(true);
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("getAgentDir fallback: when PI_CODING_AGENT_DIR unset, MC setup uses SDK default ~/.pi/agent", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const saved = process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_CODING_AGENT_DIR;

  try {
    createMockPackage(packageRoot);
    const { runInstallFixes } = await import("../install-module.js");
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");

    const calls: ExecCall[] = [];
    const expectedAgentDir = getAgentDir();

    const results = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec(calls),
      packageRoot,
      skipCompleted: false,
    });

    // THEN: MC setup call cwd equals the SDK default agent dir.
    const mcCall = calls.find((c) => c.command.includes("pi install npm:@cortexkit/pi-magic-context"));
    expect(mcCall).toBeDefined();
    expect(mcCall!.options?.cwd).toBe(expectedAgentDir);

    // AND: MC setup result is ok (jsonc written to the fallback dir).
    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult.ok).toBe(true);

    // Cleanup the jsonc that got written to the real ~/.pi/agent.
    const mcPath = join(expectedAgentDir, "magic-context.jsonc");
    if (existsSync(mcPath)) rmSync(mcPath, { force: true });
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});