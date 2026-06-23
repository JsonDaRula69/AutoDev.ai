import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readAuth } from "./auth.js";
import { readEnv } from "./env.js";
import { readState } from "./state.js";
import { validateAndCreateConfig } from "./config-defaults.js";

export interface DoctorCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DoctorResult {
  readonly checks: readonly DoctorCheck[];
  readonly passed: number;
  readonly failed: number;
  /** Whether doctor launched the config/install flow as a result of its checks. */
  readonly configFlowLaunched: boolean;
}

export type DoctorExecFn = (command: string, options?: ExecSyncOptions) => string;

export interface DoctorDeps {
  readonly projectRoot: string;
  readonly authPath: string;
  readonly execSyncOverride?: DoctorExecFn;
  /**
   * When true, doctor takes over the full install flow:
   *   1. Local install guard — aborts if not a global install.
   *   2. Fresh-install detection — launches interactive or non-interactive config.
   *   3. Existing-install health checks — auto-fixes failures.
   * When false, doctor runs only the health checks (no side effects).
   * Defaults to false.
   */
  readonly launchConfigFlow?: boolean;
  /** Notify callback used when launching the config flow. */
  readonly notify?: (message: string, level: "info" | "warning" | "error") => void;
}

/** Detect whether the current process is a global install (npm_config_global=true). */
export function isGlobalInstall(): boolean {
  return process.env.npm_config_global === "true";
}

export async function isFreshInstall(deps: Pick<DoctorDeps, "projectRoot" | "authPath">): Promise<boolean> {
  if (existsSync(deps.authPath)) {
    const auth = await readAuth(deps.authPath);
    const hasCreds = Object.values(auth).some((e) => e?.key !== undefined && e.key !== "");
    if (hasCreds) return false;
  }
  const state = await readState(deps.projectRoot, "install");
  if (state.completedSteps.length > 0) return false;
  const envPath = join(deps.projectRoot, ".env");
  if (existsSync(envPath)) {
    const env = await readEnv(deps.projectRoot);
    if (env.get("OLLAMA_CLOUD_API_KEY") !== undefined && env.get("OLLAMA_CLOUD_API_KEY") !== "") return false;
  }
  return true;
}

/**
 * Run health checks. The checks array always contains the same ordered set:
 * Bun, GitHub CLI, GitHub auth, LLM credentials, Environment vars, Install
 * state, settings.json, magic-context.jsonc, agents/*.md.
 *
 * When `launchConfigFlow` is true, doctor is the orchestrator:
 *   - Local install guard first (aborts if not global).
 *   - Fresh install → launch install (interactive or non-interactive).
 *   - Existing install with failures → launch install to fix.
 *   - All green → no action.
 */
export async function runDoctor(deps: DoctorDeps): Promise<DoctorResult> {
  const launchConfigFlow = deps.launchConfigFlow ?? false;
  const notify = deps.notify ?? (() => {});

  // ---- Gate 1: Local install guard (only when orchestrating) ----
  if (launchConfigFlow && !isGlobalInstall()) {
    notify("AutoDev was installed as a local dependency.", "warning");
    notify("AutoDev is a machine-level tool, not a project dependency.", "info");
    notify("Install it globally instead: bun install -g autodev", "info");
    return { checks: [], passed: 0, failed: 0, configFlowLaunched: false };
  }

  // ---- Gate 2: Fresh-install detection (only when orchestrating) ----
  if (launchConfigFlow) {
    const fresh = await isFreshInstall({ projectRoot: deps.projectRoot, authPath: deps.authPath });
    if (fresh) {
      const nonInteractive = process.stdin.isTTY !== true;
      if (nonInteractive) {
        notify("AutoDev detected a fresh installation.", "info");
        notify("To complete setup, run: autodev install", "info");
        return { checks: [], passed: 0, failed: 0, configFlowLaunched: false };
      }
      notify("AutoDev detected a fresh installation.", "info");
      notify("Starting interactive setup...", "info");
      const { runInstallFixes } = await import("./install-module.js");
      await runInstallFixes({
        projectRoot: deps.projectRoot,
        authPath: deps.authPath,
        notify,
      });
      return { checks: [], passed: 0, failed: 0, configFlowLaunched: true };
    }
  }

  // ---- Health checks ----
  const exec: DoctorExecFn = deps.execSyncOverride ?? ((cmd: string, opts?: ExecSyncOptions) =>
    execSync(cmd, opts ?? {}) as unknown as string);
  const checks: DoctorCheck[] = [];

  try {
    const version = exec("bun --version", { encoding: "utf-8" }).trim();
    const major = parseInt(version.split(".")[0] ?? "0", 10);
    checks.push({ name: "Bun", ok: major >= 1, detail: `v${version}` });
  } catch {
    checks.push({ name: "Bun", ok: false, detail: "not found" });
  }

  try {
    const version = exec("gh --version", { encoding: "utf-8" }).trim().split("\n")[0] ?? "";
    checks.push({ name: "GitHub CLI", ok: true, detail: version });
  } catch {
    checks.push({ name: "GitHub CLI", ok: false, detail: "not found" });
  }

  try {
    exec("gh auth status", { encoding: "utf-8", stdio: "pipe" });
    checks.push({ name: "GitHub auth", ok: true, detail: "authenticated" });
  } catch {
    checks.push({ name: "GitHub auth", ok: false, detail: "not authenticated" });
  }

  try {
    const auth = await readAuth(deps.authPath);
    const providers = Object.keys(auth).filter((k) => auth[k]?.key !== "");
    checks.push({
      name: "LLM credentials",
      ok: providers.length > 0,
      detail: providers.length > 0 ? `${providers.length} provider(s): ${providers.join(", ")}` : "no credentials",
    });
  } catch {
    checks.push({ name: "LLM credentials", ok: false, detail: `auth.json not found at ${deps.authPath}` });
  }

  try {
    const env = await readEnv(deps.projectRoot);
    const hasOllama = env.get("OLLAMA_CLOUD_API_KEY") !== undefined && env.get("OLLAMA_CLOUD_API_KEY") !== "";
    const hasVoyage = env.get("VOYAGE_API_KEY") !== undefined;
    checks.push({
      name: "Environment vars",
      ok: hasOllama,
      detail: `OLLAMA_CLOUD_API_KEY: ${hasOllama ? "set" : "missing"}, VOYAGE_API_KEY: ${hasVoyage ? "set (or ONNX fallback)" : "missing"}`,
    });
  } catch {
    checks.push({ name: "Environment vars", ok: false, detail: ".env not found" });
  }

  try {
    const state = await readState(deps.projectRoot, "install");
    const installStepCount = state.completedSteps.length;
    checks.push({
      name: "Install state",
      ok: installStepCount >= 8,
      detail: `${installStepCount}/8 install steps completed`,
    });
  } catch {
    checks.push({ name: "Install state", ok: false, detail: "install-state.json not found" });
  }

  const configResults = await validateAndCreateConfig(deps.projectRoot);
  for (const cr of configResults) {
    checks.push({
      name: cr.name,
      ok: cr.ok,
      detail: cr.created ? `${cr.detail} (created)` : cr.detail,
    });
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;

  // ---- Gate 3: Auto-fix on failure (only when orchestrating) ----
  let configFlowLaunched = false;
  if (launchConfigFlow && failed > 0) {
    notify("Some checks failed. Running install fixes...", "warning");
    const { runInstallFixes } = await import("./install-module.js");
    await runInstallFixes({
      projectRoot: deps.projectRoot,
      authPath: deps.authPath,
      notify,
    });
    configFlowLaunched = true;
  }

  return { checks, passed, failed, configFlowLaunched };
}