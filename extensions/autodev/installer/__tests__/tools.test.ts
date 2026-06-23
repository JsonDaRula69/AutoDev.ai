// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T5 Package-manager detection + OS-appropriate bootstrap tests.
 *
 * Tests (Given/When/Then):
 *  - detectPackageManager returns "brew" when brew exists
 *  - detectPackageManager returns "apt-get" when apt-get exists (no brew)
 *  - detectPackageManager returns "winget" when winget exists (no brew/apt-get)
 *  - detectPackageManager returns {found:false, name:null} when none exist
 *  - installMissingTools proceeds without PM bootstrap when PM found
 *  - installMissingTools calls installPackageManager when no PM found (non-interactive auto-proceed)
 *  - installPackageManager darwin: prints Homebrew URL, respects --yes
 *  - installPackageManager linux: reports apt approach, auto-proceed in CI
 *  - installPackageManager win32: instructs user to use Settings (no script install)
 */
import { test, expect } from "bun:test";
import type { ExecSyncOptions } from "node:child_process";

// ---------------------------------------------------------------------------
// detectPackageManager
// ---------------------------------------------------------------------------

test("detectPackageManager returns brew when brew exists", async () => {
  const { detectPackageManager } = await import("../tools.js");
  const calls: string[] = [];
  const execOverride = (cmd: string): string => {
    calls.push(cmd);
    // brew check succeeds, others fail
    if (cmd.startsWith("command -v brew")) return "/opt/homebrew/bin/brew\n";
    throw new Error("not found");
  };
  const result = detectPackageManager(() => {}, execOverride);
  expect(result.found).toBe(true);
  expect(result.name).toBe("brew");
  expect(calls.some((c) => c.includes("brew"))).toBe(true);
});

test("detectPackageManager returns apt-get when brew missing, apt-get exists", async () => {
  const { detectPackageManager } = await import("../tools.js");
  const execOverride = (cmd: string): string => {
    if (cmd.startsWith("command -v brew")) throw new Error("no brew");
    if (cmd.startsWith("command -v apt-get")) return "/usr/bin/apt-get\n";
    throw new Error("not found");
  };
  const result = detectPackageManager(() => {}, execOverride);
  expect(result.found).toBe(true);
  expect(result.name).toBe("apt-get");
});

test("detectPackageManager returns winget when brew/apt-get missing, winget exists", async () => {
  const { detectPackageManager } = await import("../tools.js");
  const execOverride = (cmd: string): string => {
    if (cmd.startsWith("command -v winget")) return "/c/.../winget\n";
    throw new Error("not found");
  };
  const result = detectPackageManager(() => {}, execOverride);
  expect(result.found).toBe(true);
  expect(result.name).toBe("winget");
});

test("detectPackageManager returns {found:false, name:null} when none exist", async () => {
  const { detectPackageManager } = await import("../tools.js");
  const execOverride = (): string => {
    throw new Error("not found");
  };
  const result = detectPackageManager(() => {}, execOverride);
  expect(result.found).toBe(false);
  expect(result.name).toBeNull();
});

// ---------------------------------------------------------------------------
// installMissingTools PM pre-check (happy)
// ---------------------------------------------------------------------------

test("installMissingTools proceeds without PM bootstrap when PM found (happy)", async () => {
  const { installMissingTools } = await import("../tools.js");
  const messages: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => messages.push({ msg, level });

  // PM detection succeeds (brew). gh/git missing -> installTool called.
  let pmChecked = false;
  let pmInstallCalled = false;
  const execOverride = (cmd: string): string => {
    if (cmd.startsWith("command -v brew")) {
      pmChecked = true;
      return "/opt/homebrew/bin/brew\n";
    }
    if (cmd.includes("bootstrap") || cmd.includes("install.sh")) {
      pmInstallCalled = true;
      return "";
    }
    // gh --version / git --version fail (need install), install commands succeed
    if (cmd.startsWith("gh --version") || cmd.startsWith("git --version")) {
      throw new Error("not installed");
    }
    return "";
  };

  // Force platform darwin via env override is not available; pass plat explicitly.
  const results = installMissingTools(notify, "darwin", execOverride);
  expect(pmChecked).toBe(true);
  expect(pmInstallCalled).toBe(false);
  // Should have proceeded to gh/git install
  expect(results.some((r) => r.tool === "GitHub CLI")).toBe(true);
});

// ---------------------------------------------------------------------------
// installMissingTools PM pre-check (failure -> bootstrap)
// ---------------------------------------------------------------------------

