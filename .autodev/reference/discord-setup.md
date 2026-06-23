# Discord Integration Setup

## Overview

Discord is an **optional** user interaction channel for AutoDev. When enabled, it provides:

- **Inbound (Reply Listener)**: A daemon polls the Discord API every 3 seconds, reads messages from configured channels, and injects them into the active tmux session as if typed by the user.
- **Outbound (Webhook/Gateway)**: Session events (session.created, session.deleted, session.idle) are dispatched to configured gateways — HTTP webhooks or shell commands — for notification.

Both subsystems are **opt-in** and disabled by default. They are enabled per-project during `autodev init` or by editing the project's `oh-my-openagent.jsonc`.

## Prerequisites

1. **Discord Bot Token** — Create a Discord Application at https://discord.com/developers/applications, add a Bot, and copy the token.
2. **Discord Channel ID(s)** — Enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click a channel → Copy ID.
3. **Authorized User ID(s)** — Right-click a user → Copy ID to restrict who can send replies to AutoDev.

## Configuration

### 1. Enable OpenClaw

In your project's `oh-my-openagent.jsonc` (typically at `<project>/.opencode/oh-my-openagent.jsonc` or `<project>/.autodev/config/oh-my-openagent.jsonc`):

```jsonc
{
  "openclaw": {
    "enabled": true,
    "replyListener": {
      "enabled": true
    }
  }
}
```

- `openclaw.enabled` — Master switch. Default: `false` (opt-in).
- `openclaw.replyListener.enabled` — Enable the reply-listener daemon. Default: `true` (when openclaw is enabled).

### 2. Set Environment Variables

**Never hardcode tokens in config files.** Use environment variables:

```bash
# Required for Discord reply listener
export AUTODEV_DISCORD_BOT_TOKEN="your_discord_bot_token"
export AUTODEV_DISCORD_CHANNEL_ID="your_discord_channel_id"
export AUTODEV_DISCORD_LIAISON_CHANNEL_ID="your_liaison_channel_id"
```

These are referenced in the config via `${AUTODEV_DISCORD_BOT_TOKEN}`, `${AUTODEV_DISCORD_CHANNEL_ID}`, and `${AUTODEV_DISCORD_LIAISON_CHANNEL_ID}`.

### 3. Full Reply Listener Configuration

```jsonc
{
  "openclaw": {
    "enabled": true,
    "replyListener": {
      "enabled": true,
      "pollIntervalMs": 3000,
      "rateLimitPerMinute": 10,
      "maxMessageLength": 4000,
      "includePrefix": true,
      "acceptDirectMessages": true,
      "directMessageTargetPane": "autodev.0",
      "directMessagePrefix": "[direct]",
      "discordBotToken": "${AUTODEV_DISCORD_BOT_TOKEN}",
      "discordChannelId": "${AUTODEV_DISCORD_CHANNEL_ID}",
      "discordLiaisonChannelId": "${AUTODEV_DISCORD_LIAISON_CHANNEL_ID}",
      "authorizedDiscordUserIds": ["user_id_1", "user_id_2"],
      "telegramBotToken": "${AUTODEV_TELEGRAM_BOT_TOKEN}",
      "telegramChatId": "${AUTODEV_TELEGRAM_CHAT_ID}"
    }
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `pollIntervalMs` | `3000` | How often to poll Discord API (ms) |
| `rateLimitPerMinute` | `10` | Max replies injected per minute |
| `maxMessageLength` | `4000` | Max characters per message |
| `includePrefix` | `true` | Prepend `[discord]` or `[telegram]` prefix |
| `acceptDirectMessages` | `true` | Accept DMs to the bot |
| `directMessageTargetPane` | `"autodev.0"` | Tmux pane for DM injection |
| `directMessagePrefix` | `"[direct]"` | Prefix for DM messages |
| `authorizedDiscordUserIds` | `[]` | Empty = all users allowed |

### 4. Outbound Gateway Configuration (Optional)

For session event notifications via HTTP webhook or shell command:

```jsonc
{
  "openclaw": {
    "gateways": {
      "autodev-liaison": {
        "type": "http",
        "url": "http://localhost:3000/hooks/wake",
        "headers": {
          "Authorization": "Bearer ${AUTODEV_HOOK_TOKEN}"
        },
        "timeout": 10000
      }
    },
    "hooks": {
      "autodev:completed": {
        "enabled": true,
        "gateway": "autodev-liaison",
        "instruction": "AutoDev completed work. Check GitHub for details."
      },
      "autodev:blocked": {
        "enabled": true,
        "gateway": "autodev-liaison",
        "instruction": "AutoDev is blocked. Check GitHub and escalate to operator."
      },
      "autodev:deployed": {
        "enabled": true,
        "gateway": "autodev-liaison",
        "instruction": "AutoDev deployed a change. Validate project health."
      }
    }
  }
}
```

Gateway types:
- **`http`** — POST JSON payload to URL (HTTPS required for remote hosts; HTTP allowed for localhost)
- **`command`** — Execute shell command with `OPENCLAW_*` environment variables

## How It Works

### Reply Listener (Inbound)

```
Discord API → reply-listener daemon (detached Bun process)
  → reply-listener-discord.ts: poll every 3s for new messages
  → session-registry.ts: look up target tmux session from message context
  → reply-listener-injection.ts: send-keys into tmux pane (rate limited, user filtered)
