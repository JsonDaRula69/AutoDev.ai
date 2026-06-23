#!/usr/bin/env bun
/**
 * AutoDev CLI entrypoint — `autodev` bin target.
 *
 * Replaces the old preinstall-guard / postinstall lifecycle hooks with a
 * real CLI subcommand switch that calls the underlying exported functions
 * directly (NOT via the orchestrator's command-registry API or private
 * handlers from `orchestrator/cli.ts`).
 *
 * First loads `~/.pi/agent/.env` into `process.env` via manual parsing
 * (Bun only auto-loads `.env` from cwd, but the autodev bin runs from
 * arbitrary cwd and needs the agent-dir env).
 *
 * Subcommands:
 *   autodev init [--skip-onboard] — project initialization (steps 1-10)
 *   autodev doctor             — machine-level health check
 *   autodev config [sub]       — config module (runConfig, created in todo 4)
 *   autodev onboard            — launch Harbor Master onboarding
 *   autodev status             — heartbeat state + active project
 *   autodev stop               — stop heartbeat timer
 *   autodev docs query <text> — docs query stub (print message)
 *   autodev docs rebuild       — docs rebuild stub (print message)
 *   autodev debate start <topic>  — debate start stub (print message)
 *   autodev debate status      — debate status stub (print message)
 *   autodev stop-continuation  — stop all continuation loops
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type { DoctorExecFn } from "../extensions/autodev/installer/doctor.js";

// ---- Helpers (ported from installer/index.ts:138-154, deleted in todo 8) ----

/**
 * Resolve the auth.json path under the pi agent dir.
 * Uses dynamic import() for ESM compatibility (package.json has type:module).
 * Falls back to ~/.pi/agent/auth.json when the pi-coding-agent package is
 * unavailable or getAgentDir throws.
 */
async function resolveAuthPath(): Promise<string> {
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    return join(getAgentDir(), "auth.json");
  } catch {
    return join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  }
}

/**
 * Detect non-interactive mode: --non-interactive flag, piped stdin, or CI.
 */
function autoNonInteractive(argsNonInteractive: boolean): boolean {
  if (argsNonInteractive) return true;
  if (process.stdin.isTTY !== true) return true;
  if (process.env.CI !== undefined) return true;
  return false;
}

/**
 * Load a .env file into process.env using manual parsing.
 * Supports KEY=VALUE lines, # comments, and quoted values.
 */
function loadEnvFile(filePath: string): void {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return; // missing file is fine
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't override existing env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Load ~/.pi/agent/.env into process.env.
 * Resolves the agent dir via dynamic import of getAgentDir, falling back
 * to ~/.pi/agent when unavailable.
 */
async function loadAgentEnv(): Promise<void> {
  let agentDir: string;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    agentDir = getAgentDir();
  } catch {
    agentDir = join(process.env.HOME ?? "~", ".pi", "agent");
  }
  loadEnvFile(join(agentDir, ".env"));
}

// ---- Print helper (replaces ctx.ui.notify for CLI) ----

function notify(msg: string, level: "info" | "warning" | "error" = "info"): void {
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(msg + "\n");
}

// ---- Subcommand handlers ----

export async function cmdDoctor(opts?: {
  readonly runDoctorOverride?: typeof import("../extensions/autodev/installer/doctor.js")["runDoctor"];
}): Promise<number> {
  const projectRoot = process.cwd();
  const authPath = await resolveAuthPath();

  const runDoctor =
    opts?.runDoctorOverride ??
    (await import("../extensions/autodev/installer/doctor.js")).runDoctor;
  const realExec: DoctorExecFn = (cmd, opts2) =>
    execSync(cmd, opts2 ?? {}) as unknown as string;

  const result = await runDoctor({
    projectRoot,
    authPath,
    execSyncOverride: realExec,
    launchConfigFlow: true,
    notify,
  });

  notify("AutoDev Doctor — Machine Health Check", "info");
  notify("============================================", "info");

  for (const check of result.checks) {
    const icon = check.ok ? "✓" : "✗";
    notify(`  ${icon} ${check.name}: ${check.detail}`, check.ok ? "info" : "error");
  }

  notify("", "info");
  notify(`Results: ${result.passed} passed, ${result.failed} failed`, "info");

  if (result.configFlowLaunched) {
    notify("Config flow launched to fix missing components.", "info");
  } else if (result.failed > 0) {
    notify("Some checks failed. Run `autodev install` to fix.", "warning");
  } else if (result.checks.length > 0) {
    notify(
      "Installation Successful! Use cd to navigate to your project folder and run autodev init to pair a project.",
      "info",
    );
  }

  return result.failed > 0 ? 1 : 0;
}

