/**
 * Installer steps — 9 sequential steps for deploying AutoDev.
 *
 * Each step is a self-contained async function that:
 * 1. Checks install-state for prior completion (skip if done).
 * 2. Runs its logic (prompt, exec, write).
 * 3. Records completion in install-state.
 * 4. Returns a result message (success, warning, or error).
 *
 * External commands (`bun`, `npx`, `gh`, `autodev`) are called via
 * `execSync` so tests can mock `require("node:child_process").execSync`.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readState, markStepCompleted, isStepCompleted, type StateScope } from "./state.js";
import { setEnvVars, ensureGitignore } from "./env.js";
import { setProviderKey, tryImportAuth } from "./auth.js";
import type { Prompter } from "./prompts.js";
import { installMissingTools } from "./tools.js";

// ---- Types ----

export interface StepContext {
  readonly projectRoot: string;
  readonly prompter: Prompter;
  readonly nonInteractive: boolean;
  readonly authPath: string;
  /** Which state scope this run belongs to ("install" or "init"). */
  readonly scope: StateScope;
  /** Notify the user (maps to ctx.ui.notify in production). */
  notify: (message: string, level: "info" | "warning" | "error") => void;
  /** Override for execSync (injectable for tests). */
  execSyncOverride?: (command: string, options?: ExecSyncOptions) => Buffer;
}

export interface StepResult {
  readonly step: number;
  readonly name: string;
  readonly status: "ok" | "skipped" | "warning" | "error";
  readonly message: string;
}

// ---- Step implementations ----

export async function step0ExternalTools(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 0, ctx.scope)) {
    return { step: 0, name: "External tools", status: "skipped", message: "Already completed." };
  }

  const results = installMissingTools(ctx.notify, undefined, ctx.execSyncOverride as never);
  const failed = results.filter((r) => !r.installed);

  await markStepCompleted(ctx.projectRoot, 0, ctx.scope);

  if (failed.length === 0) {
    const installed = results.filter((r) => r.installed);
    return {
      step: 0,
      name: "External tools",
      status: installed.length > 0 ? "ok" : "skipped",
      message: installed.length > 0
        ? `Installed: ${installed.map((r) => r.tool).join(", ")}`
        : "All external tools already present.",
    };
  }

  return {
    step: 0,
    name: "External tools",
    status: "error",
    message: `Failed to install: ${failed.map((r) => r.tool).join(", ")}. ${failed[0]?.message ?? ""}`,
  };
}

export async function step0bGhAuth(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, -1, ctx.scope)) {
    return { step: -1, name: "GitHub auth", status: "skipped", message: "Already completed." };
  }

  try {
    execSyncFn("gh auth status", { stdio: "pipe", timeout: 10_000 });
    await markStepCompleted(ctx.projectRoot, -1, ctx.scope);
    return { step: -1, name: "GitHub auth", status: "ok", message: "Already authenticated." };
  } catch {
  }

  if (ctx.nonInteractive) {
    ctx.notify("GitHub CLI not authenticated. Run `gh auth login` manually.", "warning");
    await markStepCompleted(ctx.projectRoot, -1, ctx.scope);
    return {
      step: -1,
      name: "GitHub auth",
      status: "warning",
      message: "Not authenticated. Run `gh auth login` to fix.",
    };
  }

  const shouldAuth = await ctx.prompter.confirm(
    "GitHub CLI is not authenticated. Run `gh auth login` now?",
    true,
  );
  if (!shouldAuth) {
    ctx.notify("GitHub auth skipped. Run `gh auth login` later.", "info");
    await markStepCompleted(ctx.projectRoot, -1, ctx.scope);
    return { step: -1, name: "GitHub auth", status: "skipped", message: "User declined." };
  }

  ctx.notify("Launching gh auth login --web...", "info");
  try {
    execSyncFn("gh auth login --web", { stdio: "inherit", timeout: 300_000 });
  } catch (e) {
    return {
      step: -1,
      name: "GitHub auth",
      status: "error",
      message: `gh auth login failed: ${(e as Error).message}`,
    };
  }

  await markStepCompleted(ctx.projectRoot, -1, ctx.scope);
  return { step: -1, name: "GitHub auth", status: "ok", message: "GitHub CLI authenticated." };
}

