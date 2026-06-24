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

/** Mock provider install that never touches the system. Returns success for any source. */
function mockProviderInstallOk(): (source: string) => Promise<{ ok: boolean; detail: string; alreadyInstalled: boolean }> {
  return async () => ({ ok: true, detail: "mocked", alreadyInstalled: false });
}

/** Mock provider install that simulates failure. */
function mockProviderInstallFail(): (source: string) => Promise<{ ok: boolean; detail: string; alreadyInstalled: boolean }> {
  return async () => ({ ok: false, detail: "mock failure", alreadyInstalled: false });
}

/** Mock provider install that reports already installed. */
function mockProviderInstallAlready(): (source: string) => Promise<{ ok: boolean; detail: string; alreadyInstalled: boolean }> {
  return async () => ({ ok: true, detail: "already installed", alreadyInstalled: true });
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
      providerInstallOverride: mockProviderInstallOk(),
    });

    expect(results.length).toBe(4);
    expect(results.map((r: any) => r.name)).toEqual([
      "tools",
      "ollama-cloud-provider",
      "config-files",
      "magic-context-setup",
    ]);
    expect(results.find((r: any) => r.name === "magic-context-doctor")).toBeUndefined();
    expect(results[0].ok).toBe(true);  // tools
    expect(results[1].ok).toBe(true);  // ollama-cloud-provider
    expect(results[2].ok).toBe(true);  // config-files
    expect(results[3].ok).toBe(true);  // magic-context-setup
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
      providerInstallOverride: mockProviderInstallOk(),
    });

    const piInstallCall = calls.find((c) => c.command.includes("pi install"));
    expect(piInstallCall).toBeUndefined();

    const wizardCall = calls.find((c) => c.command.includes("magic-context") && c.command.includes("setup"));
    expect(wizardCall).toBeUndefined();
    const doctorCall = calls.find((c) => c.command.includes("magic-context") && c.command.includes("doctor"));
    expect(doctorCall).toBeUndefined();

    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);

    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult).toBeDefined();
    expect(mcResult.ok).toBe(true);
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
      providerInstallOverride: mockProviderInstallFail(),
    });

    expect(results.length).toBe(4);

    const mcResult = results.find((r: any) => r.name === "magic-context-setup");
    expect(mcResult).toBeDefined();
    expect(mcResult.ok).toBe(false);
    expect(typeof mcResult.detail).toBe("string");
    expect(mcResult.detail).toContain("mock failure");

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
      providerInstallOverride: mockProviderInstallOk(),
    });

    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);

    rmSync(join(agentDir, "magic-context.jsonc"), { force: true });
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(false);

    const second = await runInstallFixes({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeRecordingExec([]),
      packageRoot,
      skipCompleted: false,
      providerInstallOverride: mockProviderInstallOk(),
    });

    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);
    const mcSecond = second.find((r: any) => r.name === "magic-context-setup");
    expect(mcSecond).toBeDefined();
    expect(mcSecond.ok).toBe(true);
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