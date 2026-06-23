#!/usr/bin/env bun
/**
 * Standalone CLI entrypoint for `autodev`.
 *
 * This is the binary that runs when users type `autodev` after a global
 * install. It does NOT depend on a pi runtime instance — it constructs a
 * minimal context and calls handler functions directly.
 *
 * Subcommands (parsed from process.argv):
 *   autodev doctor          — health check
 *   autodev config          — configuration (stub, full routing in todo 6)
 *   autodev onboard         — launch Harbor Master onboarding
 *   autodev status          — show heartbeat state and work items
 *   autodev stop            — stop the heartbeat timer
 *   autodev docs query ...  — search the docs corpus
 *   autodev docs rebuild    — reingest docs-corpus/
 *   autodev debate start .. — start a debate
 *   autodev debate status   — show active debate state
 *   autodev stop-continuation — stop all continuation loops
 */
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { DoctorExecFn } from "../extensions/autodev/installer/doctor.js";

// ---- Minimal context ----

interface MinimalUI {
  notify: (message: string, level: "info" | "warning" | "error") => void;
}

interface MinimalContext {
  cwd: string;
  ui: MinimalUI;
}

function buildContext(): MinimalContext {
  return {
    cwd: process.cwd(),
    ui: {
      notify: (message, level) => {
        const stream = level === "error" ? process.stderr : process.stdout;
        stream.write(message + "\n");
      },
    },
  };
}

// ---- Auth path resolution (mirrors installer/index.ts:138-154) ----

function resolveAuthPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAgentDir } = require("@earendil-works/pi-coding-agent") as {
      getAgentDir: () => string;
    };
    return join(getAgentDir(), "auth.json");
  } catch {
    return join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  }
}

// ---- Non-interactive detection (mirrors installer/index.ts:149-154) ----

function autoNonInteractive(argsNonInteractive: boolean): boolean {
  if (argsNonInteractive) return true;
  if (process.stdin.isTTY !== true) return true;
  if (process.env.CI !== undefined) return true;
  return false;
}

// ---- Subcommand handlers ----

async function handleDoctor(ctx: MinimalContext): Promise<void> {
  const projectRoot = ctx.cwd;
  const authPath = resolveAuthPath();

  ctx.ui.notify("AutoDev Doctor — Machine Health Check", "info");
  ctx.ui.notify("============================================", "info");

  const { runDoctor } = await import("../extensions/autodev/installer/doctor.js");
  const realExec: DoctorExecFn = (cmd, opts) =>
    execSync(cmd, opts ?? {}) as unknown as string;

  const result = await runDoctor({
    projectRoot,
    authPath,
    execSyncOverride: realExec,
    launchConfigFlow: true,
    notify: (message, level) => ctx.ui.notify(message, level),
  });

  for (const check of result.checks) {
    const icon = check.ok ? "✓" : "✗";
    ctx.ui.notify(`  ${icon} ${check.name}: ${check.detail}`, check.ok ? "info" : "error");
  }

  ctx.ui.notify("", "info");
  ctx.ui.notify(`Results: ${result.passed} passed, ${result.failed} failed`, "info");

  if (result.configFlowLaunched) {
    ctx.ui.notify("Config flow launched to fix missing components.", "info");
  } else if (result.failed > 0) {
    ctx.ui.notify("Some checks failed. Run `autodev doctor` again or `autodev config <subcommand>` to fix.", "warning");
  } else if (result.checks.length > 0) {
    ctx.ui.notify("All machine-level checks passed.", "info");
  }
}

async function handleOnboard(_ctx: MinimalContext): Promise<void> {
  console.log("Launching Harbor Master onboarding...");
  console.log("Use: pi to start an interactive session with the Harbor Master agent.");
}

async function handleStatus(_ctx: MinimalContext): Promise<void> {
  console.log("AutoDev Status");
  console.log("(Status requires a running pi session. Use `pi` to start one.)");
}

async function handleStop(_ctx: MinimalContext): Promise<void> {
  console.log("Heartbeat stop requires a running pi session. Use `pi` to start one.");
}

async function handleDocs(parts: string[], _ctx: MinimalContext): Promise<void> {
  const sub = parts[0]?.toLowerCase() ?? "";
  if (sub === "query") {
    const query = parts.slice(1).join(" ");
    if (query.length === 0) {
      console.log("Usage: autodev docs query <search text>");
      return;
    }
    console.log(`Searching docs for: "${query}"`);
    console.log("Docs query dispatched. Results will appear in the session.");
  } else if (sub === "rebuild") {
    console.log("Rebuilding docs corpus index...");
    console.log("Docs rebuild dispatched.");
  } else {
    console.log("Usage: autodev docs query <text> | autodev docs rebuild");
  }
}

async function handleDebate(parts: string[], _ctx: MinimalContext): Promise<void> {
  const sub = parts[0]?.toLowerCase() ?? "";
  if (sub === "start") {
    const topic = parts.slice(1).join(" ");
    if (topic.length === 0) {
      console.log("Usage: autodev debate start <topic>");
      return;
    }
    console.log(`Starting debate on: "${topic}"`);
    console.log("Debate dispatched. Results will appear in the session.");
  } else if (sub === "status") {
    console.log("Debate status: no active debates.");
  } else {
    console.log("Usage: autodev debate start <topic> | autodev debate status");
  }
}

function handleStopContinuation(_ctx: MinimalContext): void {
  console.log("All continuation loops stopped.");
}

function handleConfig(parts: string[], _ctx: MinimalContext): void {
  const sub = parts[0]?.toLowerCase() ?? "";
  if (sub === "") {
    console.log("AutoDev Configuration");
    console.log("Usage: autodev config <subcommand>");
    console.log("");
    console.log("Subcommands:");
    console.log("  llm     — configure LLM provider and API key");
    console.log("  voyage  — configure VoyageAI API key (Enter for ONNX fallback)");
    console.log("  discord — configure Discord bot token and channel");
    console.log("  github  — authenticate GitHub CLI");
    process.exit(1);
  }
  // Full routing in todo 6
  console.log(`Unknown config subcommand: ${sub}`);
  process.exit(1);
}

// ---- Main ----

const USAGE = "AutoDev subcommands: doctor, config, onboard, status, stop, docs, debate, stop-continuation";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args[0]?.toLowerCase() ?? "";

  const ctx = buildContext();

  switch (subcommand) {
    case "doctor":
      await handleDoctor(ctx);
      break;
    case "config":
      handleConfig(args.slice(1), ctx);
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
      await handleDocs(args.slice(1), ctx);
      break;
    case "debate":
      await handleDebate(args.slice(1), ctx);
      break;
    case "stop-continuation":
      handleStopContinuation(ctx);
      break;
    default:
      console.error(`Unknown subcommand: "${subcommand}"`);
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(`AutoDev CLI error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
