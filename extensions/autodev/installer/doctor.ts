import { execSync, type ExecSyncOptions } from "node:child_process";
import { dirname, join } from "node:path";
import { readAuth } from "./auth.js";
import { readEnv } from "./env.js";
import { readState } from "./state.js";
import { validateAndCreateConfig } from "./config-defaults.js";
import { runInstallFixes, type InstallModuleDeps } from "./install-module.js";
import { runConfig, type ConfigModuleDeps } from "./config-module.js";
import { createPrompter, type Prompter } from "./prompts.js";

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
   * When true, doctor takes over the full install flow: on health-check
   * failures it runs `runInstallFixes` (always) and `runConfig` with targeted
   * sub-commands (only in an interactive TTY), then re-runs all checks.
   * When false, doctor runs only the health checks (no side effects).
   * Defaults to false.
   */
  readonly launchConfigFlow?: boolean;
  /** Notify callback used when launching the config flow. */
  readonly notify?: (message: string, level: "info" | "warning" | "error") => void;
  /** Optional injected prompter (tests). When omitted doctor creates one. */
  readonly prompter?: Prompter;
  /** Optional global package root for symlink-based config defaults (tests). */
  readonly packageRoot?: string;
}

/**
 * Detect a first run by checking THREE independent signals:
 *   1. `auth.json` has at least one non-empty credential (resolving `$VAR`
 *      references against `process.env`).
 *   2. `.autodev/install-state.json` has any completed steps.
 *   3. `~/.pi/agent/.env` (resolved via `dirname(authPath)`) has a non-empty
 *      `OLLAMA_CLOUD_API_KEY`.
 *
 * Used ONLY for messaging (welcome vs "something needs fixing"). Never used
 * for behavioral branching.
 */
export async function isFirstRun(deps: Pick<DoctorDeps, "projectRoot" | "authPath">): Promise<boolean> {
  // Signal 1: auth.json has usable credentials.
  try {
    const auth = await readAuth(deps.authPath);
    const hasCreds = Object.values(auth).some((entry) => {
      const key = entry?.key ?? "";
      if (key === "") return false;
      if (key.startsWith("$")) {
        const varName = key.slice(1);
        const resolved = process.env[varName];
        return resolved !== undefined && resolved !== "";
      }
      return true;
    });
    if (hasCreds) return false;
  } catch {
    // unreadable / missing auth.json → treat as no creds (not a first-run signal).
  }

  // Signal 2: install-state has completed steps.
  try {
    const state = await readState(deps.projectRoot, "install");
    if (state.completedSteps.length > 0) return false;
  } catch {
    // ignore
  }

  // Signal 3: ~/.pi/agent/.env has OLLAMA_CLOUD_API_KEY.
  const envPath = join(dirname(deps.authPath), ".env");
  try {
    const env = await readEnv(deps.projectRoot, envPath);
    const v = env.get("OLLAMA_CLOUD_API_KEY");
    if (v !== undefined && v !== "") return false;
  } catch {
    // ignore
  }

  return true;
}

/**
 * Run health checks. The checks array always contains the same ordered set:
 * Bun, GitHub CLI, GitHub auth, LLM credentials, Environment vars, Install
 * state, settings.json, magic-context.jsonc, agents/*.md.
 *
 * When `launchConfigFlow` is true, doctor is the orchestrator: on failures it
 * runs the install module unconditionally, then runs the config module with
 * targeted sub-commands only in an interactive TTY, then re-runs all checks.
 */
