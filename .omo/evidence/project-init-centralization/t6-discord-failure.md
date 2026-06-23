# T6 — handleDiscord: Failure / Edge-Case Path

**Task:** project-init-centralization T6 — failure-mode and edge-case behavior for the rewritten `handleDiscord`.

**Date:** 2026-06-23

## Failure / edge-case tests

From `extensions/autodev/installer/__tests__/config-module.test.ts`:

```
(pass) handleDiscord skip: confirm=false → marks step skipped, no env writes [2.87ms]
(pass) handleDiscord no-TTY: prompt returns empty → warns, returns warning [1.89ms]
(pass) handleDiscord already-configured: STEP_DISCORD complete → returns skipped without prompting [2.49ms]
(pass) handleDiscord confirm defaults to false (skip) [2.48ms]
```

## Behavior summary

| Condition | Result |
|---|---|
| Already configured (`STEP_DISCORD` complete in `config` scope) | `status: "skipped"`, message "Already configured.", no prompt consumed |
| User declines confirm (`confirm` → false) | `status: "skipped"`, message "Discord integration skipped.", `STEP_DISCORD` marked complete, no env file written |
| No TTY (`confirm` → true via default probe, `prompt` → "") | `status: "warning"`, message "interactive config required, no TTY detected", warning notify fired, `STEP_DISCORD` marked complete, no env file written |
| Confirm default (`defaultYes`) | `false` — confirmed via probe prompter that captures the `defaultYes` argument |

## No-TTY semantics

The no-TTY warning path fires when the user confirms setup but the token `prompt` returns an empty string (the `createNoTtyPrompter` behavior). The handler:
1. Calls `deps.notify("interactive config required, no TTY detected", "warning")`.
2. Calls `markStepCompleted` so the step is not re-prompted on every run.
3. Returns `status: "warning"` with the no-TTY message.
4. Does **not** write any env vars.

## Skip semantics

When the user declines the confirm (default `false`):
1. `STEP_DISCORD` is marked complete so `handleDiscord` does not re-prompt on subsequent `autodev config` runs.
2. No env file is written.
3. Returns `status: "skipped"` with "Discord integration skipped."

This matches the existing `handleGithub` / `handleVoyage` skip-then-mark-complete pattern.

## What did NOT change

- `handleLlm`, `handleVoyage`, `handleGithub` — untouched.
- `setEnvVars` call signature and env var names (`DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID`) — unchanged.
- `ConfigResult` interface, `STEP_DISCORD=5`, `CONFIG_SCOPE="config"` — unchanged.
- No files outside `config-module.ts`, its tests, and evidence were modified.

## Conclusion

Failure and edge-case paths verified: skip, no-TTY, already-configured, and confirm-default all behave as specified, with no env writes on non-happy paths and `STEP_DISCORD` marked complete to avoid re-prompting.