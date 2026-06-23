# T7 Registry Centralization — Failure-Path Evidence

**Task:** T7 — migrate the project registry to machine-level `~/.AutoDev/projects.json`.

**Date:** 2026-06-23

## Red-phase evidence (tests written before the implementation change)

Before modifying `projects.ts`, the 4 new/rewritten registry tests were run against the old project-local implementation. Three failed for the right reason — the old code resolved the registry against `process.cwd()` (or a `projectRoot` arg) instead of `getAgentDir()`'s machine-level path.

```
(fail) loadRegistry returns default when no file exists (machine-level)
(fail) loadRegistry reads existing machine-level file
(fail) saveRegistry writes machine-level file and creates missing dir
(fail) saveRegistry creates the central dir when it does not exist
```

Root cause of each failure (confirmed against old `projects.ts`):
- `loadRegistry(tmpDir)` was removed; the new test calls `loadRegistry()` with no arg. Old code fell back to `process.cwd()`, so the test's planted file at `<tmpDir>/projects.json` was never read. The default registry returned had `name` derived from the real cwd, not `test-proj`.
- `saveRegistry(registry, tmpDir)` was removed; old code wrote to `<process.cwd()>/.autodev/projects.json`, not `<tmpDir>/projects.json`. `existsSync(join(centralDir, "projects.json"))` was false.
- Deep-nested central dir test: old code never created `<tmpDir>/nested/central/` because it wrote under `process.cwd()`.

## Failure-path behaviors verified

### 1. Missing registry file → default registry

- `loadRegistry()` catches the `ENOENT` from `readFile` and returns `defaultRegistry()` with `process.cwd()` as the sole active project.
- Test: `loadRegistry returns default when no file exists (machine-level)` — plants no file, asserts `projects.length === 1` and `projects[0].active === true`.

### 2. Unreadable / malformed registry → default registry

- `loadRegistry()` wraps `readFile` + `JSON.parse` in `try/catch`; any error (ENOENT, permission denied, invalid JSON, missing `projects` array) returns `defaultRegistry()`.
- Shape validation: `if (!Array.isArray(parsed.projects)) return defaultRegistry()` catches a valid-JSON-but-wrong-shape file (e.g. `{}`).

### 3. Missing central dir → `saveRegistry` creates it

- `saveRegistry` calls `mkdir(join(path, ".."), { recursive: true })` before writing.
- Test: `saveRegistry creates the central dir when it does not exist` — sets `PI_CODING_AGENT_DIR` to a deeply nested path (`<tmpDir>/nested/central/agent`) where neither `central/` nor `nested/` exist; `saveRegistry` creates the full chain and writes the file. Verified via `existsSync(join(deepCentral, "projects.json"))`.

## Non-regression evidence

- The 6 existing registry-helpers tests (`getActiveProject`, `setActiveProject`, `addProject` x2, `removeProject`, multi-project) pass unchanged — the pure-function helpers were not touched.
- Full suite: 522 pass, 0 fail.
- `tsc --noEmit` exit 0.

## What was NOT changed (per MUST NOT)

- `Project`/`ProjectEntry`/`ProjectRegistry` type shapes — unchanged.
- `addProject`, `removeProject`, `setActiveProject`, `getActiveProject` logic — unchanged.
- No files outside `projects.ts`, its tests, and evidence were modified.