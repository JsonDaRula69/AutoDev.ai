// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T11 orchestrator CLI tests — registerCommands dispatch for init + onboard.
 *
 * Given/When/Then:
 *  - `autodev init --skip-onboard` → handleInit invoked, runInit called with
 *    skipOnboard=true, results printed via ctx.ui.notify.
 *  - `autodev init` with no args → runInit called with skipOnboard=false.
 *  - `autodev init --bad-flag` → usage printed, runInit NOT called.
 *  - `autodev onboard` → runOnboard called with projectRoot from ctx.cwd.
 *  - Unknown subcommand → help text listing `init` and `onboard` printed.
 *
 * Strategy: build a fake ExtensionAPI that captures the registered `autodev`
 * command handler, then invoke it with a fake ExtensionCommandContext.
 * Mock runInit / runOnboard via mock.module so the dynamic imports resolve
 * to recorders.
 */
import { test, expect, mock } from "bun:test";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ---- Module mocks ----

const runInitCalls: Array<{ projectRoot: string; skipOnboard: boolean }> = [];
const mockRunInit = mock(async (deps: any) => {
  runInitCalls.push({
    projectRoot: deps.projectRoot,
    skipOnboard: deps.skipOnboard ?? false,
  });
  return [
    { name: "autodev-dirs", ok: true, detail: "ok" },
    { name: "onboard", ok: true, detail: "ok" },
  ];
});

mock.module(
  resolve(import.meta.dir, "../../installer/init-module.js"),
  () => ({ runInit: mockRunInit }),
);

const onboardCalls: Array<{ projectRoot: string }> = [];
mock.module(
  resolve(import.meta.dir, "../../../../scripts/onboard.js"),
  () => ({
    runOnboard: async (opts: any) => {
      onboardCalls.push({ projectRoot: opts.projectRoot });
      return 0;
    },
  }),
);

// ---- Fake pi + ctx ----

function makeFakePi(): { pi: any; getHandler: () => any } {
  let captured: any = null;
  const pi = {
    registerCommand: (_name: string, def: any) => {
      captured = def;
    },
  };
  return { pi, getHandler: () => captured };
}

function makeFakeCtx(cwd: string): any {
  const messages: Array<{ msg: string; level: string }> = [];
  return {
    cwd,
    ui: {
      notify: (msg: string, level: string) => {
        messages.push({ msg, level });
      },
    },
    _messages: messages,
  };
}

function freshDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "autodev-orch-cli-")));
}

// ---- Tests ----

test("handleInit --skip-onboard: runInit called with skipOnboard=true, results notified", async () => {
  const { pi, getHandler } = makeFakePi();
  const { registerCommands } = await import("../cli.js");
  registerCommands(pi); const handler = getHandler();
  expect(handler).toBeTruthy();

  const dir = freshDir();
  const ctx = makeFakeCtx(dir);
  runInitCalls.length = 0;
  await handler.handler("init --skip-onboard", ctx);
  expect(runInitCalls.length).toBe(1);
  expect(runInitCalls[0]!.skipOnboard).toBe(true);
  expect(runInitCalls[0]!.projectRoot).toBe(dir);
  expect(ctx._messages.some((m: any) => m.msg.includes("Init complete"))).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("handleInit no args: runInit called with skipOnboard=false", async () => {
  const { pi, getHandler } = makeFakePi();
  const { registerCommands } = await import("../cli.js");
  registerCommands(pi); const handler = getHandler();
  const dir = freshDir();
  const ctx = makeFakeCtx(dir);
  runInitCalls.length = 0;
  await handler.handler("init", ctx);
  expect(runInitCalls.length).toBe(1);
  expect(runInitCalls[0]!.skipOnboard).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test("handleInit --bad-flag: usage printed, runInit NOT called", async () => {
  const { pi, getHandler } = makeFakePi();
  const { registerCommands } = await import("../cli.js");
  registerCommands(pi); const handler = getHandler();
  const dir = freshDir();
  const ctx = makeFakeCtx(dir);
  runInitCalls.length = 0;
  await handler.handler("init --bad-flag", ctx);
  expect(runInitCalls.length).toBe(0);
  const combined = ctx._messages.map((m: any) => m.msg).join(" ");
  expect(combined).toMatch(/usage|unknown/i);
  rmSync(dir, { recursive: true, force: true });
});

test("handleOnboard: runOnboard called with ctx.cwd", async () => {
  const { pi, getHandler } = makeFakePi();
  const { registerCommands } = await import("../cli.js");
  registerCommands(pi); const handler = getHandler();
  const dir = freshDir();
  const ctx = makeFakeCtx(dir);
  onboardCalls.length = 0;
  await handler.handler("onboard", ctx);
  expect(onboardCalls.length).toBe(1);
  expect(onboardCalls[0]!.projectRoot).toBe(dir);
  rmSync(dir, { recursive: true, force: true });
});

test("unknown subcommand: help text lists init and onboard", async () => {
  const { pi, getHandler } = makeFakePi();
  const { registerCommands } = await import("../cli.js");
  registerCommands(pi); const handler = getHandler();
  const dir = freshDir();
  const ctx = makeFakeCtx(dir);
  await handler.handler("nope", ctx);
  const combined = ctx._messages.map((m: any) => m.msg).join(" ");
  expect(combined).toMatch(/init/);
  expect(combined).toMatch(/onboard/);
  rmSync(dir, { recursive: true, force: true });
});