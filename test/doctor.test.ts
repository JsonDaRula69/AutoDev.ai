import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor, writeMagicContextDefaults } from "../extensions/autodev/installer/doctor.js";
import { setProviderKey } from "../extensions/autodev/installer/auth.js";
import { setEnvVars } from "../extensions/autodev/installer/env.js";
import { markStepCompleted } from "../extensions/autodev/installer/state.js";
import { DEFAULT_MAGIC_CONTEXT_JSONC } from "../extensions/autodev/installer/magic-context-defaults.js";

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "autodev-doctor-test-"));
  mkdirSync(join(dir, ".autodev"), { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { }
}

const STUB_EXEC = (cmd: string): string => {
  if (cmd === "bun --version") return "1.2.3\n";
  if (cmd === "gh --version") return "gh version 2.40.0\n";
  if (cmd === "gh auth status") return "Logged in to github.com\n";
  if (cmd.startsWith("bunx @cortexkit/magic-context")) return "MC doctor OK\n";
  throw new Error(`unexpected command: ${cmd}`);
};

const FAIL_EXEC = (): string => { throw new Error("command not found"); };

/**
 * Build an exec stub whose MC doctor behavior is controlled by a mutable
 * call counter. Each entry in `mcResults` is consumed in order; subsequent
 * calls (beyond the array length) repeat the last entry.
 *
 * Non-MC commands always succeed (Bun/gh present and authenticated).
 */
function makeMcExecStub(mcResults: readonly ("ok" | "fail")[]): (cmd: string) => string {
  let mcCall = 0;
  return (cmd: string): string => {
    if (cmd === "bun --version") return "1.2.3\n";
    if (cmd === "gh --version") return "gh version 2.40.0\n";
    if (cmd === "gh auth status") return "Logged in to github.com\n";
    if (cmd.startsWith("bunx @cortexkit/magic-context")) {
      const idx = Math.min(mcCall, mcResults.length - 1);
      const result = mcResults[idx] ?? mcResults[mcResults.length - 1];
      mcCall++;
      if (result === "ok") return "MC doctor OK\n";
      throw new Error("MC doctor error: simulated failure");
    }
    throw new Error(`unexpected command: ${cmd}`);
  };
}

const AGENT_NAMES = ["nemo", "aronnax", "ned-land", "conseil", "oracle", "momus", "metis", "harbor-master", "quartermaster", "boatswain", "navigator", "watch-officer", "explore"];

/**
 * Create a mock global package layout (mirrors what
 * ~/.bun/install/global/node_modules/autodev/ contains) for symlink tests.
 */
function createMockPackage(packageRoot: string): void {
  mkdirSync(join(packageRoot, ".pi", "agents"), { recursive: true });
  mkdirSync(join(packageRoot, ".pi", "skills"), { recursive: true });
  mkdirSync(join(packageRoot, ".autodev", "reference"), { recursive: true });
  mkdirSync(join(packageRoot, ".autodev", "config"), { recursive: true });
  mkdirSync(join(packageRoot, "extensions", "autodev"), { recursive: true });
  writeFileSync(join(packageRoot, ".pi", "settings.json"), "{}");
  writeFileSync(join(packageRoot, ".pi", "magic-context.jsonc"), "{}");
  for (const a of AGENT_NAMES) {
    writeFileSync(join(packageRoot, ".pi", "agents", `${a}.md`), `---\nname: ${a}\n---\n`);
  }
  writeFileSync(join(packageRoot, ".autodev", "reference", "README.md"), "# ref\n");
  writeFileSync(join(packageRoot, ".pi", "skills", "SKILL.md"), "# skill\n");
  writeFileSync(join(packageRoot, "extensions", "autodev", "index.ts"), "// ext\n");
  for (const [name, content] of [
    ["concurrency.yaml", "max: 4\n"],
    ["debate-protocol.yaml", "rounds: 3\n"],
    ["dispatch-rules.yaml", "rules: []\n"],
    ["fallback.json", "{}"],
    ["guardrails.yaml", "rules: []\n"],
    ["mcp.json", "{}"],
    ["models.json", "{}"],
    ["standing-orders.md", "# orders\n"],
    ["team-spec.json", "{}"],
  ] as const) {
    writeFileSync(join(packageRoot, ".autodev", "config", name), content);
  }
}

async function setupFullConfig(dir: string, authPath: string): Promise<void> {
  await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
  await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
  for (let i = -1; i <= 5; i++) await markStepCompleted(dir, i, "install");
  await markStepCompleted(dir, 9, "install");
}

test("doctor passes all checks on a fully configured machine", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    createMockPackage(packageRoot);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    expect(result.failed).toBe(0);
    const names = result.checks.map((c) => c.name);
    expect(names).toEqual([
      "Bun", "GitHub CLI", "GitHub auth",
      "LLM credentials", "Environment vars", "Install state",
      "settings.json", "agents/*.md", "reference/", "skills/",
      "extensions/autodev", "config/", "magic-context.jsonc",
      "Magic Context",
    ]);
    const mcCheck = result.checks.find((c) => c.name === "Magic Context");
    expect(mcCheck?.ok).toBe(true);
    expect(mcCheck?.detail).toBe("healthy");
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("doctor fails on fresh install with no configuration", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: FAIL_EXEC });
    const failedNames = result.checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failedNames).toContain("Bun");
    expect(failedNames).toContain("GitHub CLI");
    expect(failedNames).toContain("GitHub auth");
    expect(failedNames).toContain("LLM credentials");
    expect(failedNames).toContain("Environment vars");
    expect(failedNames).toContain("Install state");
  } finally { cleanupTempDir(dir); }
});

