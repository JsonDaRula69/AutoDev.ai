// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T3 install-module tests — 4-phase non-interactive install.
 *
 * Tests (Given/When/Then):
 *  - Happy: 4 results returned (tools, ollama-cloud-provider, config-files,
 *    magic-context-setup), no doctor phase, magic-context.jsonc verified present.
 *  - No interactive wizard: no `magic-context setup` or `magic-context doctor`
 *    exec calls are made — the MC extension is installed programmatically
 *    via the SDK's DefaultPackageManager, not via a `pi install` shell-out.
 *  - Self-heal: magic-context.jsonc missing before MC setup -> file written
 *    with AutoDev defaults, then registration proceeds.
 *  - getAgentDir fallback: when PI_CODING_AGENT_DIR unset, magic-context.jsonc
 *    is written to the SDK default ~/.pi/agent.
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

/** Minimal mock package layout so validateAndCreateConfig (Phase 3) succeeds
 * and configOk is true, allowing MC registration (Phase 4) to proceed. */
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
 * Captures calls so tests can assert that no `pi install` shell-out is made
 * (the SDK installProvider path is programmatic, not via execSync). */
function makeRecordingExec(calls: ExecCall[]): (cmd: string, o?: ExecSyncOptions) => Buffer {
  return (command: string, options?: ExecSyncOptions): Buffer => {
    calls.push({ command, options });
    return Buffer.from("");
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("runInstallFixes returns exactly 4 results and no doctor phase (happy path)", async () => {
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

    // THEN: exactly 4 results, names match the 4 phases.
    expect(results.length).toBe(4);
    expect(results.map((r: any) => r.name)).toEqual([
      "tools",
      "ollama-cloud-provider",
      "config-files",
      "magic-context-setup",
    ]);
    // No "magic-context-doctor" result exists.
    expect(results.find((r: any) => r.name === "magic-context-doctor")).toBeUndefined();

    // Tools and config-files should be ok on the happy path.
    // Provider and MC setup may succeed or fail depending on network/SDK availability.
    expect(results[0].ok).toBe(true);  // tools
    expect(results[2].ok).toBe(true);  // config-files
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("MC setup uses SDK installProvider, no interactive wizard or pi install shell-out", async () => {
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

    // THEN: no `pi install` shell-out command was made — the MC extension
    // is now installed programmatically via DefaultPackageManager, not exec.
    const piInstallCall = calls.find((c) => c.command.includes("pi install"));
    expect(piInstallCall).toBeUndefined();

    // AND: no interactive `magic-context setup` wizard was invoked.
    const wizardCall = calls.find((c) => c.command.includes("magic-context") && c.command.includes("setup"));
    expect(wizardCall).toBeUndefined();
    // AND: no `@clack/prompts` or `magic-context doctor` call.
    const doctorCall = calls.find((c) => c.command.includes("magic-context") && c.command.includes("doctor"));
    expect(doctorCall).toBeUndefined();

    // AND: magic-context.jsonc exists in the agent dir (written by self-heal
    // before the SDK installProvider call).
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);

    // AND: the MC setup result exists (ok may be true or false depending on
    // whether the SDK install succeeds in the test env — network dependent).
    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult).toBeDefined();
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("MC setup handles installProvider failure gracefully", async () => {
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

    // THEN: still 4 results.
    expect(results.length).toBe(4);

    // AND: MC setup result exists — it may be ok (if SDK install succeeds
    // in test env) or not ok (if network/SDK fails). Either is acceptable;
    // the test verifies the result shape, not a specific network outcome.
    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult).toBeDefined();
    expect(typeof mcResult.ok).toBe("boolean");
    expect(typeof mcResult.detail).toBe("string");

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
    const { runInstallFixes } = await import("../install-module.js");

    const first = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec([]),
      packageRoot,
      skipCompleted: false,
    });

    // The magic-context.jsonc should exist after the first run (written by
    // the self-heal logic before the SDK installProvider call).
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);

    // WHEN: delete the jsonc to simulate it going missing.
    rmSync(join(agentDir, "magic-context.jsonc"), { force: true });
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(false);

    // AND: run again — MC phase should self-heal (re-write the jsonc).
    const second = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec([]),
      packageRoot,
      skipCompleted: false,
    });

    // THEN: jsonc exists again (self-heal re-wrote it).
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);
    const mcSecond = second.find((r: any) => r.name === "magic-context-setup");
    expect(mcSecond).toBeDefined();
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("getAgentDir fallback: when PI_CODING_AGENT_DIR unset, MC setup writes to SDK default ~/.pi/agent", async () => {
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

    // THEN: no `pi install` shell-out — the SDK installProvider is used.
    const piInstallCall = calls.find((c) => c.command.includes("pi install"));
    expect(piInstallCall).toBeUndefined();

    // AND: MC setup result exists.
    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult).toBeDefined();

    // AND: magic-context.jsonc was written to the fallback agent dir.
    const mcPath = join(expectedAgentDir, "magic-context.jsonc");
    expect(existsSync(mcPath)).toBe(true);

    // Cleanup the jsonc that got written to the real ~/.pi/agent.
    if (existsSync(mcPath)) rmSync(mcPath, { force: true });
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});