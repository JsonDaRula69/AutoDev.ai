/**
 * Interactive-only config module — manages all secrets via sub-commands.
 *
 * Each handler writes secrets to `~/.pi/agent/.env` (resolved via
 * `dirname(authPath)`) and writes only `$VAR` references to `auth.json`.
 * Pi's SDK resolves `$VAR` syntax at runtime from `process.env`.
 *
 * Sub-commands: `"llm"`, `"voyage"`, `"discord"`, `"github"`, or undefined
 * (run all in sequence). Config is interactive-only; a no-TTY prompter
 * (returns empty strings) causes each handler to warn and skip without
 * writing.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { isStepCompleted, markStepCompleted } from "./state.js";
import { setEnvVars, readEnv } from "./env.js";
import { setProviderKey, tryImportAuth, providerToEnvVar } from "./auth.js";
import type { Prompter } from "./prompts.js";

export type { Prompter } from "./prompts.js";

export interface ConfigModuleDeps {
  readonly projectRoot: string;
  readonly authPath: string;
  readonly prompter: Prompter;
  notify: (message: string, level: "info" | "warning" | "error") => void;
  readonly execSyncOverride?: (command: string, options?: ExecSyncOptions) => Buffer;
}

export interface ConfigResult {
  readonly subcommand: string;
  readonly step: number;
  readonly status: "ok" | "skipped" | "warning" | "error";
  readonly message: string;
}

const CONFIG_SCOPE = "config" as const;
const STEP_LLM = 2;
const STEP_VOYAGE = 4;
const STEP_DISCORD = 5;
const STEP_GITHUB = -1;

function execSyncFn(
  deps: ConfigModuleDeps,
  command: string,
  options?: ExecSyncOptions,
): Buffer {
  const fn = deps.execSyncOverride ?? execSync;
  const result = fn(command, options ?? {});
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}

function agentEnvPath(deps: ConfigModuleDeps): string {
  return join(dirname(deps.authPath), ".env");
}

export async function runConfig(
  deps: ConfigModuleDeps,
  subcommand?: string,
): Promise<ConfigResult[]> {
  const handlers: ReadonlyArray<[string, (d: ConfigModuleDeps) => Promise<ConfigResult>]> = [
    ["llm", handleLlm],
    ["voyage", handleVoyage],
    ["discord", handleDiscord],
    ["github", handleGithub],
  ];

  if (subcommand !== undefined) {
    const match = handlers.find(([name]) => name === subcommand);
    if (match === undefined) {
      deps.notify(`Unknown config sub-command: ${subcommand}`, "error");
      return [{
        subcommand,
        step: 0,
        status: "error",
        message: `Unknown config sub-command: ${subcommand}`,
      }];
    }
    return [await match[1](deps)];
  }

  const results: ConfigResult[] = [];
  for (const [, handler] of handlers) {
    results.push(await handler(deps));
  }
  return results;
}

async function handleLlm(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, STEP_LLM, CONFIG_SCOPE)) {
    return { subcommand: "llm", step: STEP_LLM, status: "skipped", message: "Already configured." };
  }

  const providerInput = await deps.prompter.prompt(
    "Which LLM provider are you using? (default: ollama-cloud)",
  );
  if (providerInput === "") {
    deps.notify("interactive config required, no TTY detected", "warning");
    return {
      subcommand: "llm",
      step: STEP_LLM,
      status: "warning",
      message: "interactive config required, no TTY detected",
    };
  }
  const provider = providerInput === "" ? "ollama-cloud" : providerInput;
  const envVarName = providerToEnvVar(provider);
  const envPath = agentEnvPath(deps);

  const piAuthPath = join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  const opencodeAuthPath = join(process.env.HOME ?? "~", ".opencode", "auth.json");
  const importableSources = [piAuthPath, opencodeAuthPath].filter((src) => existsSync(src));

  let imported = false;
  if (importableSources.length > 0) {
    const sourceList = importableSources.map((s) => `  - ${s}`).join("\n");
    const shouldImport = await deps.prompter.confirm(
      `Found existing auth file(s):\n${sourceList}\nImport ${provider} credentials from these?`,
      true,
    );
    if (shouldImport) {
      for (const src of importableSources) {
        if (await tryImportAuth(src, deps.authPath, provider, envVarName, envPath, deps.projectRoot)) {
          deps.notify(`Imported ${provider} credentials from ${src}.`, "info");
          imported = true;
          break;
        }
      }
      if (!imported) {
        deps.notify(`No ${provider} credentials found in existing auth files.`, "info");
      }
    }
  }

  let apiKey = "";
  if (!imported) {
    apiKey = await deps.prompter.prompt(`Enter your ${provider} API key (or env var name):`);
    if (apiKey === "") {
      deps.notify("No API key provided — credentials will be missing.", "warning");
      await markStepCompleted(deps.projectRoot, STEP_LLM, CONFIG_SCOPE);
      return {
        subcommand: "llm",
        step: STEP_LLM,
        status: "warning",
        message: "No API key provided. Set it later via .env or auth.json.",
      };
    }
    await setEnvVars(deps.projectRoot, [[envVarName, apiKey]], envPath);
    await setProviderKey(deps.authPath, provider, `$${envVarName}`);
  }

  await markStepCompleted(deps.projectRoot, STEP_LLM, CONFIG_SCOPE);
  return {
    subcommand: "llm",
    step: STEP_LLM,
    status: "ok",
    message: `${provider} credentials configured.`,
  };
}

async function handleVoyage(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, STEP_VOYAGE, CONFIG_SCOPE)) {
    return { subcommand: "voyage", step: STEP_VOYAGE, status: "skipped", message: "Already configured." };
  }

  const apiKey = await deps.prompter.prompt(
    "Enter your VoyageAI API key for semantic embeddings (press Enter to skip → ONNX fallback):",
  );

  const envPath = agentEnvPath(deps);

  if (apiKey === "") {
    deps.notify("No VoyageAI key — using local ONNX embeddings (slower, ~90MB download on first use).", "info");
    await setEnvVars(deps.projectRoot, [["VOYAGE_API_KEY", ""]], envPath);
    await markStepCompleted(deps.projectRoot, STEP_VOYAGE, CONFIG_SCOPE);
    return {
      subcommand: "voyage",
      step: STEP_VOYAGE,
      status: "warning",
      message: "VoyageAI key not set. Using ONNX fallback embeddings.",
    };
  }

  await setEnvVars(deps.projectRoot, [["VOYAGE_API_KEY", apiKey]], envPath);
  await markStepCompleted(deps.projectRoot, STEP_VOYAGE, CONFIG_SCOPE);
  return {
    subcommand: "voyage",
    step: STEP_VOYAGE,
    status: "ok",
    message: "VoyageAI API key configured.",
  };
}

async function handleDiscord(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, STEP_DISCORD, CONFIG_SCOPE)) {
    return { subcommand: "discord", step: STEP_DISCORD, status: "skipped", message: "Already configured." };
  }

  const setupDiscord = await deps.prompter.confirm("Do you want to set up Discord integration?", false);
  if (!setupDiscord) {
    await markStepCompleted(deps.projectRoot, STEP_DISCORD, CONFIG_SCOPE);
    return { subcommand: "discord", step: STEP_DISCORD, status: "skipped", message: "Discord integration skipped." };
  }

  const token = await deps.prompter.prompt("Enter your Discord bot token:");
  if (token === "") {
    deps.notify("interactive config required, no TTY detected", "warning");
    await markStepCompleted(deps.projectRoot, STEP_DISCORD, CONFIG_SCOPE);
    return {
      subcommand: "discord",
      step: STEP_DISCORD,
      status: "warning",
      message: "interactive config required, no TTY detected",
    };
  }
  const channelId = await deps.prompter.prompt("Enter your Discord channel ID:");
  const liaisonChannelId = await deps.prompter.prompt(
    "Enter your Discord liaison channel ID (optional, press Enter to skip):",
  );

  const envPath = agentEnvPath(deps);
  await setEnvVars(deps.projectRoot, [
    ["DISCORD_BOT_TOKEN", token],
    ["DISCORD_CHANNEL_ID", channelId],
    ["DISCORD_LIAISON_CHANNEL_ID", liaisonChannelId],
  ], envPath);

  await markStepCompleted(deps.projectRoot, STEP_DISCORD, CONFIG_SCOPE);
  return { subcommand: "discord", step: STEP_DISCORD, status: "ok", message: "Discord integration configured." };
}

async function handleGithub(deps: ConfigModuleDeps): Promise<ConfigResult> {
  if (await isStepCompleted(deps.projectRoot, STEP_GITHUB, CONFIG_SCOPE)) {
    return { subcommand: "github", step: STEP_GITHUB, status: "skipped", message: "Already configured." };
  }

  const envPath = agentEnvPath(deps);
  const existing = await readEnv(deps.projectRoot, envPath);
  const existingToken = existing.get("GH_TOKEN") ?? "";

  if (existingToken !== "") {
    try {
      execSyncFn(deps, "gh auth status", { stdio: "pipe", timeout: 10_000 });
      deps.notify("GitHub auth already configured and valid.", "info");
      await markStepCompleted(deps.projectRoot, STEP_GITHUB, CONFIG_SCOPE);
      return { subcommand: "github", step: STEP_GITHUB, status: "ok", message: "GitHub auth already configured." };
    } catch {
      deps.notify("Existing GH_TOKEN is expired or invalid. Re-prompting for a new token.", "warning");
    }
  }

  const promptText = `AutoDev needs a GitHub personal access token (PAT) to manage issues, PRs, labels, and CI. A PAT isolates AutoDev's GitHub operations from your personal \`gh auth login\` — they don't conflict.

To generate a fine-grained PAT:
1. Go to: https://github.com/settings/personal-access-tokens/new
2. Token name: 'AutoDev'
3. Expiration: 90 days (rotate quarterly)
4. Repository access: Select only the repos AutoDev will work on
5. Permissions:
   - Issues: Read and write
   - Pull requests: Read and write
   - Contents: Read-only
   - Metadata: Read-only
   - Labels: Read and write (if available)
6. Click 'Generate token'
7. Copy the token (starts with 'github_pat_')

Paste your token here (or press Enter to use interactive \`gh auth login --web\` instead):`;

  const tokenInput = await deps.prompter.prompt(promptText);

  if (tokenInput === "") {
    delete process.env.GH_TOKEN;
    deps.notify("Launching gh auth login --web...", "info");
    try {
      execSyncFn(deps, "gh auth login --web", { stdio: "inherit", timeout: 300_000 });
    } catch (e) {
      try {
        deps.notify("`gh auth login --web` failed; falling back to terminal-based OAuth.", "warning");
        execSyncFn(deps, "gh auth login", { stdio: "inherit", timeout: 300_000 });
      } catch (e2) {
        return {
          subcommand: "github",
          step: STEP_GITHUB,
          status: "error",
          message: `gh auth login failed: ${(e2 as Error).message}`,
        };
      }
    }
    await markStepCompleted(deps.projectRoot, STEP_GITHUB, CONFIG_SCOPE);
    return { subcommand: "github", step: STEP_GITHUB, status: "ok", message: "GitHub CLI authenticated." };
  }

  await setEnvVars(deps.projectRoot, [["GH_TOKEN", tokenInput]], envPath);
  process.env.GH_TOKEN = tokenInput;

  try {
    execSyncFn(deps, "gh auth status", { stdio: "pipe", timeout: 10_000 });
    deps.notify("GitHub token verified via gh auth status.", "info");
    await markStepCompleted(deps.projectRoot, STEP_GITHUB, CONFIG_SCOPE);
    return { subcommand: "github", step: STEP_GITHUB, status: "ok", message: "GitHub token configured and verified." };
  } catch (e) {
    deps.notify(`GitHub token written but gh auth status failed: ${(e as Error).message}`, "warning");
    await markStepCompleted(deps.projectRoot, STEP_GITHUB, CONFIG_SCOPE);
    return {
      subcommand: "github",
      step: STEP_GITHUB,
      status: "warning",
      message: `Token written but verification failed: ${(e as Error).message}`,
    };
  }
}