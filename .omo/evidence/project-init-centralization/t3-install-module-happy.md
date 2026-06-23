# T3 Install Module — Happy Path Evidence

**Task:** T3 — update `install-module.ts` so Magic Context pre-check uses `getAgentDir()`, remove Phase 5 (MC doctor), make MC setup non-interactive.

**Date:** 2026-06-23

## Verification Command

```bash
bun test extensions/autodev/installer/__tests__/install-module.test.ts
```

## Result

```
bun test v1.3.14 (0d9b296a)

extensions/autodev/installer/__tests__/install-module.test.ts:
(pass) runInstallFixes returns exactly 3 results and no doctor phase (happy path) [722.40ms]
(pass) MC setup runs pi install with cwd = getAgentDir() (central agent dir), no interactive wizard [21.54ms]
(pass) MC setup reports failure when exec throws on pi install [22.28ms]
(pass) MC setup self-heals: writes magic-context.jsonc if missing before registration [21.90ms]
(pass) getAgentDir fallback: when PI_CODING_AGENT_DIR unset, MC setup uses SDK default ~/.pi/agent [17.45ms]

 5 pass
 0 fail
 24 expect() calls
Ran 5 tests across 1 file. [851.00ms]
```

## What was verified (happy path)

- `runInstallFixes` returns **exactly 3 results** with names `["tools", "config-files", "magic-context-setup"]`.
- No `magic-context-doctor` result exists (Phase 5 removed).
- MC setup invokes `pi install npm:@cortexkit/pi-magic-context` with `cwd: getAgentDir()` (the central agent dir, `~/.AutoDev/agent/` when `PI_CODING_AGENT_DIR` is set) — **not** `projectRoot`.
- No interactive `bunx @cortexkit/magic-context setup` wizard call was made.
- No `magic-context doctor` call was made.
- `magic-context.jsonc` exists in the agent dir after install (written by Phase 2's `validateAndCreateConfig`, verified by Phase 3).
- All 3 phases report `ok: true` on the happy path.

## Self-heal verification

- When `magic-context.jsonc` is deleted between runs, the MC phase re-writes AutoDev defaults (`DEFAULT_MAGIC_CONTEXT_JSONC`) to `join(getAgentDir(), "magic-context.jsonc")` and still reports `ok: true`.

## Typecheck (T3-isolated)

```bash
# Sibling files (doctor.ts, tools.ts from T4) reverted to isolate T3:
$ bun run typecheck
$ tsc --noEmit
---EXIT: 0---
```

T3 changes (`install-module.ts` + `install-module.test.ts`) typecheck clean in isolation. (The branch also carries incomplete T4 `doctor.ts` TTY work that introduces `reopenTty` reference errors — out of T3 scope per MUST NOT: "Do NOT touch files outside install-module.ts, its tests, and evidence.")