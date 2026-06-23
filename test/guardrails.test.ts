/**
 * T7 guardrail engine tests.
 *
 * Drives `buildHandler()` directly with mock `tool_call` events — no real pi
 * session is spawned. Each test plants the preconditions (evidence files,
 * active-task.json, plans) in a temp project root and asserts the handler
 * returns the expected `{ block, reason }` or `{ warn }` outcome.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildHandler,
  loadGuardrailsConfig,
  containsSecrets,
  parseGuardrailsYaml,
  type GuardrailDeps,
} from "../extensions/autodev/guardrails/index.js";
import { evaluateExpression, type GuardrailContext } from "../extensions/autodev/guardrails/evaluator.js";

/** Build a mock bash tool_call event. */
function bashEvent(command: string, toolCallId = "tc1") {
  return {
    type: "tool_call" as const,
    toolName: "bash" as const,
    toolCallId,
    input: { command },
  };
}

/** Build a mock write tool_call event. */
function writeEvent(path: string, content: string, toolCallId = "tc1") {
  return {
    type: "tool_call" as const,
    toolName: "write" as const,
    toolCallId,
    input: { path, content },
  };
}

/** Build a mock edit tool_call event with multiple edits. */
function editEvent(path: string, edits: Array<{ oldText: string; newText: string }>, toolCallId = "tc1") {
  return {
    type: "tool_call" as const,
    toolName: "edit" as const,
    toolCallId,
    input: { path, edits },
  };
}

/** Build a mock review (custom) tool_call event. */
function reviewEvent(reviewer: string, implementer: string, toolCallId = "tc1") {
  return {
    type: "tool_call" as const,
    toolName: "review" as const,
    toolCallId,
    input: { reviewer, implementer },
  };
}

/** Build a mock todowrite (custom) tool_call event. */
function todowriteEvent(todos: Array<{ content: string; status: string }>, toolCallId = "tc1") {
  return {
    type: "tool_call" as const,
    toolName: "todowrite" as const,
    toolCallId,
    input: { todos },
  };
}

/** Temp project root + helpers per test. */
let root: string;

function setupRoot(): string {
  root = mkdtempSync(join(tmpdir(), "autodev-guardrails-"));
  // Minimal .autodev/config/guardrails.yaml so loadGuardrailsConfig finds rules.
  mkdirSync(join(root, ".autodev", "config"), { recursive: true });
  writeFileSync(
    join(root, ".autodev", "config", "guardrails.yaml"),
    [
      "hard_stops:",
      "  - id: never-deploy-directly",
      "    description: \"No direct deploy\"",
      "    enforcement: block_action",
      "  - id: no-secrets-in-code",
      "    description: \"No secrets in source\"",
      "    enforcement: block_commit",
      "  - id: one-task-at-a-time",
      "    description: \"One task at a time\"",
      "    enforcement: block_new_task",
      "  - id: evidence-or-it-didnt-happen",
      "    description: \"Evidence required\"",
      "    enforcement: block_commit",
      "  - id: follow-the-plan",
      "    description: \"Stick to the plan\"",
      "    enforcement: block_action",
      "  - id: ci-is-the-hard-gate",
      "    description: \"CI must be green\"",
      "    enforcement: block_merge",
      "  - id: never-approve-own-work",
      "    description: \"No self-review\"",
      "    enforcement: block_action",
      "  - id: never-modify-reference-docs",
      "    description: \"Reference docs immutable\"",
      "    enforcement: block_write",
      "  - id: never-modify-debate-transcripts",
      "    description: \"Debate transcripts immutable\"",
      "    enforcement: block_write",
      "soft_stops:",
      "  - id: suggest-review",
      "    description: \"Consider review\"",
      "    enforcement: warn",
      "  - id: warn-scope",
      "    description: \"Scope warning\"",
      "    enforcement: warn",
      "  - id: flag-missing-evidence",
      "    description: \"Missing evidence\"",
      "    enforcement: warn",
      "  - id: warn-no-premortem",
      "    description: \"No premortem\"",
      "    enforcement: warn",
      "  - id: suggest-debate",
      "    description: \"Consider debate\"",
      "    enforcement: warn",
      "capability_manifests: {}",
    ].join("\n"),
  );
  mkdirSync(join(root, ".omo", "evidence"), { recursive: true });
  mkdirSync(join(root, ".omo", "plans"), { recursive: true });
  return root;
}

