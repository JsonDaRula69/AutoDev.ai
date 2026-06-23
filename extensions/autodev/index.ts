/**
 * AutoDev pi extension — entry point.
 *
 * Wires context injection, the `/autodev` status command, and all 15 crew
 * modules into the pi runtime. The extension factory is synchronous; module
 * `register()` calls are synchronous and idempotent.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
  { name: "mcp-integrations", register: registerMcpIntegrations },
  { name: "lsp", register: registerLsp },
  { name: "tmux", register: registerTmux },
  { name: "rules-injection", register: registerRulesInjection },
  { name: "watch-officer-monitor", register: registerWatchOfficerMonitor },
];

export const MODULE_NAMES: readonly string[] = MODULES.map((m) => m.name);

export default function autodevExtension(pi: ExtensionAPI): void {
  // Context injection: augment the system prompt before each agent turn.
  pi.on("before_agent_start", async (event, ctx) => {
    const augmented = augmentSystemPrompt(event, ctx.cwd);
    if (augmented !== event.systemPrompt) {
      return { systemPrompt: augmented };
    }
    return undefined;
  });

  // /autodev status command.
  pi.registerCommand("autodev", {
    description: "Show AutoDev status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("AutoDev — Autonomous Engineering Team", "info");
      ctx.ui.notify(
        `${MODULES.length} modules loaded. pi-foundation branch.`,
        "info",
      );
    },
  });

  // Register all 15 modules in canonical order.
  for (const mod of MODULES) {
    mod.register(pi);
  }
}