```

1. On plugin startup, if `openclaw.enabled && replyListener.enabled`, `initializeOpenClaw()` spawns `daemon.ts` as a detached Bun process.
2. The daemon writes its PID to `.opencode/openclaw.state.json`.
3. Every `pollIntervalMs` (default 3000ms), it fetches recent messages from the configured Discord channel.
4. New messages are matched against the session registry to find the target tmux session.
5. Replies are injected into the tmux pane via `send-keys`, subject to rate limiting and authorized user filtering.

### Outbound Gateway

```
OpenCode session event → dispatchOpenClawEvent()
  → runtime-dispatch.ts: map event to OpenClaw event
  → dispatcher.ts: execute gateway (HTTP POST or shell command)
  → session-registry.ts: record message ID ↔ sessionID ↔ tmux pane
```

## Security

- **URL validation**: Remote URLs require HTTPS. HTTP is only allowed for localhost/127.0.0.1.
- **Authorized users**: Inbound replies are filtered by `authorizedDiscordUserIds`. Empty array = all users allowed.
- **Token redaction**: Secrets are masked in logs and error messages.
- **Rate limiting**: Reply injection is throttled per pane to prevent flooding.
- **No secrets in config**: Use environment variable references (`${VAR_NAME}`) — never hardcode tokens.

## Opt-In Design

Discord integration is **disabled by default** (`openclaw.enabled: false` in the Zod schema). It is enabled per-project during `autodev init` when the user selects Discord as a communication channel. This ensures:

- No unnecessary background daemons on projects that don't need Discord
- No accidental Discord API calls or token usage
- Clean separation: each project independently opts in

## Files

| Path | Purpose |
|------|---------|
| `src/plugin/openclaw/` | OpenClaw plugin source (re-exports from `@oh-my-opencode/openclaw-core`) |
| `.autodev/discord/SKILL.md` | Discord message-tool skill (send, read, react, poll, etc.) |
| `.autodev/discord/plugin-sdk.js` | Discord plugin SDK |
| `.autodev/discord/plugin-sdk.d.ts` | Discord plugin SDK types |
| `.autodev/discord/discord-runtime.js` | Discord runtime helpers |
| `.autodev/discord/thread-bindings.js` | Discord thread bindings |
| `src/plugin/config/schema/openclaw.ts` | Zod schema for OpenClaw config (defaults) |
| `src/config/oh-my-openagent.jsonc` | Project-level OpenClaw config |

## Troubleshooting

- **Daemon not starting**: Check `openclaw.enabled` and `replyListener.enabled` are both `true`. Verify `AUTODEV_DISCORD_BOT_TOKEN` is set.
- **No messages received**: Verify the bot has access to the configured channel. Check `authorizedDiscordUserIds` is not blocking the user.
- **Rate limited**: Increase `rateLimitPerMinute` or `pollIntervalMs`.
- **Daemon state**: Check `.opencode/openclaw.state.json` for PID and status.
