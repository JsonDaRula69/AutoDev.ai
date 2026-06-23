# T6 — handleDiscord: Happy Path

**Task:** project-init-centralization T6 — rewrite `handleDiscord` in `extensions/autodev/installer/config-module.ts` with a full 7-step setup walkthrough and a pointer to `~/.AutoDev/reference/discord-setup.md`.

**Date:** 2026-06-23

## Changed files

- `extensions/autodev/installer/config-module.ts` — `handleDiscord` confirm prompt now embeds the 7-step Discord bot creation/invite walkthrough and the reference doc pointer. Confirm default remains `false` (skip). Env-writing logic (`DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID`) unchanged.
- `extensions/autodev/installer/__tests__/config-module.test.ts` — new test file (6 tests) covering happy, skip, no-TTY, already-configured, walkthrough-text presence, and confirm-defaults-false.

## The 7 steps embedded in the confirm prompt

1. Discord Developer Portal → Applications → New Application
2. Bot tab → Reset Token → copy it
3. Enable Message Content Intent
4. OAuth2 → URL Generator → scopes: bot → permissions: Send Messages, Read Message History
5. Open URL → invite bot to server
6. Enable Developer Mode (User Settings → Advanced → Developer Mode)
7. Right-click channel → Copy ID

Reference pointer: `Full setup guide: ~/.AutoDev/reference/discord-setup.md`

## Happy-path verification

```
$ bun test extensions/autodev/installer/__tests__/config-module.test.ts
(pass) handleDiscord happy path: confirm, token, channel, liaison → writes env vars, returns ok [13.44ms]
(pass) handleDiscord skip: confirm=false → marks step skipped, no env writes [2.87ms]
(pass) handleDiscord no-TTY: prompt returns empty → warns, returns warning [1.89ms]
(pass) handleDiscord already-configured: STEP_DISCORD complete → returns skipped without prompting [2.49ms]
(pass) handleDiscord confirm prompt text includes all 7 setup steps and reference pointer [3.42ms]
(pass) handleDiscord confirm defaults to false (skip) [2.48ms]

 6 pass
 0 fail
 34 expect() calls
Ran 6 tests across 1 file. [73.00ms]
```

Happy-path behavior:
- `confirm` with `defaultYes=false` → user answers `y`.
- `prompt` returns bot token, channel ID, liaison channel ID.
- `setEnvVars` writes `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID` to `agentEnvPath` (`.env` sibling of `auth.json`).
- `markStepCompleted` records `STEP_DISCORD=5` in `config` scope.
- Returns `status: "ok"`, message contains "Discord".

## Type check

```
$ bun run typecheck
(no errors referencing config-module.ts or config-module.test.ts)
```

Pre-existing errors in `install-module.ts`, `doctor.ts`, and `tools.ts` are unrelated to T6 and out of scope.

## Conclusion

Happy path verified: `handleDiscord` now presents the full 7-step Discord setup walkthrough and the `~/.AutoDev/reference/discord-setup.md` pointer, confirm defaults to skip, and env vars are written on confirmation.