function teardownRoot(): void {
  rmSync(root, { recursive: true, force: true });
}

function handlerWith(deps: GuardrailDeps = {}) {
  const config = loadGuardrailsConfig(root);
  const h = buildHandler(config, deps);
  return h;
}

beforeEach(setupRoot);
afterEach(teardownRoot);

// --- hard stop 1: no-secrets-in-code ----------------------------------------

test("write with sk-ant- API key is blocked with reason no-secrets-in-code", async () => {
  const h = handlerWith();
  const ev = writeEvent("src/config.ts", 'const key = "sk-ant-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz5678"');
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "no-secrets-in-code" });
});

test("write with ghp_ token is blocked with reason no-secrets-in-code", async () => {
  const h = handlerWith();
  const ev = writeEvent("src/config.ts", 'token = "ghp_' + "A".repeat(36) + '"');
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "no-secrets-in-code" });
});

test("write with PEM private key is blocked with reason no-secrets-in-code", async () => {
  const h = handlerWith();
  const ev = writeEvent("src/key.ts", "-----BEGIN RSA PRIVATE KEY-----\nMIIE...");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "no-secrets-in-code" });
});

test("write with JWT (eyJ...) is blocked with reason no-secrets-in-code", async () => {
  const h = handlerWith();
  const ev = writeEvent("src/jwt.ts", 'const jwt = "eyJ' + "A".repeat(20) + "." + "B".repeat(20) + "." + "C".repeat(20) + '"');
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "no-secrets-in-code" });
});

test("containsSecrets detects all canonical patterns", () => {
  expect(containsSecrets("sk-ant-" + "x".repeat(30))).toBe(true);
  expect(containsSecrets("sk-or-" + "x".repeat(30))).toBe(true);
  expect(containsSecrets("AIza" + "x".repeat(35))).toBe(true);
  expect(containsSecrets("ghp_" + "x".repeat(36))).toBe(true);
  expect(containsSecrets("github_pat_" + "x".repeat(82))).toBe(true);
  expect(containsSecrets("xoxb-1234567890-abcdef")).toBe(true);
  expect(containsSecrets("-----BEGIN PRIVATE KEY-----")).toBe(true);
  expect(containsSecrets("clean content with no secrets")).toBe(false);
});

// --- hard stop 2: evidence-or-it-didnt-happen -------------------------------

test("git commit with empty .omo/evidence is blocked with reason evidence-or-it-didnt-happen", async () => {
  const h = handlerWith();
  const ev = bashEvent("git commit -m 'feat: add thing'");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "evidence-or-it-didnt-happen" });
});

