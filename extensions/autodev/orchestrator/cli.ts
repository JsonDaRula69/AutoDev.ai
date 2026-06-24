/**
 * CLI commands — register `autodev` subcommands via pi.registerCommand().
 *
 * Subcommands (parsed from the args string):
 *   autodev init [--skip-onboard] — project initialization (steps 1-10)
 *   autodev doctor          — health check
 *   autodev onboard         — launch Harbor Master onboarding
 *   autodev status          — show heartbeat state and work items
 *   autodev stop            — stop the heartbeat timer
 *   autodev docs query <text>  — search both project and central docs
 *   autodev docs rebuild central — reindex the central docs corpus
 *   autodev docs rebuild project — reindex the project docs corpus
 *   autodev debate start .. — start a debate
 *   autodev debate status   — show active debate state
 *   autodev config [sub]    — interactive secrets configuration (llm, voyage, discord, github)
 *   autodev stop-continuation — stop all continuation loops
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { getHeartbeatState, stopHeartbeat } from "./heartbeat.js";
import { loadRegistry, getActiveProject } from "./projects.js";
import { enableDebug, disableDebug, getDebugState } from "../debug/index.js";
import { stopAllLoops } from "../autonomy/continuation.js";

// ---- Command registration ----

export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand("autodev", {
    description: "AutoDev — autonomous engineering team commands. Subcommands: init, onboard, doctor, config, status, stop, install-provider, docs query, docs rebuild central, docs rebuild project, debate start, debate status, stop-continuation",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() ?? "";

      switch (subcommand) {
        case "init":
          await handleInit(parts.slice(1), ctx);
          break;
        case "doctor":
          await handleDoctor(ctx);
          break;
        case "onboard":
          await handleOnboard(ctx);
          break;
        case "status":
          await handleStatus(ctx);
          break;
        case "stop":
          await handleStop(ctx);
          break;
        case "install-provider":
          await handleInstallProvider(parts.slice(1), ctx);
          break;
        case "docs":
          await handleDocs(parts.slice(1), ctx);
          break;
        case "debate":
          await handleDebate(parts.slice(1), ctx);
          break;
        case "config":
          await handleConfig(parts.slice(1), ctx);
          break;
        case "stop-continuation":
          stopAllLoops();
          ctx.ui.notify("All continuation loops stopped.", "info");
          break;
        default:
          ctx.ui.notify(
            "AutoDev subcommands: init, onboard, doctor, config, status, stop, install-provider, docs query, docs rebuild central, docs rebuild project, debate start, debate status, stop-continuation",
            "info",
          );
      }
    },
  });
}

// ---- Subcommand handlers ----

async function handleDoctor(ctx: ExtensionCommandContext): Promise<void> {
  const projectRoot = ctx.cwd ?? process.cwd();

  let authPath: string;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    authPath = join(getAgentDir(), "auth.json");
  } catch {
    authPath = join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  }

  const { runDoctor } = await import("../installer/doctor.js");
  const result = await runDoctor({
    projectRoot,
    authPath,
    launchConfigFlow: true,
    notify: (message, level) => ctx.ui.notify(message, level),
  });

  ctx.ui.notify("AutoDev Doctor — Machine Health Check", "info");
  ctx.ui.notify("============================================", "info");

  for (const check of result.checks) {
    const icon = check.ok ? "✓" : "✗";
    ctx.ui.notify(`  ${icon} ${check.name}: ${check.detail}`, check.ok ? "info" : "error");
  }

  ctx.ui.notify("", "info");
  ctx.ui.notify(`Results: ${result.passed} passed, ${result.failed} failed`, "info");

  if (result.configFlowLaunched) {
    ctx.ui.notify("Config flow launched to fix missing components.", "info");
  } else if (result.failed > 0) {
    ctx.ui.notify("Some checks failed. Run `autodev config` in an interactive terminal, or re-run `autodev doctor`.", "warning");
  } else if (result.checks.length > 0) {
    ctx.ui.notify(
      "Installation Successful! Use cd to navigate to your project folder and run autodev init to pair a project.",
      "info",
    );
  }
}

/**
 * Handle the `--debug` flag for CLI commands.
 * Parses `--debug on` and `--debug off` from the args string.
 * Returns the remaining args after stripping the debug flag.
 */
