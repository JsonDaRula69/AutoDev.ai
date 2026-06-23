/**
 * Guardrails module — hard-stop enforcement engine.
 *
 * Enforces AutoDev's hard stops by inspecting every pi `tool_call` event
 * and returning `{ block: true, reason }` when a rule is violated, or
 * emitting a soft-stop warning via `ctx.ui.notify(..., "warning")` for
 * non-blocking rules. Rule definitions are loaded from
 * `.autodev/config/guardrails.yaml` at registration time — the handler
 * never hardcodes rule IDs.
 *
 * Hard stops (block):
 *  - never-deploy-directly
 *  - no-secrets-in-code
 *  - one-task-at-a-time
 *  - evidence-or-it-didnt-happen
 *  - follow-the-plan
 *  - ci-is-the-hard-gate
 *  - never-approve-own-work      (kept for parity with YAML; enforced on review tool calls)
 *  - never-modify-reference-docs
 *  - never-modify-debate-transcripts
 *
 * Soft stops (warn):
 *  - suggest-review
 *  - warn-scope
 *  - flag-missing-evidence
 *  - warn-no-premortem
 *  - suggest-debate
 */
import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";

/** Rule enforcement outcome for a hard stop. */
export interface BlockResult {
  readonly block: true;
  readonly reason: string;
}

/** Rule enforcement outcome for a soft stop. */
export interface WarnResult {
  readonly warn: string;
}

/** Allow outcome — no rule was violated. */
export type AllowResult = undefined;

/** The full result returned from a single rule evaluation. */
export type RuleResult = BlockResult | WarnResult | AllowResult;

/** A loaded hard-stop rule from guardrails.yaml. */
export interface HardStopRule {
  readonly id: string;
  readonly description: string;
  readonly enforcement: string;
}

/** A loaded soft-stop rule from guardrails.yaml. */
export interface SoftStopRule {
  readonly id: string;
  readonly description: string;
  readonly enforcement: "warn";
}

/** Parsed guardrails.yaml shape. */
export interface GuardrailsConfig {
  readonly hard_stops: readonly HardStopRule[];
  readonly soft_stops: readonly SoftStopRule[];
}

/** Active-task state file shape. */
interface ActiveTask {
  readonly task_id: string;
  readonly started_at: string;
}

/** Where active-task.json lives (AutoDev writes/reads this). */
const ACTIVE_TASK_PATH = ".autodev/active-task.json";

/** Canonical evidence directory — per ARCHITECTURE.md §6. */
const EVIDENCE_DIR = ".omo/evidence";

/** Canonical plans directory — per ARCHITECTURE.md §6. */
const PLANS_DIR = ".omo/plans";

/** Reference docs directory (immutable). */
const REFERENCE_DIR = ".autodev/reference";

/** Debate transcripts directory (immutable after verdict). */
const DEBATES_DIR = ".autodev/debates";

/** Secret regex patterns for no-secrets-in-code. */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, // Anthropic API key
  /sk-or-[A-Za-z0-9_-]{20,}/, // OpenRouter API key
  /AIza[0-9A-Za-z_-]{35,}/, // Google API key
  /ghp_[A-Za-z0-9]{36,}/, // GitHub PAT (classic)
  /github_pat_[A-Za-z0-9_]{82,}/, // GitHub PAT (fine-grained)
  /xox[baprs]-[A-Za-z0-9-]{10,}/, // Slack token
  /-----BEGIN[A-Z ]*PRIVATE KEY-----/, // PEM private key
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT (header.payload.sig)
];

/**
 * Minimal YAML loader for guardrails.yaml.
 *
 * The guardrails config is a flat two-section file (hard_stops, soft_stops)
 * with per-item `id`, `description`, `check`, `enforcement`, and
 * `applies_to`. We only need the `id` and `enforcement` fields — the `check`
 * expressions are implemented directly in the handler. A full YAML parser is
 * not a dependency of this repo; this focused parser reads exactly the shape
 * guardrails.yaml uses and nothing more.
 */
