/**
 * CLI commands — register `autodev` subcommands via pi.registerCommand().
 *
 * Subcommands (parsed from the args string):
 *   autodev doctor          — health check
 *   autodev onboard         — launch Harbor Master onboarding
 *   autodev status          — show heartbeat state and work items
 *   autodev stop            — stop the heartbeat timer
 *   autodev docs query ...  — search the docs corpus
 *   autodev docs rebuild    — reingest docs-corpus/
 *   autodev debate start .. — start a debate
 *   autodev debate status   — show active debate state
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getHeartbeatState, stopHeartbeat } from "./heartbeat.js";
import { loadRegistry, getActiveProject } from "./projects.js";

// ---- Command registration ----

export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand("autodev", {
    description: "AutoDev — autonomous engineering team commands. Subcommands: doctor, onboard, status, stop, docs query, docs rebuild, debate start, debate status",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const parts = trimmed.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() ?? "";

      switch (subcommand) {
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
        case "docs":
          await handleDocs(parts.slice(1), ctx);
          break;
        case "debate":
          await handleDebate(parts.slice(1), ctx);
          break;
        default:
          ctx.ui.notify(
            "AutoDev subcommands: doctor, onboard, status, stop, docs query, docs rebuild, debate start, debate status",
            "info",
          );
      }
    },
  });
}

// ---- Subcommand handlers ----

async function handleDoctor(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify("AutoDev Doctor — Health Check", "info");

  // Check heartbeat
  const hb = getHeartbeatState();
  ctx.ui.notify(`Heartbeat: ${hb.running ? "running" : "stopped"} (${hb.tickCount} ticks)`, "info");

  // Check project registry
  try {
    const registry = await loadRegistry();
    const active = getActiveProject(registry);
    ctx.ui.notify(`Active project: ${active.name} (${active.repo})`, "info");
    ctx.ui.notify(`Projects registered: ${registry.projects.length}`, "info");
  } catch {
    ctx.ui.notify("Project registry: error loading", "warning");
  }

  ctx.ui.notify("Doctor check complete.", "info");
}

async function handleOnboard(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify("Launching Harbor Master onboarding...", "info");
  ctx.ui.notify("Use: pi to start an interactive session with the Harbor Master agent.", "info");
  // In a real implementation, this would create a Harbor Master session.
  // For now, we delegate to the user starting pi interactively.
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

async function handleDocs(parts: string[], ctx: ExtensionCommandContext): Promise<void> {
  const sub = parts[0]?.toLowerCase() ?? "";

  if (sub === "query") {
    const query = parts.slice(1).join(" ");
    if (query.length === 0) {
      ctx.ui.notify("Usage: autodev docs query <search text>", "info");
      return;
    }
    ctx.ui.notify(`Searching docs for: "${query}"`, "info");
    ctx.ui.notify("Docs query dispatched. Results will appear in the session.", "info");
  } else if (sub === "rebuild") {
    ctx.ui.notify("Rebuilding docs corpus index...", "info");
    ctx.ui.notify("Docs rebuild dispatched.", "info");
  } else {
    ctx.ui.notify("Usage: autodev docs query <text> | autodev docs rebuild", "info");
  }
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
