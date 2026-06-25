// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * Uninstall module tests.
 *
 * Tests (Given/When/Then):
 *  - Removes central config home (~/.AutoDev/) when present
 *  - Calls uninstall for all pi providers (ollama-cloud, magic-context, aft-pi, pi-lsp)
 *  - Removes PI_CODING_AGENT_DIR lines from shell rc files
 *  - Removes project state files (install-state.json, config-state.json, init-state.json)
 *  - Idempotent: re-running on a clean machine returns all ok with "already absent" details
 *  - Provider uninstall errors are tolerated if the provider was never installed
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runUninstall } from "../uninstall-module.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempHome(): string {
  const dir = resolve(
    tmpdir(),
    `autodev-uninstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function makeNotify(): { calls: string[]; fn: (m: string, l: string) => void } {
  const calls: string[] = [];
  return {
    calls,
    fn: (msg: string, _level: string) => { calls.push(msg); },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tempHome: string;
let tempProject: string;
let origHome: string | undefined;

beforeEach(() => {
  tempHome = createTempHome();
  tempProject = createTempHome();
  origHome = process.env.HOME;
  process.env.HOME = tempHome;
  process.env.PI_CODING_AGENT_DIR = join(tempHome, ".AutoDev", "agent");
});

afterEach(() => {
  process.env.HOME = origHome;
  delete process.env.PI_CODING_AGENT_DIR;
  cleanupTempDir(tempHome);
  cleanupTempDir(tempProject);
});

test("removes central config home when present", async () => {
  const agentDir = join(tempHome, ".AutoDev", "agent");
  mkdirSync(join(agentDir, "agents"), { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), "{}");
  mkdirSync(join(tempHome, ".AutoDev", "config"), { recursive: true });
  writeFileSync(join(tempHome, ".AutoDev", "config", "guardrails.yaml"), "rules: []");

  expect(existsSync(tempHome + "/.AutoDev")).toBe(true);

  const { fn, calls } = makeNotify();
  const removedSources: string[] = [];
  const results = await runUninstall({
    projectRoot: tempProject,
    notify: fn,
    removeProviderOverride: (s: string) => { removedSources.push(s); },
  });

  expect(existsSync(join(tempHome, ".AutoDev"))).toBe(false);
  const centralResult = results.find((r: any) => r.name === "central-config-home");
  expect(centralResult.ok).toBe(true);
});

test("calls uninstall for all pi providers", async () => {
  const removedSources: string[] = [];
  const { fn } = makeNotify();
  await runUninstall({
    projectRoot: tempProject,
    notify: fn,
    removeProviderOverride: (s: string) => { removedSources.push(s); },
  });

  expect(removedSources).toContain("npm:pi-ollama-cloud");
  expect(removedSources).toContain("npm:@cortexkit/pi-magic-context");
  expect(removedSources).toContain("npm:@cortexkit/aft-pi");
  expect(removedSources).toContain("npm:@dreki-gg/pi-lsp");
});

test("removes PI_CODING_AGENT_DIR from .bashrc", async () => {
  const bashrcPath = join(tempHome, ".bashrc");
  writeFileSync(
    bashrcPath,
    'export SOME_OTHER_VAR="x"\nexport PI_CODING_AGENT_DIR="$HOME/.AutoDev/agent"\necho hello\n',
    "utf-8",
  );

  const { fn } = makeNotify();
  await runUninstall({
    projectRoot: tempProject,
    notify: fn,
    removeProviderOverride: () => {},
  });

  const content = readFileSync(bashrcPath, "utf-8");
  expect(content).not.toContain("PI_CODING_AGENT_DIR");
  expect(content).toContain('export SOME_OTHER_VAR="x"');
  expect(content).toContain("echo hello");
});

test("removes PI_CODING_AGENT_DIR from fish config.fish", async () => {
  const fishConfigDir = join(tempHome, ".config", "fish");
  mkdirSync(fishConfigDir, { recursive: true });
  const fishPath = join(fishConfigDir, "config.fish");
  writeFileSync(
    fishPath,
    "set -gx SOME_OTHER x\nset -gx PI_CODING_AGENT_DIR $HOME/.AutoDev/agent\n",
    "utf-8",
  );

  const { fn } = makeNotify();
  await runUninstall({
    projectRoot: tempProject,
    notify: fn,
    removeProviderOverride: () => {},
  });

  const content = readFileSync(fishPath, "utf-8");
  expect(content).not.toContain("PI_CODING_AGENT_DIR");
  expect(content).toContain("set -gx SOME_OTHER x");
});

test("removes project state files", async () => {
  mkdirSync(join(tempProject, ".autodev"), { recursive: true });
  writeFileSync(
    join(tempProject, ".autodev", "install-state.json"),
    '{"completedSteps":[0,2,3]}',
  );
  writeFileSync(
    join(tempProject, ".autodev", "config-state.json"),
    '{"completedSteps":[1]}',
  );
  writeFileSync(
    join(tempProject, ".autodev", "init-state.json"),
    '{"completedSteps":[1,2]}',
  );

  const { fn } = makeNotify();
  const results = await runUninstall({
    projectRoot: tempProject,
    notify: fn,
    removeProviderOverride: () => {},
  });

  expect(existsSync(join(tempProject, ".autodev", "install-state.json"))).toBe(false);
  expect(existsSync(join(tempProject, ".autodev", "config-state.json"))).toBe(false);
  expect(existsSync(join(tempProject, ".autodev", "init-state.json"))).toBe(false);

  const stateResult = results.find((r: any) => r.name === "project-state-files");
  expect(stateResult.ok).toBe(true);
});

test("idempotent: re-run on clean machine returns all ok", async () => {
  const { fn } = makeNotify();
  const removedSources: string[] = [];
  const results = await runUninstall({
    projectRoot: tempProject,
    notify: fn,
    removeProviderOverride: (s: string) => { removedSources.push(s); },
  });

  const failed = results.filter((r: any) => !r.ok);
  expect(failed.length).toBe(0);

  const centralResult = results.find((r: any) => r.name === "central-config-home");
  expect(centralResult.detail).toContain("absent");

  const stateResult = results.find((r: any) => r.name === "project-state-files");
  expect(stateResult.detail).toContain("no state files");
});

test("preserves other lines in .bashrc, only removes PI_CODING_AGENT_DIR", async () => {
  const bashrcPath = join(tempHome, ".bashrc");
  const originalContent = [
    "# My bashrc",
    'export PATH="/usr/local/bin:$PATH"',
    'export PI_CODING_AGENT_DIR="$HOME/.AutoDev/agent"',
    "alias ll='ls -la'",
    "",
  ].join("\n");
  writeFileSync(bashrcPath, originalContent, "utf-8");

  const { fn } = makeNotify();
  await runUninstall({
    projectRoot: tempProject,
    notify: fn,
    removeProviderOverride: () => {},
  });

  const content = readFileSync(bashrcPath, "utf-8");
  expect(content).toContain("# My bashrc");
  expect(content).toContain('export PATH="/usr/local/bin:$PATH"');
  expect(content).toContain("alias ll='ls -la'");
  expect(content).not.toContain("PI_CODING_AGENT_DIR");
});