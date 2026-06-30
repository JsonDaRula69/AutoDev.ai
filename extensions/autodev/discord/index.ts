/**
 * Discord bridge — pi extension module.
 *
 * Reads env vars:
 *  - DISCORD_BOT_TOKEN (required — bridge disables with warning if missing)
 *  - DISCORD_CHANNEL_ID (required — main channel for crew communication)
 *  - DISCORD_LIAISON_CHANNEL_ID (optional — separate channel for liaison)
 *
 * Exports `register(pi)` which wires the bridge into the pi runtime.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DiscordClient } from "./client.js";
import { createBridge, type BridgeConfig } from "./bridge.js";

/** Module-level reference so tests can inspect state. */
let bridgeHandle: { stop: () => void } | null = null;
let registerCount = 0;
let discordClient: DiscordClient | null = null;
let enabled = false;

/** Whether the bridge is currently enabled. */
export function isEnabled(): boolean {
  return enabled;
}

/** Get the Discord client instance (for tests). */
export function getClient(): DiscordClient | null {
  return discordClient;
}

/** Get the bridge handle (for tests). */
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

  const config: BridgeConfig = {
    channelId,
    liaisonChannelId: liaisonChannelId || undefined,
  };

  bridgeHandle = createBridge(pi, discordClient, config);

  registerCount++;
  if (registerCount === 1) {
    console.log(
      `[discord] Bridge enabled. Channel: ${channelId}${
        liaisonChannelId ? `, Liaison channel: ${liaisonChannelId}` : ""
      }`,
    );
  }
}