export async function runDoctor(deps: DoctorDeps): Promise<DoctorResult> {
  const launchConfigFlow = deps.launchConfigFlow ?? false;
  const notify = deps.notify ?? (() => {});

  const firstResult = await runHealthChecks(deps);
  const failed = firstResult.checks.length - firstResult.passed;

  if (!launchConfigFlow || failed === 0) {
    return firstResult;
  }

  // ---- Orchestrator mode: failures present ----
  const firstRun = await isFirstRun(deps);
  if (firstRun) {
    notify("Welcome to AutoDev! Starting first-run setup...", "info");
  } else {
    notify("Some health checks failed. Something needs fixing...", "warning");
  }

  // (1) Install module — always, no prompts, safe in CI.
  notify("Running install fixes...", "info");
  const installDeps: InstallModuleDeps = {
    projectRoot: deps.projectRoot,
    notify,
    execSyncOverride: deps.execSyncOverride as never,
    ...(deps.packageRoot !== undefined ? { packageRoot: deps.packageRoot } : {}),
  };
  await runInstallFixes(installDeps);

  // (2) Config module — only in an interactive TTY, with targeted sub-commands.
  const isTty = process.stdin.isTTY === true;
  if (isTty) {
    const subcommands = targetedSubcommands(firstResult.checks);
    if (subcommands.length > 0) {
      const prompter = deps.prompter ?? createPrompter();
      const configDeps: ConfigModuleDeps = {
        projectRoot: deps.projectRoot,
        authPath: deps.authPath,
        prompter,
        notify,
        ...(deps.execSyncOverride !== undefined
          ? { execSyncOverride: deps.execSyncOverride as never }
          : {}),
      };
      for (const sub of subcommands) {
        await runConfig(configDeps, sub);
      }
      if (deps.prompter === undefined) {
        prompter.close();
      }
    }
  } else {
    notify(
      "Non-interactive environment detected. Run `autodev config` in an interactive terminal to set up credentials.",
      "warning",
    );
  }

  // (3) Re-run all health checks to report what's still broken.
  const rechecked = await runHealthChecks(deps);
  return {
    checks: rechecked.checks,
    passed: rechecked.passed,
    failed: rechecked.failed,
    configFlowLaunched: true,
  };
}

/**
 * Map failing health checks to targeted config sub-commands.
 * Discord is never auto-triggered (it is not a health check).
 */
function targetedSubcommands(checks: readonly DoctorCheck[]): string[] {
  const subs = new Set<string>();
  for (const c of checks) {
    if (c.ok) continue;
    if (c.name === "LLM credentials") subs.add("llm");
    if (c.name === "GitHub auth") subs.add("github");
    if (c.name === "Environment vars") {
      // Env check fails on missing OLLAMA_CLOUD_API_KEY → `llm` writes it.
      subs.add("llm");
      if (c.detail.includes("VOYAGE_API_KEY: missing")) subs.add("voyage");
    }
  }
  return Array.from(subs);
}

/** Run the full health-check set and return a summary. */
async function runHealthChecks(deps: DoctorDeps): Promise<DoctorResult> {
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

  // GitHub auth — verify token validity, not just presence.
  const ghTokenSet = process.env.GH_TOKEN !== undefined && process.env.GH_TOKEN !== "";
  try {
    exec("gh auth status", { encoding: "utf-8", stdio: "pipe" });
    checks.push({
      name: "GitHub auth",
      ok: true,
      detail: ghTokenSet ? "authenticated via GH_TOKEN" : "authenticated",
    });
  } catch {
    checks.push({
      name: "GitHub auth",
      ok: false,
      detail: ghTokenSet ? "GH_TOKEN invalid or expired" : "not authenticated",
    });
  }

  // LLM credentials — resolve `$VAR` references against process.env.
  try {
    const auth = await readAuth(deps.authPath);
    const providers = Object.keys(auth).filter((k) => {
      const key = auth[k]?.key ?? "";
      if (key === "") return false;
      if (key.startsWith("$")) {
        const varName = key.slice(1);
        const resolved = process.env[varName];
        return resolved !== undefined && resolved !== "";
      }
      return true;
    });
    checks.push({
      name: "LLM credentials",
      ok: providers.length > 0,
      detail: providers.length > 0 ? `${providers.length} provider(s): ${providers.join(", ")}` : "no credentials",
    });
  } catch {
    checks.push({ name: "LLM credentials", ok: false, detail: `auth.json not found at ${deps.authPath}` });
  }

  try {
    const envPath = join(dirname(deps.authPath), ".env");
    const env = await readEnv(deps.projectRoot, envPath);
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

  // Install state — aggregate install + config scopes; threshold 6.
  try {
    const installState = await readState(deps.projectRoot, "install");
    const configState = await readState(deps.projectRoot, "config");
    const allSteps = new Set<number>([...installState.completedSteps, ...configState.completedSteps]);
    const count = allSteps.size;
    checks.push({
      name: "Install state",
      ok: count >= 6,
      detail: `${count}/6 install steps completed`,
    });
  } catch {
    checks.push({ name: "Install state", ok: false, detail: "install-state.json not found" });
  }

  const configResults = await validateAndCreateConfig(deps.packageRoot);
  for (const cr of configResults) {
    checks.push({
      name: cr.name,
      ok: cr.ok,
      detail: cr.created ? `${cr.detail} (created)` : cr.detail,
    });
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  return { checks, passed, failed, configFlowLaunched: false };
}