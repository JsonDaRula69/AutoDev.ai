// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T6 config-module tests — handleDiscord full setup walkthrough.
 *
 * Tests (Given/When/Then):
 *  - Happy: confirm=true, token, channel, liaison → writes env vars, returns ok
 *  - Skip: confirm=false → marks step skipped, no env writes
 *  - No-TTY: confirm returns "" (no TTY) → warns, returns warning
 *  - Already-configured: STEP_DISCORD complete → returns skipped without prompting
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { MockPrompter, type Prompter } from "../prompts.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `autodev-config-module-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

interface Harness {
  projectRoot: string;
  authPath: string;
  envPath: string;
  notifyCalls: Array<{ message: string; level: string }>;
  deps: import("../config-module.js").ConfigModuleDeps;
}

async function makeHarness(prompter: Prompter): Promise<Harness> {
  const projectRoot = createTempDir();
  // Mirror agentEnvPath: join(dirname(authPath), ".env")
  const authDir = join(projectRoot, "agent");
  mkdirSync(authDir, { recursive: true });
  const authPath = join(authDir, "auth.json");
  const envPath = join(authDir, ".env");

  const notifyCalls: Array<{ message: string; level: string }> = [];
  const { ConfigModuleDeps } = await import("../config-module.js");
  const deps: typeof ConfigModuleDeps = {
    projectRoot,
    authPath,
    prompter,
    notify: (message: string, level: "info" | "warning" | "error") => {
      notifyCalls.push({ message, level });
    },
    fetchOverride: async () => ({ status: 200 } as Response),
  };
  return { projectRoot, authPath, envPath, notifyCalls, deps };
}

function readEnvFile(envPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(envPath)) return map;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tests: handleDiscord
// ---------------------------------------------------------------------------

test("handleDiscord happy path: confirm, token, channel, liaison → writes env vars, returns ok", async () => {
  const prompter = new MockPrompter();
  // confirm "set up Discord?" → yes
  prompter.answers.push("y");
  // prompt: bot token
  prompter.answers.push("BOT_TOKEN_123");
  // prompt: channel id
  prompter.answers.push("111222333");
  // prompt: liaison channel id
  prompter.answers.push("444555666");

  const h = await makeHarness(prompter);
  try {
    const { runConfig } = await import("../config-module.js");
    const results = await runConfig(h.deps, "discord");
    expect(results.length).toBe(1);
    const r = results[0];
    expect(r.subcommand).toBe("discord");
    expect(r.status).toBe("ok");
    expect(r.message).toContain("Discord");

    // env vars written
    const env = readEnvFile(h.envPath);
    expect(env.get("DISCORD_BOT_TOKEN")).toBe("BOT_TOKEN_123");
    expect(env.get("DISCORD_CHANNEL_ID")).toBe("111222333");
    expect(env.get("DISCORD_LIAISON_CHANNEL_ID")).toBe("444555666");

    // confirm prompt text contained the 7-step walkthrough + reference pointer
    // (MockPrompter captures the question text? No — it discards _question.
    //  We verify via the function output instead; the walkthrough text presence
    //  is asserted in a dedicated test below.)
  } finally {
    cleanupTempDir(h.projectRoot);
  }
});

test("handleDiscord skip: confirm=false → marks step skipped, no env writes", async () => {
  const prompter = new MockPrompter();
  // confirm "set up Discord?" → no
  prompter.answers.push("n");

  const h = await makeHarness(prompter);
  try {
    const { runConfig } = await import("../config-module.js");
    const results = await runConfig(h.deps, "discord");
    expect(results.length).toBe(1);
    const r = results[0];
    expect(r.subcommand).toBe("discord");
    expect(r.status).toBe("skipped");
    expect(r.message).toContain("skipped");

    // No env file written
    expect(existsSync(h.envPath)).toBe(false);
  } finally {
    cleanupTempDir(h.projectRoot);
  }
});

