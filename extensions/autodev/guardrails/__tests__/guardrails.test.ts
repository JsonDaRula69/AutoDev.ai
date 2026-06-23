/**
 * T12 guardrail config loader tests.
 *
 * Verifies the central-then-project-then-defaults config resolution:
 *   1. Central `~/.AutoDev/config/guardrails.yaml` is loaded by default.
 *   2. Project `.autodev/config/guardrails.yaml` overrides central (file-level,
 *      not deep merge).
 *   3. Hardcoded defaults are used when neither file exists.
 *
 * `PI_CODING_AGENT_DIR` is redirected to a temp tree so `getAgentDir()`
 * resolves into the test's central dir, matching the T2/T7 pattern.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- Helpers ----

let centralRoot: string;
let projectRoot: string;
let savedAgentDir: string | undefined;

function setup(): void {
  centralRoot = mkdtempSync(join(tmpdir(), "autodev-guard-central-"));
  projectRoot = mkdtempSync(join(tmpdir(), "autodev-guard-project-"));
  savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(centralRoot, "agent");
}

function teardown(): void {
  if (savedAgentDir !== undefined) process.env.PI_CODING_AGENT_DIR = savedAgentDir;
  else delete process.env.PI_CODING_AGENT_DIR;
  rmSync(centralRoot, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
}

function writeCentralGuardrails(rules: string): void {
  const dir = join(centralRoot, "config");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "guardrails.yaml"), rules);
}

function writeProjectGuardrails(rules: string): void {
  const dir = join(projectRoot, ".autodev", "config");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "guardrails.yaml"), rules);
}

beforeEach(setup);
afterEach(teardown);

// --- Happy: central config exists → engine loads it -------------------------

test("loadGuardrailsConfig loads central ~/.AutoDev/config/guardrails.yaml when no project override", async () => {
  writeCentralGuardrails(
    [
      "hard_stops:",
      "  - id: central-only-rule",
      "    description: \"from central\"",
      "    enforcement: block_action",
      "soft_stops: []",
    ].join("\n"),
  );
  const { loadGuardrailsConfig } = await import("../index.js");
  const cfg = loadGuardrailsConfig(projectRoot);
  expect(cfg.hard_stops.some((r) => r.id === "central-only-rule")).toBe(true);
  expect(cfg.hard_stops[0]!.description).toBe("from central");
});

// --- Project override: both exist → project wins ----------------------------

test("loadGuardrailsConfig uses project .autodev/config/guardrails.yaml when both central and project exist", async () => {
  writeCentralGuardrails(
    [
      "hard_stops:",
      "  - id: central-rule",
      "    description: \"from central\"",
      "    enforcement: block_action",
      "soft_stops: []",
    ].join("\n"),
  );
  writeProjectGuardrails(
    [
      "hard_stops:",
      "  - id: project-rule",
      "    description: \"from project\"",
      "    enforcement: block_action",
      "soft_stops: []",
    ].join("\n"),
  );
  const { loadGuardrailsConfig } = await import("../index.js");
  const cfg = loadGuardrailsConfig(projectRoot);
  // Project wins — central rule must NOT be present (file-level override, no merge).
  expect(cfg.hard_stops.some((r) => r.id === "project-rule")).toBe(true);
  expect(cfg.hard_stops.some((r) => r.id === "central-rule")).toBe(false);
});

// --- No configs → hardcoded defaults ----------------------------------------

test("loadGuardrailsConfig returns hardcoded defaults when neither central nor project config exists", async () => {
  const { loadGuardrailsConfig, DEFAULT_GUARDRAILS_CONFIG } = await import("../index.js");
  const cfg = loadGuardrailsConfig(projectRoot);
  // Defaults must be non-empty and match the exported DEFAULT_GUARDRAILS_CONFIG.
  expect(cfg.hard_stops.length).toBeGreaterThan(0);
  expect(cfg).toEqual(DEFAULT_GUARDRAILS_CONFIG);
});

// --- Project-only (no central) → project loaded -----------------------------

test("loadGuardrailsConfig loads project config when central does not exist", async () => {
  writeProjectGuardrails(
    [
      "hard_stops:",
      "  - id: project-only-rule",
      "    description: \"project only\"",
      "    enforcement: block_action",
      "soft_stops: []",
    ].join("\n"),
  );
  const { loadGuardrailsConfig } = await import("../index.js");
  const cfg = loadGuardrailsConfig(projectRoot);
  expect(cfg.hard_stops.some((r) => r.id === "project-only-rule")).toBe(true);
});

// --- File-level override is NOT a deep merge --------------------------------

test("loadGuardrailsConfig project override replaces central entirely (no deep merge)", async () => {
  writeCentralGuardrails(
    [
      "hard_stops:",
      "  - id: central-hard",
      "    description: \"central hard\"",
      "    enforcement: block_action",
      "soft_stops:",
      "  - id: central-soft",
      "    description: \"central soft\"",
      "    enforcement: warn",
    ].join("\n"),
  );
  writeProjectGuardrails(
    [
      "hard_stops: []",
      "soft_stops:",
      "  - id: project-soft",
      "    description: \"project soft\"",
      "    enforcement: warn",
    ].join("\n"),
  );
  const { loadGuardrailsConfig } = await import("../index.js");
  const cfg = loadGuardrailsConfig(projectRoot);
  // Project override: central hard stop gone, central soft stop gone.
  expect(cfg.hard_stops.length).toBe(0);
  expect(cfg.soft_stops.some((r) => r.id === "project-soft")).toBe(true);
  expect(cfg.soft_stops.some((r) => r.id === "central-soft")).toBe(false);
});