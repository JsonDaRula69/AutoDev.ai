/**
 * Discord bridge — pi extension module.
 *
 * Reads env vars:
 *  - DISCORD_BOT_TOKEN (required — bridge disables with warning if missing)
 *  - DISCORD_CHANNEL_ID (required — main channel for crew communication)
 *  - DISCORD_LIAISON_CHANNEL_ID (optional — separate channel for liaison)
 *
 * Exports `register(pi)` which wires the bridge into the pi runtime.
 * Uses both REST API (client.ts) and Gateway WebSocket (gateway.ts) for
 * real-time message events and online presence.
 *
 * Inbound messages are routed to a pi agent session via the extension API.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DiscordClient } from "./client.js";
import { DiscordGateway } from "./gateway.js";
import { createBridge, type BridgeConfig, type InboundHandler } from "./bridge.js";

let bridgeHandle: { stop: () => void } | null = null;
let registerCount = 0;
let discordClient: DiscordClient | null = null;
let discordGateway: DiscordGateway | null = null;
let enabled = false;

export function isEnabled(): boolean {
  return enabled;
}

export function getClient(): DiscordClient | null {
  return discordClient;
}

export function getGateway(): DiscordGateway | null {
  return discordGateway;
}

export function getBridgeHandle(): { stop: () => void } | null {
  return bridgeHandle;
}

export function register(pi: ExtensionAPI): void {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  const liaisonChannelId = process.env.DISCORD_LIAISON_CHANNEL_ID;

  if (!token) {
    console.warn(
      "[discord] DISCORD_BOT_TOKEN not set. Discord bridge disabled. " +
        "Set DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, and optionally DISCORD_LIAISON_CHANNEL_ID to enable.",
    );
    enabled = false;
    return;
  }

  if (!channelId) {
    console.warn(
      "[discord] DISCORD_CHANNEL_ID not set. Discord bridge disabled. " +
        "Set DISCORD_CHANNEL_ID to the channel where the crew should communicate.",
    );
    enabled = false;
    return;
  }

  enabled = true;
  discordClient = new DiscordClient(token);
  discordGateway = new DiscordGateway(token);

  const config: BridgeConfig = {
    channelId,
    liaisonChannelId: liaisonChannelId || undefined,
  };

  const inboundHandler: InboundHandler = async (message) => {
    const content = message.content.trim();
    if (!content) return null;

    try {
      pi.sendUserMessage(content);
      return null;
    } catch (err) {
      console.error(`[discord] Failed to route message to session: ${err}`);
      return "Sorry, I could not process that message. Please try again.";
    }
  };

  bridgeHandle = createBridge(pi, discordClient, config, discordGateway, inboundHandler);

  registerCount++;
  if (registerCount === 1) {
    console.log(
      `[discord] Bridge enabled. Channel: ${channelId}${
        liaisonChannelId ? `, Liaison channel: ${liaisonChannelId}` : ""
      }`,
    );
    void discordGateway.connect();
  }
}