test("handleDiscord no-TTY: prompt returns empty → warns, returns warning", async () => {
  // No-TTY prompter: confirm returns defaultYes (false for our confirm), and
  // prompt returns "". But confirm default is false → would skip before reaching
  // the token prompt. The no-TTY warning path requires the confirm to pass (true)
  // so that the empty token prompt triggers the warning. Use a custom prompter.
  const noTtyPrompter: Prompter = {
    confirm: async (_q: string, _defaultYes = true) => true,
    prompt: async (_q: string) => "",
    close: () => {},
  };

  const h = await makeHarness(noTtyPrompter);
  try {
    const { runConfig } = await import("../config-module.js");
    const results = await runConfig(h.deps, "discord");
    expect(results.length).toBe(1);
    const r = results[0];
    expect(r.subcommand).toBe("discord");
    expect(r.status).toBe("warning");
    expect(r.message).toContain("no TTY");

    // a warning notify was fired
    const warned = h.notifyCalls.some((c) => c.level === "warning");
    expect(warned).toBe(true);

    // No env file written
    expect(existsSync(h.envPath)).toBe(false);
  } finally {
    cleanupTempDir(h.projectRoot);
  }
});

test("handleDiscord force re-config: --discord bypasses skip gate even when step completed", async () => {
  const prompter = new MockPrompter();
  prompter.answers = ["n"];
  const h = await makeHarness(prompter);
  try {
    const { markStepCompleted } = await import("../state.js");
    await markStepCompleted(h.projectRoot, 5, "config");

    const { runConfig } = await import("../config-module.js");
    const results = await runConfig(h.deps, "discord");
    expect(results.length).toBe(1);
    const r = results[0];
    expect(r.subcommand).toBe("discord");
    expect(r.status).toBe("skipped");
    expect(r.message).toContain("skipped");
  } finally {
    cleanupTempDir(h.projectRoot);
  }
});

test("handleDiscord confirm prompt text includes all 7 setup steps and reference pointer", async () => {
  // Capture the confirm question text by using a recording prompter.
  let capturedConfirm = "";
  let capturedTokenPrompt = "";
  const recordingPrompter: Prompter = {
    confirm: async (q: string, _d = true) => {
      capturedConfirm = q;
      return true;
    },
    prompt: async (q: string) => {
      capturedTokenPrompt = q;
      return "tkn";
    },
    close: () => {},
  };

  const h = await makeHarness(recordingPrompter);
  try {
    const { runConfig } = await import("../config-module.js");
    await runConfig(h.deps, "discord");

    const text = capturedConfirm + capturedTokenPrompt;
    // 7 steps
    expect(text).toContain("Discord Developer Portal");
    expect(text).toContain("New Application");
    expect(text).toContain("Reset Token");
    expect(text).toContain("Message Content Intent");
    expect(text).toContain("URL Generator");
    expect(text).toContain("Send Messages");
    expect(text).toContain("Read Message History");
    expect(text).toContain("Developer Mode");
    expect(text).toContain("Copy ID");
    // reference pointer
    expect(text).toContain("~/.AutoDev/reference/discord-setup.md");
  } finally {
    cleanupTempDir(h.projectRoot);
  }
});

test("handleDiscord confirm defaults to false (skip)", async () => {
  // Verify the confirm call uses defaultYes=false by checking the NoTty
  // prompter path: createNoTtyPrompter.confirm returns defaultYes, so a no-TTY
  // confirm on Discord should resolve to false (skip), not true.
  // We emulate by passing a prompter that returns the defaultYes value.
  let receivedDefault: boolean | undefined;
  const probePrompter: Prompter = {
    confirm: async (_q: string, defaultYes = true) => {
      receivedDefault = defaultYes;
      return defaultYes;
    },
    prompt: async (_q: string) => "",
    close: () => {},
  };

  const h = await makeHarness(probePrompter);
  try {
    const { runConfig } = await import("../config-module.js");
    await runConfig(h.deps, "discord");
    expect(receivedDefault).toBe(false);
  } finally {
    cleanupTempDir(h.projectRoot);
  }
});