import type { DiscordMessage } from "./client.js";
import { execSync } from "node:child_process";

const COMMAND_PATTERNS: ReadonlyArray<{
  readonly trigger: string;
  readonly description: string;
}> = [
  { trigger: "/autodev status", description: "Show AutoDev status" },
  { trigger: "/autodev task", description: "Create a new GitHub issue" },
  { trigger: "/autodev hold", description: "Freeze a PR from auto-merge" },
  { trigger: "/autodev proceed", description: "Release a frozen PR" },
];

export interface SlashCommandResult {
  readonly command: string;
  readonly args: string;
  readonly matched: boolean;
}

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

export async function handleSlashCommand(
  result: SlashCommandResult,
): Promise<string | null> {
  if (!result.matched) return null;

  switch (result.command) {
    case "/autodev status":
      return handleStatusCommand(result.args);
    case "/autodev task":
      return handleTaskCommand(result.args);
    case "/autodev hold":
      return handleHoldCommand(result.args);
    case "/autodev proceed":
      return handleProceedCommand(result.args);
    default:
      return null;
  }
}

function runGh(args: string): string {
  try {
    return execSync(`gh ${args}`, { encoding: "utf-8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? (e as Error).message;
    throw new Error(stderr.slice(0, 500));
  }
}

function parsePrUrl(url: string): { repo: string; number: string } | null {
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { repo: m[1], number: m[2] };
}

async function handleStatusCommand(_args: string): Promise<string> {
  let workItems = "Unable to query — gh CLI not available or not authenticated.";
  try {
    const issues = runGh("issue list --label autodev-request --state open --json number,title --limit 5 2>/dev/null");
    const parsed = JSON.parse(issues) as Array<{ number: number; title: string }>;
    if (parsed.length === 0) {
      workItems = "No open autodev-request issues.";
    } else {
      workItems = parsed.map((i) => `  #${i.number}: ${i.title}`).join("\n");
    }
  } catch {
    // gh not available — keep default message
  }

  return [
    "**AutoDev Status**",
    "",
    `Discord bridge: ${process.env.DISCORD_BOT_TOKEN ? "connected" : "disabled"}`,
    "Heartbeat: polling every 5 minutes",
    "",
    "**Open Work Items:**",
    workItems,
  ].join("\n");
}

async function handleTaskCommand(args: string): Promise<string> {
  if (!args) {
    return [
      "**Usage:** `/autodev task <title>`",
      "",
      "Creates a new GitHub issue labeled `autodev-request`.",
      "Example: `/autodev task Add user authentication`",
    ].join("\n");
  }

  try {
    const output = runGh(`issue create --title "${args.replace(/"/g, '\\"')}" --label autodev-request --body "Created via Discord slash command."`);
    return `**Task Created:** ${output}\n\nIssue labeled \`autodev-request\`. The crew will pick it up on the next heartbeat.`;
  } catch (e) {
    return `**Error creating task:** ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
  }
}

async function handleHoldCommand(args: string): Promise<string> {
  if (!args) {
    return [
      "**Usage:** `/autodev hold <pr-url>`",
      "",
      "Freezes a PR from auto-merge by adding the `autodev-blocked` label.",
      "Example: `/autodev hold https://github.com/owner/repo/pull/42`",
    ].join("\n");
  }

  const pr = parsePrUrl(args);
  if (!pr) {
    return "**Error:** Invalid PR URL. Expected format: `https://github.com/owner/repo/pull/123`";
  }

  try {
    runGh(`pr edit ${pr.number} --repo ${pr.repo} --add-label autodev-blocked`);
    return `**PR Frozen:** #${pr.number} in ${pr.repo}\n\nAuto-merge will not proceed until released with \`/autodev proceed\`.`;
  } catch (e) {
    return `**Error freezing PR:** ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
  }
}

async function handleProceedCommand(args: string): Promise<string> {
  if (!args) {
    return [
      "**Usage:** `/autodev proceed <pr-url>`",
      "",
      "Releases a frozen PR by removing the `autodev-blocked` label.",
      "Example: `/autodev proceed https://github.com/owner/repo/pull/42`",
    ].join("\n");
  }

  const pr = parsePrUrl(args);
  if (!pr) {
    return "**Error:** Invalid PR URL. Expected format: `https://github.com/owner/repo/pull/123`";
  }

  try {
    runGh(`pr edit ${pr.number} --repo ${pr.repo} --remove-label autodev-blocked`);
    return `**PR Released:** #${pr.number} in ${pr.repo}\n\nAuto-merge can now proceed if all gates pass.`;
  } catch (e) {
    return `**Error releasing PR:** ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
  }
}

export function getSlashCommands(): ReadonlyArray<{ trigger: string; description: string }> {
  return COMMAND_PATTERNS;
}