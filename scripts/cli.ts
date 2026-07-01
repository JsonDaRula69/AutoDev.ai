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
 *   autodev docs query <text>      — search both project and central docs
 *   autodev docs rebuild central     — reindex the central docs corpus
 *   autodev docs rebuild project     — reindex the project docs corpus
 *   autodev debate start <topic>  — debate start stub (print message)
 *   autodev debate status      — debate status stub (print message)
 *   autodev stop-continuation  — stop all continuation loops
 *   autodev update             — self-update: migrate config, then update the package
 */
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
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
 * Resolve the pi agent directory, honoring `PI_CODING_AGENT_DIR` when set.
 *
 * install.sh writes models.json/auth.json/.env to `~/.AutoDev/agent/` and
 * exports `PI_CODING_AGENT_DIR` in the install shell + user's shell rc. But a
 * new shell that hasn't reloaded its rc will be missing the env var, so the
 * SDK's `getAgentDir()` falls back to its default `~/.pi/agent` — which has
 * nothing. When the env var is unset, prefer `~/.AutoDev/agent/` (the
 * install.sh location) if it exists on disk, and set the env var so every
 * downstream `getAgentDir()` call in this process resolves correctly.
 */
export async function resolveAgentDir(): Promise<string> {
  const home = process.env.HOME ?? "~";
  const autodevAgentDir = join(home, ".AutoDev", "agent");

  if (process.env.PI_CODING_AGENT_DIR === undefined) {
    if (existsSync(autodevAgentDir)) {
      process.env.PI_CODING_AGENT_DIR = autodevAgentDir;
    }
  }

  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    return getAgentDir();
  } catch {
    return join(home, ".pi", "agent");
  }
}

/**
 * Load <agentDir>/.env into process.env.
 * Resolves the agent dir via `resolveAgentDir()`, which honors
 * `PI_CODING_AGENT_DIR` and falls back to `~/.AutoDev/agent/` when the env
 * var is unset but that directory exists (the install.sh location).
 */
