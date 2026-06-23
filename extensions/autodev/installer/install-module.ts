/**
 * Install module — dependency-injectable install fixes for AutoDev.
 *
 * Runs the non-interactive "install" lifecycle: external tool installation,
 * `.pi/` config file download, Magic Context setup (conditional), and Magic
 * Context doctor check (warning-only). Completion is recorded in the
 * `"install"` state scope so re-runs skip finished work.
 *
 * This module never interacts with the user, writes credentials, or performs
 * GitHub authentication. It is safe to run in CI and non-interactive contexts.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { installMissingTools, type Platform } from "./tools.js";
import { validateAndCreateConfig } from "./config-defaults.js";
import { markStepCompleted, isStepCompleted } from "./state.js";

// ---- Types ----

export interface InstallFixResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface InstallModuleDeps {
  readonly projectRoot: string;
  /** Notify the user (maps to ctx.ui.notify in production). */
  readonly notify: (message: string, level: "info" | "warning" | "error") => void;
  /** Platform override (defaults to detected platform). */
  readonly platform?: Platform;
  /** Override for execSync (injectable for tests). */
  readonly execSyncOverride?: (command: string, options?: ExecSyncOptions) => Buffer;
  /** Override for global `fetch` used by config file downloads. */
  readonly fetchOverride?: typeof fetch;
  /** If true, completed steps are skipped. Defaults to true. */
  readonly skipCompleted?: boolean;
}

// ---- Constants (mirror steps.ts so this module is standalone) ----

const MC_SETUP_CMD = "bunx @cortexkit/magic-context@latest setup --harness pi";
const MC_SETUP_TIMEOUT_MS = 120_000;
const MC_DOCTOR_CMD = "bunx @cortexkit/magic-context@latest doctor";
const MC_DOCTOR_TIMEOUT_MS = 30_000;

/** Step 0 — external tools (gh + git, bun check is harmless and included). */
const STEP_TOOLS = 0;
/** Step 3 — `.pi/` config files + Magic Context setup. Marked only after both succeed. */
const STEP_CONFIG_AND_MC = 3;

// ---- Public API ----

/**
 * Run all install fixes sequentially and return a result per phase.
 *
 * Phases:
 *   1. Install `gh` if missing (via `installMissingTools`).
 *   2. Install `git` if missing (via `installMissingTools`).
 *   3. Download `.pi/` config files via `validateAndCreateConfig`.
 *   4. Run Magic Context setup — ONLY if `.pi/magic-context.jsonc` does not
 *      already declare `harness: "pi"`.
 *   5. Run Magic Context doctor as a warning check (non-fatal).
 *
 * State is recorded in the `"install"` scope: step 0 after tools, step 3 after
 * config files AND Magic Context setup both succeed.
 */
export async function runInstallFixes(deps: InstallModuleDeps): Promise<InstallFixResult[]> {
  const results: InstallFixResult[] = [];
  const { projectRoot, notify } = deps;
  const skipCompleted = deps.skipCompleted ?? true;

  // ---- Phase 1+2: External tools (gh + git) ----
  const toolsResult = await runToolsPhase(deps, skipCompleted);
  results.push(toolsResult);

  // ---- Phase 3: .pi/ config files ----
  const configResult = await runConfigFilesPhase(deps);
  results.push(configResult);
  const configOk = configResult.ok;

  // ---- Phase 4: Magic Context setup (conditional) ----
  const mcSetupResult = await runMagicContextSetupPhase(deps, configOk, skipCompleted);
  results.push(mcSetupResult);
  const mcSetupOk = mcSetupResult.ok;

  // Step 3 is only marked complete when BOTH config files AND MC setup succeed.
  if (configOk && mcSetupOk) {
    await markStepCompleted(projectRoot, STEP_CONFIG_AND_MC, "install");
  }

  // ---- Phase 5: Magic Context doctor (warning-only, never fatal) ----
  const mcDoctorResult = await runMagicContextDoctorPhase(deps);
  results.push(mcDoctorResult);

  return results;
}

// ---- Phase implementations ----

async function runToolsPhase(
  deps: InstallModuleDeps,
  skipCompleted: boolean,
): Promise<InstallFixResult> {
  const { projectRoot, notify, platform, execSyncOverride } = deps;

  if (skipCompleted && await isStepCompleted(projectRoot, STEP_TOOLS, "install")) {
    return { name: "tools", ok: true, detail: "Already completed (step 0)." };
  }

  notify("Checking and installing external tools (gh, git, bun)...", "info");
  const toolResults = installMissingTools(
    notify,
    platform,
    execSyncOverride as never,
  );
  const failed = toolResults.filter((r) => !r.installed);

  await markStepCompleted(projectRoot, STEP_TOOLS, "install");

  if (failed.length === 0) {
    const installed = toolResults.filter((r) => r.installed);
    return {
      name: "tools",
      ok: true,
      detail: installed.length > 0
        ? `Installed: ${installed.map((r) => r.tool).join(", ")}`
        : "All external tools already present.",
    };
  }

  return {
    name: "tools",
    ok: false,
    detail: `Failed to install: ${failed.map((r) => r.tool).join(", ")}. ${failed[0]?.message ?? ""}`,
  };
}

