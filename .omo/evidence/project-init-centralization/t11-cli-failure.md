# T11 CLI Dispatch — Failure / Edge-Case Evidence

Date: 2026-06-23

## Failure paths covered

### Unknown flag
`autodev init --bad-flag` → `parseInitFlags` returns `unknown: "--bad-flag"`.
`cmdInit` / `handleInit` prints `Unknown flag: --bad-flag` (error level) and
usage text, returns exit code 1. `runInit` is NOT called (verified:
`runInitCalls.length === 0` in the test).

### --help / -h
`autodev init --help` → `parseInitFlags` returns `help: true`. `cmdInit` prints
usage and returns 0. `runInit` is NOT called.

### runInit failure propagation
`cmdInit` counts failed results (`r.ok === false`) across the result array
returned by `runInit`. If any step failed, it returns 1 and prints a warning:
`Init completed with N failed step(s).` If all succeed, it prints
`Init complete (N steps).` and returns 0.

The orchestrator `handleInit` mirrors this: counts failures, warns or confirms.

### runOnboard fallback
`cmdOnboard` / `handleOnboard` returns whatever exit code `runOnboard` returns.
If `runOnboard` returns non-zero (pi SDK unavailable, agent missing), the
orchestrator emits a warning: `Onboarding fell back to manual instructions.`

## What was NOT changed (per MUST NOT)

- `runInit` and `runOnboard` implementations were NOT touched — only dispatch.
- No other command handlers (doctor, config, status, stop, docs, debate,
  stop-continuation) were modified.
- No merge to `main`.

## Test isolation gotcha

Initial approach used `mock.module(resolve(...))` to globally replace
`init-module.js`'s `runInit`. This poisoned `init-module.test.ts` when both
test files ran in the same `bun test` process (13 failures). Switched to
dependency injection (`runInitOverride` parameter) which is scoped per-call
and does not affect other test files. The T14 doctor tests were similarly
converted to use `runDoctorOverride` injection.

## Verification

```
$ bun test scripts/__tests__/cli.test.ts
8 pass, 0 fail (includes T14 doctor tests)

$ bun test extensions/autodev/orchestrator/__tests__/cli.test.ts
5 pass, 0 fail

$ bun test (full suite)
579 pass, 0 fail
```