# T5 Package-Manager Detection — Failure Path Evidence

**Task:** project-init-centralization T5
**Date:** 2026-06-23
**File:** `extensions/autodev/installer/tools.ts`

## Failure scenario

When no supported package manager is detected (`brew`, `apt-get`, `winget` all absent), `installMissingTools` invokes `installPackageManager` to bootstrap one before proceeding with gh/git installs.

## Failure-path verification

### Test: `detectPackageManager returns {found:false, name:null} when none exist`

```
Given: execOverride throws for every `command -v <pm>` probe
When:  detectPackageManager() is called
Then:  result is { found: false, name: null }
       notify emits "No supported package manager detected" warning
```

### Test: `installMissingTools calls installPackageManager when no PM found (non-interactive auto-proceed)`

```
Given: CI=true, execOverride fails all PM checks + gh/git version checks
When:  installMissingTools(notify, "darwin", execOverride)
Then:  pmBootstrapExecuted === true (Homebrew install script ran)
       notify emits a message mentioning "homebrew" or "package manager"
```

### Test: `installPackageManager win32: instructs Settings, no script install`

```
Given: platform is win32
When:  installPackageManager("win32", notify, execOverride)
Then:  scriptRun === false (no shell command executed)
       result.installed === false
       notify emits message mentioning "settings" or "app installer"
```

## Per-platform bootstrap behavior

| Platform | Action | Auto-proceed | Result |
|---|---|---|---|
| darwin | Run Homebrew install script from `raw.githubusercontent.com/Homebrew/install/HEAD/install.sh` | CI=1, non-TTY, or `--yes`/`-y` in argv | `{ installed: true }` on success |
| linux | `apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg` | same | `{ installed: true }` on success |
| win32 | No script; instructs user to install App Installer via Settings | n/a (never scripts) | `{ installed: false }` |

## Non-interactive detection (`isNonInteractive`)

Auto-proceeds when ANY of:
- `process.env.CI === "true" || "1"`
- `process.stdout.isTTY === false`
- `process.argv` contains `--yes` or `-y`

When interactive and no `--yes`: notifies the user of the bootstrap URL and warns to pass `--yes` (the prompt path; actual confirmation prompt is left to the caller/installer flow).

## Test run

```
$ bun test extensions/autodev/installer/__tests__/tools.test.ts
 10 pass
 0 fail
```

## Error handling

`installPackageManager` wraps the bootstrap exec in try/catch. On failure:
- Emits `error`-level notify with the failure message
- Returns `{ tool: "package-manager", installed: false, message: "Failed to install package manager: <err>" }`
- `installMissingTools` aborts remaining tool installs and returns early with the failed PM result