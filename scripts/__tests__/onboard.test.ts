// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T10 onboard tests — scripts/onboard.ts runOnboard().
 *
 * Given/When/Then:
 *  - Happy: injected sessionFactory + loadHarborMaster + writeMemory ->
 *    runOnboard returns 0, memory file written, success notify emitted.
 *  - Missing agent: loadHarborMaster returns undefined -> fallback stub,
 *    runOnboard returns 1, no session created.
 *  - Pi SDK unavailable: sessionFactory throws -> fallback stub,
 *    runOnboard returns 1.
 *  - Memory write fails: writeMemory returns false -> warning emitted,
 *    runOnboard still returns 0 (session ran).
 */
import { test, expect } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runOnboard } from "../onboard.js";

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `autodev-onboard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function makeFakeSession(): { promptCalls: string[]; disposeCalls: number; session: any } {
  const promptCalls: string[] = [];
  const disposeCalls = { count: 0 };
  const session = {
    prompt: async (text: string) => {
      promptCalls.push(text);
    },
    subscribe: () => () => {},
    dispose: () => {
      disposeCalls.count++;
    },
  };
  return { promptCalls, disposeCalls, session };
}

test("runOnboard happy: session launched, memory written, returns 0", async () => {
  const projectRoot = createTempDir();
  try {
    const { promptCalls, disposeCalls, session } = makeFakeSession();
    const messages: Array<{ msg: string; level: string }> = [];
    let wroteMemory = false;

    const code = await runOnboard({
      projectRoot,
      notify: (msg, level) => messages.push({ msg, level }),
      sessionFactory: async () => session,
      loadHarborMaster: () => "You are the Harbor Master.",
      loadOnboardingProtocol: () => "# Onboarding Protocol\n...",
      writeMemory: (root, content) => {
        mkdirSync(join(root, ".autodev", "memory"), { recursive: true });
        writeFileSync(join(root, ".autodev", "memory", "projectbrief.md"), content, "utf-8");
        wroteMemory = true;
        return true;
      },
    });

    expect(code).toBe(0);
    expect(promptCalls.length).toBe(1);
    expect(promptCalls[0]).toContain("Harbor Master");
    expect(disposeCalls.count).toBe(1);
    expect(wroteMemory).toBe(true);
    expect(messages.some((m) => m.msg.includes("Onboarding complete"))).toBe(true);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard missing agent: loadHarborMaster undefined -> fallback stub, returns 1", async () => {
  const projectRoot = createTempDir();
  try {
    let sessionCreated = false;
    const messages: Array<{ msg: string; level: string }> = [];

    const code = await runOnboard({
      projectRoot,
      notify: (msg, level) => messages.push({ msg, level }),
      sessionFactory: async () => {
        sessionCreated = true;
        return {} as never;
      },
      loadHarborMaster: () => undefined,
      loadOnboardingProtocol: () => undefined,
      writeMemory: () => true,
    });

    expect(code).toBe(1);
    expect(sessionCreated).toBe(false);
    expect(messages.some((m) => m.level === "warning" && m.msg.includes("not found"))).toBe(true);
    expect(messages.some((m) => m.msg.includes("To onboard manually"))).toBe(true);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard pi SDK unavailable: sessionFactory throws -> fallback stub, returns 1", async () => {
  const projectRoot = createTempDir();
  try {
    const messages: Array<{ msg: string; level: string }> = [];

    const code = await runOnboard({
      projectRoot,
      notify: (msg, level) => messages.push({ msg, level }),
      sessionFactory: async () => {
        throw new Error("pi SDK not installed");
      },
      loadHarborMaster: () => "You are the Harbor Master.",
      loadOnboardingProtocol: () => undefined,
      writeMemory: () => true,
    });

    expect(code).toBe(1);
    expect(messages.some((m) => m.level === "warning" && m.msg.includes("pi session unavailable"))).toBe(true);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard memory write fails: warning emitted, returns 0", async () => {
  const projectRoot = createTempDir();
  try {
    const { session } = makeFakeSession();
    const messages: Array<{ msg: string; level: string }> = [];

    const code = await runOnboard({
      projectRoot,
      notify: (msg, level) => messages.push({ msg, level }),
      sessionFactory: async () => session,
      loadHarborMaster: () => "You are the Harbor Master.",
      loadOnboardingProtocol: () => undefined,
      writeMemory: () => false,
    });

    expect(code).toBe(0);
    expect(messages.some((m) => m.level === "warning" && m.msg.includes("projectbrief.md"))).toBe(true);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard default memory writer writes .autodev/memory/projectbrief.md", async () => {
  const projectRoot = createTempDir();
  try {
    const { session } = makeFakeSession();

    await runOnboard({
      projectRoot,
      notify: () => {},
      sessionFactory: async () => session,
      loadHarborMaster: () => "You are the Harbor Master.",
      loadOnboardingProtocol: () => undefined,
    });

    const briefPath = join(projectRoot, ".autodev", "memory", "projectbrief.md");
    expect(existsSync(briefPath)).toBe(true);
    const content = readFileSync(briefPath, "utf-8");
    expect(content).toContain("# Project Brief");
  } finally {
    cleanupTempDir(projectRoot);
  }
});