async function loadAgentEnv(): Promise<void> {
  const agentDir = await resolveAgentDir();
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
  const projectRoot = process.cwd();
  const authPath = await resolveAuthPath();
  const subcommands = parts.length > 0 ? [parts[0]] : ["llm", "voyage", "discord", "github"];

  const first = parts[0];
  if (first !== undefined && !["llm", "voyage", "discord", "github"].includes(first)) {
    notify("Usage: autodev config <sub-command>", "info");
    notify("", "info");
    notify("Sub-commands:", "info");
    notify("  llm      — configure LLM provider credentials", "info");
    notify("  voyage   — configure VoyageAI embeddings API key", "info");
    notify("  discord  — configure Discord bot token + channel ID", "info");
    notify("  github   — configure GitHub auth (PAT or gh auth login)", "info");
    notify("", "info");
    notify("Run `autodev config` with no sub-command to configure all in sequence.", "info");
    return 1;
  }

  try {
    const { runConfig } = await import(
      "../extensions/autodev/installer/config-module.js"
    );
    const { createPrompter } = await import(
      "../extensions/autodev/installer/prompts.js"
    );
    const prompter = createPrompter();
    try {
      for (const sub of subcommands) {
        await runConfig(
          {
            projectRoot,
            authPath,
            prompter,
            notify,
          },
          sub,
        );
      }
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

export async function cmdOnboard(partsOrOpts: string[] | {
  readonly runOnboardOverride?: typeof import("./onboard.js")["runOnboard"];
} = [], opts?: {
  readonly runOnboardOverride?: typeof import("./onboard.js")["runOnboard"];
}): Promise<number> {
  const parts = Array.isArray(partsOrOpts) ? partsOrOpts : [];
  const runOnboardOverride = Array.isArray(partsOrOpts) ? opts?.runOnboardOverride : partsOrOpts.runOnboardOverride;
  const verbose = parts.includes("--verbose") || parts.includes("-v");
  const projectRoot = process.cwd();
  const runOnboard = runOnboardOverride
    ?? (await import("./onboard.js")).runOnboard;
  return runOnboard({ projectRoot, notify, ...(verbose ? { verbose: true } : {}) });
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
    const { searchDocsBoth } = await import(
      "../extensions/autodev/docs/index.js"
    );
    const results = await searchDocsBoth(query, 5);
    notify(`Searching docs for: "${query}"`, "info");
    if (results.length === 0) {
      notify("No results found.", "info");
      return 0;
    }
    for (const r of results) {
      notify(`${r.doc_path} (#${r.chunk_index}) score=${r.score.toFixed(4)}`, "info");
      notify(r.content, "info");
      notify("", "info");
    }
    return 0;
  }

  if (sub === "rebuild") {
    const tier = parts[1]?.toLowerCase() ?? "";
    if (tier === "central" || tier === "project") {
      const { docsRebuildTier } = await import(
        "../extensions/autodev/docs/index.js"
      );
      const { embed } = await import(
        "../extensions/autodev/embeddings.js"
      );
      const result = await docsRebuildTier(tier, embed);
      notify(`Rebuilding ${tier} docs corpus index...`, "info");
      notify(`${result.chunks} chunks indexed, ${result.errors.length} errors`, "info");
      for (const err of result.errors) {
        notify(err, "error");
      }
      return 0;
    }
    if (tier === "") {
      notify("Usage: autodev docs rebuild <central|project>", "info");
      return 0;
    }
    notify(`Unknown tier: ${tier}. Use 'central' or 'project'.`, "error");
    return 1;
  }

  if (sub === "sources") {
    if (process.stdin.isTTY !== true) {
      notify("'autodev docs sources' requires an interactive terminal.", "warning");
      return 1;
    }
    const { runDocsSourcesCommand } = await import(
      "../extensions/autodev/installer/docs-sources.js"
    );
    const home = process.env.HOME ?? "~";
    const yamlPath = join(home, ".AutoDev", "config", "docs-sources.yaml");
    return runDocsSourcesCommand({ yamlPath });
  }

  notify(
    "Usage: autodev docs query <text> | autodev docs rebuild <central|project> | autodev docs sources",
    "info",
  );
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

async function cmdUninstall(): Promise<number> {
  const projectRoot = process.cwd();
  const { runUninstall } = await import(
    "../extensions/autodev/installer/uninstall-module.js"
  );
  const results = await runUninstall({ projectRoot, notify });
  notify("", "info");
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    notify(`  ${icon} ${r.name}: ${r.detail}`, r.ok ? "info" : "error");
  }
  const failed = results.filter((r) => !r.ok);
  return failed.length > 0 ? 1 : 0;
}

async function cmdUpdate(postUpdate: boolean = false): Promise<number> {
  notify("AutoDev Update", "info");
  notify("============================================", "info");

  // 1. Detect current version from installed package.json.
  let currentVersion: string = "0.0.0";
  try {
    const pkg = require("../../package.json") as { version?: string };
    currentVersion = pkg.version ?? "0.0.0";
  } catch {
    try {
      const { dirname } = require("node:path") as { dirname: (p: string) => string };
      let dir = dirname(__dirname);
      while (dir !== dirname(dir)) {
        const pkgPath = join(dir, "package.json");
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          currentVersion = pkg.version ?? "0.0.0";
          break;
        }
        dir = dirname(dir);
      }
    } catch {
    }
  }
  notify(`Current version: ${currentVersion}`, "info");

  if (!postUpdate) {
    // 2. Check npm registry for latest version.
    try {
      execSync("npm cache clean --force 2>/dev/null", { encoding: "utf-8", timeout: 15_000 });
    } catch {
    }
    let latestVersion: string;
    try {
      const result = execSync("npm view autodev-ai version 2>/dev/null", { encoding: "utf-8", timeout: 15_000 }).trim();
      latestVersion = result || currentVersion;
    } catch {
      notify("Could not reach npm registry. Check your network connection.", "warning");
      return 1;
    }
    notify(`Latest version:  ${latestVersion}`, "info");

    // 3. Compare versions.
    const { compareSemver } = await import("../extensions/autodev/installer/migrations.js");
    if (compareSemver(latestVersion, currentVersion) <= 0) {
      notify("Already up to date.", "info");
      // Still run pending migrations in case a previous update didn't run them.
      return cmdUpdate(true);
    }

    // 4. Self-update the package FIRST (update the updater before running migrations).
    notify("\nUpdating autodev-ai...", "info");
    const home = process.env.HOME ?? "~";
    const bunCacheDir = join(home, ".bun", "install", "cache");
    if (existsSync(bunCacheDir)) {
      try {
        execSync(`rm -rf "${bunCacheDir}"`, { stdio: "pipe", timeout: 10_000 });
        notify("Cleared bun global cache.", "info");
      } catch {
      }
    }

    let updateCommand: string | null = null;
    try {
      const configModule = require("@earendil-works/pi-coding-agent/dist/config.js") as {
        getSelfUpdateCommand: (pkg: string) => { display: string } | undefined;
      };
      const cmd = configModule.getSelfUpdateCommand("autodev-ai");
      if (cmd) {
        updateCommand = cmd.display;
      }
    } catch {
    }

    if (updateCommand === null) {
      updateCommand = `bun install -g autodev-ai@${latestVersion}`;
    }
    notify(`Running: ${updateCommand}`, "info");

    try {
      execSync(updateCommand, { stdio: "inherit", timeout: 120_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notify(`Update failed: ${msg}`, "error");
      notify("You may need to update manually.", "warning");
      return 1;
    }

    // 5. Re-exec from the NEW code to run migrations + verify.
    notify("\nRe-launching from updated code to run migrations...", "info");
    const { execSync: reExec } = require("node:child_process") as { execSync: (cmd: string, opts: { stdio: string }) => void };
    try {
      reExec("autodev update --post-update", { stdio: "inherit" });
    } catch {
      notify("Post-update re-exec failed. Migrations may not have run.", "warning");
      notify("Run 'autodev update --post-update' manually.", "info");
    }
    return 0;
  }

  // Post-update phase: running from the NEW code after self-update.
  // 6. Resolve agent dir for migrations.
  let agentDir: string;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    agentDir = getAgentDir();
  } catch {
    agentDir = join(process.env.HOME ?? "~", ".AutoDev", "agent");
  }

  // 7. Run migrations using the NEW code's MIGRATIONS array.
  const { MIGRATIONS, getLastMigratedVersion, writeCurrentVersion, selectMigrations, runMigrations } =
    await import("../extensions/autodev/installer/migrations.js");

  const lastMigrated = getLastMigratedVersion(agentDir);
  const pendingMigrations = selectMigrations(MIGRATIONS, lastMigrated ?? "0.0.0", currentVersion);

  if (pendingMigrations.length > 0) {
    notify(`\nRunning ${pendingMigrations.length} migration(s)...`, "info");
    const migrationResults = runMigrations(pendingMigrations, agentDir);
    for (const r of migrationResults) {
      const icon = r.ok ? "✓" : "✗";
      notify(`  ${icon} ${r.name}: ${r.detail}`, r.ok ? "info" : "error");
    }
    const failedMigrations = migrationResults.filter((r) => !r.ok);
    if (failedMigrations.length > 0) {
      notify(`${failedMigrations.length} migration(s) failed.`, "error");
      return 1;
    }
    writeCurrentVersion(agentDir, currentVersion);
    notify("Migrations complete.", "info");
  } else {
    notify("No migrations needed for this update.", "info");
    writeCurrentVersion(agentDir, currentVersion);
  }

  // 8. Post-update verification.
  notify(`\nUpdated to version ${currentVersion}.`, "info");
  notify("Update complete. Run 'autodev doctor' to verify your setup.", "info");
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
      return cmdOnboard(rest);

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

    case "uninstall":
      return cmdUninstall();

    case "update":
      return cmdUpdate(rest.includes("--post-update"));

    default:
      notify(`Unknown subcommand: ${subcommand}`, "error");
      notify(HELP_SUBCOMMANDS, "info");
      return 1;
  }
}

/** Canonical subcommand list for help text. */
export const HELP_SUBCOMMANDS =
  "AutoDev subcommands: init, onboard [--verbose], doctor, config [llm|voyage|discord|github|verbose], status, stop, update, uninstall, docs query, docs rebuild central, docs rebuild project, docs sources, debate start, debate status, stop-continuation";

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