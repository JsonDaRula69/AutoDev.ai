import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const VERBOSE_CONFIG_FILENAME = "verbose.yaml";

export interface VerboseConfig {
  enabled: boolean;
  showToolCalls: boolean;
  showThinking: boolean;
  showReasoning: boolean;
  showSubAgents: boolean;
}

const DEFAULT_CONFIG: VerboseConfig = {
  enabled: false,
  showToolCalls: true,
  showThinking: true,
  showReasoning: true,
  showSubAgents: true,
};

export { DEFAULT_CONFIG as DEFAULT_VERBOSE_CONFIG };

export function resolveVerboseConfig(agentDir: string): VerboseConfig {
  const configPath = join(agentDir, "..", "config", VERBOSE_CONFIG_FILENAME);
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const content = readFileSync(configPath, "utf-8");
    const cfg: Partial<VerboseConfig> = {};
    for (const line of content.split("\n")) {
      const m = line.match(/^(\w+):\s*(\S+)/);
      if (!m) continue;
      const [, key, val] = m;
      if (key === "enabled") cfg.enabled = val === "true";
      else if (key === "showToolCalls") cfg.showToolCalls = val === "true";
      else if (key === "showThinking") cfg.showThinking = val === "true";
      else if (key === "showReasoning") cfg.showReasoning = val === "true";
      else if (key === "showSubAgents") cfg.showSubAgents = val === "true";
    }
    return { ...DEFAULT_CONFIG, ...cfg };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeVerboseConfig(agentDir: string, cfg: VerboseConfig): void {
  const configDir = join(agentDir, "..", "config");
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, VERBOSE_CONFIG_FILENAME);
  const lines = [
    `enabled: ${cfg.enabled}`,
    `showToolCalls: ${cfg.showToolCalls}`,
    `showThinking: ${cfg.showThinking}`,
    `showReasoning: ${cfg.showReasoning}`,
    `showSubAgents: ${cfg.showSubAgents}`,
  ];
  writeFileSync(configPath, lines.join("\n") + "\n", "utf-8");
}

export function isVerboseActive(cliFlag: boolean | undefined, config: VerboseConfig | undefined): boolean {
  return cliFlag === true || config?.enabled === true;
}

export interface VerboseLogger {
  readonly active: boolean;
  logEvent(agentLabel: string, event: any): void;
  logToolCall(agentLabel: string, toolName: string, args: unknown): void;
  logToolResult(agentLabel: string, toolName: string, result: unknown): void;
  logThinking(agentLabel: string, text: string): void;
  logPrompt(agentLabel: string, promptLength: number): void;
  logPromptResult(agentLabel: string, entryCount: number, assistantCount: number): void;
}

function noopLogger(): VerboseLogger {
  return {
    active: false,
    logEvent: () => {},
    logToolCall: () => {},
    logToolResult: () => {},
    logThinking: () => {},
    logPrompt: () => {},
    logPromptResult: () => {},
  };
}

function createLogger(cfg: VerboseConfig): VerboseLogger {
  const label = (agent: string) => `\x1b[36m[verbose:${agent}]\x1b[0m`;

  return {
    active: true,
    logEvent(agent: string, event: any) {
      if (event.type === "tool_execution_start") {
        if (cfg.showToolCalls) {
          const toolName = event.toolName ?? "unknown";
          const argsStr = JSON.stringify(event.args ?? {}).slice(0, 200);
          console.error(`${label(agent)} TOOL: ${toolName}(${argsStr})`);
        }
      } else if (event.type === "tool_execution_end") {
        if (cfg.showToolCalls) {
          const toolName = event.toolName ?? "unknown";
          const resultStr = typeof event.result === "string"
            ? event.result.slice(0, 300)
            : JSON.stringify(event.result ?? "").slice(0, 300);
          console.error(`${label(agent)} TOOL RESULT: ${toolName} → ${resultStr}`);
        }
      } else if (event.type === "message_end") {
        const msg = event.message;
        const role = msg?.role;
        if (role === "assistant" && Array.isArray(msg?.content)) {
          for (const part of msg.content) {
            if (part?.type === "thinking" && cfg.showThinking && part.thinking) {
              const preview = part.thinking.slice(0, 500);
              console.error(`${label(agent)} THINKING: ${preview}`);
            }
            if (part?.type === "reasoning" && cfg.showReasoning && part.reasoning) {
              const preview = part.reasoning.slice(0, 500);
              console.error(`${label(agent)} REASONING: ${preview}`);
            }
          }
        }
      }
    },
    logToolCall(agent: string, toolName: string, args: unknown) {
      if (!cfg.showToolCalls) return;
      const argsStr = JSON.stringify(args ?? {}).slice(0, 200);
      console.error(`${label(agent)} TOOL: ${toolName}(${argsStr})`);
    },
    logToolResult(agent: string, toolName: string, result: unknown) {
      if (!cfg.showToolCalls) return;
      const resultStr = typeof result === "string"
        ? result.slice(0, 300)
        : JSON.stringify(result ?? "").slice(0, 300);
      console.error(`${label(agent)} TOOL RESULT: ${toolName} → ${resultStr}`);
    },
    logThinking(agent: string, text: string) {
      if (!cfg.showThinking) return;
      console.error(`${label(agent)} THINKING: ${text.slice(0, 500)}`);
    },
    logPrompt(agent: string, promptLength: number) {
      console.error(`${label(agent)} PROMPT sent (${promptLength} chars)`);
    },
    logPromptResult(agent: string, entryCount: number, assistantCount: number) {
      console.error(`${label(agent)} PROMPT returned — ${entryCount} log entries, ${assistantCount} assistant`);
    },
  };
}

export function createVerboseLogger(opts: {
  cliFlag?: boolean;
  config?: VerboseConfig;
}): VerboseLogger {
  const config = opts.config;
  const enabled = opts.cliFlag === true || config?.enabled === true;
  if (!enabled) return noopLogger();
  const cfg = config ?? DEFAULT_CONFIG;
  return createLogger(cfg);
}

export function createSubAgentLogger(parentLogger: VerboseLogger, cfg: VerboseConfig): VerboseLogger {
  if (!parentLogger.active || !cfg.showSubAgents) return noopLogger();
  return createLogger(cfg);
}