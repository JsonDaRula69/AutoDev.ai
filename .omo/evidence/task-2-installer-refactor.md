# Task 2 — Installer Refactor: Dead lifecycle hooks removed, bin repointed

## Changes

| File | Action |
|------|--------|
| `package.json` | Removed `preinstall`/`postinstall` scripts entirely (not empty strings), repointed `bin.autodev` → `./scripts/cli.ts` |
| `scripts/preinstall-guard.ts` | Deleted |
| `scripts/postinstall.ts` | Deleted |
| `scripts/cli.ts` | Created — standalone CLI entrypoint |

## Fixes applied (2026-06-23)

The first pass left two defects:
1. `package.json` had `"preinstall": ""` and `"postinstall": ""` instead of removing the keys entirely.
2. `scripts/cli.ts` referenced `autodev install`/`autodev init` in `handleConfig` usage and in the doctor failure message.
3. `handleDoctor` printed the header AFTER calling `runDoctor` instead of before.

All three fixed in the amended commit.

## Verification

### `grep -c "preinstall\|postinstall" package.json` — PASS (returns 0)
```
0
```

### `bun run typecheck` — PASS
```
$ tsc --noEmit
(no output — clean)
```

### `CI=1 bun run scripts/cli.ts doctor` — PASS (no crash/hang, header before output)
```
AutoDev Doctor — Machine Health Check
============================================
AutoDev was installed as a local dependency.
AutoDev is a machine-level tool, not a project dependency.
Install it globally instead: bun install -g autodev

Results: 0 passed, 0 failed
```

### `bun run scripts/cli.ts config` — PASS (correct usage, exits 1)
```
AutoDev Configuration
Usage: autodev config <subcommand>

Subcommands:
  llm     — configure LLM provider and API key
  voyage  — configure VoyageAI API key (Enter for ONNX fallback)
  discord — configure Discord bot token and channel
  github  — authenticate GitHub CLI
EXIT CODE: 1
```

### `bun run scripts/cli.ts badcommand` — PASS (exits 1 with usage)
```
Unknown subcommand: "badcommand"
AutoDev subcommands: doctor, config, onboard, status, stop, docs, debate, stop-continuation
EXIT CODE: 1
```

## Key design decisions

1. **No pi dependency** — `scripts/cli.ts` constructs a minimal `{ cwd, ui }` context instead of requiring a pi `ExtensionCommandContext`. This is required because the `autodev` binary must work standalone after `bun install -g`.
2. **`resolveAuthPath` and `autoNonInteractive` duplicated** — copied from `installer/index.ts:138-154` to avoid importing pi-dependent modules. These are small, stable functions.
3. **`handleDoctor` uses `execSyncOverride`** — replicates the pattern from `scripts/postinstall.ts:33-44` rather than importing from `orchestrator/cli.ts` (which depends on pi).
4. **`handleConfig` is a stub** — prints usage listing `llm`, `voyage`, `discord`, `github` and exits non-zero. Full routing deferred to todo 6.
5. **Doctor header printed before `runDoctor` call** — so the user sees the header immediately, not after the doctor completes.
