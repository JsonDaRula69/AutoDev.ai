/**
 * Install module — dependency-injectable install fixes for AutoDev.
 *
 * Runs the non-interactive "install" lifecycle in three phases:
 *   1. Install external tools (gh, git, bun) via `installMissingTools`.
 *   2. Symlink centralized config into `~/.AutoDev/` via `validateAndCreateConfig`
 *      (also writes `magic-context.jsonc` with AutoDev defaults).
 *   3. Register the Magic Context pi extension via the non-interactive
 *      `pi install npm:@cortexkit/pi-magic-context` command and verify that
 *      `magic-context.jsonc` exists in the agent dir. No interactive wizard
 *      is invoked and no TTY is required.
 *
 * Completion is recorded in the `"install"` state scope so re-runs skip
 * finished work.
 *
 * This module never interacts with the user, writes credentials, or performs
 * GitHub authentication. It is safe to run in CI and non-interactive contexts.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { installMissingTools, type Platform } from "./tools.js";
import { validateAndCreateConfig } from "./config-defaults.js";
import { markStepCompleted, isStepCompleted } from "./state.js";
import { DEFAULT_MAGIC_CONTEXT_JSONC } from "./magic-context-defaults.js";
import { openVectorStore } from "../docs/index.js";
import { createCentralDbSchema } from "../docs/seeding.js";

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
  /** Optional global package root for symlink-based config defaults (tests). */
  readonly packageRoot?: string;
  /** If true, completed steps are skipped. Defaults to true. */
  readonly skipCompleted?: boolean;
}

// ---- Constants (mirror steps.ts so this module is standalone) ----

/** Non-interactive Magic Context registration command.
 * Registers `@cortexkit/pi-magic-context` as a pi extension in the central
 * `settings.json`. Never opens an interactive wizard. */
const MC_INSTALL_CMD = "pi install npm:@cortexkit/pi-magic-context";
const MC_INSTALL_TIMEOUT_MS = 120_000;

/** Step 0 — external tools (gh + git, bun check is harmless and included). */
const STEP_TOOLS = 0;
/** Step 3 — `.pi/` config files + Magic Context registration. Marked only after both succeed. */
const STEP_CONFIG_AND_MC = 3;

/**
 * Run install tools + config symlinks phases (1-2), WITHOUT the Magic Context
 * registration phase (3). Used by doctor's FirstRun flow so MC install can be
 * deferred until after interactive config prompts complete.
 *
 * Phases:
 *   1. Install `gh` and `git` if missing (via `installMissingTools`).
 *   2. Symlink centralized config into `~/.AutoDev/` via `validateAndCreateConfig`
 *      (also writes `magic-context.jsonc` with AutoDev defaults).
 *
 * State step 0 is marked after tools. State step 3 is NOT marked here (it
 * requires MC registration to succeed first — use `runMagicContextInstall`
 * for that).
 */
export async function runInstallToolsAndConfig(deps: InstallModuleDeps): Promise<InstallFixResult[]> {
  const results: InstallFixResult[] = [];
  const { projectRoot, notify } = deps;
  const skipCompleted = deps.skipCompleted ?? true;

  const toolsResult = await runToolsPhase(deps, skipCompleted);
  results.push(toolsResult);

  const configResult = await runConfigFilesPhase(deps);
  results.push(configResult);

  return results;
}

/**
 * Run Magic Context registration only (phase 3). Requires that the config
 * files phase (symlinks + magic-context.jsonc) has already succeeded — pass
 * `configOk=true` from the prior `runInstallToolsAndConfig` result.
 *
 * State step 3 is marked complete only when this succeeds AND configOk is true.
 */
export async function runMagicContextInstall(
  deps: InstallModuleDeps,
  configOk: boolean,
): Promise<InstallFixResult> {
  const { projectRoot, notify } = deps;
  const skipCompleted = deps.skipCompleted ?? true;

  const mcSetupResult = await runMagicContextSetupPhase(deps, configOk, skipCompleted);
  if (configOk && mcSetupResult.ok) {
    await markStepCompleted(projectRoot, STEP_CONFIG_AND_MC, "install");
  }
  return mcSetupResult;
}

// ---- Public API ----

/**
 * Run all install fixes sequentially and return a result per phase.
 *
 * Phases:
 *   1. Install `gh` and `git` if missing (via `installMissingTools`).
 *   2. Symlink centralized config into `~/.AutoDev/` via `validateAndCreateConfig`
 *      (also writes `magic-context.jsonc` with AutoDev defaults).
 *   3. Register the Magic Context pi extension via the non-interactive
 *      `pi install npm:@cortexkit/pi-magic-context` command and verify
 *      `magic-context.jsonc` exists in the agent dir.
 *
 * State is recorded in the `"install"` scope: step 0 after tools, step 3 after
 * config files AND Magic Context registration both succeed.
 */