async function runConfigFilesPhase(deps: InstallModuleDeps): Promise<InstallFixResult> {
  const { projectRoot, notify, fetchOverride } = deps;
  notify("Downloading .pi/ config files if missing...", "info");
  const configResults = await validateAndCreateConfig(projectRoot, fetchOverride);
  const failed = configResults.filter((r) => !r.ok);
  if (failed.length === 0) {
    const created = configResults.filter((r) => r.created);
    return {
      name: "config-files",
      ok: true,
      detail: created.length > 0
        ? `Created: ${created.map((r) => r.name).join(", ")}`
        : "All config files already present.",
    };
  }
  return {
    name: "config-files",
    ok: false,
    detail: failed.map((r) => `${r.name}: ${r.detail}`).join("; "),
  };
}

async function runMagicContextSetupPhase(
  deps: InstallModuleDeps,
  configOk: boolean,
  skipCompleted: boolean,
): Promise<InstallFixResult> {
  const { projectRoot, notify, execSyncOverride } = deps;

  if (skipCompleted && await isStepCompleted(projectRoot, STEP_CONFIG_AND_MC, "install")) {
    return { name: "magic-context-setup", ok: true, detail: "Already completed (step 3)." };
  }

  // If config file download failed, we cannot reliably proceed with MC setup.
  if (!configOk) {
    return {
      name: "magic-context-setup",
      ok: false,
      detail: "Skipped: config files phase failed.",
    };
  }

  // Pre-check: only run setup if `.pi/magic-context.jsonc` does NOT have
  // `harness: "pi"` already configured.
  if (hasMagicContextHarnessPi(projectRoot)) {
    notify("Magic Context already configured with harness: pi. Skipping setup.", "info");
    return {
      name: "magic-context-setup",
      ok: true,
      detail: "Already configured (harness: pi detected in magic-context.jsonc).",
    };
  }

  notify("Setting up Magic Context (bunx @cortexkit/magic-context setup --harness pi)...", "info");
  try {
    execFn(MC_SETUP_CMD, { cwd: projectRoot, stdio: "pipe", timeout: MC_SETUP_TIMEOUT_MS }, execSyncOverride);
    return {
      name: "magic-context-setup",
      ok: true,
      detail: "Magic Context setup completed.",
    };
  } catch (e) {
    return {
      name: "magic-context-setup",
      ok: false,
      detail: `Magic Context setup failed: ${(e as Error).message}`,
    };
  }
}

async function runMagicContextDoctorPhase(deps: InstallModuleDeps): Promise<InstallFixResult> {
  const { projectRoot, notify, execSyncOverride } = deps;
  notify("Running Magic Context doctor check...", "info");
  try {
    execFn(MC_DOCTOR_CMD, { cwd: projectRoot, stdio: "pipe", timeout: MC_DOCTOR_TIMEOUT_MS }, execSyncOverride);
    return {
      name: "magic-context-doctor",
      ok: true,
      detail: "Magic Context doctor check passed.",
    };
  } catch (e) {
    // Doctor is a warning check, not fatal — return ok=true with a warning note
    // so the overall install does not fail, but surface the issue.
    notify(`Magic Context doctor check had issues: ${(e as Error).message}`, "warning");
    return {
      name: "magic-context-doctor",
      ok: true,
      detail: `Warning: doctor check had issues: ${(e as Error).message}`,
    };
  }
}

// ---- Helpers ----

/**
 * Read `.pi/magic-context.jsonc` and check whether it declares
 * `harness: "pi"`. Returns false if the file is missing, unreadable, or does
 * not contain the harness setting. Tolerates JSONC comments/ trailing commas
 * via a lightweight strip before JSON.parse.
 */
function hasMagicContextHarnessPi(projectRoot: string): boolean {
  const mcPath = join(projectRoot, ".pi", "magic-context.jsonc");
  if (!existsSync(mcPath)) return false;
  try {
    const raw = readFileSync(mcPath, "utf-8");
    const stripped = stripJsonc(raw);
    const parsed = JSON.parse(stripped) as { harness?: string };
    return parsed.harness === "pi";
  } catch {
    return false;
  }
}

/**
 * Minimal JSONC -> JSON transform: strip `//` line comments and block
 * `/* ... *\/` comments, plus trailing commas before `}` or `]`.
 * Good enough for the magic-context.jsonc schema; not a full JSONC parser.
 */
function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    // line comment
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    // block comment
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // string literal — copy verbatim (comments inside strings are preserved)
    if (ch === '"') {
      out += ch;
      i++;
      while (i < text.length) {
        const c = text[i];
        out += c;
        if (c === "\\" && i + 1 < text.length) {
          out += text[i + 1];
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  // strip trailing commas before } or ]
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function execFn(
  command: string,
  options: ExecSyncOptions,
  override?: (command: string, options?: ExecSyncOptions) => Buffer,
): Buffer {
  if (override) {
    return override(command, options);
  }
  const result = execSync(command, options ?? {});
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}