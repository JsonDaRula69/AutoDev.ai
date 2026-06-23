/**
 * T12 dispatch config loader tests.
 *
 * Verifies the central-then-project-then-defaults config resolution for
 * dispatch-rules.yaml:
 *   1. Central `~/.AutoDev/config/dispatch-rules.yaml` is loaded by default.
 *   2. Project `.autodev/config/dispatch-rules.yaml` overrides central
 *      (file-level, not deep merge).
 *   3. Hardcoded defaults are used when neither file exists.
 *
 * `PI_CODING_AGENT_DIR` is redirected to a temp tree so `getAgentDir()`
 * resolves into the test's central dir, matching the T7 pattern.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- Helpers ----

let centralRoot: string;
let projectRoot: string;
let savedAgentDir: string | undefined;

function setup(): void {
  centralRoot = mkdtempSync(join(tmpdir(), "autodev-dispatch-central-"));
  projectRoot = mkdtempSync(join(tmpdir(), "autodev-dispatch-project-"));
  savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(centralRoot, "agent");
}

function teardown(): void {
  if (savedAgentDir !== undefined) process.env.PI_CODING_AGENT_DIR = savedAgentDir;
  else delete process.env.PI_CODING_AGENT_DIR;
  rmSync(centralRoot, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
}

function writeCentralDispatch(rules: string): void {
  const dir = join(centralRoot, "config");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "dispatch-rules.yaml"), rules);
}

function writeProjectDispatch(rules: string): void {
  const dir = join(projectRoot, ".autodev", "config");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "dispatch-rules.yaml"), rules);
}

beforeEach(setup);
afterEach(teardown);

// --- Happy: central config exists → engine loads it -------------------------

test("loadDispatchConfig loads central ~/.AutoDev/config/dispatch-rules.yaml when no project override", async () => {
  writeCentralDispatch(
    [
      "dispatch_rules:",
      "  - trigger: central-trigger",
      "    from: nemo",
      "    to: ned_land",
      "    condition: \"true\"",
    ].join("\n"),
  );
  const { loadDispatchConfig } = await import("../dispatch.js");
  const cfg = loadDispatchConfig(projectRoot);
  expect(cfg.dispatch_rules.some((r) => r.trigger === "central-trigger")).toBe(true);
});

// --- Project override: both exist → project wins ----------------------------

test("loadDispatchConfig uses project .autodev/config/dispatch-rules.yaml when both central and project exist", async () => {
  writeCentralDispatch(
    [
      "dispatch_rules:",
      "  - trigger: central-trigger",
      "    from: nemo",
      "    to: ned_land",
      "    condition: \"true\"",
    ].join("\n"),
  );
  writeProjectDispatch(
    [
      "dispatch_rules:",
      "  - trigger: project-trigger",
      "    from: nemo",
      "    to: aronnax",
      "    condition: \"true\"",
    ].join("\n"),
  );
  const { loadDispatchConfig } = await import("../dispatch.js");
  const cfg = loadDispatchConfig(projectRoot);
  // Project wins — central rule must NOT be present (file-level override, no merge).
  expect(cfg.dispatch_rules.some((r) => r.trigger === "project-trigger")).toBe(true);
  expect(cfg.dispatch_rules.some((r) => r.trigger === "central-trigger")).toBe(false);
});

// --- No configs → hardcoded defaults ----------------------------------------

test("loadDispatchConfig returns hardcoded defaults when neither central nor project config exists", async () => {
  const { loadDispatchConfig, DEFAULT_DISPATCH_CONFIG } = await import("../dispatch.js");
  const cfg = loadDispatchConfig(projectRoot);
  expect(cfg).toEqual(DEFAULT_DISPATCH_CONFIG);
  // Defaults must be non-empty to be meaningful.
  expect(cfg.dispatch_rules.length).toBeGreaterThan(0);
});

// --- Project-only (no central) → project loaded -----------------------------

test("loadDispatchConfig loads project config when central does not exist", async () => {
  writeProjectDispatch(
    [
      "dispatch_rules:",
      "  - trigger: project-only-trigger",
      "    from: nemo",
      "    to: ned_land",
      "    condition: \"true\"",
    ].join("\n"),
  );
  const { loadDispatchConfig } = await import("../dispatch.js");
  const cfg = loadDispatchConfig(projectRoot);
  expect(cfg.dispatch_rules.some((r) => r.trigger === "project-only-trigger")).toBe(true);
});

// --- File-level override is NOT a deep merge --------------------------------

test("loadDispatchConfig project override replaces central entirely (no deep merge)", async () => {
  writeCentralDispatch(
    [
      "dispatch_rules:",
      "  - trigger: central-a",
      "    from: nemo",
      "    to: ned_land",
      "    condition: \"true\"",
      "  - trigger: central-b",
      "    from: nemo",
      "    to: oracle",
      "    condition: \"true\"",
    ].join("\n"),
  );
  writeProjectDispatch(
    [
      "dispatch_rules:",
      "  - trigger: project-only",
      "    from: nemo",
      "    to: ned_land",
      "    condition: \"true\"",
    ].join("\n"),
  );
  const { loadDispatchConfig } = await import("../dispatch.js");
  const cfg = loadDispatchConfig(projectRoot);
  expect(cfg.dispatch_rules.length).toBe(1);
  expect(cfg.dispatch_rules.some((r) => r.trigger === "project-only")).toBe(true);
  expect(cfg.dispatch_rules.some((r) => r.trigger === "central-a")).toBe(false);
  expect(cfg.dispatch_rules.some((r) => r.trigger === "central-b")).toBe(false);
});