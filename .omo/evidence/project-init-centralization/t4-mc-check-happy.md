# T4 — Magic Context Doctor Health Check: Happy Path

**Task:** T4 of project-init-centralization — add MC doctor as the 10th standing health check.
**Date:** 2026-06-23
**File changed:** `extensions/autodev/installer/doctor.ts`, `test/doctor.test.ts`

## What was implemented

`runHealthChecks` now returns a 14-entry checks array (13 from `validateAndCreateConfig` + the new `Magic Context` check). The 10th standing health check is named `"Magic Context"` and:

1. Shells out to `bunx @cortexkit/magic-context@latest doctor` with `encoding: "utf-8"`, `stdio: "pipe"`, `timeout: 30_000` (same exec pattern as the other checks).
2. On first success → `ok: true, detail: "healthy"`.
3. On first failure → calls `writeMagicContextDefaults(getAgentDir())` (writes the T1 JSONC block), then retries the doctor once.
4. On retry success → `ok: true, detail: "healthy (after defaults written)"`.

`writeMagicContextDefaults(agentDir)` is exported and reuses `DEFAULT_MAGIC_CONTEXT_JSONC` from `magic-context-defaults.ts` (T1) so there is a single source of truth for the default content. It creates the agent dir if missing and writes `magic-context.jsonc` as a real file.

## Happy-path verification

```
$ bun run typecheck
$ tsc --noEmit
(EXIT 0)

$ bun test test/doctor.test.ts
test/doctor.test.ts:
(pass) doctor passes all checks on a fully configured machine [33.52ms]
(pass) Magic Context check passes healthy on first attempt [26.42ms]
(pass) Magic Context check recovers after writing defaults on first failure [24.14ms]
(pass) writeMagicContextDefaults writes the JSONC block to the agent dir [1.42ms]
 12 pass
 0 fail
```

Full suite (521 tests, 29 files) green:

```
$ bun test
 521 pass
 0 fail
 1923 expect() calls
 Ran 521 tests across 29 files. [16.67s]
```

## Behavioral contract (pinned by tests)

- Check name is exactly `"Magic Context"`.
- It is the last entry in the checks array (after `magic-context.jsonc` from `validateAndCreateConfig`).
- Happy path: `ok: true, detail: "healthy"` — no defaults file written by the check itself (though `validateAndCreateConfig` may have written one earlier in the same `runDoctor` call).
- No existing 9 check behaviors changed.
- `execSyncOverride` injection works for the MC check the same way it does for the Bun/gh checks.