export function parseGuardrailsYaml(text: string): GuardrailsConfig {
  const hardStops: HardStopRule[] = [];
  const softStops: SoftStopRule[] = [];
  let section: "hard" | "soft" | null = null;
  let current: { id?: string; description?: string; enforcement?: string } | null = null;

  const flush = (): void => {
    if (current === null) return;
    if (current.id !== undefined) {
      const rule = {
        id: current.id,
        description: current.description ?? "",
        enforcement: current.enforcement ?? "",
      };
      if (section === "hard") {
        hardStops.push(rule);
      } else if (section === "soft") {
        softStops.push({ ...rule, enforcement: "warn" });
      }
    }
    current = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    // Top-level section headers.
    if (/^hard_stops:\s*$/.test(line)) {
      flush();
      section = "hard";
      continue;
    }
    if (/^soft_stops:\s*$/.test(line)) {
      flush();
      section = "soft";
      continue;
    }
    if (/^capability_manifests:\s*$/.test(line)) {
      flush();
      section = null;
      continue;
    }

    // New list item under a section: "  - id: foo".
    const itemMatch = /^(\s*)-\s+id:\s*(\S+)\s*$/.exec(line);
    if (itemMatch !== null && section !== null) {
      flush();
      current = { id: itemMatch[2] ?? "" };
      continue;
    }

    // Continuation fields of the current item.
    if (current !== null) {
      const descMatch = /^\s+description:\s*"?(.*)?"?\s*$/.exec(line);
      if (descMatch !== null && descMatch[1] !== undefined) {
        current.description = descMatch[1];
        continue;
      }
      const enfMatch = /^\s+enforcement:\s*(\S+)\s*$/.exec(line);
      if (enfMatch !== null && enfMatch[1] !== undefined) {
        current.enforcement = enfMatch[1];
        continue;
      }
    }
  }
  flush();

  return { hard_stops: hardStops, soft_stops: softStops };
}

/** Load guardrails.yaml from the project root. Returns empty config if missing. */
export function loadGuardrailsConfig(projectRoot: string): GuardrailsConfig {
  const path = resolve(projectRoot, ".autodev/config/guardrails.yaml");
  if (!existsSync(path)) {
    return { hard_stops: [], soft_stops: [] };
  }
  const text = readFileSync(path, "utf8");
  return parseGuardrailsYaml(text);
}

/** Read active-task.json if it exists. */
function readActiveTask(projectRoot: string): ActiveTask | undefined {
  const path = resolve(projectRoot, ACTIVE_TASK_PATH);
  if (!existsSync(path)) return undefined;
  try {
    const data = readFileSync(path, "utf8");
    const parsed = JSON.parse(data) as ActiveTask;
    if (typeof parsed.task_id !== "string") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Write active-task.json. */
function writeActiveTask(projectRoot: string, task: ActiveTask): void {
  const dir = resolve(projectRoot, ".autodev");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "active-task.json"), JSON.stringify(task, null, 2));
}

/** Delete active-task.json (on task completion). */
function clearActiveTask(projectRoot: string): void {
  const path = resolve(projectRoot, ACTIVE_TASK_PATH);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore — best-effort cleanup */
    }
  }
}

/** Check if `.omo/evidence/` contains any `.md` or `.txt` files. */
export function evidenceExists(projectRoot: string): boolean {
  const dir = resolve(projectRoot, EVIDENCE_DIR);
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir);
    return entries.some((n) => n.endsWith(".md") || n.endsWith(".txt"));
  } catch {
    return false;
  }
}

