# slack — Source Structure
**npm name:** `@opencode-ai/slack`
**private:** no
**version:** 1.17.7
**type:** module
**license:** MIT

A **Slack bot integration** for OpenCode that bridges Slack threaded messages into OpenCode sessions. Built with `@slack/bolt` (Socket Mode) on top of the OpenCode SDK (`createOpencode`). Each Slack thread becomes a separate OpenCode session; the bot subscribes to OpenCode events and posts tool/message updates back into the originating thread. Not used by AutoDev (which uses Discord via OpenClaw).

## Key directories
- `src/`
  - `index.ts` — The entire bot. Initializes `@slack/bolt` `App` (token, signingSecret, socketMode, appToken), calls `createOpencode({ port: 0 })` to spawn an in-process OpenCode server, maintains a `Map<sessionKey, {client, server, sessionId, channel, thread}>`, subscribes to `opencode.client.event.subscribe()` for `message.part.updated` events, and routes tool-part updates back to the matching Slack thread.

## Key files
- `package.json`
- `README.md` — setup (create Slack app, enable Socket Mode, OAuth scopes `chat:write`, `app_mentions:read`, `channels:history`, `groups:history`), env vars (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`), `bun dev` usage
- `.env.example` — env var template
- `tsconfig.json`
- `sst-env.d.ts`
- `.gitignore`

## Scripts
- `dev` — `bun run src/index.ts`
- `typecheck` — `tsgo --noEmit`

## Dependencies
- `@slack/bolt` ^3.17.1
- `@opencode-ai/sdk` `workspace:*`
- devDeps: `@types/node`, `typescript`, `@typescript/native-preview`

## Behavior (from source + README)
- Bot responds to messages in channels where it's added.
- Creates a separate OpenCode session per Slack thread.
- Forwards `message.part.updated` tool events back into the originating thread.
- Uses Socket Mode (no public HTTP endpoint required).