async function cmdConfig(parts: string[]): Promise<number> {
  if (parts.length === 0) {
    notify("Usage: autodev config <sub-command>", "info");
    notify("", "info");
    notify("Sub-commands:", "info");
    notify("  llm      — configure LLM provider credentials", "info");
    notify("  voyage   — configure VoyageAI embeddings API key", "info");
    notify("  discord  — configure Discord bot token + channel ID", "info");
    notify("  github   — configure GitHub auth (PAT or gh auth login)", "info");
    notify("", "info");
    notify("Run `autodev config` with no sub-command to configure all in sequence.", "info");
    return 0;
  }

  const projectRoot = process.cwd();
  const authPath = await resolveAuthPath();
  const subSubcommand = parts[0] ?? "";

  try {
    const { runConfig } = await import(
      "../extensions/autodev/installer/config-module.js"
    );
    const { createPrompter } = await import(
      "../extensions/autodev/installer/prompts.js"
    );
    const prompter = createPrompter();
    try {
      await runConfig(
        {
          projectRoot,
          authPath,
          prompter,
          notify,
        },
        subSubcommand,
      );
    } finally {
      prompter.close();
    }
  } catch (e) {
    notify(
      `autodev config: ${e instanceof Error ? e.message : String(e)}`,
      "error",
    );
    return 1;
  }
  return 0;
}

export async function cmdOnboard(opts?: {
  readonly runOnboardOverride?: typeof import("./onboard.js")["runOnboard"];
}): Promise<number> {
  const projectRoot = process.cwd();
  const runOnboard = opts?.runOnboardOverride
    ?? (await import("./onboard.js")).runOnboard;
  return runOnboard({ projectRoot, notify });
}

/**
 * `autodev init` — run project-level initialization (steps 1-10) via runInit.
 *
 * Flags:
 *   --skip-onboard  Skip the Harbor Master onboarding session (step 10).
 *   --help, -h      Print usage and return 0.
 *
 * Returns 0 on success, 1 on unknown flag or runInit failure.
 */
export async function cmdInit(parts: string[], opts?: {
  readonly runInitOverride?: typeof import("../extensions/autodev/installer/init-module.js")["runInit"];
}): Promise<number> {
  const flags = parseInitFlags(parts);
  if (flags.unknown) {
    notify(`Unknown flag: ${flags.unknown}`, "error");
    printInitUsage();
    return 1;
  }
  if (flags.help) {
    printInitUsage();
    return 0;
  }

  const projectRoot = process.cwd();
  const runInit = opts?.runInitOverride
    ?? (await import("../extensions/autodev/installer/init-module.js")).runInit;
  const results = await runInit({
    projectRoot,
    notify,
    skipOnboard: flags.skipOnboard,
  });

  let failures = 0;
  for (const r of results) {
    if (r.ok) {
      notify(`  ✓ ${r.name}: ${r.detail}`, "info");
    } else {
      notify(`  ✗ ${r.name}: ${r.detail}`, "error");
      failures++;
    }
  }
  notify("", "info");
  if (failures > 0) {
    notify(`Init completed with ${failures} failed step(s).`, "warning");
    return 1;
  }
  notify(`Init complete (${results.length} steps).`, "info");
  return 0;
}

interface InitFlags {
  readonly skipOnboard: boolean;
  readonly help: boolean;
  readonly unknown: string | undefined;
}

function parseInitFlags(parts: string[]): InitFlags {
  let skipOnboard = false;
  let help = false;
  for (const p of parts) {
    if (p === "--skip-onboard") skipOnboard = true;
    else if (p === "--help" || p === "-h") help = true;
    else return { skipOnboard, help, unknown: p };
  }
  return { skipOnboard, help, unknown: undefined };
}

function printInitUsage(): void {
  notify("Usage: autodev init [--skip-onboard]", "info");
  notify("", "info");
  notify("Flags:", "info");
  notify("  --skip-onboard  Skip the Harbor Master onboarding session (step 10).", "info");
  notify("  --help, -h      Show this help and exit.", "info");
}