/**
 * Step 1 — Environment check.
 * Verify Bun >= 1.0 is installed, then run `bun install`.
 */
export async function step1BunCheck(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 1)) {
    return { step: 1, name: "Bun check", status: "skipped", message: "Already completed." };
  }

  try {
    const bunVersion = execSyncFn("bun --version", { encoding: "utf-8" }).toString().trim();
    const major = parseInt(bunVersion.split(".")[0] ?? "0", 10);
    if (major < 1) {
      return {
        step: 1,
        name: "Bun check",
        status: "error",
        message: `Bun >= 1.0 required, found ${bunVersion}. Run: curl -fsSL https://bun.sh/install | bash`,
      };
    }
    ctx.notify(`Bun ${bunVersion} detected.`, "info");
  } catch {
    return {
      step: 1,
      name: "Bun check",
      status: "error",
      message: "Bun is not installed. Run: curl -fsSL https://bun.sh/install | bash",
    };
  }

  // Run bun install
  try {
    ctx.notify("Running bun install...", "info");
    execSyncFn("bun install", { cwd: ctx.projectRoot, stdio: "pipe" });
  } catch (e) {
    return {
      step: 1,
      name: "Bun check",
      status: "error",
      message: `bun install failed: ${(e as Error).message}`,
    };
  }

  await markStepCompleted(ctx.projectRoot, 1);
  return { step: 1, name: "Bun check", status: "ok", message: "Bun >= 1.0 confirmed, dependencies installed." };
}

/**
 * Step 2 — LLM provider credentials.
 * Prompt for provider and API key, write to auth.json and .env.
 */
export async function step2LlmCredentials(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 2)) {
    return { step: 2, name: "LLM credentials", status: "skipped", message: "Already completed." };
  }

  let provider: string;
  let apiKey = "";

  if (ctx.nonInteractive) {
    provider = "ollama-cloud";
    apiKey = process.env.OLLAMA_CLOUD_API_KEY ?? "";
    if (apiKey === "") {
      ctx.notify("OLLAMA_CLOUD_API_KEY env var not set — credentials will be missing.", "warning");
      await markStepCompleted(ctx.projectRoot, 2);
      return {
        step: 2,
        name: "LLM credentials",
        status: "warning",
        message: "OLLAMA_CLOUD_API_KEY not set. Set it in .env later.",
      };
    }
    await setProviderKey(ctx.authPath, provider, apiKey);
    const envVarName = providerToEnvVar(provider);
    await setEnvVars(ctx.projectRoot, [[envVarName, apiKey]]);
  } else {
    provider = await ctx.prompter.prompt("Which LLM provider are you using? (default: ollama-cloud)");
    if (provider === "") provider = "ollama-cloud";

    const piAuthPath = join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
    const opencodeAuthPath = join(process.env.HOME ?? "~", ".opencode", "auth.json");

    const importableSources = [piAuthPath, opencodeAuthPath].filter((src) => existsSync(src));

    let imported = false;
    if (importableSources.length > 0) {
      const sourceList = importableSources.map((s) => `  - ${s}`).join("\n");
      const shouldImport = await ctx.prompter.confirm(
        `Found existing auth file(s):\n${sourceList}\nImport ${provider} credentials from these?`,
        true,
      );
      if (shouldImport) {
        for (const src of importableSources) {
          if (await tryImportAuth(src, ctx.authPath, provider)) {
            ctx.notify(`Imported ${provider} credentials from ${src}.`, "info");
            imported = true;
            break;
          }
        }
        if (!imported) {
          ctx.notify(`No ${provider} credentials found in existing auth files.`, "info");
        }
      }
    }

    if (!imported) {
      apiKey = await ctx.prompter.prompt(`Enter your ${provider} API key (or env var name):`);
      if (apiKey === "") {
        ctx.notify("No API key provided — credentials will be missing.", "warning");
        await markStepCompleted(ctx.projectRoot, 2);
        return {
          step: 2,
          name: "LLM credentials",
          status: "warning",
          message: "No API key provided. Set it later via .env or auth.json.",
        };
      }
      await setProviderKey(ctx.authPath, provider, apiKey);
    }

    const envVarName = providerToEnvVar(provider);
    if (!imported && apiKey !== "") {
      await setEnvVars(ctx.projectRoot, [[envVarName, apiKey]]);
    }
  }

  await markStepCompleted(ctx.projectRoot, 2);
  return { step: 2, name: "LLM credentials", status: "ok", message: `${provider} credentials configured.` };
}