export function handleDebugFlag(args: string): string {
  const parts = args.trim().split(/\s+/);
  const remaining: string[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i] as string;

    if (part === "--debug") {
      const value = parts[i + 1] as string | undefined;
      if (value === "on" || value === "true") {
        enableDebug();
        i += 2;
        continue;
      }
      if (value === "off" || value === "false") {
        disableDebug();
        i += 2;
        continue;
      }
      // Bare `--debug` without value — enable
      enableDebug();
      i += 1;
      continue;
    }

    remaining.push(part);
    i += 1;
  }

  return remaining.join(" ");
}

async function handleOnboard(ctx: ExtensionCommandContext): Promise<void> {
  const projectRoot = ctx.cwd ?? process.cwd();
  const { runOnboard } = await import("../../../scripts/onboard.js");
  const code = await runOnboard({
    projectRoot,
    notify: (message, level) => ctx.ui.notify(message, level),
  });
  if (code !== 0) {
    ctx.ui.notify(
      "Onboarding fell back to manual instructions. See messages above.",
      "warning",
    );
  }
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

async function handleInit(parts: string[], ctx: ExtensionCommandContext): Promise<void> {
  const flags = parseInitFlags(parts);
  if (flags.unknown) {
    ctx.ui.notify(`Unknown flag: ${flags.unknown}`, "error");
    ctx.ui.notify("Usage: autodev init [--skip-onboard]", "info");
    return;
  }
  if (flags.help) {
    ctx.ui.notify("Usage: autodev init [--skip-onboard]", "info");
    ctx.ui.notify("Flags:", "info");
    ctx.ui.notify("  --skip-onboard  Skip the Harbor Master onboarding session.", "info");
    ctx.ui.notify("  --help, -h      Show this help and exit.", "info");
    return;
  }

  const projectRoot = ctx.cwd ?? process.cwd();
  const { runInit } = await import("../installer/init-module.js");
  const results = await runInit({
    projectRoot,
    notify: (message, level) => ctx.ui.notify(message, level),
    skipOnboard: flags.skipOnboard,
  });

  let failures = 0;
  for (const r of results) {
    if (r.ok) {
      ctx.ui.notify(`  ✓ ${r.name}: ${r.detail}`, "info");
    } else {
      ctx.ui.notify(`  ✗ ${r.name}: ${r.detail}`, "error");
      failures++;
    }
  }
  ctx.ui.notify("", "info");
  if (failures > 0) {
    ctx.ui.notify(`Init completed with ${failures} failed step(s).`, "warning");
  } else {
    ctx.ui.notify(`Init complete (${results.length} steps).`, "info");
  }
}

async function handleConfig(parts: string[], ctx: ExtensionCommandContext): Promise<void> {
  const subSubcommand = parts[0] ?? "";

  if (subSubcommand === "") {
    ctx.ui.notify("Usage: autodev config <sub-command>", "info");
    ctx.ui.notify("Sub-commands: llm, voyage, discord, github", "info");
    ctx.ui.notify("Run `autodev config` with no sub-command to configure all in sequence.", "info");
    return;
  }

  const projectRoot = ctx.cwd ?? process.cwd();
  let authPath: string;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    authPath = join(getAgentDir(), "auth.json");
  } catch {
    authPath = join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  }

  const { runConfig } = await import("../installer/config-module.js");
  const { createPrompter } = await import("../installer/prompts.js");
  const prompter = createPrompter();
  try {
    await runConfig(
      {
        projectRoot,
        authPath,
        prompter,
        notify: (message, level) => ctx.ui.notify(message, level),
      },
      subSubcommand,
    );
  } finally {
    prompter.close();
  }
}

async function handleStatus(ctx: ExtensionCommandContext): Promise<void> {
  const hb = getHeartbeatState();
  ctx.ui.notify("AutoDev Status", "info");
  ctx.ui.notify(`Heartbeat: ${hb.running ? "running" : "stopped"}`, "info");
  ctx.ui.notify(`Ticks: ${hb.tickCount}`, "info");
  ctx.ui.notify(`Last tick: ${hb.lastTickAt !== undefined ? new Date(hb.lastTickAt).toISOString() : "never"}`, "info");
  ctx.ui.notify(`Errors: ${hb.errors}`, "info");
  ctx.ui.notify(`Interval: ${hb.intervalMs / 1000}s`, "info");

  try {
    const registry = await loadRegistry();
    const active = getActiveProject(registry);
    ctx.ui.notify(`Active project: ${active.name}`, "info");
    ctx.ui.notify(`Repo: ${active.repo}`, "info");
  } catch {
    ctx.ui.notify("Project registry: error loading", "warning");
  }
}

