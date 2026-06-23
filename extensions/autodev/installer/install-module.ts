/**
 * Internal install module — no secrets, no prompts.
 *
 * Called by doctor to fix missing tools, config files, and Magic Context.
 * All fixes are idempotent and run unconditionally.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { ensureGitignore } from "./env.js";
import { installMissingTools } from "./tools.js";
import { validateAndCreateConfig } from "./config-defaults.js";
import { markStepCompleted } from "./state.js";

// ---- Types ----

export interface InstallModuleDeps {
  readonly projectRoot: string;
  readonly authPath: string;
  notify: (message: string, level: "info" | "warning" | "error") => void;
  /** Override for execSync (injectable for tests). */
  execSyncOverride?: (command: string, options?: ExecSyncOptions) => string;
  /** Override for fetch (injectable for tests). */
  fetchOverride?: typeof fetch;
}

export interface InstallFixResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

// ---- Helpers ----

function execSyncFn(
  command: string,
  options: ExecSyncOptions,
  execOverride?: (command: string, options?: ExecSyncOptions) => string,
): string {
  if (execOverride) {
    return execOverride(command, options);
  }
  const result = execSync(command, options);
  return Buffer.isBuffer(result) ? result.toString() : Buffer.from(result).toString();
}

// ---- Main ----

/**
 * Run all install fixes unconditionally (each is idempotent).
 *
 * Fixes:
 *   1. Install gh if missing
 *   2. Install git if missing
 *   3. Download .pi/settings.json, .pi/magic-context.jsonc, missing .pi/agents/*.md
 *   4. Run `bunx @cortexkit/magic-context@latest setup --harness pi`
 *   5. Run `bunx @cortexkit/magic-context@latest doctor` (warning on failure)
 *
 * Returns one InstallFixResult per logical fix group.
 */
export async function runInstallFixes(deps: InstallModuleDeps): Promise<InstallFixResult[]> {
  const { projectRoot, notify, execSyncOverride } = deps;
  const results: InstallFixResult[] = [];

  // Ensure .gitignore includes .env
  await ensureGitignore(projectRoot);

  // ---- Fix 1+2: External tools (gh, git) ----
  const toolResults = installMissingTools(notify, undefined, execSyncOverride);
  const failedTools = toolResults.filter((r) => !r.installed);
  // Only report gh and git — ignore bun (bun is a prerequisite handled by install.sh)
  const ghResult = toolResults.find((r) => r.tool === "GitHub CLI");
  const gitResult = toolResults.find((r) => r.tool === "git");
  const toolDetails: string[] = [];
  if (ghResult) toolDetails.push(`gh: ${ghResult.installed ? "ok" : ghResult.message}`);
  if (gitResult) toolDetails.push(`git: ${gitResult.installed ? "ok" : gitResult.message}`);
  const toolsOk = failedTools.length === 0;
  results.push({
    name: "External tools (gh/git)",
    ok: toolsOk,
    detail: toolDetails.length > 0 ? toolDetails.join("; ") : "All present",
  });
  await markStepCompleted(projectRoot, 0, "install");

  // ---- Fix 3: Config files ----
  const configResults = await validateAndCreateConfig(projectRoot);
  const configFailed = configResults.filter((r) => !r.ok);
  const configOk = configFailed.length === 0;
  results.push({
    name: "Config files",
    ok: configOk,
    detail: configOk
      ? configResults.map((r) => `${r.name}: ${r.detail}`).join("; ")
      : configFailed.map((r) => `${r.name}: ${r.detail}`).join("; "),
  });

  // ---- Fix 4: Magic Context setup ----
  let mcSetupOk = true;
  let mcSetupDetail = "Magic Context configured.";
  notify("Setting up Magic Context...", "info");
  try {
    execSyncFn(
      "bunx @cortexkit/magic-context@latest setup --harness pi",
      { cwd: projectRoot, stdio: "pipe", timeout: 120_000 },
      execSyncOverride,
    );
  } catch (e) {
    mcSetupOk = false;
    mcSetupDetail = `Magic Context setup failed: ${(e as Error).message}`;
  }

  // ---- Fix 5: Magic Context doctor (warning check) ----
  if (mcSetupOk) {
    try {
      execSyncFn(
        "bunx @cortexkit/magic-context@latest doctor",
        { cwd: projectRoot, stdio: "pipe", timeout: 30_000 },
        execSyncOverride,
      );
      notify("Magic Context doctor check passed.", "info");
    } catch (e) {
      notify(`Magic Context doctor check had issues: ${(e as Error).message}`, "warning");
    }
  }

  results.push({
    name: "Magic Context setup",
    ok: mcSetupOk,
    detail: mcSetupDetail,
  });

  results.push({
    name: "Magic Context doctor",
    ok: true, // doctor failure is a warning, not an error
    detail: mcSetupOk ? "Doctor check completed (warnings may exist)" : "Skipped because setup failed",
  });

  // Record step 3 for config files + MC setup (one logical unit)
  await markStepCompleted(projectRoot, 3, "install");

  return results;
}