test("git commit after writing an evidence file is allowed", async () => {
  writeFileSync(join(root, ".omo", "evidence", "task-x.txt"), "verified");
  const h = handlerWith();
  const ev = bashEvent("git commit -m 'feat: add thing'");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

test("git commit after writing a .md evidence file is allowed", async () => {
  writeFileSync(join(root, ".omo", "evidence", "task-x.md"), "# Evidence\n");
  const h = handlerWith();
  const ev = bashEvent("git commit -m 'feat: add thing'");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

test("non-commit bash command is allowed even with empty evidence dir", async () => {
  const h = handlerWith();
  const ev = bashEvent("ls -la");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

// --- hard stop 3: ci-is-the-hard-gate ---------------------------------------

test("gh pr merge when CI is not green is blocked with reason ci-is-the-hard-gate", async () => {
  const deps: GuardrailDeps = {
    ciChecker: async () => Promise.resolve(false),
  };
  const h = handlerWith(deps);
  const ev = bashEvent("gh pr merge 42 --squash");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "ci-is-the-hard-gate" });
});

test("gh pr merge when CI is green is allowed", async () => {
  const deps: GuardrailDeps = {
    ciChecker: async () => Promise.resolve(true),
  };
  const h = handlerWith(deps);
  const ev = bashEvent("gh pr merge 42 --squash");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

// --- hard stop 4: one-task-at-a-time ----------------------------------------

test("todowrite in_progress when another task is active is blocked with reason one-task-at-a-time", async () => {
  // Seed an active task.
  mkdirSync(join(root, ".autodev"), { recursive: true });
  writeFileSync(
    join(root, ".autodev", "active-task.json"),
    JSON.stringify({ task_id: "task-A", started_at: "2026-01-01T00:00:00Z" }),
  );
  const h = handlerWith();
  const ev = todowriteEvent([{ content: "task-B", status: "in_progress" }]);
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "one-task-at-a-time" });
});

test("todowrite in_progress when no task is active is allowed and records the task", async () => {
  const h = handlerWith();
  const ev = todowriteEvent([{ content: "task-A", status: "in_progress" }]);
  const result = await h(ev, root);
  expect(result).toBeUndefined();
  expect(existsSync(join(root, ".autodev", "active-task.json"))).toBe(true);
});

test("todowrite completing the active task clears active-task.json", async () => {
  mkdirSync(join(root, ".autodev"), { recursive: true });
  writeFileSync(
    join(root, ".autodev", "active-task.json"),
    JSON.stringify({ task_id: "task-A", started_at: "2026-01-01T00:00:00Z" }),
  );
  const h = handlerWith();
  const ev = todowriteEvent([{ content: "task-A", status: "completed" }]);
  const result = await h(ev, root);
  expect(result).toBeUndefined();
  expect(existsSync(join(root, ".autodev", "active-task.json"))).toBe(false);
});

test("completing a non-active todo does NOT clear the active task", async () => {
  mkdirSync(join(root, ".autodev"), { recursive: true });
  writeFileSync(
    join(root, ".autodev", "active-task.json"),
    JSON.stringify({ task_id: "task-A", started_at: "2026-01-01T00:00:00Z" }),
  );
  const h = handlerWith();
  // task-B completed (not task-A) — no in_progress to trigger the block branch.
  const ev = todowriteEvent([{ content: "task-B", status: "completed" }]);
  const result = await h(ev, root);
  expect(result).toBeUndefined();
  // active-task.json must still be present because task-A was not completed.
  expect(existsSync(join(root, ".autodev", "active-task.json"))).toBe(true);
});

test("completing the active todo alongside another todo clears active-task.json", async () => {
  mkdirSync(join(root, ".autodev"), { recursive: true });
  writeFileSync(
    join(root, ".autodev", "active-task.json"),
    JSON.stringify({ task_id: "task-A", started_at: "2026-01-01T00:00:00Z" }),
  );
  const h = handlerWith();
  const ev = todowriteEvent([
    { content: "task-A", status: "completed" },
    { content: "task-B", status: "completed" },
  ]);
  const result = await h(ev, root);
  expect(result).toBeUndefined();
  expect(existsSync(join(root, ".autodev", "active-task.json"))).toBe(false);
});

test("completing only a non-active todo (with active task present) preserves active-task.json", async () => {
  mkdirSync(join(root, ".autodev"), { recursive: true });
  writeFileSync(
    join(root, ".autodev", "active-task.json"),
    JSON.stringify({ task_id: "task-A", started_at: "2026-01-01T00:00:00Z" }),
  );
  const h = handlerWith();
  const ev = todowriteEvent([
    { content: "task-B", status: "completed" },
    { content: "task-C", status: "completed" },
  ]);
  const result = await h(ev, root);
  expect(result).toBeUndefined();
  expect(existsSync(join(root, ".autodev", "active-task.json"))).toBe(true);
});

// --- hard stop 5: follow-the-plan -------------------------------------------

test("write to a file NOT in the active plan is blocked with reason follow-the-plan", async () => {
  // Plant a plan that mentions src/foo.ts but not src/bar.ts.
  writeFileSync(
    join(root, ".omo", "plans", "task-1.md"),
    "# Plan\n\nImplement in `src/foo.ts`.\n",
  );
  const h = handlerWith();
  const ev = writeEvent("src/bar.ts", "export const x = 1;");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "follow-the-plan" });
});

test("write to a file mentioned in the active plan is allowed", async () => {
  writeFileSync(
    join(root, ".omo", "plans", "task-1.md"),
    "# Plan\n\nImplement in `src/foo.ts`.\n",
  );
  const h = handlerWith();
  const ev = writeEvent("src/foo.ts", "export const x = 1;");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

test("write is allowed when no plan exists (nothing to deviate from)", async () => {
  // Remove the (empty) plans dir so collectPlannedPaths returns [].
  rmSync(join(root, ".omo", "plans"), { recursive: true, force: true });
  const h = handlerWith();
  const ev = writeEvent("src/anything.ts", "export const x = 1;");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

// --- hard stop 6: never-deploy-directly --------------------------------------

test("bash with 'deploy' keyword is blocked with reason never-deploy-directly", async () => {
  const h = handlerWith();
  const ev = bashEvent("npm run deploy");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "never-deploy-directly" });
});

test("bash with kubectl apply is blocked with reason never-deploy-directly", async () => {
  const h = handlerWith();
  const ev = bashEvent("kubectl apply -f deployment.yaml");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "never-deploy-directly" });
});

// --- additional hard stops from YAML ---------------------------------------

test("write to .autodev/reference/ is blocked with reason never-modify-reference-docs", async () => {
  const h = handlerWith();
  const ev = writeEvent(".autodev/reference/architecture.md", "# Architecture\n");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "never-modify-reference-docs" });
});

