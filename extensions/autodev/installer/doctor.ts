import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { load } from "js-yaml";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readAuth } from "./auth.js";
import { readEnv } from "./env.js";
import { readState } from "./state.js";
import { validateAndCreateConfig } from "./config-defaults.js";
import { runInstallFixes, runInstallToolsAndConfig, runMagicContextInstall, type InstallModuleDeps } from "./install-module.js";
import { runConfig, type ConfigModuleDeps } from "./config-module.js";
import { DEFAULT_MAGIC_CONTEXT_JSONC } from "./magic-context-defaults.js";
import { createPrompter, type Prompter } from "./prompts.js";
import { reopenTty, type ReopenTtyDeps } from "./tty.js";
import { seedCentralDocs } from "../docs/seeding.js";
import { embed } from "../embeddings.js";

const MC_DOCTOR_CMD = "bunx @cortexkit/magic-context@latest doctor";
const MC_DOCTOR_TIMEOUT_MS = 30_000;
const MC_DOCTOR_EXEC_OPTS: ExecSyncOptions = {
  encoding: "utf-8",
  stdio: "pipe",
  timeout: MC_DOCTOR_TIMEOUT_MS,
};

/**
 * Write AutoDev defaults to `magic-context.jsonc` in the central agent dir.
 *
 * Used as the retry hook when the MC doctor fails on its first attempt:
 * writing the defaults resolves the common case where the file is missing or
 * misconfigured. Reuses the JSONC block from T1's `magic-context-defaults.ts`
 * so a single source of truth governs the default content.
 *
 * No-op (and reports ok=false with the error message) if the write itself
 * fails — the caller decides whether to retry.
 */
export function writeMagicContextDefaults(agentDir: string): { ok: boolean; detail: string } {
  const mcPath = join(agentDir, "magic-context.jsonc");
  try {
    if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
    writeFileSync(mcPath, DEFAULT_MAGIC_CONTEXT_JSONC, "utf-8");
    return { ok: true, detail: "defaults written" };
  } catch (e) {
    return { ok: false, detail: `defaults write failed: ${(e as Error).message}` };
  }
}

/**
 * Run the Magic Context doctor as a standing health check, with a single
 * retry that writes AutoDev defaults to `magic-context.jsonc` before the
 * second attempt. Resolves the common "missing or empty config" failure mode
 * without surfacing it as a hard failure.
 *
 * - First attempt succeeds → `ok: true, detail: "healthy"`.
 * - First attempt fails → `writeMagicContextDefaults(getAgentDir())` runs
 *   once, then the doctor runs again.
 *   - Second succeeds → `ok: true, detail: "healthy (after defaults written)"`.
 *   - Second fails → `ok: false, detail: "MC doctor failed after retry: ..."`.
 */
function runMagicContextCheck(exec: DoctorExecFn): DoctorCheck {
  const firstErr = tryMcDoctor(exec);
  if (firstErr === null) {
    return { name: "Magic Context", ok: true, detail: "healthy" };
  }

  const writeResult = writeMagicContextDefaults(getAgentDir());
  if (!writeResult.ok) {
    return {
      name: "Magic Context",
      ok: false,
      detail: `MC doctor failed; ${writeResult.detail}; first error: ${firstErr}`,
    };
  }

  const secondErr = tryMcDoctor(exec);
  if (secondErr === null) {
    return { name: "Magic Context", ok: true, detail: "healthy (after defaults written)" };
  }
  return {
    name: "Magic Context",
    ok: false,
    detail: `MC doctor failed after retry: ${secondErr}`,
  };
}

