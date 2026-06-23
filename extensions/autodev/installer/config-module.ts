/**
 * Config module — interactive-only secret entry for AutoDev.
 *
 * Called by doctor (when TTY is available) or directly via `autodev config`.
 * Each sub-command handles one credential domain: LLM provider, VoyageAI,
 * Discord, or GitHub auth. There is NO non-interactive mode — if the prompter
 * returns empty strings (no TTY), each handler warns and skips without writing.
 *
 * Secrets are written to `.env` as the single source of truth. `auth.json`
 * stores only env-var references (e.g., `"$OLLAMA_CLOUD_API_KEY"`) — pi's SDK
 * resolves `$VAR` syntax at runtime from `process.env`, which Bun auto-loads
 * from `.env`.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isStepCompleted, markStepCompleted } from "./state.js";
import { setEnvVars, ensureGitignore } from "./env.js";
import { setProviderKey, tryImportAuth } from "./auth.js";
import type { Prompter } from "./prompts.js";

// ---- Types ----

export interface ConfigModuleDeps {
  readonly projectRoot: string;
  readonly authPath: string;
  readonly prompter: Prompter;
  notify: (message: string, level: "info" | "warning" | "error") => void;
  /** Override for execSync (injectable for tests). */
  readonly execSyncOverride?: (command: string, options?: ExecSyncOptions) => Buffer;
}

export interface ConfigResult {
  readonly name: string;
  readonly status: "ok" | "skipped" | "warning" | "error";
  readonly message: string;
}

// ---- Helpers ----

function providerToEnvVar(provider: string): string {
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

/** Check if the prompter is a no-TTY prompter (returns empty strings). */
function isNoTtyPrompter(prompter: Prompter): boolean {
  // We probe by asking a quick question. If the answer is empty, it's no-TTY.
  // We use a synchronous check: MockPrompter returns answers from its array;
  // no-TTY prompter always returns "". We don't want to consume a real answer,
  // so we check the class/behavior indirectly.
  // The no-TTY prompter from prompts.ts always returns "" for prompt and
  // defaultYes for confirm. We detect it by checking if prompt returns "".
  // But we can't call prompt without consuming an answer slot in MockPrompter.
  // Instead, we rely on the caller to handle empty returns gracefully.
  return false; // handled inline in each handler
}

// ---- Handlers ----

async function handleLlm(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, 2)) {
    return { name: "llm", status: "skipped", message: "LLM credentials already configured." };
  }

  const provider = await deps.prompter.prompt("Which LLM provider are you using? (default: ollama-cloud)");
  const resolvedProvider = provider === "" ? "ollama-cloud" : provider;

  // Check for existing auth files to import from
  const homeDir = process.env.HOME ?? "~";
  const piAuthPath = join(homeDir, ".pi", "agent", "auth.json");
  const opencodeAuthPath = join(homeDir, ".opencode", "auth.json");
  const importableSources = [piAuthPath, opencodeAuthPath].filter((src) => existsSync(src));

  let imported = false;
  if (importableSources.length > 0) {
    const sourceList = importableSources.map((s) => `  - ${s}`).join("\n");
    const shouldImport = await deps.prompter.confirm(
      `Found existing auth file(s):\n${sourceList}\nImport ${resolvedProvider} credentials from these?`,
      true,
    );
    if (shouldImport) {
      for (const src of importableSources) {
        if (await tryImportAuth(src, deps.authPath, resolvedProvider)) {
          deps.notify(`Imported ${resolvedProvider} credentials from ${src}.`, "info");
          imported = true;
          break;
        }
      }
      if (!imported) {
        deps.notify(`No ${resolvedProvider} credentials found in existing auth files.`, "info");
      }
    }
  }

  if (!imported) {
    const apiKey = await deps.prompter.prompt(`Enter your ${resolvedProvider} API key (or env var name):`);
    if (apiKey === "") {
      deps.notify("Interactive config required, no TTY detected — LLM credentials skipped.", "warning");
      return { name: "llm", status: "warning", message: "No API key provided. Set it later via .env or auth.json." };
    }

    // Write actual secret to .env
    const envVarName = providerToEnvVar(resolvedProvider);
    await setEnvVars(deps.projectRoot, [[envVarName, apiKey]]);

    // Write env-var reference to auth.json (not the actual secret)
    await setProviderKey(deps.authPath, resolvedProvider, `$${envVarName}`);
  }

  await markStepCompleted(deps.projectRoot, 2);
  return { name: "llm", status: "ok", message: `${resolvedProvider} credentials configured.` };
}

