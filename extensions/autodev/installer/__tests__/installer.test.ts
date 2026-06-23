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
  const dir = createTempDir();
  const sourcePath = join(dir, "source-auth.json");
  const targetPath = join(dir, "target-auth.json");
  try {
    // Create source
    await setProviderKey(sourcePath, "ollama-cloud", "sk-imported-key");

    // Import
    const result = await tryImportAuth(sourcePath, targetPath, "ollama-cloud");
    expect(result).toBe(true);

    // Verify
    const target = await readAuth(targetPath);
    expect(target["ollama-cloud"]!.key).toBe("sk-imported-key");
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
// Steps module tests — non-interactive path
// ---------------------------------------------------------------------------

test("step1BunCheck: succeeds when bun is available (non-interactive)", async () => {
  const { step1BunCheck } = await import("../steps.js");
  const dir = createTempDir();
  // Create a minimal package.json so bun install doesn't fail
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", private: true }));
  try {
    const result = await step1BunCheck({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      scope: "install",
      notify: mock(() => {}),
    });
    // Bun should be available in the test environment
    expect(result.status).toBe("ok");
    expect(result.step).toBe(1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("step2LlmCredentials: non-interactive reads from env var", async () => {
  const origEnv = process.env.OLLAMA_CLOUD_API_KEY;
  process.env.OLLAMA_CLOUD_API_KEY = "sk-noninteractive-test";

  const { step2LlmCredentials } = await import("../steps.js");
  const dir = createTempDir();
  try {
    const result = await step2LlmCredentials({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("configured");

    // Verify auth.json was written
    const { readAuth } = await import("../auth.js");
    const auth = await readAuth(join(dir, "auth.json"));
    expect(auth["ollama-cloud"]).toBeDefined();
    expect(auth["ollama-cloud"]!.key).toBe("sk-noninteractive-test");

    // Verify .env was written
    const { readEnv } = await import("../env.js");
    const env = await readEnv(dir);
    expect(env.get("OLLAMA_CLOUD_API_KEY")).toBe("sk-noninteractive-test");
  } finally {
    process.env.OLLAMA_CLOUD_API_KEY = origEnv;
    cleanupTempDir(dir);
  }
});

test("step2LlmCredentials: non-interactive warns when env var missing", async () => {
  const origEnv = process.env.OLLAMA_CLOUD_API_KEY;
  delete process.env.OLLAMA_CLOUD_API_KEY;

  const { step2LlmCredentials } = await import("../steps.js");
  const dir = createTempDir();
  try {
    const result = await step2LlmCredentials({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("warning");
    expect(result.message).toContain("not set");
  } finally {
    process.env.OLLAMA_CLOUD_API_KEY = origEnv;
    cleanupTempDir(dir);
  }
});

test("step4VoyageAi: non-interactive reads from env var", async () => {
  const origEnv = process.env.VOYAGE_API_KEY;
  process.env.VOYAGE_API_KEY = "voyage-test-key";

  const { step4VoyageAi } = await import("../steps.js");
  const dir = createTempDir();
  try {
    const result = await step4VoyageAi({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");

    // Verify .env was written
    const { readEnv } = await import("../env.js");
    const env = await readEnv(dir);
    expect(env.get("VOYAGE_API_KEY")).toBe("voyage-test-key");
  } finally {
    process.env.VOYAGE_API_KEY = origEnv;
    cleanupTempDir(dir);
  }
});

test("step4VoyageAi: non-interactive skips when env var missing", async () => {
  const origEnv = process.env.VOYAGE_API_KEY;
  delete process.env.VOYAGE_API_KEY;

  const { step4VoyageAi } = await import("../steps.js");
  const dir = createTempDir();
  try {
    const result = await step4VoyageAi({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("warning");
    expect(result.message).toContain("ONNX");
  } finally {
    process.env.VOYAGE_API_KEY = origEnv;
    cleanupTempDir(dir);
  }
});

test("step5Discord: non-interactive reads from env vars", async () => {
  const origToken = process.env.DISCORD_BOT_TOKEN;
  const origChannel = process.env.DISCORD_CHANNEL_ID;
  const origLiaison = process.env.DISCORD_LIAISON_CHANNEL_ID;
  process.env.DISCORD_BOT_TOKEN = "discord-test-token";
  process.env.DISCORD_CHANNEL_ID = "12345";
  process.env.DISCORD_LIAISON_CHANNEL_ID = "67890";

  const { step5Discord } = await import("../steps.js");
  const dir = createTempDir();
  try {
    const result = await step5Discord({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");

    // Verify .env was written
    const { readEnv } = await import("../env.js");
    const env = await readEnv(dir);
    expect(env.get("DISCORD_BOT_TOKEN")).toBe("discord-test-token");
    expect(env.get("DISCORD_CHANNEL_ID")).toBe("12345");
    expect(env.get("DISCORD_LIAISON_CHANNEL_ID")).toBe("67890");
  } finally {
    process.env.DISCORD_BOT_TOKEN = origToken;
    process.env.DISCORD_CHANNEL_ID = origChannel;
    process.env.DISCORD_LIAISON_CHANNEL_ID = origLiaison;
    cleanupTempDir(dir);
  }
});

test("step5Discord: non-interactive skips when token missing", async () => {
  const origToken = process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_BOT_TOKEN;

  const { step5Discord } = await import("../steps.js");
  const dir = createTempDir();
  try {
    const result = await step5Discord({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("skipped");
  } finally {
    process.env.DISCORD_BOT_TOKEN = origToken;
    cleanupTempDir(dir);
  }
});

test("step7KnowledgeBase: warns when reference dir is empty", async () => {
  const { step7KnowledgeBase } = await import("../steps.js");
  const dir = createTempDir();
  try {
    const result = await step7KnowledgeBase({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      scope: "init",
      notify: mock(() => {}),
    });
    expect(result.status).toBe("warning");
    expect(result.message).toContain("empty");
  } finally {
    cleanupTempDir(dir);
  }
});

test("step7KnowledgeBase: ok when reference dir has files", async () => {
  const { step7KnowledgeBase } = await import("../steps.js");
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, ".autodev", "reference"), { recursive: true });
    writeFileSync(join(dir, ".autodev", "reference", "test.md"), "# Test");
    const result = await step7KnowledgeBase({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      scope: "init",
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Steps module tests — interactive path with MockPrompter
// ---------------------------------------------------------------------------

test("step2LlmCredentials: interactive prompts for credentials", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const { step2LlmCredentials } = await import("../steps.js");
  const dir = createTempDir();
  const mockPrompter = new MockPrompter();
  mockPrompter.answers = ["ollama-cloud", "n", "sk-interactive-test"];

  try {
    const result = await step2LlmCredentials({
      projectRoot: dir,
      prompter: mockPrompter,
      nonInteractive: false,
      authPath: join(dir, "auth.json"),
      scope: "install",
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");

    const { readAuth } = await import("../auth.js");
    const auth = await readAuth(join(dir, "auth.json"));
    expect(auth["ollama-cloud"]!.key).toBe("sk-interactive-test");
  } finally {
    cleanupTempDir(dir);
  }
});

test("step2LlmCredentials: interactive imports from existing auth file when user says yes", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const { step2LlmCredentials } = await import("../steps.js");
  const { setProviderKey } = await import("../auth.js");
  const dir = createTempDir();
  const sourceAuthPath = join(dir, "source-auth.json");
  const targetAuthPath = join(dir, "auth.json");

  await setProviderKey(sourceAuthPath, "ollama-cloud", "sk-imported-key");

  const origHome = process.env.HOME;
  process.env.HOME = dir;
  mkdirSync(join(dir, ".pi", "agent"), { recursive: true });
  writeFileSync(join(dir, ".pi", "agent", "auth.json"), readFileSync(sourceAuthPath));

  const mockPrompter = new MockPrompter();
  mockPrompter.answers = ["ollama-cloud", "y"];

  try {
    const result = await step2LlmCredentials({
      projectRoot: dir,
      prompter: mockPrompter,
      nonInteractive: false,
      authPath: targetAuthPath,
      scope: "install",
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("configured");

    const { readAuth } = await import("../auth.js");
    const auth = await readAuth(targetAuthPath);
    expect(auth["ollama-cloud"]!.key).toBe("sk-imported-key");
  } finally {
    process.env.HOME = origHome;
    cleanupTempDir(dir);
  }
});

test("step4VoyageAi: interactive accepts key", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const { step4VoyageAi } = await import("../steps.js");
  const dir = createTempDir();
  const mockPrompter = new MockPrompter();
  mockPrompter.answers = ["voyage-interactive-key"];

  try {
    const result = await step4VoyageAi({
      projectRoot: dir,
      prompter: mockPrompter,
      nonInteractive: false,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");

    const { readEnv } = await import("../env.js");
    const env = await readEnv(dir);
    expect(env.get("VOYAGE_API_KEY")).toBe("voyage-interactive-key");
  } finally {
    cleanupTempDir(dir);
  }
});

test("step4VoyageAi: interactive skips when empty", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const { step4VoyageAi } = await import("../steps.js");
  const dir = createTempDir();
  const mockPrompter = new MockPrompter();
  mockPrompter.answers = [""];

  try {
    const result = await step4VoyageAi({
      projectRoot: dir,
      prompter: mockPrompter,
      nonInteractive: false,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("warning");
    expect(result.message).toContain("ONNX");
  } finally {
    cleanupTempDir(dir);
  }
});

test("step5Discord: interactive skips when user says no", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const { step5Discord } = await import("../steps.js");
  const dir = createTempDir();
  const mockPrompter = new MockPrompter();
  mockPrompter.answers = ["n"];

  try {
    const result = await step5Discord({
      projectRoot: dir,
      prompter: mockPrompter,
      nonInteractive: false,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("skipped");
  } finally {
    cleanupTempDir(dir);
  }
});

test("step5Discord: interactive configures when user says yes", async () => {
  const { MockPrompter } = await import("../prompts.js");
  const { step5Discord } = await import("../steps.js");
  const dir = createTempDir();
  const mockPrompter = new MockPrompter();
  mockPrompter.answers = ["y", "discord-token", "channel-123", ""];

  try {
    const result = await step5Discord({
      projectRoot: dir,
      prompter: mockPrompter,
      nonInteractive: false,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(result.status).toBe("ok");

    const { readEnv } = await import("../env.js");
    const env = await readEnv(dir);
    expect(env.get("DISCORD_BOT_TOKEN")).toBe("discord-token");
    expect(env.get("DISCORD_CHANNEL_ID")).toBe("channel-123");
    expect(env.get("DISCORD_LIAISON_CHANNEL_ID")).toBe("");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Idempotent re-run tests
// ---------------------------------------------------------------------------

test("steps are skipped when already completed (install-state resume)", async () => {
  const { markStepCompleted } = await import("../state.js");
  const { step1BunCheck, step2LlmCredentials, step4VoyageAi } = await import("../steps.js");
  const dir = createTempDir();

  // Mark steps 1, 2, 4 as completed
  await markStepCompleted(dir, 1);
  await markStepCompleted(dir, 2);
  await markStepCompleted(dir, 4);

  try {
    // Step 1 should be skipped
    const r1 = await step1BunCheck({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(r1.status).toBe("skipped");

    // Step 2 should be skipped
    const r2 = await step2LlmCredentials({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(r2.status).toBe("skipped");

    // Step 4 should be skipped
    const r4 = await step4VoyageAi({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      notify: mock(() => {}),
    });
    expect(r4.status).toBe("skipped");
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// runInstallSteps integration test
// ---------------------------------------------------------------------------

test("runInstallSteps runs all install steps and collects results", async () => {
  const origBunVersion = process.env.BUN_VERSION;
  const origOllama = process.env.OLLAMA_CLOUD_API_KEY;
  const origVoyage = process.env.VOYAGE_API_KEY;
  const origDiscordToken = process.env.DISCORD_BOT_TOKEN;
  const origDiscordChannel = process.env.DISCORD_CHANNEL_ID;
  const origDiscordLiaison = process.env.DISCORD_LIAISON_CHANNEL_ID;

  process.env.OLLAMA_CLOUD_API_KEY = "sk-test-all-steps";
  process.env.VOYAGE_API_KEY = "voyage-test-all-steps";
  process.env.DISCORD_BOT_TOKEN = "discord-test-all-steps";
  process.env.DISCORD_CHANNEL_ID = "channel-test";
  process.env.DISCORD_LIAISON_CHANNEL_ID = "liaison-test";

  const { runInstallSteps } = await import("../steps.js");
  const dir = createTempDir();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test", private: true }));
  try {
    const results = await runInstallSteps({
      projectRoot: dir,
      prompter: null as any,
      nonInteractive: true,
      authPath: join(dir, "auth.json"),
      scope: "install",
      notify: mock(() => {}),
    });

    expect(results.length).toBe(8);

    expect(results[0]!.step).toBe(0);

    expect(results[1]!.step).toBe(-1);

    expect(results[2]!.step).toBe(1);
    expect(results[2]!.status).toBe("ok");

    expect(results[3]!.step).toBe(2);
    expect(results[3]!.status).toBe("ok");

    expect(results[4]!.step).toBe(3);

    expect(results[5]!.step).toBe(4);
    expect(results[5]!.status).toBe("ok");

    expect(results[6]!.step).toBe(5);
    expect(results[6]!.status).toBe("ok");

    expect(results[7]!.step).toBe(9);

    const { readEnv } = await import("../env.js");
    const env = await readEnv(dir);
    expect(env.get("OLLAMA_CLOUD_API_KEY")).toBe("sk-test-all-steps");
    expect(env.get("VOYAGE_API_KEY")).toBe("voyage-test-all-steps");
    expect(env.get("DISCORD_BOT_TOKEN")).toBe("discord-test-all-steps");
  } finally {
    process.env.BUN_VERSION = origBunVersion;
    process.env.OLLAMA_CLOUD_API_KEY = origOllama;
    process.env.VOYAGE_API_KEY = origVoyage;
    process.env.DISCORD_BOT_TOKEN = origDiscordToken;
    process.env.DISCORD_CHANNEL_ID = origDiscordChannel;
    process.env.DISCORD_LIAISON_CHANNEL_ID = origDiscordLiaison;
    cleanupTempDir(dir);
  }
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
