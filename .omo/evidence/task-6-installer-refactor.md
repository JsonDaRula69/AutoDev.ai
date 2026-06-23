# Task 6 — installer-refactor: Full sub-command routing in cli.ts, remove install/init from dispatcher

**Date:** 2026-06-23
**Plan:** `.omo/plans/installer-refactor.md` todo 6
**Status:** ✅ COMPLETE

## Changes

### `scripts/cli.ts`
- Rewrote `cmdConfig(parts)` to:
  - Print usage listing `llm`, `voyage`, `discord`, `github` when no sub-subcommand (exit 0).
  - Construct `ConfigModuleDeps` with `prompter = createPrompter()` from `prompts.js`.
  - Call `runConfig(deps, subSubcommand)` passing the sub-subcommand as the second arg.
  - Call `prompter.close()` in a `finally` block.
  - Removed the old `subcommand`/`args` fields from the deps object (those were never part of `ConfigModuleDeps` — `runConfig` takes `subcommand` as a separate param).

### `extensions/autodev/index.ts`
- Added `loadAgentEnv()` async helper:
  - Resolves agent dir via `await import("@earendil-works/pi-coding-agent")` → `getAgentDir()`, falling back to `~/.pi/agent`.
  - Reads `~/.pi/agent/.env` via `readFileSync`, parses KEY=VALUE lines (skipping comments/blank), strips surrounding quotes, does NOT override existing env vars.
- Changed `autodevExtension` from sync `function` → `async function` returning `Promise<void>`.
- Calls `await loadAgentEnv()` as the FIRST statement, before `pi.on("before_agent_start", ...)` and before the module registration loop.
- This is the ONLY change to the extension entry point (per MUST NOT: no other module registration changes).

### `extensions/autodev/orchestrator/cli.ts`
- Removed `import { handleInstall, handleInit } from "../installer/index.js"` (line 23).
- Removed `case "install"` and `case "init"` branches from the dispatcher switch.
- Added `case "config"` → `handleConfig(parts.slice(1), ctx)`.
- Added `handleConfig(parts, ctx)` function:
  - No sub-subcommand → prints usage `llm, voyage, discord, github` via `ctx.ui.notify`.
  - Resolves `projectRoot = ctx.cwd ?? process.cwd()`, `authPath` via dynamic `getAgentDir()` import with `~/.pi/agent/auth.json` fallback.
  - Constructs `ConfigModuleDeps` with `prompter = createPrompter()`, `notify = (msg, level) => ctx.ui.notify(msg, level)`.
  - Calls `runConfig(deps, subSubcommand)`, closes prompter in `finally`.
- Updated failure message at line 109 (handleDoctor): `"Some checks failed. Run \`autodev config\` in an interactive terminal, or re-run \`autodev doctor\`."` (was `"Run \`autodev install\` to fix."`).
- Updated command description string and default-help string to drop `install`/`init`, add `config`.
- Updated file-top doc comment to drop install/init lines, add config line.
- `handleDebugFlag` export preserved (untouched).

## Verification

### `bun run typecheck`
```
$ tsc --noEmit
(exit 0, clean)
```

### Acceptance grep criteria
| Criterion | Expected | Actual |
|-----------|----------|--------|
| `grep -c 'handleInstall\|handleInit\|case "install"\|case "init"' extensions/autodev/orchestrator/cli.ts` | 0 | **0** ✅ |
| `grep -c 'case "config"' extensions/autodev/orchestrator/cli.ts` | 1 | **1** ✅ |
| `grep -c 'runConfig' extensions/autodev/orchestrator/cli.ts` | ≥1 | **2** ✅ |
| `grep -c 'registerCommands' scripts/cli.ts` | 0 | **0** ✅ |
| `grep -c 'autodev install' extensions/autodev/orchestrator/cli.ts` | 0 | **0** ✅ |
| `grep -c 'handleDebugFlag' extensions/autodev/orchestrator/cli.ts` | ≥1 | **1** ✅ |

### `CI=1 bun run scripts/cli.ts doctor`
```
AutoDev was installed as a local dependency.
AutoDev is a machine-level tool, not a project dependency.
Install it globally instead: bun install -g autodev
AutoDev Doctor — Machine Health Check
============================================

Results: 0 passed, 0 failed
EXIT: 0
```
Does not hang. Prints a report. ✅

### `bun run scripts/cli.ts config` (no sub-subcommand)
```
Usage: autodev config <sub-command>

Sub-commands:
  llm      — configure LLM provider credentials
  voyage   — configure VoyageAI embeddings API key
  discord  — configure Discord bot token + channel ID
  github   — configure GitHub auth (PAT or gh auth login)

Run `autodev config` with no sub-command to configure all in sequence.
EXIT: 0
```
Lists `llm`, `voyage`, `discord`, `github`. Exits 0. ✅

### `bun run scripts/cli.ts badcommand` (failure path)
```
Unknown subcommand: badcommand
Subcommands: doctor, config, onboard, status, stop, docs, debate, stop-continuation
EXIT: 1
```
Prints help with new command list, exits non-zero. ✅

### `bun run scripts/cli.ts config llm` with MockPrompter (test script)
Test script at `/var/folders/.../test-config-llm.ts` injected `MockPrompter` with answers `["ollama-cloud", "n", "sk-test-key-123"]` into `runConfig(deps, "llm")`:
```
Results: [
  {
    "subcommand": "llm",
    "step": 2,
    "status": "ok",
    "message": "ollama-cloud credentials configured."
  }
]
EXIT: 0
```
`config llm` handler runs and returns `ok`. ✅

## MUST NOT checks
- ✅ Did not remove `doctor`, `onboard`, `status`, `stop`, `docs`, `debate`, `stop-continuation` from dispatcher.
- ✅ Did not add `install` or `init` back.
- ✅ No secret-handling logic in `cli.ts` — delegates to `config-module.ts`.
- ✅ Did not call `registerCommands` from `scripts/cli.ts` (grep=0).
- ✅ Did not change module registrations in `index.ts` beyond adding `.env` loading.
- ✅ Did not remove `handleDebugFlag` export (grep=1).