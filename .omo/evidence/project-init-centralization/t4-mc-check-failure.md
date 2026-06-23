# T4 — Magic Context Doctor Health Check: Failure / Retry Path

**Task:** T4 of project-init-centralization — add MC doctor as the 10th standing health check.
**Date:** 2026-06-23
**File changed:** `extensions/autodev/installer/doctor.ts`, `test/doctor.test.ts`

## Failure-mode contract

The `Magic Context` check (10th standing health check) does not surface a first-attempt failure directly. It performs a single retry after writing AutoDev defaults to `magic-context.jsonc` in the central agent dir (`getAgentDir()`). Only if the retry also fails does the check report `ok: false`.

### First attempt fails → defaults written → retry succeeds

```
detail = "healthy (after defaults written)"
ok     = true
```

The check calls `writeMagicContextDefaults(getAgentDir())`, which writes the T1 JSONC block (`DEFAULT_MAGIC_CONTEXT_JSONC`) as a real file at `<agentDir>/magic-context.jsonc`, then re-runs the MC doctor. On retry success, the check passes with the `(after defaults written)` suffix so callers can distinguish "was always healthy" from "self-healed".

### First attempt fails → defaults written → retry also fails

```
detail = "MC doctor failed after retry: <error message from second attempt>"
ok     = false
```

The defaults file is still written (the write itself is reported as `ok: true` via `writeMagicContextDefaults`'s return), but the check surfaces the second failure's error message prefixed with `MC doctor failed after retry:`.

### Defaults write itself fails

If `writeMagicContextDefaults` reports `ok: false`, the retry does NOT run — the check immediately returns:

```
detail = "MC doctor failed; defaults write failed: <write error>; first error: <first MC doctor error>"
ok     = false
```

This path is not exercised by the unit tests (requires simulating a filesystem write failure on `magic-context.jsonc`), but the implementation guards it and the JSDoc on `writeMagicContextDefaults` documents the contract.

## Failure-path verification

```
$ bun test test/doctor.test.ts
(pass) Magic Context check recovers after writing defaults on first failure [24.14ms]
(pass) Magic Context check fails after retry when both attempts fail [24.53ms]
 12 pass
 0 fail
```

The "recovers" test asserts:
- `mcCheck.ok === true`
- `mcCheck.detail === "healthy (after defaults written)"`
- The written file at `<agentDir>/magic-context.jsonc` equals `DEFAULT_MAGIC_CONTEXT_JSONC` byte-for-byte.

The "double fail" test asserts:
- `mcCheck.ok === false`
- `mcCheck.detail` contains `"MC doctor failed after retry"`
- The defaults file exists on disk (the retry still wrote it before the second attempt).

## Test harness

Both retry tests use `makeMcExecStub(["fail", "ok"])` / `makeMcExecStub(["fail", "fail"])` — a stubbed `execSyncOverride` whose MC doctor behavior is controlled by a mutable call counter, so the first and second MC doctor invocations can be made to fail or succeed independently. Non-MC commands (Bun/gh) always succeed in the stub so the rest of the health checks pass.