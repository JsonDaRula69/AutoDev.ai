/**
 * Discord bridge — bidirectional message relay between Discord and pi sessions.
 *
 * Inbound: Discord message → callback for session dispatch → response posted to Discord.
 * Outbound: pi.on("agent_end", ...) → post response to Discord channel.
 * Reply polling: periodically checks Discord for replies to agent messages.
 *
 * Session creation is handled by the caller (heartbeat/dispatch system).
 * The bridge only handles Discord API communication and event wiring.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DiscordClient, type DiscordMessage } from "./client.js";
import { parseSlashCommand, handleSlashCommand } from "./slash.js";

const MAX_INPUT_CHARS = 10_000;
const REPLY_POLL_INTERVAL_MS = 10_000;
const POLL_LIMIT = 25;

interface TrackedSession {
  readonly channelId: string;
  lastMessageId: string;
  sessionId?: string;
}

export interface BridgeConfig {
  readonly channelId: string;
  readonly liaisonChannelId?: string | undefined;
}

export type InboundHandler = (message: DiscordMessage) => Promise<string | null>;

export function createBridge(
  pi: ExtensionAPI,
  client: DiscordClient,
  config: BridgeConfig,
  inboundHandler?: InboundHandler,
): { stop: () => void } {
  const sessions = new Map<string, TrackedSession>();
  const replyPollTimers: ReturnType<typeof setInterval>[] = [];
  let stopped = false;

  async function handleInboundMessage(message: DiscordMessage): Promise<void> {
    if (stopped) return;
    if (message.author.bot) return;

    const slashResult = parseSlashCommand(message);
    if (slashResult.matched) {
      const response = await handleSlashCommand(slashResult);
      if (response) {
        await client.sendMessage(message.channel_id, response, {
          replyTo: message.id,
        });
      }
      return;
    }

    if (inboundHandler) {
      try {
        const response = await inboundHandler(message);
        if (response) {
          await client.sendMessage(message.channel_id, truncateResponse(response), {
            replyTo: message.id,
          });
        }
      } catch (err) {
        console.error(`[discord] Inbound handler failed: ${err}`);
        await client.sendMessage(
          message.channel_id,
          "Sorry, I encountered an error processing your message. Please try again.",
          { replyTo: message.id },
        );
      }
    }

    const sessionKey = `${message.channel_id}:main`;
    let tracked = sessions.get(sessionKey);
    if (!tracked) {
      tracked = { channelId: message.channel_id, lastMessageId: message.id };
      sessions.set(sessionKey, tracked);
    } else {
      tracked.lastMessageId = message.id;
    }
  }

  function handleAgentEnd(event: { messages?: unknown[] }, _ctx: { cwd: string }): void {
    if (stopped) return;
    if (!event.messages || event.messages.length === 0) return;

    const lastMessage = event.messages[event.messages.length - 1] as {
      content?: string | Array<{ type?: string; text?: string }>;
    } | undefined;
    const rawContent = lastMessage?.content;
    if (rawContent === undefined || rawContent === null) return;

    const content = typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
            .filter((part) => part?.type === "text" && typeof part.text === "string")
            .map((part) => part.text!)
            .join("")
        : "";

    if (content.length === 0) return;

    void client.sendMessage(config.channelId, truncateResponse(content));
  }

  function startReplyPolling(): void {
    const timer = setInterval(async () => {
      if (stopped) return;

      for (const [sessionKey, tracked] of sessions.entries()) {
        try {
          const messages = await client.getMessages(tracked.channelId, {
            limit: POLL_LIMIT,
          });

          for (const msg of messages) {
            if (msg.author.bot) continue;
            if (msg.referenced_message?.id === tracked.lastMessageId) {
              await handleInboundMessage(msg);
            }
          }
        } catch (err) {
          console.warn(`[discord] Reply poll error for ${sessionKey}: ${err}`);
        }
      }
    }, REPLY_POLL_INTERVAL_MS);

    replyPollTimers.push(timer);
  }

  pi.on("agent_end", handleAgentEnd);
  startReplyPolling();

  return {
    stop: () => {
      stopped = true;
      for (const timer of replyPollTimers) {
        clearInterval(timer);
      }
      replyPollTimers.length = 0;
    },
  };
}

function truncateResponse(response: string): string {
  const MAX_DISCORD_CHARS = 2000;
  if (response.length <= MAX_DISCORD_CHARS) return response;

  const truncated = response.slice(0, MAX_DISCORD_CHARS - 3);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const breakAt = Math.max(lastPeriod, lastNewline);
  if (breakAt > MAX_DISCORD_CHARS / 2) {
    return truncated.slice(0, breakAt + 1) + "...";
  }
  return truncated + "...";
}
