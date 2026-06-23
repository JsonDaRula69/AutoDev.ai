# Task 2 — Installer Refactor: package.json lifecycle cleanup + scripts/cli.ts

**Date:** 2026-06-23
**Wave:** 1 (foundational)
**Plan:** installer-refactor, todo 2

## Summary

Removed dead `preinstall`/`postinstall` lifecycle hooks from `package.json` and deleted the corresponding `scripts/preinstall-guard.ts` + `scripts/postinstall.ts` files. Repointed `bin.autodev` from `./scripts/postinstall.ts` → `./scripts/cli.ts`. Created `scripts/cli.ts` as a real CLI entrypoint that:

1. Loads `~/.pi/agent/.env` into `process.env` first (manual KEY=VALUE parser, dynamic `import()` of `getAgentDir` from `@earendil-works/pi-coding-agent` with `~/.pi/agent` fallback).
2. Dispatches subcommands by calling exported functions directly — NOT via `registerCommands` or private handlers from `orchestrator/cli.ts`.
3. Ports `resolveAuthPath` + `autoNonInteractive` helpers from `installer/index.ts:138-154` (these get deleted in todo 8).

## Files changed

| File | Action | Detail |
|------|--------|--------|
| `package.json` | modified | Removed `preinstall`/`postinstall` scripts; repointed `bin.autodev` to `./scripts/cli.ts` |
| `scripts/preinstall-guard.ts` | deleted | Dead lifecycle guard |
| `scripts/postinstall.ts` | deleted | Dead postinstall hook |
| `scripts/cli.ts` | created | New CLI entrypoint |

## Subcommand wiring

| Subcommand | Calls |
|------------|-------|
| `doctor` | `runDoctor` from `../extensions/autodev/installer/doctor.js` |
| `config [sub]` | `runConfig` from `../extensions/autodev/installer/config-module.js` (todo 4) |
| `onboard` | inline print-message handler |
| `status` | `getHeartbeatState` + `loadRegistry` + `getActiveProject` |
| `stop` | `stopHeartbeat` |
| `docs query\|rebuild` | inline print-message handler |
| `debate start\|status` | inline print-message handler |
| `stop-continuation` | `stopAllLoops` from `../extensions/autodev/autonomy/continuation.js` |

`doctor` exits non-zero (`1`) when `result.failed > 0`.

## Acceptance criteria verification

```
=== preinstall count (expect 0) ===
0
=== postinstall count (expect 0) ===
0
=== preinstall-guard.ts exists? (expect no) ===
deleted
=== postinstall.ts exists? (expect no) ===
deleted
=== cli.ts exists? (expect yes) ===
created
=== bin.autodev value ===
    "autodev": "./scripts/cli.ts"
=== registerCommands in cli.ts (expect 0) ===
0
=== require( in cli.ts (expect 0) ===
0
=== JSON parse test ===
JSON valid
exit=0
=== CI doctor run ===
AutoDev was installed as a local dependency.
AutoDev is a machine-level tool, not a project dependency.
Install it globally instead: bun install -g autodev
AutoDev Doctor — Machine Health Check
============================================

Results: 0 passed, 0 failed
exit=0
```

All criteria pass. Typecheck (`tsc --noEmit`) clean.

## Constraints honored

- `bin` field preserved.
- `dependencies`, `devDependencies`, `type`, `packageManager`, `pi` fields unchanged.
- No import of `registerCommands` or private handlers from `orchestrator/cli.ts`.
- Dynamic `import()` used throughout (no `require()`).
- `config` sub-command routing deferred to todo 6 — `cmdConfig` only calls `runConfig` with the subcommand.