/**
 * Step 3 — Magic Context setup.
 * Run `bunx @cortexkit/magic-context@latest setup --harness pi` and doctor check.
 */
export async function step3MagicContext(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 3)) {
    return { step: 3, name: "Magic Context", status: "skipped", message: "Already completed." };
  }

  ctx.notify("Setting up Magic Context...", "info");
  try {
    execSyncFn("bunx @cortexkit/magic-context@latest setup --harness pi", {
      cwd: ctx.projectRoot,
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (e) {
    return {
      step: 3,
      name: "Magic Context",
      status: "error",
      message: `Magic Context setup failed: ${(e as Error).message}`,
    };
  }

  try {
    execSyncFn("bunx @cortexkit/magic-context@latest doctor", {
      cwd: ctx.projectRoot,
      stdio: "pipe",
      timeout: 30_000,
    });
    ctx.notify("Magic Context doctor check passed.", "info");
  } catch (e) {
    ctx.notify(`Magic Context doctor check had issues: ${(e as Error).message}`, "warning");
  }

  await markStepCompleted(ctx.projectRoot, 3);
  return { step: 3, name: "Magic Context", status: "ok", message: "Magic Context configured." };
}

/**
 * Step 4 — VoyageAI API key (skippable → ONNX fallback).
 */
export async function step4VoyageAi(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 4)) {
    return { step: 4, name: "VoyageAI key", status: "skipped", message: "Already completed." };
  }

  let apiKey: string;

  if (ctx.nonInteractive) {
    apiKey = process.env.VOYAGE_API_KEY ?? "";
  } else {
    apiKey = await ctx.prompter.prompt(
      "Enter your VoyageAI API key for semantic embeddings (press Enter to skip → ONNX fallback):",
    );
  }

  if (apiKey === "") {
    ctx.notify("No VoyageAI key — using local ONNX embeddings (slower, ~90MB download on first use).", "info");
    await setEnvVars(ctx.projectRoot, [["VOYAGE_API_KEY", ""]]);
    await markStepCompleted(ctx.projectRoot, 4);
    return {
      step: 4,
      name: "VoyageAI key",
      status: "warning",
      message: "VoyageAI key not set. Using ONNX fallback embeddings.",
    };
  }

  await setEnvVars(ctx.projectRoot, [["VOYAGE_API_KEY", apiKey]]);
  await markStepCompleted(ctx.projectRoot, 4);
  return { step: 4, name: "VoyageAI key", status: "ok", message: "VoyageAI API key configured." };
}

/**
 * Step 5 — Discord (optional).
 */
export async function step5Discord(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 5)) {
    return { step: 5, name: "Discord", status: "skipped", message: "Already completed." };
  }

  let setupDiscord: boolean;

  if (ctx.nonInteractive) {
    const token = process.env.DISCORD_BOT_TOKEN ?? "";
    setupDiscord = token !== "";
    if (setupDiscord) {
      const channelId = process.env.DISCORD_CHANNEL_ID ?? "";
      const liaisonChannelId = process.env.DISCORD_LIAISON_CHANNEL_ID ?? "";
      await setEnvVars(ctx.projectRoot, [
        ["DISCORD_BOT_TOKEN", token],
        ["DISCORD_CHANNEL_ID", channelId],
        ["DISCORD_LIAISON_CHANNEL_ID", liaisonChannelId],
      ]);
    }
  } else {
    setupDiscord = await ctx.prompter.confirm("Do you want to set up Discord integration?", false);
    if (setupDiscord) {
      const token = await ctx.prompter.prompt("Enter your Discord bot token:");
      const channelId = await ctx.prompter.prompt("Enter your Discord channel ID:");
      const liaisonChannelId = await ctx.prompter.prompt(
        "Enter your Discord liaison channel ID (optional, press Enter to skip):",
      );
      await setEnvVars(ctx.projectRoot, [
        ["DISCORD_BOT_TOKEN", token],
        ["DISCORD_CHANNEL_ID", channelId],
        ["DISCORD_LIAISON_CHANNEL_ID", liaisonChannelId],
      ]);
    }
  }

  await markStepCompleted(ctx.projectRoot, 5);
  if (!setupDiscord) {
    return { step: 5, name: "Discord", status: "skipped", message: "Discord integration skipped." };
  }
  return { step: 5, name: "Discord", status: "ok", message: "Discord integration configured." };
}

