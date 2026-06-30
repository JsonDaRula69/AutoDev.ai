import { test, expect } from "bun:test";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runDoctor, writeMagicContextDefaults } from "../extensions/autodev/installer/doctor.js";
import { setProviderKey } from "../extensions/autodev/installer/auth.js";
import { setEnvVars } from "../extensions/autodev/installer/env.js";
import { markStepCompleted } from "../extensions/autodev/installer/state.js";
import { DEFAULT_MAGIC_CONTEXT_JSONC } from "../extensions/autodev/installer/magic-context-defaults.js";
import {
  createTempDir,
  cleanupTempDir,
  STUB_EXEC,
  FAIL_EXEC,
  makeMcExecStub,
  AGENT_NAMES,
  createMockPackage,
} from "./mocks/doctor-fixture.js";

async function setupFullConfig(dir: string, authPath: string): Promise<void> {
  await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
  await setEnvVars(dir, [["OLLAMA_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
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
      "extensions/autodev", "config/", "docs-sources.yaml", "magic-context.jsonc",
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
    await setEnvVars(dir, [["OLLAMA_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
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
    await setEnvVars(dir, [["OLLAMA_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
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
  const xdgDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  const savedXdg = process.env.XDG_CONFIG_HOME;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.XDG_CONFIG_HOME = xdgDir;
  try {
    await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
    await setEnvVars(dir, [["OLLAMA_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
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
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(xdgDir);
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
    await setEnvVars(dir, [["OLLAMA_API_KEY", "sk-test"], ["VOYAGE_API_KEY", ""]]);
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
  const xdgDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  const savedXdg = process.env.XDG_CONFIG_HOME;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.XDG_CONFIG_HOME = xdgDir;
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
    expect(existsSync(join(xdgDir, "cortexkit", "magic-context.jsonc"))).toBe(true);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(xdgDir);
  }
});

test("Magic Context check recovers after writing defaults on first failure", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const xdgDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  const savedXdg = process.env.XDG_CONFIG_HOME;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.XDG_CONFIG_HOME = xdgDir;
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
    const written = readFileSync(join(xdgDir, "cortexkit", "magic-context.jsonc"), "utf-8");
    expect(written).toBe(DEFAULT_MAGIC_CONTEXT_JSONC);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(xdgDir);
  }
});

test("Magic Context check fails after retry when both attempts fail", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const xdgDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  const savedXdg = process.env.XDG_CONFIG_HOME;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.XDG_CONFIG_HOME = xdgDir;
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
    expect(existsSync(join(xdgDir, "cortexkit", "magic-context.jsonc"))).toBe(true);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
    cleanupTempDir(xdgDir);
  }
});

test("writeMagicContextDefaults writes the JSONC block to the CortexKit config dir", () => {
  const xdgDir = createTempDir();
  const agentDir = createTempDir();
  const savedXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdgDir;
  try {
    const result = writeMagicContextDefaults(agentDir);
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("defaults written");
    const written = readFileSync(join(xdgDir, "cortexkit", "magic-context.jsonc"), "utf-8");
    expect(written).toBe(DEFAULT_MAGIC_CONTEXT_JSONC);
  } finally {
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
    cleanupTempDir(xdgDir);
    cleanupTempDir(agentDir);
  }
});
// ---- T14: central ~/.AutoDev/ path resolution & install-state threshold ----

/**
 * Decision #20: the install-state threshold must NOT include the "init" scope.
 * doctor's "Install state" check aggregates "install" + "config" scopes only.
 * This test pins that "init" scope completion alone does NOT satisfy the check.
 */
test("doctor install-state threshold excludes the 'init' scope (Decision #20)", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const packageRoot = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
    await setEnvVars(dir, [["OLLAMA_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
    // Complete many steps in the "init" scope ONLY — but zero in install/config.
    for (let i = 1; i <= 10; i++) await markStepCompleted(dir, i, "init");
    createMockPackage(packageRoot);
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot,
    });
    const stateCheck = result.checks.find((c) => c.name === "Install state");
    expect(stateCheck?.ok).toBe(false);
    // Threshold counts only install+config; init steps must not contribute.
    expect(stateCheck?.detail).toContain("0/6");
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

/**
 * isFirstRun() resolves the .env path via `dirname(authPath)`, which is the
 * central agent dir (~/.AutoDev/agent/) when PI_CODING_AGENT_DIR is set.
 * This test pins that the env signal resolves to the central path, not the
 * project dir.
 */
test("doctor isFirstRun reads .env from the central agent dir (dirname(authPath))", async () => {
  const dir = createTempDir();
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  mkdirSync(agentDir, { recursive: true });
  const authPath = join(agentDir, "auth.json");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    // Plant OLLAMA_API_KEY in the central .env (dirname(authPath)).
    writeFileSync(join(agentDir, ".env"), "OLLAMA_API_KEY=sk-central\n");
    const { isFirstRun } = await import("../extensions/autodev/installer/doctor.js");
    const firstRun = await isFirstRun({ projectRoot: dir, authPath });
    // Signal 3 (OLLAMA_API_KEY present) should be satisfied → not first run.
    expect(firstRun).toBe(false);
    // And the file was read from the central path, not the project dir.
    expect(existsSync(join(dir, ".env"))).toBe(false);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
  }
});

/**
 * validateAndCreateConfig results reflect symlink creation from the package
 * root, not network downloads. When the central ~/.AutoDev/ is not populated
 * (no package source files), the config checks fail.
 */
test("doctor config checks fail when central ~/.AutoDev/ is not populated", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  const centralDir = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await setupFullConfig(dir, authPath);
    // packageRoot points to an EMPTY temp dir — no .pi/.autodev structure.
    const emptyPackage = createTempDir();
    const result = await runDoctor({
      projectRoot: dir,
      authPath,
      execSyncOverride: STUB_EXEC,
      packageRoot: emptyPackage,
    });
    const settingsCheck = result.checks.find((c) => c.name === "settings.json");
    expect(settingsCheck?.ok).toBe(false);
    const agentsCheck = result.checks.find((c) => c.name === "agents/*.md");
    expect(agentsCheck?.ok).toBe(false);
    cleanupTempDir(emptyPackage);
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
    cleanupTempDir(dir);
    cleanupTempDir(centralDir);
  }
});
