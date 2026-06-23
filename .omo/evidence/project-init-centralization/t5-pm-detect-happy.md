# T5 Package-Manager Detection — Happy Path Evidence

**Task:** project-init-centralization T5
**Date:** 2026-06-23
**File:** `extensions/autodev/installer/tools.ts`

## What was implemented

- `detectPackageManager(notify?, execOverride?)` — probes `command -v brew/apt-get/winget` in priority order; returns first hit or `{ found: false, name: null }`.
- `installPackageManager(plat, notify?, execOverride?)` — OS-appropriate bootstrap:
  - darwin: prints Homebrew bootstrap URL, runs install script (auto-proceeds in CI / non-TTY / `--yes`).
  - linux: runs `apt-get update && apt-get install` prerequisites (same auto-proceed rules).
  - win32: instructs user to install App Installer via Settings (no script install).
- `installMissingTools` now pre-checks PM before gh/git install; aborts tool installs if bootstrap fails.

## Happy-path verification

### Test: `detectPackageManager returns brew when brew exists`

```
Given: execOverride returns `/opt/homebrew/bin/brew` for `command -v brew`
When:  detectPackageManager() is called
Then:  result is { found: true, name: "brew" }
```

### Test: `installMissingTools proceeds without PM bootstrap when PM found (happy)`

```
Given: execOverride reports brew present, gh/git absent
When:  installMissingTools(notify, "darwin", execOverride)
Then:  pmInstallCalled === false (no bootstrap)
       results includes GitHub CLI install result
```

## Test run

```
$ bun test extensions/autodev/installer/__tests__/tools.test.ts
 10 pass
 0 fail
 25 expect() calls
Ran 10 tests across 1 file. [48.00ms]
```

## Full suite (no regressions)

```
$ bun test
 517 pass
 0 fail
 1909 expect() calls
Ran 517 tests across 29 files. [16.76s]
```

## Typecheck

My changes introduce zero new typecheck errors (verified by diffing `tsc --noEmit` output with and without `tools.ts` changes). Pre-existing `doctor.ts` errors (`reopenTty` / `reopenTtyOverride`) are outside T5 scope and pre-date this task.

## Pure LOC

- `tools.ts`: 199 pure LOC (healthy, < 200)
- `tools.test.ts`: 200 pure LOC (at warning band edge; one cohesive test file for one SUT)

## Files changed

- `extensions/autodev/installer/tools.ts` (added `detectPackageManager`, `installPackageManager`, `PackageManagerDetectionResult`, PM pre-check in `installMissingTools`; refactored `commandExists` to `commandExistsWith` for execOverride threading)
- `extensions/autodev/installer/__tests__/tools.test.ts` (new: 10 tests covering detect happy + install per-platform + PM pre-check)