/**
 * Step 6 — GitHub labels.
 * Create all 8 AutoDev labels via `gh label create --force`.
 */
export async function step6GitHubLabels(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 6, ctx.scope)) {
    return { step: 6, name: "GitHub labels", status: "skipped", message: "Already completed." };
  }

  const labels = [
    { name: "autodev-request", color: "1d76db", description: "New work request for AutoDev" },
    { name: "autodev-planned", color: "0e8a16", description: "Work has been planned and scoped" },
    { name: "autodev-in-progress", color: "fbca04", description: "Work is currently being implemented" },
    { name: "autodev-review", color: "5319e7", description: "Work is under review" },
    { name: "autodev-ready", color: "bfe5bf", description: "Review passed, ready for merge" },
    { name: "autodev-merged", color: "c2e0c6", description: "Work has been merged" },
    { name: "autodev-blocked", color: "b60205", description: "Work is blocked and needs attention" },
    { name: "autodev-rejected", color: "e99695", description: "Work has been rejected" },
  ];

  let created = 0;
  let errors = 0;

  for (const label of labels) {
    try {
      execSyncFn(
        `gh label create "${label.name}" --color "${label.color}" --description "${label.description}" --force`,
        { cwd: ctx.projectRoot, stdio: "pipe" },
      );
      created++;
    } catch {
      errors++;
    }
  }

  await markStepCompleted(ctx.projectRoot, 6, ctx.scope);

  if (errors > 0 && created === 0) {
    return {
      step: 6,
      name: "GitHub labels",
      status: "error",
      message: `Failed to create any GitHub labels. Is \`gh\` CLI installed and authenticated?`,
    };
  }

  const msg = `Created ${created}/${labels.length} GitHub labels${errors > 0 ? ` (${errors} errors)` : ""}.`;
  return {
    step: 6,
    name: "GitHub labels",
    status: errors > 0 ? "warning" : "ok",
    message: msg,
  };
}

/**
 * Step 7 — Knowledge base seeding prompt.
 * If `.autodev/reference/` is empty, prompt to run `autodev onboard`.
 */
export async function step7KnowledgeBase(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 7, ctx.scope)) {
    return { step: 7, name: "Knowledge base", status: "skipped", message: "Already completed." };
  }

  const refDir = join(ctx.projectRoot, ".autodev", "reference");
  const isEmpty = !existsSync(refDir) || (existsSync(refDir) && (await isDirEmpty(refDir)));

  if (isEmpty) {
    if (ctx.nonInteractive) {
      ctx.notify("Knowledge base is empty. Run `autodev onboard` to seed it.", "info");
    } else {
      const runOnboard = await ctx.prompter.confirm(
        "Knowledge base is empty. Would you like to run `autodev onboard` now?",
        false,
      );
      if (runOnboard) {
        ctx.notify("Run `autodev onboard` in a separate terminal to start the Harbor Master.", "info");
      }
    }
  }

  await markStepCompleted(ctx.projectRoot, 7, ctx.scope);
  return {
    step: 7,
    name: "Knowledge base",
    status: isEmpty ? "warning" : "ok",
    message: isEmpty
      ? "Knowledge base is empty. Run `autodev onboard` to seed it."
      : "Knowledge base already populated.",
  };
}

/**
 * Step 8 — Docs corpus indexing.
 * Run `autodev docs rebuild`.
 */
export async function step8DocsRebuild(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 8, ctx.scope)) {
    return { step: 8, name: "Docs rebuild", status: "skipped", message: "Already completed." };
  }

  ctx.notify("Rebuilding docs corpus index...", "info");
  try {
    execSyncFn("autodev docs rebuild", { cwd: ctx.projectRoot, stdio: "pipe", timeout: 60_000 });
  } catch (e) {
    return {
      step: 8,
      name: "Docs rebuild",
      status: "error",
      message: `Docs rebuild failed: ${(e as Error).message}`,
    };
  }

  await markStepCompleted(ctx.projectRoot, 8, ctx.scope);
  return { step: 8, name: "Docs rebuild", status: "ok", message: "Docs corpus indexed." };
}