test("doctor detects missing auth.json", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "nonexistent-auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
    for (let i = -1; i <= 5; i++) await markStepCompleted(dir, i, "install");
    await markStepCompleted(dir, 9, "install");
    createMockPackage(packageRoot);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    const llmCheck = result.checks.find((c) => c.name === "LLM credentials");
    expect(llmCheck?.ok).toBe(false);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("doctor detects missing .env", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    createMockPackage(packageRoot);
    const fs = await import("node:fs");
    fs.unlinkSync(join(dir, ".env"));
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    const envCheck = result.checks.find((c) => c.name === "Environment vars");
    expect(envCheck?.ok).toBe(false);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("doctor detects incomplete install state", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
    await markStepCompleted(dir, 1, "install");
    await markStepCompleted(dir, 2, "install");
    createMockPackage(packageRoot);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    const stateCheck = result.checks.find((c) => c.name === "Install state");
    expect(stateCheck?.ok).toBe(false);
    expect(stateCheck?.detail).toContain("2/6");
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("doctor symlinks missing config files from package", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
    for (let i = -1; i <= 5; i++) await markStepCompleted(dir, i, "install");
    await markStepCompleted(dir, 9, "install");
    createMockPackage(packageRoot);

    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    const settingsCheck = result.checks.find((c) => c.name === "settings.json");
    expect(settingsCheck?.ok).toBe(true);
    expect(settingsCheck?.detail).toContain("symlinked");

    const mcCheck = result.checks.find((c) => c.name === "magic-context.jsonc");
    expect(mcCheck?.ok).toBe(true);
    expect(mcCheck?.detail).toContain("written");
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("doctor detects missing agent source files", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    createMockPackage(packageRoot);
    const fs = await import("node:fs");
    fs.unlinkSync(join(packageRoot, ".pi", "agents", "nemo.md"));
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    const agentsCheck = result.checks.find((c) => c.name === "agents/*.md");
    expect(agentsCheck?.ok).toBe(false);
    expect(agentsCheck?.detail).toContain("nemo");
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("doctor detects VoyageAI fallback (empty key still ok)", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", ""]]);
    createMockPackage(packageRoot);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    const envCheck = result.checks.find((c) => c.name === "Environment vars");
    expect(envCheck?.ok).toBe(true);
    expect(envCheck?.detail).toContain("ONNX fallback");
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("Magic Context check passes healthy on first attempt", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    createMockPackage(packageRoot);
    const exec = makeMcExecStub(["ok"]);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: exec,
      packageRoot,
    });
    const mcCheck = result.checks.find((c) => c.name === "Magic Context");
    expect(mcCheck?.ok).toBe(true);
    expect(mcCheck?.detail).toBe("healthy");
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("Magic Context check recovers after writing defaults on first failure", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    createMockPackage(packageRoot);
    const exec = makeMcExecStub(["fail", "ok"]);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: exec,
      packageRoot,
    });
    const mcCheck = result.checks.find((c) => c.name === "Magic Context");
    expect(mcCheck?.ok).toBe(true);
    expect(mcCheck?.detail).toBe("healthy (after defaults written)");
    const written = readFileSync(join(agentDir, "magic-context.jsonc"), "utf-8");
    expect(written).toBe(DEFAULT_MAGIC_CONTEXT_JSONC);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("Magic Context check fails after retry when both attempts fail", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    createMockPackage(packageRoot);
    const exec = makeMcExecStub(["fail", "fail"]);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: exec,
      packageRoot,
    });
    const mcCheck = result.checks.find((c) => c.name === "Magic Context");
    expect(mcCheck?.ok).toBe(false);
    expect(mcCheck?.detail).toContain("MC doctor failed after retry");
    expect(existsSync(join(agentDir, "magic-context.jsonc"))).toBe(true);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("writeMagicContextDefaults writes the JSONC block to the agent dir", () => {
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  try {
    const result = writeMagicContextDefaults(agentDir);
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("defaults written");
    const written = readFileSync(join(agentDir, "magic-context.jsonc"), "utf-8");
    expect(written).toBe(DEFAULT_MAGIC_CONTEXT_JSONC);
  } finally {
    cleanupTempDir(centralDir);
  }
});