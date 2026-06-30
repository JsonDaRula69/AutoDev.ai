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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { isStepCompleted, markStepCompleted } from "./state.js";
import { setEnvVars, readEnv } from "./env.js";
import { setProviderKey, tryImportAuth, providerToEnvVar } from "./auth.js";
import type { Prompter } from "./prompts.js";
import { validateLlmKey, validateVoyageKey, validateGithubToken, validateDiscordToken } from "./key-validator.js";

export type { Prompter } from "./prompts.js";

export interface ConfigModuleDeps {
  readonly projectRoot: string;
  readonly authPath: string;
  readonly prompter: Prompter;
  notify: (message: string, level: "info" | "warning" | "error") => void;
  readonly execSyncOverride?: (command: string, options?: ExecSyncOptions) => Buffer;
  readonly fetchOverride?: (url: string, init?: RequestInit) => Promise<Response>;
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

  const PROVIDERS = [
    { value: "ollama-cloud", label: "Ollama Cloud", hint: "glm-5.2, deepseek, kimi — default" },
    { value: "openai", label: "OpenAI", hint: "gpt-4, o1, etc." },
    { value: "anthropic", label: "Anthropic", hint: "Claude models" },
    { value: "google", label: "Google AI", hint: "Gemini models" },
  ];

  const providerChoice = await deps.prompter.select("Select your LLM provider:", PROVIDERS, "ollama-cloud");

  if (typeof providerChoice !== "string") {
    deps.notify("Provider selection cancelled.", "warning");
    return { subcommand: "llm", step: STEP_LLM, status: "warning", message: "Cancelled." };
  }