function tryMcDoctor(exec: DoctorExecFn): string | null {
  try {
    exec(MC_DOCTOR_CMD, MC_DOCTOR_EXEC_OPTS);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

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
  /**
   * Override for `reopenTty()` used when `process.stdin` is not a TTY but a
   * controlling terminal may still be reachable via `/dev/tty`. Tests inject
   * a fake here to simulate the happy/failure paths without a real TTY.
   */
  readonly reopenTtyOverride?: ReopenTtyDeps;
  readonly providerInstallOverride?: (source: string) => Promise<{ ok: boolean; detail: string; alreadyInstalled: boolean }>;
  readonly fetchOverride?: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Detect a first run by checking THREE independent signals:
 *   1. `auth.json` has at least one non-empty credential (resolving `$VAR`
 *      references against `process.env`).
 *   2. `.autodev/install-state.json` has any completed steps.
 *   3. `~/.pi/agent/.env` (resolved via `dirname(authPath)`) has a non-empty
 *      `OLLAMA_CLOUD_API_KEY`.
 *
 * Used to fork the config flow: a fresh install runs all four config
 * sub-commands (llm, voyage, discord, github); a broken existing install
 * runs only the targeted sub-commands for checks that failed.
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
 * Run 10 health checks. The checks array always contains the same ordered set:
 * Bun, GitHub CLI, GitHub auth, LLM credentials, Environment vars, Install
 * state, settings.json, magic-context.jsonc, agents/*.md, Magic Context.
 *
 * The 10th check (Magic Context) shells out to the MC doctor with a single
 * retry: on first failure it writes AutoDev defaults to `magic-context.jsonc`
 * in the central agent dir, then re-runs the doctor.
 *
 * When `launchConfigFlow` is true, doctor is the orchestrator:
 *   - Fresh install (isFirstRun=true): skip health checks, run the full
 *     FirstRun flow (tools → symlinks → config prompts → MC install), then
 *     run all health checks to report final state.
 *   - Broken install (isFirstRun=false): run health checks first, then run
 *     install fixes + targeted config sub-commands for failed checks, then
 *     re-run all health checks.
 */
export async function runDoctor(deps: DoctorDeps): Promise<DoctorResult> {
  const launchConfigFlow = deps.launchConfigFlow ?? false;
  const notify = deps.notify ?? (() => {});

  if (!launchConfigFlow) {
    return runHealthChecks(deps);
  }

  // ---- Phase 0: isFirstRun gate ----
  const firstRun = await isFirstRun(deps);
  if (firstRun) {
    notify("Welcome to AutoDev! Starting first-run setup...", "info");
    const firstRunResult = await runFirstRunFlow(deps, notify);
    return firstRunResult;
  }

  // ---- Broken-install path ----
  notify("Some health checks failed. Something needs fixing...", "warning");
  const firstResult = await runHealthChecks(deps);
  const failed = firstResult.checks.length - firstResult.passed;

  if (failed === 0) {
    return firstResult;
  }

  // (1) Install module — always, no prompts, safe in CI.
  notify("Running install fixes...", "info");
  const installDeps: InstallModuleDeps = {
    projectRoot: deps.projectRoot,
    notify,
    execSyncOverride: deps.execSyncOverride as never,
    ...(deps.packageRoot !== undefined ? { packageRoot: deps.packageRoot } : {}),
    ...(deps.providerInstallOverride !== undefined ? { providerInstallOverride: deps.providerInstallOverride } : {}),
  };
  await runInstallFixes(installDeps);

  // (2) Config module — interactive TTY only, targeted sub-commands.
  const subcommands = await brokenInstallSubcommands(firstResult.checks, deps);
  await runConfigSubcommands(deps, subcommands, notify);

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
 * FirstRun flow — the full install + config sequence for a fresh machine.
 *
 * Order (MC install deferred until after config prompts):
 *   1. External tools (gh, git) — non-interactive.
 *   2. Centralized config symlinks + magic-context.jsonc defaults — non-interactive.
 *   3. Interactive config prompts: llm → voyage → discord → github.
 *      Discord is always presented; user can skip without failing doctor.
 *   4. Magic Context pi extension registration — non-interactive.
 *   5. Central docs seeding from docs-sources.yaml — non-interactive, warning on failure.
 *   6. Full health-check pass to report final state.
 */
async function runFirstRunFlow(
  deps: DoctorDeps,
  notify: (message: string, level: "info" | "warning" | "error") => void,
): Promise<DoctorResult> {
  const installDeps: InstallModuleDeps = {
    projectRoot: deps.projectRoot,
    notify,
    execSyncOverride: deps.execSyncOverride as never,
    ...(deps.packageRoot !== undefined ? { packageRoot: deps.packageRoot } : {}),
    ...(deps.providerInstallOverride !== undefined ? { providerInstallOverride: deps.providerInstallOverride } : {}),
  };

  // (1+2) Tools + symlinks (no MC install yet).
  notify("Installing external tools and central config...", "info");
  const installResults = await runInstallToolsAndConfig(installDeps);
  const configOk = installResults.every((r) => r.ok);

  // (3) Interactive config prompts — all four sub-commands.
  await runConfigSubcommands(deps, ["llm", "voyage", "discord", "github"], notify);

  // (4) MC install — deferred until after config prompts.
  notify("Registering Magic Context extension...", "info");
  const mcResult = await runMagicContextInstall(installDeps, configOk);
  if (!mcResult.ok) {
    notify(`Magic Context setup: ${mcResult.detail}`, "warning");
  }

  // (5) Central docs seeding — load sources from central config and rebuild.
  const sourcesPath = join(getAgentDir(), "..", "config", "docs-sources.yaml");
  if (existsSync(sourcesPath)) {
    try {
      const rawYaml = readFileSync(sourcesPath, "utf-8");
      const parsed = load(rawYaml) as { sources?: { name: string; type: "git-sparse" | "llms-txt" | "llms-full"; url: string; targetSubdir: string }[] } | undefined;
      const sources = parsed?.sources ?? [];
      if (sources.length === 0) {
        notify(
          "No docs sources configured. Edit ~/.AutoDev/config/docs-sources.yaml to add sources, then run `autodev docs rebuild central`.",
          "warning",
        );
      } else {
        notify("Seeding central docs corpus...", "info");
        const seedResult = await seedCentralDocs(sources, embed);
        const errorSuffix = seedResult.errors.length > 0
          ? `; errors: ${seedResult.errors.join("; ")}`
          : "";
        notify(`Central docs seeded: ${seedResult.chunks} chunks${errorSuffix}`, seedResult.errors.length > 0 ? "warning" : "info");
      }
    } catch (e) {
      notify(`Central docs seeding skipped: ${(e as Error).message}`, "warning");
    }
  } else {
    notify(
      "No docs sources configured. Edit ~/.AutoDev/config/docs-sources.yaml to add sources, then run `autodev docs rebuild central`.",
      "warning",
    );
  }

  // (6) Full health-check pass to report final state.
  const finalResult = await runHealthChecks(deps);
  return {
    checks: finalResult.checks,
    passed: finalResult.passed,
    failed: finalResult.failed,
    configFlowLaunched: true,
  };
}

/**
 * Run config sub-commands interactively. Handles TTY routing: direct stdin,
 * /dev/tty reopen for piped stdin, or skip with warning in full CI.
 */
async function runConfigSubcommands(
  deps: DoctorDeps,
  subcommands: string[],
  notify: (message: string, level: "info" | "warning" | "error") => void,
): Promise<void> {
  if (subcommands.length === 0) return;

  const isTty = process.stdin.isTTY === true;
  if (isTty) {
    const prompter = deps.prompter ?? createPrompter();
    const configDeps: ConfigModuleDeps = {
      projectRoot: deps.projectRoot,
      authPath: deps.authPath,
      prompter,
      notify,
      ...(deps.execSyncOverride !== undefined
        ? { execSyncOverride: deps.execSyncOverride as never }
        : {}),
      ...(deps.fetchOverride !== undefined ? { fetchOverride: deps.fetchOverride } : {}),
    };
    for (const sub of subcommands) {
      await runConfig(configDeps, sub);
    }
    if (deps.prompter === undefined) {
      prompter.close();
    }
  } else {
    const reopened = reopenTty(deps.reopenTtyOverride);
    if (reopened !== null) {
      notify("stdin is non-interactive; opened /dev/tty for prompts.", "info");
      const configDeps: ConfigModuleDeps = {
        projectRoot: deps.projectRoot,
        authPath: deps.authPath,
        prompter: reopened,
        notify,
        ...(deps.execSyncOverride !== undefined
          ? { execSyncOverride: deps.execSyncOverride as never }
          : {}),
        ...(deps.fetchOverride !== undefined ? { fetchOverride: deps.fetchOverride } : {}),
      };
      for (const sub of subcommands) {
        await runConfig(configDeps, sub);
      }
      reopened.close();
    } else {
      notify(
        "Non-interactive environment detected and no controlling terminal available. Run `autodev config` in an interactive terminal to set up credentials.",
        "warning",
      );
    }
  }
}

/**
 * Map failing health checks to targeted config sub-commands for a broken
 * install. Discord is included if its config step (5) is not yet completed.
 */
async function brokenInstallSubcommands(
  checks: readonly DoctorCheck[],
  deps: DoctorDeps,
): Promise<string[]> {
  const subs = new Set<string>(targetedSubcommands(checks));

  // Always offer Discord if it hasn't been configured yet.
  try {
    const configState = await readState(deps.projectRoot, "config");
    if (!configState.completedSteps.includes(5)) {
      subs.add("discord");
    }
  } catch {
    // install-state.json missing → treat as not configured.
    subs.add("discord");
  }

  return Array.from(subs);
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

  checks.push(runMagicContextCheck(exec));

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  return { checks, passed, failed, configFlowLaunched: false };
}