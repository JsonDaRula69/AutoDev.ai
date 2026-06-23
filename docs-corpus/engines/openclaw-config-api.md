# OpenClaw Config Schema

**Source:** `src/plugin/config/schema/openclaw.ts` (AutoDev repo)
**Full source copy:** `docs-corpus/engines/openclaw-config.ts`

## Overview

OpenClaw is the outbound-hook + inbound-reply system that lets AutoDev push messages to external gateways (HTTP endpoints or shell commands) and listen for replies (Discord / Telegram). The config schema is defined with Zod and intersects with core types from `@oh-my-opencode/openclaw-core`.

## Schemas

### OpenClawGatewaySchema

Defines a single outbound gateway. Type is either `http` or `command`.

```typescript
{
  type: "http" | "command",       // default: "http"
  url?: string,                   // HTTP only
  method: string,                 // default: "POST"
  headers?: Record<string, string>,
  command?: string,               // command only
  timeout?: number,
}
```

### OpenClawHookSchema

Defines a hook that fires an instruction to a named gateway.

```typescript
{
  enabled: boolean,               // default: true
  gateway: string,                // name of a gateway in OpenClawConfig.gateways
  instruction: string,            // prompt/instruction to send
}
```

### OpenClawReplyListenerConfigSchema

Inbound reply listener for Discord / Telegram.

```typescript
{
  discordBotToken?: string,
  discordChannelId?: string,
  discordMention?: string,                          // for allowed_mentions
  authorizedDiscordUserIds: string[],                // default: []
  telegramBotToken?: string,
  telegramChatId?: string,
  pollIntervalMs: number,                           // default: 3000
  rateLimitPerMinute: number,                       // default: 10
  maxMessageLength: number,                         // default: 500
  includePrefix: boolean,                           // default: true
}
```

### OpenClawConfigSchema (root)

```typescript
{
  enabled: boolean,                                 // default: false
  gateways: Record<string, OpenClawGateway>,        // default: {}
  hooks: Record<string, OpenClawHook>,               // default: {}
  replyListener?: OpenClawReplyListenerConfig,
}
```

## Types

The exported types are Zod-inferred schemas intersected (`&`) with the core types from `@oh-my-opencode/openclaw-core`:

- `OpenClawConfig`
- `OpenClawGateway`
- `OpenClawHook`
- `OpenClawReplyListenerConfig`

This dual-type pattern means the Zod schema validates runtime config while the core types provide additional static type guarantees from the OmO `openclaw-core` package.