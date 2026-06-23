# T7 Registry Centralization — Happy Path Evidence

**Task:** T7 — migrate the project registry from project-local `.autodev/projects.json` to machine-level `~/.AutoDev/projects.json` (resolved via `join(getAgentDir(), "..", "projects.json")`).

**Date:** 2026-06-23

## Changed files

- `extensions/autodev/orchestrator/projects.ts` — removed `projectRoot` param from `registryPath`/`loadRegistry`/`saveRegistry`; imported `getAgentDir` from `@earendil-works/pi-coding-agent`; registry path is now `join(getAgentDir(), "..", "projects.json")`; `saveRegistry` creates the central dir via `mkdir(recursive: true)`. `defaultRegistry` retains `projectRoot` for deriving name/repo from cwd.
- `extensions/autodev/orchestrator/__tests__/orchestrator.test.ts` — registry tests redirect `PI_CODING_AGENT_DIR` to a temp tree (matching the T2/T3/T5 test-isolation pattern); 4 registry tests rewritten for the machine-level path; multi-project test updated to drop the `tmpDir` arg.

## Verification command

```bash
bun test extensions/autodev/orchestrator/__tests__/orchestrator.test.ts
```

## Result

```
bun test v1.3.14 (0d9b296a)

extensions/autodev/orchestrator/__tests__/orchestrator.test.ts:
(pass) loadRegistry returns default when no file exists (machine-level) [663.79ms]
(pass) loadRegistry reads existing machine-level file [2.63ms]
(pass) saveRegistry writes machine-level file and creates missing dir [2.11ms]
(pass) saveRegistry creates the central dir when it does not exist [2.09ms]
(pass) getActiveProject returns active project [1.29ms]
(pass) setActiveProject deactivates others [1.26ms]
(pass) addProject adds new project [1.21ms]
(pass) addProject updates existing project [1.18ms]
(pass) removeProject removes by name [1.89ms]
(pass) parseTriageResult parses valid JSON [5.81ms]
(pass) parseTriageResult returns undefined for invalid JSON [1.59ms]
(pass) parseTriageResult returns undefined for invalid classification [1.09ms]
(pass) parseTriageResult returns undefined for invalid route [1.18ms]
(pass) getHeartbeatState returns initial state [1.47ms]
(pass) startHeartbeat and stopHeartbeat [2514.06ms]
(pass) transitionLabel calls gh issue edit [3.12ms]
(pass) registerCommands registers autodev command [15.93ms]
(pass) orchestrator register() does not throw [2060.45ms]
(pass) work-item file prevents duplicate dispatch [5.31ms]
(pass) multi-project registry with 2 projects [2.00ms]

 20 pass
 0 fail
 47 expect() calls
Ran 20 tests across 1 file. [5.32s]
```

## What was verified (happy path)

- `loadRegistry()` (no args) reads the registry from `join(getAgentDir(), "..", "projects.json")` — the machine-level path (`~/.AutoDev/projects.json` when `PI_CODING_AGENT_DIR` is set).
- Missing registry file → `loadRegistry()` returns `defaultRegistry()` with cwd as the sole active project.
- `saveRegistry(registry)` (no args) writes to the machine-level path.
- `saveRegistry` creates the central dir (`~/.AutoDev/`) when the entire parent chain does not exist (verified with a deeply nested temp `agent` dir path).
- `defaultRegistry` still accepts an optional `projectRoot` for deriving name/repo from cwd — unchanged.
- `addProject`, `removeProject`, `setActiveProject`, `getActiveProject` logic unchanged (3 existing tests pass).
- All non-registry orchestrator tests (dispatch, heartbeat, CLI, index, work-item dedup) pass unchanged — no caller broke.

## Full-suite verification

```bash
$ bun test
 522 pass
 0 fail
 1925 expect() calls
Ran 522 tests across 29 files. [16.23s]
```

## Typecheck

```bash
$ bun run typecheck
$ tsc --noEmit
---EXIT: 0---
```

No production caller required changes: `scripts/cli.ts`, `extensions/autodev/orchestrator/cli.ts`, and `extensions/autodev/orchestrator/heartbeat.ts` already called `loadRegistry()` with no arguments. Only the test file passed `projectRoot` and that has been updated.