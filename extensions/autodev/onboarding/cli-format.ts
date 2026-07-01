/**
 * CLI formatting — structured layout with colors and visual separation.
 *
 * Renders agent responses, user input, thinking, tool calls, and subagent
 * activity with distinct visual styling so the user can instantly tell what's
 * happening in the conversation.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const GRAY = "\x1b[90m";
const BLUE = "\x1b[34m";

export type OutputChannel = "agent" | "user" | "thinking" | "toolcall" | "toolresult" | "subagent" | "system" | "mailbox" | "error" | "warning";

interface FormatOpts {
  agent?: string;
}

const CHANNEL_STYLES: Record<OutputChannel, { prefix: string; color: string; label: string }> = {
  agent:     { prefix: "", color: RESET, label: "" },
  user:      { prefix: "", color: BOLD + GREEN, label: "" },
  thinking:  { prefix: "  ", color: DIM + GRAY, label: "💭" },
  toolcall:  { prefix: "  ", color: YELLOW, label: "🔧" },
  toolresult: { prefix: "  ", color: GRAY, label: "↳" },
  subagent:  { prefix: "  ", color: MAGENTA, label: "⚡" },
  system:    { prefix: "", color: CYAN, label: "ℹ" },
  mailbox:   { prefix: "  ", color: BLUE, label: "📮" },
  error:     { prefix: "", color: BOLD + "\x1b[31m", label: "✗" },
  warning:   { prefix: "", color: YELLOW, label: "⚠" },
};

const AGENT_NAMES: Record<string, string> = {
  "harbor-master": "Harbor Master",
  "explore": "Explore",
  "conseil": "Conseil",
  "metis": "Metis",
  "momus": "Momus",
  "aronnax": "Aronnax",
  "ned-land": "Ned Land",
  "oracle": "Oracle",
  "nemo": "Nemo",
};

function agentLabel(agent: string): string {
  return AGENT_NAMES[agent] ?? agent;
}

export function formatMessage(channel: OutputChannel, content: string, opts?: FormatOpts): string {
  const style = CHANNEL_STYLES[channel];
  const lines = content.split("\n");
  const agent = opts?.agent ?? "";

  if (channel === "agent") {
    const name = agentLabel(agent);
    const header = `${BOLD}${CYAN}── ${name} ${RESET}${GRAY}${"─".repeat(Math.max(0, 50 - name.length))}${RESET}`;
    const body = lines.map(l => l).join("\n");
    const footer = `${GRAY}${"─".repeat(60)}${RESET}`;
    return `${header}\n${body}\n${footer}\n`;
  }

  if (channel === "user") {
    return `${BOLD}${GREEN}> ${content}${RESET}\n`;
  }

  if (channel === "thinking") {
    const name = agent ? `${agentLabel(agent)} ` : "";
    const preview = content.slice(0, 500);
    const wrapped = wrapText(preview, 70);
    return `${DIM}${GRAY}${style.label} ${name}thinking:${RESET}\n${DIM}${GRAY}${style.prefix}${wrapped}${RESET}\n`;
  }

  if (channel === "toolcall") {
    const name = agent ? `${agentLabel(agent)} ` : "";
    return `${style.color}${style.label} ${name}${content}${RESET}\n`;
  }

  if (channel === "toolresult") {
    const preview = content.slice(0, 300);
    return `${style.color}${style.label} ${preview}${RESET}\n`;
  }

  if (channel === "subagent") {
    const name = agent ? `${agentLabel(agent)} ` : "";
    return `${style.color}${style.label} ${name}${content}${RESET}\n`;
  }

  if (channel === "mailbox") {
    return `${style.color}${style.label} ${content}${RESET}\n`;
  }

  if (channel === "system") {
    return `${style.color}${style.label} ${content}${RESET}\n`;
  }

  if (channel === "error") {
    return `${style.color}${style.label} ${content}${RESET}\n`;
  }

  if (channel === "warning") {
    return `${style.color}${style.label} ${content}${RESET}\n`;
  }

  return `${style.color}${content}${RESET}\n`;
}

function wrapText(text: string, width: number): string {
  const words = text.split(" ");
  const result: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).length > width) {
      result.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) result.push(line);
  return result.join("\n" + "  ");
}

export function formatSessionHeader(projectRoot: string, isResuming: boolean): string {
  const title = isResuming ? "Resuming Onboarding Session" : "Starting Onboarding Session";
  const bar = "═".repeat(60);
  return `${BOLD}${CYAN}${bar}${RESET}\n${BOLD}${CYAN}  ${title}${RESET}\n${BOLD}${CYAN}  ${projectRoot}${RESET}\n${BOLD}${CYAN}${bar}${RESET}\n`;
}

export function formatPrompt(label: string): string {
  return `${BOLD}${GREEN}> ${RESET}`;
}

export function formatDivider(): string {
  return `${GRAY}${"─".repeat(60)}${RESET}\n`;
}

export function formatVerboseEvent(agent: string, event: any, config: { showToolCalls: boolean; showThinking: boolean; showReasoning: boolean }): string | null {
  if (event.type === "tool_execution_start" && config.showToolCalls) {
    const toolName = event.toolName ?? "unknown";
    const argsStr = JSON.stringify(event.args ?? {}).slice(0, 150);
    return formatMessage("toolcall", `${toolName}(${argsStr})`, { agent });
  }
  if (event.type === "tool_execution_end" && config.showToolCalls) {
    const toolName = event.toolName ?? "unknown";
    const resultStr = typeof event.result === "string"
      ? event.result.slice(0, 200)
      : JSON.stringify(event.result ?? "").slice(0, 200);
    return formatMessage("toolresult", `${toolName} → ${resultStr}`, { agent });
  }
  if (event.type === "message_end" && event.message?.role === "assistant" && Array.isArray(event.message?.content)) {
    for (const part of event.message.content) {
      if (part?.type === "thinking" && config.showThinking && part.thinking) {
        return formatMessage("thinking", part.thinking, { agent });
      }
      if (part?.type === "reasoning" && config.showReasoning && part.reasoning) {
        return formatMessage("thinking", part.reasoning, { agent });
      }
    }
  }
  return null;
}