  const provider = providerChoice;
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
  let lastError = "";
  if (!imported) {
    for (let attempt = 0; attempt < 3; attempt++) {
      apiKey = await deps.prompter.prompt(
        attempt === 0
          ? `Enter your ${provider} API key:`
          : `Key rejected: ${lastError}\nRe-enter your ${provider} API key (or press Enter to cancel):`,
      );
      if (apiKey === "") {
        if (attempt === 0) {
          deps.notify("No API key provided — credentials will be missing.", "warning");
        } else {
          deps.notify("Key entry cancelled.", "warning");
        }
        await markStepCompleted(deps.projectRoot, STEP_LLM, CONFIG_SCOPE);
        return {
          subcommand: "llm",
          step: STEP_LLM,
          status: "warning",
          message: "No valid API key provided. Set it later via .env or auth.json.",
        };
      }

      deps.notify(`Validating ${provider} API key...`, "info");
      const validation = await validateLlmKey(provider, apiKey, {
        ...(deps.fetchOverride ? { fetchOverride: deps.fetchOverride } : {}),
      });
      if (validation.valid) {
        deps.notify(`${provider} API key validated.`, "info");
        break;
      }
      lastError = validation.error ?? "Unknown error";
      deps.notify(`Validation failed: ${lastError}`, "warning");
      apiKey = "";
    }

    if (apiKey === "") {
      await markStepCompleted(deps.projectRoot, STEP_LLM, CONFIG_SCOPE);
      return {
        subcommand: "llm",
        step: STEP_LLM,
        status: "warning",
        message: "API key validation failed after 3 attempts.",
      };
    }

    await setEnvVars(deps.projectRoot, [[envVarName, apiKey]], envPath);
    await setProviderKey(deps.authPath, provider, `$${envVarName}`);
    await writeAgentModelsJson(deps.authPath, provider, apiKey);
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

  const envPath = agentEnvPath(deps);

  while (true) {
    const apiKey = await deps.prompter.prompt(
      "Enter your VoyageAI API key for semantic embeddings (press Enter to skip → ONNX fallback):",
    );

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

    deps.notify("Validating VoyageAI API key...", "info");
    const validation = await validateVoyageKey(apiKey, {
      ...(deps.fetchOverride ? { fetchOverride: deps.fetchOverride } : {}),
    });

    if (validation.valid) {
      deps.notify("VoyageAI API key validated.", "info");
      await setEnvVars(deps.projectRoot, [["VOYAGE_API_KEY", apiKey]], envPath);
      await markStepCompleted(deps.projectRoot, STEP_VOYAGE, CONFIG_SCOPE);
      return {
        subcommand: "voyage",
        step: STEP_VOYAGE,
        status: "ok",
        message: "VoyageAI key configured.",
      };
    }

    deps.notify(`VoyageAI key validation failed: ${validation.error}`, "warning");
    const choice = await deps.prompter.select(
      "VoyageAI key is invalid. What would you like to do?",
      [
        { value: "retry", label: "Re-enter the API key" },
        { value: "skip", label: "Skip and use local ONNX embeddings" },
        { value: "abort", label: "Abort configuration" },
      ],
      "retry",
    );

    if (choice === "skip") {
      deps.notify("Using local ONNX embeddings (slower, ~90MB download on first use).", "info");
      await setEnvVars(deps.projectRoot, [["VOYAGE_API_KEY", ""]], envPath);
      await markStepCompleted(deps.projectRoot, STEP_VOYAGE, CONFIG_SCOPE);
      return {
        subcommand: "voyage",
        step: STEP_VOYAGE,
        status: "warning",
        message: "VoyageAI key invalid. Using ONNX fallback embeddings.",
      };
    }

    if (choice === "abort" || choice === undefined) {
      return {
        subcommand: "voyage",
        step: STEP_VOYAGE,
        status: "error",
        message: `VoyageAI key invalid: ${validation.error}`,
      };
    }
  }
}

async function handleDiscord(deps: ConfigModuleDeps): Promise<ConfigResult> {
  const setupText = `Do you want to set up Discord integration?

AutoDev uses Discord as its crew-to-liaison bridge. To create and invite a bot:

1. Discord Developer Portal → Applications → New Application
2. Bot tab → Reset Token → copy it
3. Enable Message Content Intent
4. OAuth2 → URL Generator → scopes: bot → permissions: Send Messages, Read Message History
5. Open URL → invite bot to server
6. Enable Developer Mode (User Settings → Advanced → Developer Mode)
7. Right-click channel → Copy ID

Full setup guide: ~/.AutoDev/reference/discord-setup.md`;

  const setupDiscord = await deps.prompter.confirm(setupText, false);
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

  deps.notify("Validating Discord bot token...", "info");
  const discordValidation = await validateDiscordToken(token, {
    ...(deps.fetchOverride ? { fetchOverride: deps.fetchOverride } : {}),
  });
  if (!discordValidation.valid) {
    deps.notify(`Discord token validation failed: ${discordValidation.error}`, "warning");
    return {
      subcommand: "discord",
      step: STEP_DISCORD,
      status: "error",
      message: `Discord token invalid: ${discordValidation.error}`,
    };
  }
  deps.notify("Discord bot token validated.", "info");

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

  deps.notify("Validating GitHub token...", "info");
  const ghValidation = validateGithubToken(tokenInput, {
    ...(deps.execSyncOverride ? { execSyncOverride: deps.execSyncOverride as never } : {}),
  });

  if (!ghValidation.valid) {
    deps.notify(`GitHub token rejected: ${ghValidation.error}`, "warning");
    return {
      subcommand: "github",
      step: STEP_GITHUB,
      status: "error",
      message: `GitHub token invalid: ${ghValidation.error}`,
    };
  }

  deps.notify("GitHub token validated.", "info");
  await setEnvVars(deps.projectRoot, [["GH_TOKEN", tokenInput]], envPath);
  process.env.GH_TOKEN = tokenInput;

  await markStepCompleted(deps.projectRoot, STEP_GITHUB, CONFIG_SCOPE);
  return { subcommand: "github", step: STEP_GITHUB, status: "ok", message: "GitHub token configured and verified." };
}

const PROVIDER_MODEL_DEFS: Record<string, { api: string; baseUrl: string; models: { id: string; name: string; context: number; output: number }[] }> = {
  "ollama-cloud": {
    api: "openai-completions",
    baseUrl: "https://ollama.com/v1",
    models: [
      { id: "glm-5.2:cloud", name: "GLM 5.2 Cloud", context: 976000, output: 131072 },
      { id: "deepseek-v4-pro:cloud", name: "DeepSeek V4 Pro", context: 128000, output: 8192 },
      { id: "deepseek-v4-flash:cloud", name: "DeepSeek V4 Flash", context: 128000, output: 8192 },
      { id: "kimi-k2.7-code:cloud", name: "Kimi K2.7 Code", context: 128000, output: 8192 },
    ],
  },
};

function writeAgentModelsJson(authPath: string, provider: string, envVarName: string): void {
  const def = PROVIDER_MODEL_DEFS[provider];
  if (!def) return;

  const agentDir = dirname(authPath);
  const modelsJsonPath = join(agentDir, "models.json");

  let config: { providers: Record<string, unknown> } = { providers: {} };
  if (existsSync(modelsJsonPath)) {
    try {
      config = JSON.parse(readFileSync(modelsJsonPath, "utf-8"));
      if (!config.providers || typeof config.providers !== "object") config.providers = {};
    } catch {
      config = { providers: {} };
    }
  }

  config.providers[provider] = {
    api: def.api,
    baseUrl: def.baseUrl,
    apiKey: `$${envVarName}`,
    models: def.models,
  };

  writeFileSync(modelsJsonPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}