export async function runInstallFixes(deps: InstallModuleDeps): Promise<InstallFixResult[]> {
  const results: InstallFixResult[] = [];
  const { projectRoot, notify } = deps;
  const skipCompleted = deps.skipCompleted ?? true;

  // ---- Phase 1+2: External tools (gh + git) ----
  const toolsResult = await runToolsPhase(deps, skipCompleted);
  results.push(toolsResult);

  // ---- Phase 3: centralized config files (symlinks + magic-context.jsonc) ----
  const configResult = await runConfigFilesPhase(deps);
  results.push(configResult);
  const configOk = configResult.ok;

  // ---- Phase 4: Magic Context registration (non-interactive) ----
  const mcSetupResult = await runMagicContextSetupPhase(deps, configOk, skipCompleted);
  results.push(mcSetupResult);
  const mcSetupOk = mcSetupResult.ok;

  // Step 3 is only marked complete when BOTH config files AND MC registration succeed.
  if (configOk && mcSetupOk) {
    await markStepCompleted(projectRoot, STEP_CONFIG_AND_MC, "install");
  }

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
  const { projectRoot, notify, packageRoot } = deps;
  notify("Symlinking .pi/ config files into ~/.AutoDev/ if missing...", "info");
  const configResults = await validateAndCreateConfig(packageRoot);
  const failed = configResults.filter((r) => !r.ok);
  const agentDir = getAgentDir();
  const centralDocsResult = createCentralDocsStructure(agentDir);
  if (failed.length === 0) {
    const created = configResults.filter((r) => r.created);
    const configDetail = created.length > 0
      ? `Created: ${created.map((r) => r.name).join(", ")}`
      : "All config files already present.";
    return {
      name: "config-files",
      ok: centralDocsResult.ok,
      detail: `${configDetail}; Central docs: ${centralDocsResult.detail}`,
    };
  }
  return {
    name: "config-files",
    ok: false,
    detail: `${failed.map((r) => `${r.name}: ${r.detail}`).join("; ")}; Central docs: ${centralDocsResult.detail}`,
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

  // If config file download failed, we cannot reliably proceed with MC registration.
  if (!configOk) {
    return {
      name: "magic-context-setup",
      ok: false,
      detail: "Skipped: config files phase failed.",
    };
  }

  // Decision #14: the MC pre-check is a simple "does magic-context.jsonc exist?"
  // in the central agent dir. T1's validateAndCreateConfig writes AutoDev defaults
  // there, so this is a verify-only step. If the file is missing (e.g. T1 write
  // failed or was skipped), write the defaults here as a self-healing fallback.
  const agentDir = getAgentDir();
  const mcPath = join(agentDir, "magic-context.jsonc");
  if (!existsSync(mcPath)) {
    notify("magic-context.jsonc missing; writing AutoDev defaults...", "info");
    try {
      if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
      writeFileSync(mcPath, DEFAULT_MAGIC_CONTEXT_JSONC, "utf-8");
    } catch (e) {
      return {
        name: "magic-context-setup",
        ok: false,
        detail: `Failed to write magic-context.jsonc: ${(e as Error).message}`,
      };
    }
  }

  // Register the Magic Context pi extension non-interactively. cwd is the
  // central agent dir so `settings.json` is updated in place. No TTY, no
  // @clack/prompts wizard.
  notify(`Running ${MC_INSTALL_CMD} (cwd: ${agentDir})...`, "info");
  try {
    execFn(MC_INSTALL_CMD, { cwd: agentDir, stdio: "pipe", timeout: MC_INSTALL_TIMEOUT_MS }, execSyncOverride);
  } catch (e) {
    return {
      name: "magic-context-setup",
      ok: false,
      detail: `Magic Context registration failed: ${(e as Error).message}`,
    };
  }

  // Verify the config file exists after registration.
  if (!existsSync(mcPath)) {
    return {
      name: "magic-context-setup",
      ok: false,
      detail: "magic-context.jsonc not found after registration.",
    };
  }

  return {
    name: "magic-context-setup",
    ok: true,
    detail: "Magic Context registered and magic-context.jsonc verified.",
  };
}

// ---- Public helpers ----

export function createCentralDocsStructure(agentDir: string): { ok: boolean; detail: string } {
  try {
    const centralHome = join(agentDir, "..", "docs-corpus");
    mkdirSync(centralHome, { recursive: true });
    const db = openVectorStore(join(centralHome, "vectors.db"));
    try {
      createCentralDbSchema(db);
      return { ok: true, detail: `initialized at ${centralHome}` };
    } finally {
      db.close();
    }
  } catch (e) {
    return { ok: false, detail: `failed: ${(e as Error).message}` };
  }
}

// ---- Helpers ----

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