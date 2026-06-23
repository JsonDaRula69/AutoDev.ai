# T1 Symlinks Happy Path Evidence

**Task:** project-init-centralization T1 — set `PI_CODING_AGENT_DIR` and centralize config via symlinks into `~/.AutoDev/`.

**Date:** 2026-06-23

## What was tested

`validateAndCreateConfig(packageRoot, overrides)` with `PI_CODING_AGENT_DIR` pointed at a temp central dir and a mock global package layout. Verifies all symlinks and the real-file `magic-context.jsonc` are created.

## Test

`extensions/autodev/installer/__tests__/config-defaults.test.ts`

```
(pass) getAgentDir returns default ~/.pi/agent when env var unset
(pass) getAgentDir returns custom dir when PI_CODING_AGENT_DIR is set
(pass) validateAndCreateConfig creates all symlinks and magic-context.jsonc on happy path
(pass) validateAndCreateConfig is idempotent: re-run returns ok=true, created=false for existing symlinks
```

## Assertions verified

- `~/.AutoDev/agent/settings.json` is a symlink → `<packageRoot>/.pi/settings.json`.
- `~/.AutoDev/agents/*.md` (13 files) are symlinks → `<packageRoot>/.pi/agents/*.md`.
- `~/.AutoDev/reference/` is a directory symlink → `<packageRoot>/.autodev/reference/`.
- `~/.AutoDev/skills/` is a directory symlink → `<packageRoot>/.pi/skills/`.
- `~/.AutoDev/agent/extensions/autodev` is a directory symlink → `<packageRoot>/extensions/autodev`.
- `~/.AutoDev/config/*` (9 files) are symlinks → `<packageRoot>/.autodev/config/*`.
- `~/.AutoDev/agent/magic-context.jsonc` is a real file (not a symlink), written with AutoDev defaults.
- Idempotent re-run: all `created=false`, `ok=true` for existing entries.

## Command

```
bun test extensions/autodev/installer/__tests__/config-defaults.test.ts
```

## Result

```
6 pass, 0 fail, 56 expect() calls
```

## Typecheck

```
bun run typecheck → tsc --noEmit → EXIT 0
```

## Conclusion

Symlink-based centralization works end-to-end. No network calls. `magic-context.jsonc` written as a real file. Idempotent.