/** Read the content of a write or edit tool call for secret scanning. */
function extractWrittenText(event: ToolCallEvent): string {
  if (event.toolName === "write") {
    const input = event.input as { content?: string };
    return typeof input.content === "string" ? input.content : "";
  }
  if (event.toolName === "edit") {
    const input = event.input as { edits?: Array<{ newText?: string }> };
    if (Array.isArray(input.edits)) {
      return input.edits.map((e) => e?.newText ?? "").join("\n");
    }
  }
  return "";
}

/** Extract the target file path from a write/edit/read/grep tool call. */
function extractTargetPath(event: ToolCallEvent): string | undefined {
  const input = event.input as { path?: string };
  return typeof input.path === "string" ? input.path : undefined;
}

/** Extract the bash command string from a bash tool call. */
function extractCommand(event: ToolCallEvent): string | undefined {
  if (event.toolName !== "bash") return undefined;
  const input = event.input as { command?: string };
  return typeof input.command === "string" ? input.command : undefined;
}

/** Test whether a string contains a known secret pattern. */
export function containsSecrets(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/** Test whether a bash command performs a deploy-like action. */
function isDeployAction(command: string): boolean {
  // Any explicit deploy tool name or "deploy" keyword in the command.
  if (/\bdeploy\b/i.test(command)) return true;
  // kubectl/terraform apply are deploy-equivalent.
  if (/\b(kubectl|terraform|helm)\s+apply\b/.test(command)) return true;
  return false;
}

/** Test whether a bash command runs `git commit`. */
function isGitCommit(command: string): boolean {
  return /\bgit\s+commit\b/.test(command);
}

/** Test whether a bash command runs `gh pr merge`. */
function isGhPrMerge(command: string): boolean {
  return /\bgh\s+pr\s+merge\b/.test(command);
}

/**
 * Check CI status for a PR. In production this shells out to `gh pr checks`;
 * in tests it can be overridden via the `ciChecker` parameter.
 */
export type CiChecker = (command: string, projectRoot: string) => Promise<boolean>;

/** Default CI checker: runs `gh pr checks <args>` and treats non-zero exit as "not green". */
const defaultCiChecker: CiChecker = async (_command: string, _projectRoot: string): Promise<boolean> => {
  // Best-effort: parse the PR number from the merge command.
  const match = /\bgh\s+pr\s+merge\s+(?:--\S+\s+)*(\d+)\b/.exec(_command);
  if (match === null || match[1] === undefined) return false;
  try {
    const proc = Bun.spawn(["gh", "pr", "checks", match[1], "--required"], {
      cwd: _projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
};

/** Read all plan files from `.omo/plans/` and collect their file paths. */
function collectPlannedPaths(projectRoot: string): readonly string[] {
  const dir = resolve(projectRoot, PLANS_DIR);
  if (!existsSync(dir)) return [];
  const paths: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const full = join(dir, name);
      const text = readFileSync(full, "utf8");
      // Collect backtick-quoted file paths and bare relative paths in lists.
      const codePathRegex = /`((?:[A-Za-z0-9_.\-]+\/)+[A-Za-z0-9_.\-]+)`/g;
      let m: RegExpExecArray | null;
      while ((m = codePathRegex.exec(text)) !== null) {
        if (m[1] !== undefined) paths.push(m[1]);
      }
    }
  } catch {
    return [];
  }
  return paths;
}

/** Test whether a target path is mentioned in any active plan. */
export function isPathInPlan(targetPath: string, projectRoot: string): boolean {
  const planned = collectPlannedPaths(projectRoot);
  if (planned.length === 0) return true; // No plan → nothing to deviate from.
  // Normalize: compare basenames and suffixes to be lenient.
  const normalized = targetPath.replace(/^\.?\//, "");
  return planned.some((p) => p === normalized || p.endsWith(normalized) || normalized.endsWith(p));
}

/** Check whether a path is under `.autodev/reference/`. */
function isReferenceDoc(path: string): boolean {
  const normalized = path.replace(/^\.?\//, "");
  return normalized.startsWith(REFERENCE_DIR + "/") || normalized === REFERENCE_DIR;
}

/** Check whether a path is under `.autodev/debates/`. */
function isDebateTranscript(path: string): boolean {
  const normalized = path.replace(/^\.?\//, "");
  return normalized.startsWith(DEBATES_DIR + "/") || normalized === DEBATES_DIR;
}

/** A hook the host (or tests) can inject to override CI checking. */
export interface GuardrailDeps {
  readonly ciChecker?: CiChecker;
  /** Track how many files have been changed in the current turn (for warn-scope). */
  readonly filesChangedCount?: () => number;
  /** Override the project root (tests use a temp dir). */
  readonly projectRoot?: string;
}

/** The shared handler created by `register()`. Exported for direct testing. */
export interface GuardrailHandler {
  (event: ToolCallEvent, projectRoot: string): Promise<RuleResult>;
}

/**
 * Build the guardrail evaluation handler from a loaded config and deps.
 *
 * Tests import this directly to drive the logic with fake events and a temp
 * project root, avoiding the need to spawn a real pi session.
 */
export function buildHandler(config: GuardrailsConfig, deps: GuardrailDeps = {}): GuardrailHandler {
  const hardStopIds = new Set(config.hard_stops.map((r) => r.id));
  const softStopIds = new Set(config.soft_stops.map((r) => r.id));
  const ciChecker = deps.ciChecker ?? defaultCiChecker;

  return async (event: ToolCallEvent, projectRoot: string): Promise<RuleResult> => {
    const root = deps.projectRoot ?? projectRoot;

    // --- HARD STOPS -----------------------------------------------------

    // never-deploy-directly: block bash deploy-like commands.
    if (hardStopIds.has("never-deploy-directly") && event.toolName === "bash") {
      const cmd = extractCommand(event);
      if (cmd !== undefined && isDeployAction(cmd)) {
        return { block: true, reason: "never-deploy-directly" };
      }
    }

    // no-secrets-in-code: block write/edit containing secrets.
    if (hardStopIds.has("no-secrets-in-code") && (event.toolName === "write" || event.toolName === "edit")) {
      const text = extractWrittenText(event);
      if (containsSecrets(text)) {
        return { block: true, reason: "no-secrets-in-code" };
      }
    }

    // evidence-or-it-didnt-happen: block `git commit` when no evidence file.
    if (hardStopIds.has("evidence-or-it-didnt-happen") && event.toolName === "bash") {
      const cmd = extractCommand(event);
      if (cmd !== undefined && isGitCommit(cmd)) {
        if (!evidenceExists(root)) {
          return { block: true, reason: "evidence-or-it-didnt-happen" };
        }
      }
    }

    // one-task-at-a-time: block todowrite in_progress when a different task is active.
    if (hardStopIds.has("one-task-at-a-time") && event.toolName === "todowrite") {
      const input = event.input as { todos?: Array<{ content?: string; status?: string }> };
      const todos = Array.isArray(input.todos) ? input.todos : [];
      const firstInProgress = todos.find((t) => t?.status === "in_progress");
      if (firstInProgress !== undefined) {
        const active = readActiveTask(root);
        if (active !== undefined) {
          // Completing the active task is allowed (clears state below).
          const completesActive = todos.some(
            (t) => t?.status === "completed" && t.content === active.task_id,
          );
          if (!completesActive) {
            return { block: true, reason: "one-task-at-a-time" };
          }
        }
      }
      // On completion of the active task, clear the state file.
      const completesAny = todos.some((t) => t?.status === "completed");
      if (completesAny && readActiveTask(root) !== undefined) {
        clearActiveTask(root);
      }
      // On first in_progress with no active task, record it.
      if (firstInProgress !== undefined && readActiveTask(root) === undefined) {
        const taskId = firstInProgress.content ?? "task";
        writeActiveTask(root, { task_id: taskId, started_at: new Date().toISOString() });
      }
    }

    // follow-the-plan: block write/edit to paths not in the active plan.
    if (hardStopIds.has("follow-the-plan") && (event.toolName === "write" || event.toolName === "edit")) {
      const target = extractTargetPath(event);
      if (target !== undefined && !isPathInPlan(target, root)) {
        return { block: true, reason: "follow-the-plan" };
      }
    }

    // ci-is-the-hard-gate: block `gh pr merge` when CI is not green.
    if (hardStopIds.has("ci-is-the-hard-gate") && event.toolName === "bash") {
      const cmd = extractCommand(event);
      if (cmd !== undefined && isGhPrMerge(cmd)) {
        const green = await ciChecker(cmd, root);
        if (!green) {
          return { block: true, reason: "ci-is-the-hard-gate" };
        }
      }
    }

    // never-approve-own-work: kept for parity with YAML — enforced on review tool calls.
    if (hardStopIds.has("never-approve-own-work") && event.toolName === "review") {
      const input = event.input as { reviewer?: string; implementer?: string };
      if (
        typeof input.reviewer === "string" &&
        typeof input.implementer === "string" &&
        input.reviewer === input.implementer
      ) {
        return { block: true, reason: "never-approve-own-work" };
      }
    }

    // never-modify-reference-docs: block writes under .autodev/reference/.
    if (hardStopIds.has("never-modify-reference-docs") && (event.toolName === "write" || event.toolName === "edit")) {
      const target = extractTargetPath(event);
      if (target !== undefined && isReferenceDoc(target)) {
        return { block: true, reason: "never-modify-reference-docs" };
      }
    }

    // never-modify-debate-transcripts: block writes under .autodev/debates/.
    if (
      hardStopIds.has("never-modify-debate-transcripts") &&
      (event.toolName === "write" || event.toolName === "edit")
    ) {
      const target = extractTargetPath(event);
      if (target !== undefined && isDebateTranscript(target)) {
        return { block: true, reason: "never-modify-debate-transcripts" };
      }
    }

    // --- SOFT STOPS -----------------------------------------------------

    // warn-scope: warn when a single tool call touches >10 files (edit with >10 edits).
    if (softStopIds.has("warn-scope") && event.toolName === "edit") {
      const input = event.input as { edits?: unknown[] };
      const count = Array.isArray(input.edits) ? input.edits.length : 0;
      if (count > 10) {
        return { warn: "warn-scope: this change affects more than 10 files. Consider breaking it up." };
      }
    }

    // flag-missing-evidence: warn on review tool calls with no evidence file.
    if (softStopIds.has("flag-missing-evidence") && event.toolName === "review") {
      if (!evidenceExists(root)) {
        return { warn: "flag-missing-evidence: no evidence file found for this change." };
      }
    }

    // suggest-review: warn on large writes without review (heuristic: >2000 chars).
    if (softStopIds.has("suggest-review") && event.toolName === "write") {
      const text = extractWrittenText(event);
      if (text.length > 2000) {
        return { warn: "suggest-review: large change without an explicit review request." };
      }
    }

    return undefined;
  };
}

/** Register the guardrail engine on the pi runtime. */
export function register(pi: ExtensionAPI): void {
  // Load rule definitions once at registration time. The handler closure
  // captures the config; the event handler reads `ctx.cwd` for the project root.
  const config = loadGuardrailsConfig(process.cwd());
  const handler = buildHandler(config);

  pi.on("tool_call", async (event, ctx) => {
    const result = await handler(event, ctx.cwd);
    if (result === undefined) return undefined;
    if ("block" in result && result.block) {
      ctx.ui.notify(`Guardrail BLOCKED: ${result.reason}`, "error");
      return { block: true, reason: result.reason };
    }
    if ("warn" in result) {
      ctx.ui.notify(result.warn, "warning");
      return undefined; // soft stops never block
    }
    return undefined;
  });
}