test("write to .autodev/debates/ is blocked with reason never-modify-debate-transcripts", async () => {
  const h = handlerWith();
  const ev = writeEvent(".autodev/debates/debate-1.md", "# Debate\n");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "never-modify-debate-transcripts" });
});

test("review tool call where reviewer == implementer is blocked with reason never-approve-own-work", async () => {
  const h = handlerWith();
  const ev = reviewEvent("ned_land", "ned_land");
  const result = await h(ev, root);
  expect(result).toEqual({ block: true, reason: "never-approve-own-work" });
});

// --- soft stops -------------------------------------------------------------

test("edit with >10 edits emits a warn-scope warning (not a block)", async () => {
  const h = handlerWith();
  const edits = Array.from({ length: 11 }, (_, i) => ({ oldText: `old${i}`, newText: `new${i}` }));
  const ev = editEvent("src/foo.ts", edits);
  const result = await h(ev, root);
  expect(result).toBeDefined();
  expect("warn" in (result as object)).toBe(true);
  expect((result as { warn: string }).warn).toContain("warn-scope");
});

test("review tool call with no evidence file emits a flag-missing-evidence warning", async () => {
  const h = handlerWith();
  const ev = reviewEvent("oracle", "ned_land");
  const result = await h(ev, root);
  expect(result).toBeDefined();
  expect("warn" in (result as object)).toBe(true);
  expect((result as { warn: string }).warn).toContain("flag-missing-evidence");
});

test("write larger than 2000 chars emits a suggest-review warning", async () => {
  const h = handlerWith();
  // Plant a plan that mentions the target file so follow-the-plan doesn't fire.
  writeFileSync(
    join(root, ".omo", "plans", "task-1.md"),
    "# Plan\n\nImplement in `src/big.ts`.\n",
  );
  const ev = writeEvent("src/big.ts", "x".repeat(2500));
  const result = await h(ev, root);
  expect(result).toBeDefined();
  expect("warn" in (result as object)).toBe(true);
  expect((result as { warn: string }).warn).toContain("suggest-review");
});

// --- compliant action -------------------------------------------------------

