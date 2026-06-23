import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createPrompter } from "./prompts.js";
import { runInstallSteps, runInitSteps, type StepContext } from "./steps.js";
import { ensureGitignore } from "./env.js";
import { runDoctor } from "./doctor.js";
import { execSync } from "node:child_process";
import { join } from "node:path";

export interface InstallOptions {
  readonly projectRoot: string;
  readonly authPath: string;
  readonly nonInteractive: boolean;
  readonly notify: (message: string, level: "info" | "warning" | "error") => void;
}

export async function runInstall(opts: InstallOptions): Promise<void> {
  const { nonInteractive, projectRoot, authPath, notify } = opts;

  notify("AutoDev Installer — Machine Setup", "info");
  notify("============================================", "info");

  await ensureGitignore(projectRoot);

  const prompter = createPrompter();

  const stepCtx: StepContext = {
    projectRoot,
    prompter,
    nonInteractive,
    authPath,
    scope: "install",
    notify,
  };

  try {
    const results = await runInstallSteps(stepCtx);

    notify("", "info");
    notify("============================================", "info");
    notify("Installation Summary", "info");
    notify("============================================", "info");

    let ok = 0;
    let skipped = 0;
    let warnings = 0;
    let errors = 0;

    for (const r of results) {
      const icon = r.status === "ok" ? "✓" : r.status === "skipped" ? "→" : r.status === "warning" ? "⚠" : "✗";
      notify(`  ${icon} Step ${r.step}: ${r.name} — ${r.message}`, r.status === "error" ? "error" : "info");
      if (r.status === "ok") ok++;
      else if (r.status === "skipped") skipped++;
      else if (r.status === "warning") warnings++;
      else errors++;
    }

    notify("", "info");
    notify(`Results: ${ok} ok, ${skipped} skipped, ${warnings} warnings, ${errors} errors`, "info");

    if (errors > 0) {
      notify("Some steps failed. Check the messages above and re-run `autodev install` to retry.", "warning");
      return;
    }

    notify("Machine setup complete! Run `autodev init` in your project directory to configure it.", "info");

    notify("", "info");
    notify("Running post-install health check...", "info");
    const result = await runDoctor({
      projectRoot,
      authPath,
      execSyncOverride: (cmd, o) => execSync(cmd, o ?? {}) as unknown as string,
    });
    for (const check of result.checks) {
      const icon = check.ok ? "✓" : "✗";
      notify(`  ${icon} ${check.name}: ${check.detail}`, check.ok ? "info" : "error");
    }
    notify("", "info");
    notify(`Health check: ${result.passed} passed, ${result.failed} failed`, "info");
  } finally {
    prompter.close();
  }
}

export async function runInit(opts: InstallOptions): Promise<void> {
  const { nonInteractive, projectRoot, authPath, notify } = opts;

  notify("AutoDev Init — Project Setup", "info");
  notify("============================================", "info");

  const prompter = createPrompter();

  const stepCtx: StepContext = {
    projectRoot,
    prompter,
    nonInteractive,
    authPath,
    scope: "init",
    notify,
  };

  try {
    const results = await runInitSteps(stepCtx);

    notify("", "info");
    notify("============================================", "info");
    notify("Project Init Summary", "info");
    notify("============================================", "info");

    let ok = 0;
    let skipped = 0;
    let warnings = 0;
    let errors = 0;

    for (const r of results) {
      const icon = r.status === "ok" ? "✓" : r.status === "skipped" ? "→" : r.status === "warning" ? "⚠" : "✗";
      notify(`  ${icon} Step ${r.step}: ${r.name} — ${r.message}`, r.status === "error" ? "error" : "info");
      if (r.status === "ok") ok++;
      else if (r.status === "skipped") skipped++;
      else if (r.status === "warning") warnings++;
      else errors++;
    }

    notify("", "info");
    notify(`Results: ${ok} ok, ${skipped} skipped, ${warnings} warnings, ${errors} errors`, "info");

    if (errors > 0) {
      notify("Some steps failed. Check the messages above and re-run `autodev init` to retry.", "warning");
    } else {
      notify("Project setup complete! Run `autodev onboard` to seed the knowledge base.", "info");
    }
  } finally {
    prompter.close();
  }
}

function resolveAuthPath(): string {
  try {
    const { getAgentDir } = require("@earendil-works/pi-coding-agent") as {
      getAgentDir: () => string;
    };
    return join(getAgentDir(), "auth.json");
  } catch {
    return join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  }
}

function autoNonInteractive(argsNonInteractive: boolean): boolean {
  if (argsNonInteractive) return true;
  if (process.stdin.isTTY !== true) return true;
  if (process.env.CI !== undefined) return true;
  return false;
}

export async function handleInstall(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const argsNonInteractive = args.includes("--non-interactive");
  const nonInteractive = autoNonInteractive(argsNonInteractive);
  const projectRoot = ctx.cwd ?? process.cwd();
  const authPath = resolveAuthPath();

  await runInstall({
    projectRoot,
    authPath,
    nonInteractive,
    notify: (message, level) => ctx.ui.notify(message, level),
  });
}

export async function handleInit(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const argsNonInteractive = args.includes("--non-interactive");
  const nonInteractive = autoNonInteractive(argsNonInteractive);
  const projectRoot = ctx.cwd ?? process.cwd();
  const authPath = resolveAuthPath();

  await runInit({
    projectRoot,
    authPath,
    nonInteractive,
    notify: (message, level) => ctx.ui.notify(message, level),
  });
}