async function handleVoyage(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, 4)) {
    return { name: "voyage", status: "skipped", message: "VoyageAI key already configured." };
  }

  const apiKey = await deps.prompter.prompt(
    "Enter your VoyageAI API key for semantic embeddings (press Enter to skip → ONNX fallback):",
  );

  if (apiKey === "") {
    deps.notify("No VoyageAI key — using local ONNX embeddings (slower, ~90MB download on first use).", "info");
    await setEnvVars(deps.projectRoot, [["VOYAGE_API_KEY", ""]]);
    await markStepCompleted(deps.projectRoot, 4);
    return {
      name: "voyage",
      status: "warning",
      message: "VoyageAI key not set. Using ONNX fallback embeddings.",
    };
  }

  await setEnvVars(deps.projectRoot, [["VOYAGE_API_KEY", apiKey]]);
  await markStepCompleted(deps.projectRoot, 4);
  return { name: "voyage", status: "ok", message: "VoyageAI API key configured." };
}

async function handleDiscord(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, 5)) {
    return { name: "discord", status: "skipped", message: "Discord integration already configured." };
  }

  const setupDiscord = await deps.prompter.confirm("Do you want to set up Discord integration?", false);
  if (setupDiscord) {
    const token = await deps.prompter.prompt("Enter your Discord bot token:");
    const channelId = await deps.prompter.prompt("Enter your Discord channel ID:");
    const liaisonChannelId = await deps.prompter.prompt(
      "Enter your Discord liaison channel ID (optional, press Enter to skip):",
    );
    await setEnvVars(deps.projectRoot, [
      ["DISCORD_BOT_TOKEN", token],
      ["DISCORD_CHANNEL_ID", channelId],
      ["DISCORD_LIAISON_CHANNEL_ID", liaisonChannelId],
    ]);
  }

  await markStepCompleted(deps.projectRoot, 5);
  if (!setupDiscord) {
    return { name: "discord", status: "skipped", message: "Discord integration skipped." };
  }
  return { name: "discord", status: "ok", message: "Discord integration configured." };
}

async function handleGithub(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, -1)) {
    return { name: "github", status: "skipped", message: "GitHub auth already configured." };
  }

  // Check if already authenticated
  const execSyncFn = deps.execSyncOverride ?? execSync;
  try {
    execSyncFn("gh auth status", { stdio: "pipe", timeout: 10_000 });
    await markStepCompleted(deps.projectRoot, -1);
    return { name: "github", status: "ok", message: "Already authenticated with GitHub CLI." };
  } catch {
    // Not authenticated — proceed
  }

  const shouldAuth = await deps.prompter.confirm(
    "GitHub CLI is not authenticated. Run `gh auth login` now?",
    true,
  );
  if (!shouldAuth) {
    deps.notify("GitHub auth skipped. Run `gh auth login` later.", "info");
    await markStepCompleted(deps.projectRoot, -1);
    return { name: "github", status: "skipped", message: "User declined GitHub auth." };
  }

  deps.notify("Launching gh auth login --web...", "info");
  try {
    execSyncFn("gh auth login --web", { stdio: "inherit", timeout: 300_000 });
  } catch (e) {
    return {
      name: "github",
      status: "error",
      message: `gh auth login failed: ${(e as Error).message}`,
    };
  }

  await markStepCompleted(deps.projectRoot, -1);
  return { name: "github", status: "ok", message: "GitHub CLI authenticated." };
}

// ---- Dispatch ----

const HANDLERS: Record<string, (deps: ConfigModuleDeps) => Promise<ConfigResult>> = {
  llm: handleLlm,
  voyage: handleVoyage,
  discord: handleDiscord,
  github: handleGithub,
};

const HANDLER_ORDER = ["llm", "voyage", "discord", "github"] as const;

/**
 * Run the interactive config flow for AutoDev secrets.
 *
 * If `subcommand` is undefined or empty, runs all handlers in order:
 * llm → voyage → discord → github.
 *
 * If `subcommand` is one of `"llm"`, `"voyage"`, `"discord"`, `"github"`,
 * runs only that handler.
 *
 * If `subcommand` is unknown, returns a single error result.
 *
 * `ensureGitignore` is called on the first handler invocation (tracked via
 * a local flag).
 */
export async function runConfig(
  deps: ConfigModuleDeps,
  subcommand?: string,
): Promise<ConfigResult[]> {
  let gitignoreEnsured = false;

  async function ensureGitignoreOnce(): Promise<void> {
    if (!gitignoreEnsured) {
      await ensureGitignore(deps.projectRoot);
      gitignoreEnsured = true;
    }
  }

  if (subcommand !== undefined && subcommand !== "") {
    const handler = HANDLERS[subcommand];
    if (handler === undefined) {
      return [{
        name: subcommand,
        status: "error",
        message: `Unknown config sub-command "${subcommand}". Valid: llm, voyage, discord, github.`,
      }];
    }
    await ensureGitignoreOnce();
    return [await handler(deps)];
  }

  // Run all handlers in order
  const results: ConfigResult[] = [];
  for (const name of HANDLER_ORDER) {
    await ensureGitignoreOnce();
    results.push(await HANDLERS[name]!(deps));
  }
  return results;
}
