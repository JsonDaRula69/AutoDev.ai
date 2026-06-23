/**
 * Installer module — `autodev install` CLI command handler.
 *
 * Exports `handleInstall()` which is called from the orchestrator CLI handler.
 * Walks through 9 deployment steps: Bun check, LLM credentials, Magic Context,
 * VoyageAI key, Discord, GitHub labels, knowledge base seeding, docs rebuild,
 * and doctor verification.
 *
 * Supports `--non-interactive` flag for CI/automation.
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createPrompter } from "./prompts.js";
import { runAllSteps, type StepContext } from "./steps.js";
import { ensureGitignore } from "./env.js";
import { join } from "node:path";

export async function handleInstall(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const nonInteractive = args.includes("--non-interactive");
  const projectRoot = ctx.cwd ?? process.cwd();

  ctx.ui.notify("AutoDev Installer — Setting up your environment", "info");
  ctx.ui.notify("============================================", "info");

  await ensureGitignore(projectRoot);

  let authPath: string;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    authPath = join(getAgentDir(), "auth.json");
  } catch {
    authPath = join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  }

  const prompter = createPrompter();

  const stepCtx: StepContext = {
    projectRoot,
    prompter,
    nonInteractive,
    authPath,
    notify: (message, level) => {
      ctx.ui.notify(message, level);
    },
  };

  try {
    const results = await runAllSteps(stepCtx);

    ctx.ui.notify("", "info");
    ctx.ui.notify("============================================", "info");
    ctx.ui.notify("Installation Summary", "info");
    ctx.ui.notify("============================================", "info");

    let ok = 0;
    let skipped = 0;
    let warnings = 0;
    let errors = 0;

    for (const r of results) {
      const icon = r.status === "ok" ? "✓" : r.status === "skipped" ? "→" : r.status === "warning" ? "⚠" : "✗";
      ctx.ui.notify(`  ${icon} Step ${r.step}: ${r.name} — ${r.message}`, r.status === "error" ? "error" : "info");
      if (r.status === "ok") ok++;
      else if (r.status === "skipped") skipped++;
      else if (r.status === "warning") warnings++;
      else errors++;
    }

    ctx.ui.notify("", "info");
    ctx.ui.notify(`Results: ${ok} ok, ${skipped} skipped, ${warnings} warnings, ${errors} errors`, "info");

    if (errors > 0) {
      ctx.ui.notify("Some steps failed. Check the messages above and re-run `autodev install` to retry.", "warning");
    } else {
      ctx.ui.notify("AutoDev installation complete! Run `autodev doctor` to verify.", "info");
    }
  } finally {
    prompter.close();
  }
}
