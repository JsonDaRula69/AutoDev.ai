# T1 Symlinks Failure Path Evidence

**Task:** project-init-centralization T1 — failure and fallback paths for symlink-based config.

**Date:** 2026-06-23

## Tests

`extensions/autodev/installer/__tests__/config-defaults.test.ts`

### Missing source file

```
(pass) validateAndCreateConfig returns ok=false with 'source file missing' when package lacks settings.json
```

Assertion: `settings.json` result has `ok=false`, `detail` contains `"source file missing"`. Other symlinks still attempt (the missing-source check is per-entry, not all-or-nothing).

### Windows EPERM fallback

```
(pass) validateAndCreateConfig falls back to copy with warning when symlink throws EPERM
```

Injected `symlinkOverride` throws an `EPERM` error. Expected behavior:
- `linkOrCopy` catches `EPERM` (or detects `process.platform === "win32"`).
- Falls back to `fs.cpSync` (recursive for dirs).
- All results still `ok=true` (copy succeeded).
- At least one result `detail` mentions `copied`/`eperm`/`symlink failed` (the `COPY_FALLBACK_WARNING`).
- `~/.AutoDev/agent/settings.json` is a real file (not a symlink) after the copy fallback.

### Env var unset (documented, not asserted in this suite)

When `PI_CODING_AGENT_DIR` is unset, `getAgentDir()` returns the SDK default `~/.pi/agent/`. `validateAndCreateConfig` then symlinks into `~/.pi/` instead of `~/.AutoDev/`. This is the expected fallback behavior — `install.sh` always sets the env var, so this only happens when the user bypasses the installer.

The `getAgentDir returns default ~/.pi/agent when env var unset` test verifies the SDK default is unchanged.

## Command

```
bun test extensions/autodev/installer/__tests__/config-defaults.test.ts
```

## Result

```
6 pass, 0 fail
```

## Conclusion

Failure paths work:
- Missing source files produce `ok=false` with actionable detail.
- EPERM on Windows falls back to copy with a warning explaining how to enable auto-updating symlinks.
- Env var unset falls back to SDK default `~/.pi/agent/` (documented, not blocking).