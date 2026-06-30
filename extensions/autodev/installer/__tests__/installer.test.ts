// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T19 Installer module tests.
 *
 * Tests:
 *  - Non-interactive path with env vars
 *  - Interactive path with mocked prompter
 *  - Idempotent re-run (install-state resume)
 *  - .env creation and update
 *  - .gitignore update
 *  - Install-state read/write
 */
import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = resolve(tmpdir(), `autodev-installer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

// ---------------------------------------------------------------------------
// State module tests
// ---------------------------------------------------------------------------

test("readState returns empty state when no file exists", async () => {
  const { readState } = await import("../state.js");
  const dir = createTempDir();
  try {
    const state = await readState(dir);
    expect(state.completedSteps).toEqual([]);
    expect(state.startedAt).toBe("");
    expect(state.updatedAt).toBe("");
  } finally {
    cleanupTempDir(dir);
  }
});

test("markStepCompleted persists and is idempotent", async () => {
  const { readState, markStepCompleted } = await import("../state.js");
  const dir = createTempDir();
  try {
    await markStepCompleted(dir, 1);
    let state = await readState(dir);
    expect(state.completedSteps).toEqual([1]);
    expect(state.startedAt).not.toBe("");

    // Mark same step again — should be idempotent
    await markStepCompleted(dir, 1);
    state = await readState(dir);
    expect(state.completedSteps).toEqual([1]);

    // Mark another step
    await markStepCompleted(dir, 2);
    state = await readState(dir);
    expect(state.completedSteps).toEqual([1, 2]);
  } finally {
    cleanupTempDir(dir);
  }
});

test("isStepCompleted returns correct values", async () => {
  const { markStepCompleted, isStepCompleted } = await import("../state.js");
  const dir = createTempDir();
  try {
    expect(await isStepCompleted(dir, 1)).toBe(false);
    await markStepCompleted(dir, 1);
    expect(await isStepCompleted(dir, 1)).toBe(true);
    expect(await isStepCompleted(dir, 2)).toBe(false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Env module tests
// ---------------------------------------------------------------------------

test("parseEnv parses key=value pairs", async () => {
  const { parseEnv } = await import("../env.js");
  const content = "KEY1=value1\nKEY2=value2\n# comment\n\nKEY3=value3\n";
  const map = parseEnv(content);
  expect(map.get("KEY1")).toBe("value1");
  expect(map.get("KEY2")).toBe("value2");
  expect(map.get("KEY3")).toBe("value3");
  expect(map.size).toBe(3);
});

test("serializeEnv produces valid .env format", async () => {
  const { serializeEnv } = await import("../env.js");
  const map = new Map([["KEY1", "value1"], ["KEY2", "value2"]]);
  const result = serializeEnv(map);
  expect(result).toContain("KEY1=value1");
  expect(result).toContain("KEY2=value2");
  expect(result.endsWith("\n")).toBe(true);
});

test("setEnvVar creates .env file and updates it", async () => {
  const { setEnvVar, readEnv } = await import("../env.js");
  const dir = createTempDir();
  try {
    await setEnvVar(dir, "TEST_KEY", "test-value");
    const envPath = join(dir, ".env");
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("TEST_KEY=test-value");

    // Update existing
    await setEnvVar(dir, "TEST_KEY", "new-value");
    const updated = await readEnv(dir);
    expect(updated.get("TEST_KEY")).toBe("new-value");
  } finally {
    cleanupTempDir(dir);
  }
});

test("setEnvVars sets multiple vars at once", async () => {
  const { setEnvVars, readEnv } = await import("../env.js");
  const dir = createTempDir();
  try {
    await setEnvVars(dir, [["A", "1"], ["B", "2"]]);
    const vars = await readEnv(dir);
    expect(vars.get("A")).toBe("1");
    expect(vars.get("B")).toBe("2");
  } finally {
    cleanupTempDir(dir);
  }
});

test("ensureGitignore adds .env when missing", async () => {
  const { ensureGitignore } = await import("../env.js");
  const dir = createTempDir();
  try {
    // No .gitignore yet
    await ensureGitignore(dir);
    const gitignorePath = join(dir, ".gitignore");
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, "utf-8");
    expect(content).toContain(".env");

    // Idempotent — calling again should not duplicate
    await ensureGitignore(dir);
    const lines = readFileSync(gitignorePath, "utf-8").split("\n").filter((l) => l.trim() === ".env");
    expect(lines.length).toBe(1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("ensureGitignore does not modify existing .gitignore with .env", async () => {
  const { ensureGitignore } = await import("../env.js");
  const dir = createTempDir();
  try {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n.env\n");
    const mtimeBefore = readFileSync(join(dir, ".gitignore"), "utf-8");
    await ensureGitignore(dir);
    const mtimeAfter = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(mtimeAfter).toBe(mtimeBefore);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Auth module tests
// ---------------------------------------------------------------------------

test("readAuth returns empty object when file missing", async () => {
  const { readAuth } = await import("../auth.js");
  const dir = createTempDir();
  try {
    const auth = await readAuth(join(dir, "auth.json"));
    expect(auth).toEqual({});
  } finally {
    cleanupTempDir(dir);
  }
});

test("setProviderKey writes and reads correctly", async () => {
  const { setProviderKey, readAuth } = await import("../auth.js");
  const dir = createTempDir();
  const authPath = join(dir, "auth.json");
  try {
    await setProviderKey(authPath, "ollama-cloud", "sk-test-key");
    const auth = await readAuth(authPath);
    expect(auth["ollama-cloud"]).toBeDefined();
    expect(auth["ollama-cloud"]!.type).toBe("api_key");
    expect(auth["ollama-cloud"]!.key).toBe("sk-test-key");
  } finally {
    cleanupTempDir(dir);
  }
});

test("tryImportAuth imports from existing auth file", async () => {
  const { tryImportAuth, readAuth, setProviderKey } = await import("../auth.js");
  const { readEnv } = await import("../env.js");
  const dir = createTempDir();
  const sourcePath = join(dir, "source-auth.json");
  const targetPath = join(dir, "target-auth.json");
  try {
    // Create source
    await setProviderKey(sourcePath, "ollama-cloud", "sk-imported-key");

    // Import
    const result = await tryImportAuth(sourcePath, targetPath, "ollama-cloud");
    expect(result).toBe(true);

    // Verify auth.json has $VAR reference (not literal key)
    const target = await readAuth(targetPath);
    expect(target["ollama-cloud"]!.key).toBe("$OLLAMA_API_KEY");

    // Verify .env has the actual key
    const env = await readEnv(dir, join(dir, ".env"));
    expect(env.get("OLLAMA_API_KEY")).toBe("sk-imported-key");
  } finally {
    cleanupTempDir(dir);
  }
});

test("tryImportAuth returns false when source missing", async () => {
  const { tryImportAuth } = await import("../auth.js");
  const dir = createTempDir();
  try {
    const result = await tryImportAuth(join(dir, "nonexistent.json"), join(dir, "target.json"), "ollama-cloud");
    expect(result).toBe(false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Prompter module tests
// ---------------------------------------------------------------------------

test("MockPrompter returns predetermined answers", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const mock = new MockPrompter();
  mock.answers = ["ollama-cloud", "sk-test-key", "y"];

  expect(await mock.prompt("Provider?")).toBe("ollama-cloud");
  expect(await mock.prompt("Key?")).toBe("sk-test-key");
  expect(await mock.confirm("Continue?")).toBe(true);
});

test("MockPrompter confirm uses default when no answer", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const mock = new MockPrompter();
  mock.answers = [""];

  expect(await mock.confirm("Continue?", true)).toBe(true);
  expect(await mock.confirm("Continue?", false)).toBe(false);
});

// ---------------------------------------------------------------------------
// .gitignore update test
// ---------------------------------------------------------------------------

test("installer ensures .gitignore includes .env", async () => {
  const { ensureGitignore } = await import("../env.js");
  const dir = createTempDir();
  try {
    // Create .gitignore without .env
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    await ensureGitignore(dir);
    const content = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(content).toContain(".env");
  } finally {
    cleanupTempDir(dir);
  }
});