test("installMissingTools calls installPackageManager when no PM found (non-interactive auto-proceed)", async () => {
  const { installMissingTools } = await import("../tools.js");
  const messages: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => messages.push({ msg, level });

  let pmBootstrapExecuted = false;
  const execOverride = (cmd: string): string => {
    // All command -v checks fail -> no PM
    if (cmd.startsWith("command -v")) throw new Error("not found");
    // gh/git not installed
    if (cmd.startsWith("gh --version") || cmd.startsWith("git --version")) {
      throw new Error("not installed");
    }
    // Homebrew bootstrap script
    if (cmd.includes("install.sh") || cmd.includes("brew")) {
      pmBootstrapExecuted = true;
      return "";
    }
    return "";
  };

  // Force CI/non-interactive
  const savedCI = process.env.CI;
  const savedTTY = process.stdout.isTTY;
  process.env.CI = "true";
  try {
    installMissingTools(notify, "darwin", execOverride);
    expect(pmBootstrapExecuted).toBe(true);
    // Should notify about PM bootstrap
    expect(messages.some((m) => m.msg.toLowerCase().includes("homebrew") || m.msg.toLowerCase().includes("package manager"))).toBe(true);
  } finally {
    if (savedCI === undefined) delete process.env.CI;
    else process.env.CI = savedCI;
  }
});

// ---------------------------------------------------------------------------
// installPackageManager per-platform behavior
// ---------------------------------------------------------------------------

test("installPackageManager darwin: prints Homebrew URL and auto-proceeds in CI", async () => {
  const { installPackageManager } = await import("../tools.js");
  const messages: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => messages.push({ msg, level });

  let scriptRun = false;
  const execOverride = (cmd: string): string => {
    if (cmd.includes("install.sh")) {
      scriptRun = true;
      return "";
    }
    return "";
  };

  const savedCI = process.env.CI;
  process.env.CI = "true";
  try {
    const result = installPackageManager("darwin", notify, execOverride);
    expect(scriptRun).toBe(true);
    expect(result.installed).toBe(true);
    expect(messages.some((m) => m.msg.includes("install.sh") || m.msg.includes("Homebrew"))).toBe(true);
  } finally {
    if (savedCI === undefined) delete process.env.CI;
    else process.env.CI = savedCI;
  }
});

test("installPackageManager linux: reports apt approach and auto-proceeds in CI", async () => {
  const { installPackageManager } = await import("../tools.js");
  const messages: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => messages.push({ msg, level });

  let aptRun = false;
  const execOverride = (cmd: string): string => {
    if (cmd.includes("apt-get install")) {
      aptRun = true;
      return "";
    }
    return "";
  };

  const savedCI = process.env.CI;
  process.env.CI = "true";
  try {
    const result = installPackageManager("linux", notify, execOverride);
    expect(aptRun).toBe(true);
    expect(result.installed).toBe(true);
    expect(messages.some((m) => m.msg.toLowerCase().includes("apt"))).toBe(true);
  } finally {
    if (savedCI === undefined) delete process.env.CI;
    else process.env.CI = savedCI;
  }
});

test("installPackageManager win32: instructs Settings, no script install", async () => {
  const { installPackageManager } = await import("../tools.js");
  const messages: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => messages.push({ msg, level });

  let scriptRun = false;
  const execOverride = (cmd: string): string => {
    scriptRun = true;
    return "";
  };

  const result = installPackageManager("win32", notify, execOverride);
  expect(scriptRun).toBe(false);
  expect(result.installed).toBe(false);
  expect(messages.some((m) => m.msg.toLowerCase().includes("settings") || m.msg.toLowerCase().includes("app installer"))).toBe(true);
});

test("installPackageManager darwin --yes flag respected: runs bootstrap without prompt when --yes in argv", async () => {
  const { installPackageManager } = await import("../tools.js");
  const messages: Array<{ msg: string; level: string }> = [];
  const notify = (msg: string, level: string) => messages.push({ msg, level });

  let scriptRun = false;
  const execOverride = (cmd: string): string => {
    if (cmd.includes("install.sh")) {
      scriptRun = true;
      return "";
    }
    return "";
  };

  // Simulate --yes in argv (non-CI, but --yes passed)
  const savedArgv = process.argv;
  const savedCI = process.env.CI;
  delete process.env.CI;
  process.argv = ["bun", "autodev", "install", "--yes"];
  try {
    const result = installPackageManager("darwin", notify, execOverride);
    expect(scriptRun).toBe(true);
    expect(result.installed).toBe(true);
  } finally {
    process.argv = savedArgv;
    if (savedCI === undefined) delete process.env.CI;
    else process.env.CI = savedCI;
  }
});