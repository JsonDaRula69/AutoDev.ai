import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../extensions/autodev/installer/doctor.js";
import { setProviderKey } from "../extensions/autodev/installer/auth.js";
import { setEnvVars } from "../extensions/autodev/installer/env.js";
import { markStepCompleted } from "../extensions/autodev/installer/state.js";

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
  throw new Error(`unexpected command: ${cmd}`);
};

const FAIL_EXEC = (): string => { throw new Error("command not found"); };

async function setupFullConfig(dir: string, authPath: string): Promise<void> {
  await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
  await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
  for (let i = -1; i <= 5; i++) await markStepCompleted(dir, i, "install");
  await markStepCompleted(dir, 9, "install");
  mkdirSync(join(dir, ".pi"), { recursive: true });
  writeFileSync(join(dir, ".pi", "magic-context.jsonc"), "{}");
  writeFileSync(join(dir, ".pi", "settings.json"), "{}");
  mkdirSync(join(dir, ".pi", "agents"), { recursive: true });
  for (const a of ["nemo", "aronnax", "ned-land", "conseil", "oracle", "momus", "metis", "harbor-master", "quartermaster", "boatswain", "navigator", "watch-officer", "explore"]) {
    writeFileSync(join(dir, ".pi", "agents", `${a}.md`), `---\nname: ${a}\n---\n`);
  }
}

test("doctor passes all checks on a fully configured machine", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    await setupFullConfig(dir, authPath);
    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: STUB_EXEC });
    expect(result.failed).toBe(0);
    const names = result.checks.map((c) => c.name);
    expect(names).toEqual([
      "Bun", "GitHub CLI", "GitHub auth",
      "LLM credentials", "Environment vars", "Install state",
      "settings.json", "magic-context.jsonc", "agents/*.md",
    ]);
  } finally { cleanupTempDir(dir); }
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
  try {
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
    for (let i = -1; i <= 5; i++) await markStepCompleted(dir, i, "install");
    await markStepCompleted(dir, 9, "install");
    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(join(dir, ".pi", "magic-context.jsonc"), "{}");
    writeFileSync(join(dir, ".pi", "settings.json"), "{}");
    mkdirSync(join(dir, ".pi", "agents"), { recursive: true });
    for (const a of ["nemo", "aronnax", "ned-land", "conseil", "oracle", "momus", "metis", "harbor-master", "quartermaster", "boatswain", "navigator", "watch-officer", "explore"]) {
      writeFileSync(join(dir, ".pi", "agents", `${a}.md`), `---\nname: ${a}\n---\n`);
    }
    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: STUB_EXEC });
    const llmCheck = result.checks.find((c) => c.name === "LLM credentials");
    expect(llmCheck?.ok).toBe(false);
  } finally { cleanupTempDir(dir); }
});

test("doctor detects missing .env", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    await setupFullConfig(dir, authPath);
    const fs = await import("node:fs");
    fs.unlinkSync(join(dir, ".env"));
    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: STUB_EXEC });
    const envCheck = result.checks.find((c) => c.name === "Environment vars");
    expect(envCheck?.ok).toBe(false);
  } finally { cleanupTempDir(dir); }
});

test("doctor detects incomplete install state", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
    await markStepCompleted(dir, 1, "install");
    await markStepCompleted(dir, 2, "install");
    mkdirSync(join(dir, ".pi"), { recursive: true });
    writeFileSync(join(dir, ".pi", "magic-context.jsonc"), "{}");
    writeFileSync(join(dir, ".pi", "settings.json"), "{}");
    mkdirSync(join(dir, ".pi", "agents"), { recursive: true });
    for (const a of ["nemo", "aronnax", "ned-land", "conseil", "oracle", "momus", "metis", "harbor-master", "quartermaster", "boatswain", "navigator", "watch-officer", "explore"]) {
      writeFileSync(join(dir, ".pi", "agents", `${a}.md`), `---\nname: ${a}\n---\n`);
    }
    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: STUB_EXEC });
    const stateCheck = result.checks.find((c) => c.name === "Install state");
    expect(stateCheck?.ok).toBe(false);
    expect(stateCheck?.detail).toContain("2/6");
  } finally { cleanupTempDir(dir); }
});

test("doctor downloads missing config files from repo", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", "voy-test"]]);
    for (let i = -1; i <= 5; i++) await markStepCompleted(dir, i, "install");
    await markStepCompleted(dir, 9, "install");

    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: STUB_EXEC });
    const settingsCheck = result.checks.find((c) => c.name === "settings.json");
    expect(settingsCheck?.ok).toBe(true);
    expect(settingsCheck?.detail).toContain("downloaded");

    const mcCheck = result.checks.find((c) => c.name === "magic-context.jsonc");
    expect(mcCheck?.ok).toBe(true);
    expect(mcCheck?.detail).toContain("downloaded");
  } finally { cleanupTempDir(dir); }
});

test("doctor detects missing agent files", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    await setupFullConfig(dir, authPath);
    const fs = await import("node:fs");
    fs.unlinkSync(join(dir, ".pi", "agents", "nemo.md"));
    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: STUB_EXEC });
    const agentsCheck = result.checks.find((c) => c.name === "agents/*.md");
    expect(agentsCheck?.ok).toBe(false);
    expect(agentsCheck?.detail).toContain("nemo");
  } finally { cleanupTempDir(dir); }
});

test("doctor detects VoyageAI fallback (empty key still ok)", async () => {
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    await setupFullConfig(dir, authPath);
    await setEnvVars(dir, [["OLLAMA_CLOUD_API_KEY", "sk-test"], ["VOYAGE_API_KEY", ""]]);
    const result = await runDoctor({ projectRoot: dir, authPath, execSyncOverride: STUB_EXEC });
    const envCheck = result.checks.find((c) => c.name === "Environment vars");
    expect(envCheck?.ok).toBe(true);
    expect(envCheck?.detail).toContain("ONNX fallback");
  } finally { cleanupTempDir(dir); }
});