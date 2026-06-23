/**
 * AutoDev pi extension — entry point.
 *
 * Wires context injection, the `/autodev` status command, and all 15 crew
 * modules into the pi runtime. The extension factory is synchronous; module
 * `register()` calls are synchronous and idempotent.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { augmentSystemPrompt } from "./context.js";

import { register as registerGuardrails } from "./guardrails/index.js";
import { register as registerBackground } from "./background/index.js";
import { register as registerDelegation } from "./delegation/index.js";
import { register as registerLoreguard } from "./loreguard/index.js";
import { register as registerDocs } from "./docs/index.js";
import { register as registerTools } from "./tools/index.js";
import { register as registerTeamMode } from "./team-mode/index.js";
import { register as registerCommentChecker } from "./comment-checker/index.js";
import { register as registerNotepad } from "./notepad/index.js";
import { register as registerIntentGate } from "./intent-gate/index.js";
import { register as registerMcpIntegrations } from "./mcp-integrations/index.js";
import { register as registerLsp } from "./lsp/index.js";
import { register as registerTmux } from "./tmux/index.js";
import { register as registerRulesInjection } from "./rules-injection/index.js";
import { register as registerWatchOfficerMonitor } from "./watch-officer-monitor/index.js";
import { register as registerOrchestrator } from "./orchestrator/index.js";
import { register as registerDiscord } from "./discord/index.js";
import { register as registerDebate } from "./debate/index.js";
import { register as registerAutonomy } from "./autonomy/index.js";
import { register as registerDebug } from "./debug/index.js";

/** Canonical module registration order. */
const MODULES: ReadonlyArray<{ readonly name: string; readonly register: (pi: ExtensionAPI) => void }> = [
  { name: "guardrails", register: registerGuardrails },
  { name: "background", register: registerBackground },
  { name: "delegation", register: registerDelegation },
  { name: "loreguard", register: registerLoreguard },
  { name: "docs", register: registerDocs },
  { name: "tools", register: registerTools },
  { name: "team-mode", register: registerTeamMode },
  { name: "comment-checker", register: registerCommentChecker },
  { name: "notepad", register: registerNotepad },
  { name: "intent-gate", register: registerIntentGate },
  { name: "discord", register: registerDiscord },
  { name: "mcp-integrations", register: registerMcpIntegrations },
  { name: "lsp", register: registerLsp },
  { name: "tmux", register: registerTmux },
  { name: "rules-injection", register: registerRulesInjection },
  { name: "watch-officer-monitor", register: registerWatchOfficerMonitor },
  { name: "orchestrator", register: registerOrchestrator },
  { name: "debate", register: registerDebate },
  { name: "autonomy", register: registerAutonomy },
  { name: "debug", register: registerDebug },
];

export const MODULE_NAMES: readonly string[] = MODULES.map((m) => m.name);

async function loadAgentEnv(): Promise<void> {
  let agentDir: string;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    agentDir = getAgentDir();
  } catch {
    agentDir = join(process.env.HOME ?? "~", ".pi", "agent");
  }
  const envPath = join(agentDir, ".env");
  if (!existsSync(envPath)) return;

  let raw: string;
  try {
    raw = readFileSync(envPath, "utf-8");
  } catch {
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export default async function autodevExtension(pi: ExtensionAPI): Promise<void> {
  await loadAgentEnv();

  pi.on("before_agent_start", async (event, ctx) => {
    const augmented = augmentSystemPrompt(event, ctx.cwd);
    if (augmented !== event.systemPrompt) {
      return { systemPrompt: augmented };
    }
    return undefined;
  });

  for (const mod of MODULES) {
    mod.register(pi);
  }
}