/**
 * Step 9 — Health verification.
 * Run `autodev doctor` to verify everything works.
 */
export async function step9Doctor(ctx: StepContext): Promise<StepResult> {
  if (await isStepCompleted(ctx.projectRoot, 9, ctx.scope)) {
    return { step: 9, name: "Doctor check", status: "skipped", message: "Already completed." };
  }

  ctx.notify("Running health verification...", "info");
  try {
    const output = execSyncFn("autodev doctor", { cwd: ctx.projectRoot, stdio: "pipe", timeout: 30_000 });
    ctx.notify(output.toString(), "info");
  } catch (e) {
    return {
      step: 9,
      name: "Doctor check",
      status: "error",
      message: `Doctor check failed: ${(e as Error).message}`,
    };
  }

  await markStepCompleted(ctx.projectRoot, 9, ctx.scope);
  return { step: 9, name: "Doctor check", status: "ok", message: "Health verification passed." };
}

// ---- Runners ----

/** Machine-level install steps (1-5 + doctor). Run once per machine. */
export const INSTALL_STEPS: ReadonlyArray<(ctx: StepContext) => Promise<StepResult>> = [
  step0ExternalTools,
  step0bGhAuth,
  step1BunCheck,
  step2LlmCredentials,
  step3MagicContext,
  step4VoyageAi,
  step5Discord,
  step9Doctor,
];

/** Project-level init steps (6-8). Run once per project. */
export const INIT_STEPS: ReadonlyArray<(ctx: StepContext) => Promise<StepResult>> = [
  step6GitHubLabels,
  step7KnowledgeBase,
  step8DocsRebuild,
];

export const INSTALL_STEP_NAMES: readonly string[] = [
  "External tools",
  "GitHub auth",
  "Bun check",
  "LLM credentials",
  "Magic Context",
  "VoyageAI key",
  "Discord",
  "Doctor check",
];

export const INIT_STEP_NAMES: readonly string[] = [
  "GitHub labels",
  "Knowledge base",
  "Docs rebuild",
];

/**
 * Run a set of steps sequentially, collecting results.
 * Does NOT abort on partial failure — each step runs regardless of prior errors.
 */
async function runSteps(
  steps: ReadonlyArray<(ctx: StepContext) => Promise<StepResult>>,
  names: readonly string[],
  ctx: StepContext,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    try {
      const result = await step(ctx);
      results.push(result);
      if (result.status === "error") {
        ctx.notify(`Step ${result.step} (${names[i]}): ${result.message}`, "error");
      } else if (result.status === "warning") {
        ctx.notify(`Step ${result.step} (${names[i]}): ${result.message}`, "warning");
      } else if (result.status === "ok") {
        ctx.notify(`Step ${result.step} (${names[i]}): ${result.message}`, "info");
      }
    } catch (e) {
      const msg = `Unexpected error in step ${i + 1}: ${(e as Error).message}`;
      ctx.notify(msg, "error");
      results.push({ step: i + 1, name: names[i] ?? `Step ${i + 1}`, status: "error", message: msg });
    }
  }
  return results;
}

/** Run machine-level install steps. */
export async function runInstallSteps(ctx: StepContext): Promise<StepResult[]> {
  return runSteps(INSTALL_STEPS, INSTALL_STEP_NAMES, ctx);
}

/** Run project-level init steps. */
export async function runInitSteps(ctx: StepContext): Promise<StepResult[]> {
  return runSteps(INIT_STEPS, INIT_STEP_NAMES, ctx);
}

// ---- Helpers ----

function execSyncFn(command: string, options?: ExecSyncOptions): Buffer {
  const result = execSync(command, options ?? {});
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}

function providerToEnvVar(provider: string): string {
  // Map common provider names to their env var names
  const map: Record<string, string> = {
    "ollama-cloud": "OLLAMA_CLOUD_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    google: "GEMINI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  return map[provider] ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

async function isDirEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await readdir(dirPath);
    return entries.length === 0;
  } catch {
    return true;
  }
}