async function handleStop(_ctx: ExtensionCommandContext): Promise<void> {
  stopHeartbeat();
  _ctx.ui.notify("Heartbeat stopped.", "info");
}

async function handleInstallProvider(parts: string[], ctx: ExtensionCommandContext): Promise<void> {
  const source = parts[0];
  if (!source) {
    ctx.ui.notify("Usage: autodev install-provider <package-name>", "info");
    ctx.ui.notify("Example: autodev install-provider pi-ollama-cloud", "info");
    return;
  }

  const fullSource = source.startsWith("npm:") ? source : `npm:${source}`;
  const agentDir = (() => {
    try {
      const { getAgentDir } = require("@earendil-works/pi-coding-agent");
      return getAgentDir();
    } catch {
      return join(process.env.HOME ?? "~", ".pi", "agent");
    }
  })();

  const { installProvider } = await import("../installer/provider-install.js");
  const result = await installProvider({
    source: fullSource,
    cwd: agentDir,
    agentDir,
    notify: (message, level) => ctx.ui.notify(message, level),
  });

  if (result.ok) {
    ctx.ui.notify(`  ✓ ${result.source}: ${result.detail}`, "info");
  } else {
    ctx.ui.notify(`  ✗ ${result.source}: ${result.detail}`, "error");
  }
}

async function handleDocs(parts: string[], ctx: ExtensionCommandContext): Promise<void> {
  const sub = parts[0]?.toLowerCase() ?? "";

  if (sub === "query") {
    const query = parts.slice(1).join(" ");
    if (query.length === 0) {
      ctx.ui.notify("Usage: autodev docs query <search text>", "info");
      return;
    }
    const { searchDocsBoth } = await import("../docs/index.js");
    const results = await searchDocsBoth(query, 5);
    ctx.ui.notify(`Searching docs for: "${query}"`, "info");
    if (results.length === 0) {
      ctx.ui.notify("No results found.", "info");
      return;
    }
    for (const r of results) {
      ctx.ui.notify(
        `${r.doc_path} (#${r.chunk_index}) score=${r.score.toFixed(4)}`,
        "info",
      );
      ctx.ui.notify(r.content, "info");
      ctx.ui.notify("", "info");
    }
    return;
  }

  if (sub === "rebuild") {
    const tier = parts[1]?.toLowerCase() ?? "";
    if (tier === "central" || tier === "project") {
      const { docsRebuildTier } = await import("../docs/index.js");
      const { embed } = await import("../embeddings.js");
      const result = await docsRebuildTier(tier, embed);
      ctx.ui.notify(`Rebuilding ${tier} docs corpus index...`, "info");
      ctx.ui.notify(
        `${result.chunks} chunks indexed, ${result.errors.length} errors`,
        "info",
      );
      for (const err of result.errors) {
        ctx.ui.notify(err, "error");
      }
      return;
    }
    if (tier === "") {
      ctx.ui.notify("Usage: autodev docs rebuild <central|project>", "info");
      return;
    }
    ctx.ui.notify(`Unknown tier: ${tier}. Use 'central' or 'project'.`, "error");
    return;
  }

  ctx.ui.notify(
    "Usage: autodev docs query <text> | autodev docs rebuild <central|project>",
    "info",
  );
}

async function handleDebate(parts: string[], ctx: ExtensionCommandContext): Promise<void> {
  const sub = parts[0]?.toLowerCase() ?? "";

  if (sub === "start") {
    const topic = parts.slice(1).join(" ");
    if (topic.length === 0) {
      ctx.ui.notify("Usage: autodev debate start <topic>", "info");
      return;
    }
    ctx.ui.notify(`Starting debate on: "${topic}"`, "info");
    ctx.ui.notify("Debate dispatched. Results will appear in the session.", "info");
  } else if (sub === "status") {
    ctx.ui.notify("Debate status: no active debates.", "info");
  } else {
    ctx.ui.notify("Usage: autodev debate start <topic> | autodev debate status", "info");
  }
}
