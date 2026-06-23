# Task 3 — install-module.ts + config-defaults fetchOverride + state "config" scope

**Date:** 2026-06-23
**Plan:** `.omo/plans/installer-refactor.md` (Wave 2, todo 3)
**Branch:** main (uncommitted, per two-repo workflow — AutoDev infra commits directly to `origin`)

## Summary

Created `extensions/autodev/installer/install-module.ts` exporting `runInstallFixes(deps: InstallModuleDeps): Promise<InstallFixResult[]>`. Modified `config-defaults.ts` to accept an optional `fetchOverride?: typeof fetch` and wire it through `downloadFile`. Modified `state.ts` to add `"config"` to the `StateScope` union.

## Files changed

- **Created:** `extensions/autodev/installer/install-module.ts`
- **Modified:** `extensions/autodev/installer/config-defaults.ts`
- **Modified:** `extensions/autodev/installer/state.ts`
- **NOT deleted:** `extensions/autodev/installer/steps.ts` (per MUST NOT)

## Verification

### File existence

```
$ test -f extensions/autodev/installer/install-module.ts && echo FILE_EXISTS_OK
FILE_EXISTS_OK
```

### Typecheck

```
$ bun run typecheck
$ tsc --noEmit
(exit 0, no output)
```

### Acceptance grep counts (install-module.ts)

| Pattern | Expected | Actual |
|---|---|---|
| `export async function runInstallFixes` | 1 | 1 |
| `export interface InstallModuleDeps` | 1 | 1 |
| `export interface InstallFixResult` | 1 | 1 |
| `validateAndCreateConfig(projectRoot` | 1 | 1 |
| `fetchOverride` | ≥1 | 3 |
| `markStepCompleted(projectRoot, STEP_.*"install"` | ≥1 | 2 |
| `harness === "pi"` | 1 | 1 |
| `MC_SETUP_CMD` | ≥1 | 2 |
| `MC_DOCTOR_CMD` | ≥1 | 2 |
| `prompts` (forbidden) | 0 | 0 |
| `auth.json` (forbidden) | 0 | 0 |
| `gh auth login` (forbidden) | 0 | 0 |

### Acceptance grep counts (config-defaults.ts)

| Pattern | Expected | Actual |
|---|---|---|
| `fetchOverride` | ≥1 | 6 |

### Acceptance grep counts (state.ts)

| Pattern | Expected | Actual |
|---|---|---|
| `"config"` (in StateScope) | 1 | 1 |

### steps.ts preserved

```
$ test -f extensions/autodev/installer/steps.ts && echo STEPS_EXISTS_OK
STEPS_EXISTS_OK
```

### Tests

```
$ bun test extensions/autodev/installer
 33 pass
 0 fail
 93 expect() calls
Ran 33 tests across 1 file. [1292.00ms]
```

Full suite: 487 pass, 1 fail. The single failure (`test/doctor.test.ts` "doctor detects missing agent files") is **pre-existing on clean `main`** — verified by `git stash` + isolated `bun test test/doctor.test.ts` on the unmodified tree, which reproduces the same failure. It is a doctor-logic bug unrelated to this todo.

## Behavior

`runInstallFixes` runs five phases sequentially:

1. **Tools** — `installMissingTools(notify, platform?, execOverride?)` installs gh/git if missing (bun check is harmless and included). Marks step 0 in `"install"` scope.
2. **Config files** — `validateAndCreateConfig(projectRoot, fetchOverride)` downloads `.pi/settings.json`, `.pi/magic-context.jsonc`, and missing `.pi/agents/*.md` from the AutoDev repo.
3. **MC setup (conditional)** — Only runs `bunx @cortexkit/magic-context@latest setup --harness pi` (120s timeout) if `.pi/magic-context.jsonc` does NOT already declare `harness: "pi"`. Skips with `ok:true` if already configured.
4. **State mark** — Step 3 (`STEP_CONFIG_AND_MC`) marked complete in `"install"` scope ONLY when both config files AND MC setup succeed.
5. **MC doctor (warning)** — `bunx @cortexkit/magic-context@latest doctor` (30s timeout). On failure, notifies at warning level and returns `ok:true` with a warning detail (non-fatal).

No prompts, no auth.json writes, no credential values to `.env`, no `gh auth login`.

## Dependencies for downstream todos

- Todo 4 (config-module) will use the new `"config"` StateScope and the `fetchOverride`-enabled `validateAndCreateConfig`.
- Todo 8 will delete `step0ExternalTools`/`step3MagicContext` from `steps.ts` once `runInstallFixes` is wired into the CLI.