test("normal write with no secrets, plan present, in-scope path is allowed", async () => {
  writeFileSync(
    join(root, ".omo", "plans", "task-1.md"),
    "# Plan\n\nImplement in `src/foo.ts`.\n",
  );
  const h = handlerWith();
  const ev = writeEvent("src/foo.ts", "export const x = 1;");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

test("normal bash command is allowed", async () => {
  const h = handlerWith();
  const ev = bashEvent("bun test");
  const result = await h(ev, root);
  expect(result).toBeUndefined();
});

// --- YAML parser ------------------------------------------------------------

test("parseGuardrailsYaml extracts hard and soft stop ids", () => {
  const yaml = [
    "hard_stops:",
    "  - id: never-deploy-directly",
    "    description: \"No direct deploy\"",
    "    enforcement: block_action",
    "  - id: no-secrets-in-code",
    "    description: \"No secrets\"",
    "    enforcement: block_commit",
    "soft_stops:",
    "  - id: warn-scope",
    "    description: \"Scope warning\"",
    "    enforcement: warn",
    "capability_manifests: {}",
  ].join("\n");
  const cfg = parseGuardrailsYaml(yaml);
  expect(cfg.hard_stops.map((r) => r.id)).toEqual(["never-deploy-directly", "no-secrets-in-code"]);
  expect(cfg.soft_stops.map((r) => r.id)).toEqual(["warn-scope"]);
  expect(cfg.soft_stops[0]?.enforcement).toBe("warn");
});

test("loadGuardrailsConfig reads from .autodev/config/guardrails.yaml", () => {
  const cfg = loadGuardrailsConfig(root);
  expect(cfg.hard_stops.length).toBe(9);
  expect(cfg.soft_stops.length).toBe(5);
  expect(cfg.hard_stops.some((r) => r.id === "no-secrets-in-code")).toBe(true);
});

// --- expression evaluator (M3) ------------------------------------------------

test("evaluateExpression: action_type == 'deploy' matches deploy action_type", () => {
  expect(evaluateExpression("action_type == 'deploy'", { action_type: "deploy" })).toBe(true);
});

test("evaluateExpression: action_type == 'deploy' is false for write action_type", () => {
  expect(evaluateExpression("action_type == 'deploy'", { action_type: "write" })).toBe(false);
});

test("evaluateExpression: AND with != is true when agent differs", () => {
  expect(
    evaluateExpression("action_type == 'deploy' AND agent != 'navigator'", {
      action_type: "deploy",
      agent: "nemo",
    }),
  ).toBe(true);
});

test("evaluateExpression: AND with != is false when agent is navigator", () => {
  expect(
    evaluateExpression("action_type == 'deploy' AND agent != 'navigator'", {
      action_type: "deploy",
      agent: "navigator",
    }),
  ).toBe(false);
});

test("evaluateExpression: contains_secrets(diff) is true for an API key", () => {
  expect(evaluateExpression("contains_secrets(diff)", { diff: "sk-ant-abc123def456ghi789jkl012mno345pqr678" })).toBe(true);
});

test("evaluateExpression: contains_secrets(diff) is false for clean code", () => {
  expect(evaluateExpression("contains_secrets(diff)", { diff: "normal code" })).toBe(false);
});

test("evaluateExpression: active_tasks > 1 is true when active_tasks is 2", () => {
  expect(evaluateExpression("active_tasks > 1", { active_tasks: 2 })).toBe(true);
});

test("evaluateExpression: active_tasks > 1 is false when active_tasks is 1", () => {
  expect(evaluateExpression("active_tasks > 1", { active_tasks: 1 })).toBe(false);
});

test("evaluateExpression: NOT evidence_exists is true when evidence_exists is false", () => {
  expect(evaluateExpression("NOT evidence_exists", { evidence_exists: false })).toBe(true);
});

test("evaluateExpression: NOT evidence_exists is false when evidence_exists is true", () => {
  expect(evaluateExpression("NOT evidence_exists", { evidence_exists: true })).toBe(false);
});

test("evaluateExpression: OR returns true when either side is true", () => {
  expect(
    evaluateExpression("action_type == 'deploy' OR action_type == 'merge'", { action_type: "merge" }),
  ).toBe(true);
});

test("evaluateExpression: OR returns false when neither side is true", () => {
  expect(
    evaluateExpression("action_type == 'deploy' OR action_type == 'merge'", { action_type: "write" }),
  ).toBe(false);
});

test("evaluateExpression: path_starts_with(path, '.autodev/reference/') matches reference path", () => {
  expect(
    evaluateExpression("path_starts_with(path, '.autodev/reference/')", {
      path: ".autodev/reference/architecture.md",
    }),
  ).toBe(true);
});

test("evaluateExpression: path_starts_with(path, '.autodev/reference/') is false for other paths", () => {
  expect(
    evaluateExpression("path_starts_with(path, '.autodev/reference/')", { path: "src/foo.ts" }),
  ).toBe(false);
});

test("evaluateExpression: empty expression returns false", () => {
  expect(evaluateExpression("", {} as GuardrailContext)).toBe(false);
  expect(evaluateExpression("   ", {} as GuardrailContext)).toBe(false);
});

test("evaluateExpression: ci_status != 'green' is true when ci_status is red", () => {
  expect(evaluateExpression("ci_status != 'green'", { ci_status: "red" })).toBe(true);
});

test("evaluateExpression: ci_status != 'green' is false when ci_status is green", () => {
  expect(evaluateExpression("ci_status != 'green'", { ci_status: "green" })).toBe(false);
});