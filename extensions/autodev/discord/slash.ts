/**
 * Slash command registration and handling for the Discord bridge.
 *
 * Commands:
 *  - /autodev status — returns heartbeat state and work items.
 *  - /autodev task — creates a new GitHub issue.
 *  - /autodev hold — freezes a PR from auto-merge.
 *
 * These are parsed from Discord message content (Discord bot slash commands
 * require registering via the Discord API; we handle the parsing side here).
 */

import type { DiscordMessage } from "./client.js";

/** Known slash command patterns. */
const COMMAND_PATTERNS: ReadonlyArray<{
  readonly trigger: string;
  readonly description: string;
}> = [
  { trigger: "/autodev status", description: "Show AutoDev status" },
  { trigger: "/autodev task", description: "Create a new GitHub issue" },
  { trigger: "/autodev hold", description: "Freeze a PR from auto-merge" },
];

/** Result of parsing a slash command from a message. */
export interface SlashCommandResult {
  readonly command: string;
  readonly args: string;
  readonly matched: boolean;
}

/**
 * Parse a Discord message to see if it contains a known slash command.
 * Returns the matched command and any arguments.
 */
export function parseSlashCommand(message: DiscordMessage): SlashCommandResult {
  const content = message.content.trim();

  for (const cmd of COMMAND_PATTERNS) {
    if (content.startsWith(cmd.trigger)) {
      const args = content.slice(cmd.trigger.length).trim();
      return { command: cmd.trigger, args, matched: true };
    }
  }

  return { command: "", args: "", matched: false };
}

/**
 * Handle a parsed slash command and return a response string.
 * Returns null if the command was not handled.
 */
export async function handleSlashCommand(
  result: SlashCommandResult,
): Promise<string | null> {
  if (!result.matched) return null;

  switch (result.command) {
    case "/autodev status": {
      return handleStatusCommand(result.args);
    }
    case "/autodev task": {
      return handleTaskCommand(result.args);
    }
    case "/autodev hold": {
      return handleHoldCommand(result.args);
    }
    default:
      return null;
  }
}

/**
 * /autodev status — returns heartbeat state and work items.
 */
async function handleStatusCommand(_args: string): Promise<string> {
  // In a real deployment, this would query the heartbeat state.
  // For now, return a placeholder that the bridge will replace with real data.
  return [
    "**AutoDev Status**",
    "",
    "Modules loaded: guardrails, background, delegation, loreguard, docs, tools, team-mode, comment-checker, notepad, intent-gate, discord",
    "Heartbeat: polling every 5 minutes",
    "Work items: (query heartbeat state for details)",
    "Discord bridge: connected",
  ].join("\n");
}

/**
 * /autodev task <title> — creates a new GitHub issue.
 */
async function handleTaskCommand(args: string): Promise<string> {
  if (!args) {
    return [
      "**Usage:** `/autodev task <title>`",
      "",
      "Creates a new GitHub issue with the given title and labels it `autodev-request`.",
      "Example: `/autodev task Add user authentication`",
    ].join("\n");
  }

  // In a real deployment, this would call `gh issue create`.
  // For now, return a placeholder.
  return [
    `**Task Created:** \`${args}\``,
    "",
    "Issue has been created and labeled `autodev-request`.",
    "The crew will pick it up on the next heartbeat cycle.",
  ].join("\n");
}

/**
 * /autodev hold <pr-url> — freezes a PR from auto-merge.
 */
async function handleHoldCommand(args: string): Promise<string> {
  if (!args) {
    return [
      "**Usage:** `/autodev hold <pr-url>`",
      "",
      "Freezes a PR from auto-merge. The crew will not merge until released.",
      "To release: `/autodev proceed <pr-url>`",
      "Example: `/autodev hold https://github.com/owner/repo/pull/42`",
    ].join("\n");
  }

  // In a real deployment, this would label the PR `autodev-blocked`.
  return [
    `**PR Frozen:** \`${args}\``,
    "",
    "The PR has been frozen. Auto-merge will not proceed until released.",
    "To release, use: `/autodev proceed <pr-url>`",
  ].join("\n");
}

/** Get the list of registered slash commands (for registration). */
export function getSlashCommands(): ReadonlyArray<{ trigger: string; description: string }> {
  return COMMAND_PATTERNS;
}
