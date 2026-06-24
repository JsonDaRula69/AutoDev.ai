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
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../doctor.js";
import { MockPrompter } from "../prompts.js";
import type { ReopenTtyDeps } from "../tty.js";

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "autodev-doc-orch-"));
  mkdirSync(join(dir, ".autodev"), { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { }
}

const AGENT_NAMES = [
  "nemo", "aronnax", "ned-land", "conseil", "oracle", "momus",
  "metis", "harbor-master", "quartermaster", "boatswain",
  "navigator", "watch-officer", "explore",
];

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

const STUB_EXEC = (cmd: string): string => {
  if (cmd === "bun --version") return "1.2.3\n";
  if (cmd === "gh --version") return "gh version 2.40.0\n";
  if (cmd === "gh auth status") return "Logged in to github.com\n";
  throw new Error(`unexpected command: ${cmd}`);
};

const mockProviderInstall = async () => ({ ok: true, detail: "mocked", alreadyInstalled: false });

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
  mockPrompter.answers = ["ollama-cloud", "sk-via-tty", "y", "", "", ""];
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