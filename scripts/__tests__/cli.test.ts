// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T11 CLI tests — scripts/cli.ts init + onboard dispatch.
 *
 * Given/When/Then:
 *  - `autodev init --skip-onboard` → cmdInit called with skipOnboard=true,
 *    returns 0, runInit invoked once.
 *  - `autodev init` with no args → cmdInit called with skipOnboard=false,
 *    returns 0.
 *  - `autodev init --bad-flag` → prints usage, returns 1.
 *  - Help text lists `init` and `onboard`.
 *  - `autodev onboard` → dispatches to runOnboard.
 *
 * Uses dependency injection (runInitOverride / runOnboardOverride) instead of
 * global mock.module to avoid poisoning other tests in the same process.
 */
import { test, expect, mock } from "bun:test";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- Temp project root isolation ----

function freshProjectRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "autodev-cli-test-"));
  return realpathSync(d);
}

// ---- Helpers ----

function captureNotify(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as any).write = (chunk: any) => {
    messages.push(String(chunk));
    return true;
  };
  (process.stderr as any).write = (chunk: any) => {
    messages.push(String(chunk));
    return true;
  };
  return {
    messages,
    restore: () => {
      (process.stdout as any).write = origOut;
      (process.stderr as any).write = origErr;
    },
  };
}

// ---- Tests ----

test("cmdInit happy with --skip-onboard: calls runInit with skipOnboard=true, returns 0", async () => {
  const projectRoot = freshProjectRoot();
  const savedCwd = process.cwd();
  process.chdir(projectRoot);
  const cap = captureNotify();
  const calls: any[] = [];
  try {
    const mockRunInit = mock(async (deps: any) => {
      calls.push(deps);
      return [{ name: "autodev-dirs", ok: true, detail: "ok" }];
    });
    const { cmdInit } = await import("../cli.js");
    const code = await cmdInit(["--skip-onboard"], { runInitOverride: mockRunInit });
    expect(code).toBe(0);
    expect(calls.length).toBe(1);
    expect(calls[0]!.skipOnboard).toBe(true);
    expect(calls[0]!.projectRoot).toBe(projectRoot);
  } finally {
    cap.restore();
    process.chdir(savedCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("cmdInit happy with no args: calls runInit with skipOnboard=false, returns 0", async () => {
  const projectRoot = freshProjectRoot();
  const savedCwd = process.cwd();
  process.chdir(projectRoot);
  const cap = captureNotify();
  const calls: any[] = [];
  try {
    const mockRunInit = mock(async (deps: any) => {
      calls.push(deps);
      return [{ name: "autodev-dirs", ok: true, detail: "ok" }];
    });
    const { cmdInit } = await import("../cli.js");
    const code = await cmdInit([], { runInitOverride: mockRunInit });
    expect(code).toBe(0);
    expect(calls.length).toBe(1);
    expect(calls[0]!.skipOnboard).toBe(false);
  } finally {
    cap.restore();
    process.chdir(savedCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("cmdInit with unknown flag: prints usage, returns 1", async () => {
  const projectRoot = freshProjectRoot();
  const savedCwd = process.cwd();
  process.chdir(projectRoot);
  const cap = captureNotify();
  const calls: any[] = [];
  try {
    const mockRunInit = mock(async (deps: any) => {
      calls.push(deps);
      return [];
    });
    const { cmdInit } = await import("../cli.js");
    const code = await cmdInit(["--bad-flag"], { runInitOverride: mockRunInit });
    expect(code).toBe(1);
    expect(calls.length).toBe(0);
    expect(cap.messages.join("")).toMatch(/usage|unknown/i);
  } finally {
    cap.restore();
    process.chdir(savedCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("cmdInit --help: prints usage, returns 0, runInit NOT called", async () => {
  const projectRoot = freshProjectRoot();
  const savedCwd = process.cwd();
  process.chdir(projectRoot);
  const cap = captureNotify();
  const calls: any[] = [];
  try {
    const mockRunInit = mock(async (deps: any) => {
      calls.push(deps);
      return [];
    });
    const { cmdInit } = await import("../cli.js");
    const code = await cmdInit(["--help"], { runInitOverride: mockRunInit });
    expect(code).toBe(0);
    expect(calls.length).toBe(0);
    expect(cap.messages.join("")).toMatch(/usage/i);
  } finally {
    cap.restore();
    process.chdir(savedCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("help text lists init and onboard", async () => {
  const { HELP_SUBCOMMANDS } = await import("../cli.js");
  expect(HELP_SUBCOMMANDS).toMatch(/init/);
  expect(HELP_SUBCOMMANDS).toMatch(/onboard/);
});

test("cmdOnboard dispatches to runOnboard (returns its exit code)", async () => {
  const projectRoot = freshProjectRoot();
  const savedCwd = process.cwd();
  process.chdir(projectRoot);
  const cap = captureNotify();
  const calls: any[] = [];
  try {
    const mockRunOnboard = mock(async (opts: any) => {
      calls.push(opts);
      return 0;
    });
    const { cmdOnboard } = await import("../cli.js");
    const code = await cmdOnboard({ runOnboardOverride: mockRunOnboard });
    expect(code).toBe(0);
    expect(calls.length).toBe(1);
    expect(calls[0]!.projectRoot).toBe(projectRoot);
  } finally {
    cap.restore();
    process.chdir(savedCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// ---- T14: doctor success message (Decision #21) ----

test("cmdDoctor prints the Decision #21 success message when all checks pass", async () => {
  const projectRoot = freshProjectRoot();
  const savedCwd = process.cwd();
  process.chdir(projectRoot);
  const cap = captureNotify();
  try {
    const mockRunDoctor = mock(async () => ({
      checks: [
        { name: "Bun", ok: true, detail: "v1.2.3" },
        { name: "GitHub CLI", ok: true, detail: "gh version 2.40.0" },
      ],
      passed: 2,
      failed: 0,
      configFlowLaunched: false,
    }));
    const { cmdDoctor } = await import("../cli.js");
    const code = await cmdDoctor({ runDoctorOverride: mockRunDoctor });
    expect(code).toBe(0);
    const combined = cap.messages.join("");
    expect(combined).toContain(
      "Installation Successful! Use cd to navigate to your project folder and run autodev init to pair a project.",
    );
    expect(combined).not.toContain("All machine-level checks passed.");
  } finally {
    cap.restore();
    process.chdir(savedCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("cmdDoctor does NOT print the success message when checks fail", async () => {
  const projectRoot = freshProjectRoot();
  const savedCwd = process.cwd();
  process.chdir(projectRoot);
  const cap = captureNotify();
  try {
    const mockRunDoctor = mock(async () => ({
      checks: [{ name: "Bun", ok: false, detail: "not found" }],
      passed: 0,
      failed: 1,
      configFlowLaunched: false,
    }));
    const { cmdDoctor } = await import("../cli.js");
    const code = await cmdDoctor({ runDoctorOverride: mockRunDoctor });
    expect(code).toBe(1);
    const combined = cap.messages.join("");
    expect(combined).not.toContain("Installation Successful!");
  } finally {
    cap.restore();
    process.chdir(savedCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});