async function cmdStatus(): Promise<number> {
  const { getHeartbeatState } = await import(
    "../extensions/autodev/orchestrator/heartbeat.js"
  );
  const { loadRegistry, getActiveProject } = await import(
    "../extensions/autodev/orchestrator/projects.js"
  );

  const hb = getHeartbeatState();
  notify("AutoDev Status", "info");
  notify(`Heartbeat: ${hb.running ? "running" : "stopped"}`, "info");
  notify(`Ticks: ${hb.tickCount}`, "info");
  notify(
    `Last tick: ${hb.lastTickAt !== undefined ? new Date(hb.lastTickAt).toISOString() : "never"}`,
    "info",
  );
  notify(`Errors: ${hb.errors}`, "info");
  notify(`Interval: ${hb.intervalMs / 1000}s`, "info");

  try {
    const registry = await loadRegistry();
    const active = getActiveProject(registry);
    notify(`Active project: ${active.name}`, "info");
    notify(`Repo: ${active.repo}`, "info");
  } catch {
    notify("Project registry: error loading", "warning");
  }
  return 0;
}

async function cmdStop(): Promise<number> {
  const { stopHeartbeat } = await import(
    "../extensions/autodev/orchestrator/heartbeat.js"
  );
  stopHeartbeat();
  notify("Heartbeat stopped.", "info");
  return 0;
}

async function cmdDocs(parts: string[]): Promise<number> {
  const sub = parts[0]?.toLowerCase() ?? "";

  if (sub === "query") {
    const query = parts.slice(1).join(" ");
    if (query.length === 0) {
      notify("Usage: autodev docs query <search text>", "info");
      return 0;
    }
    notify(`Searching docs for: "${query}"`, "info");
    notify("Docs query dispatched. Results will appear in the session.", "info");
  } else if (sub === "rebuild") {
    notify("Rebuilding docs corpus index...", "info");
    notify("Docs rebuild dispatched.", "info");
  } else {
    notify("Usage: autodev docs query <text> | autodev docs rebuild", "info");
  }
  return 0;
}

async function cmdDebate(parts: string[]): Promise<number> {
  const sub = parts[0]?.toLowerCase() ?? "";

  if (sub === "start") {
    const topic = parts.slice(1).join(" ");
    if (topic.length === 0) {
      notify("Usage: autodev debate start <topic>", "info");
      return 0;
    }
    notify(`Starting debate on: "${topic}"`, "info");
    notify("Debate dispatched. Results will appear in the session.", "info");
  } else if (sub === "status") {
    notify("Debate status: no active debates.", "info");
  } else {
    notify("Usage: autodev debate start <topic> | autodev debate status", "info");
  }
  return 0;
}

async function cmdStopContinuation(): Promise<number> {
  const { stopAllLoops } = await import(
    "../extensions/autodev/autonomy/continuation.js"
  );
  stopAllLoops();
  notify("All continuation loops stopped.", "info");
  return 0;
}

// ---- Main ----

async function main(): Promise<number> {
  // Load ~/.pi/agent/.env FIRST (Bun only auto-loads cwd/.env)
  await loadAgentEnv();

  const argv = process.argv.slice(2);
  const trimmed = argv.join(" ").trim();
  const parts = trimmed.length > 0 ? trimmed.split(/\s+/) : [];
  const subcommand = parts[0]?.toLowerCase() ?? "";
  const rest = parts.slice(1);

  switch (subcommand) {
    case "":
      notify(HELP_SUBCOMMANDS, "info");
      return 0;

    case "doctor":
      return cmdDoctor();

    case "config":
      return cmdConfig(rest);

    case "init":
      return cmdInit(rest);

    case "onboard":
      return cmdOnboard();

    case "status":
      return cmdStatus();

    case "stop":
      return cmdStop();

    case "docs":
      return cmdDocs(rest);

    case "debate":
      return cmdDebate(rest);

    case "stop-continuation":
      return cmdStopContinuation();

    default:
      notify(`Unknown subcommand: ${subcommand}`, "error");
      notify(HELP_SUBCOMMANDS, "info");
      return 1;
  }
}

/** Canonical subcommand list for help text. */
export const HELP_SUBCOMMANDS =
  "AutoDev subcommands: init, onboard, doctor, config, status, stop, docs query, docs rebuild, debate start, debate status, stop-continuation";

if (import.meta.main) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((e) => {
      console.error(
        `AutoDev CLI error: ${e instanceof Error ? e.message : String(e)}`,
      );
      process.exit(1);
    });
}