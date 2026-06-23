# T15 — /dev/tty reopen: happy path evidence

Date: 2026-06-23

## Scenario

`process.stdin` is not a TTY (piped stdin, CI shell) but an interactive user
is sitting in front of a controlling terminal. Doctor orchestrator mode
detects failures and should reopen `/dev/tty` to run interactive config
prompts instead of skipping them.

## What was implemented

- `extensions/autodev/installer/tty.ts`: `reopenTty(deps)` helper.
  - Opens `TTY_DEVICE` (`/dev/tty` on Unix, `\\.\CONIN$` on Windows) via
    `openSync(..., "r+")`.
  - On success, creates read/write streams from the fd and a readline
    interface, returns a `Prompter` via `createPrompterFromRl`.
  - On failure (ENOENT, no controlling terminal, CI), returns `null`.
  - `ReopenTtyDeps` supports `openSyncOverride`, stream overrides, and
    `prompterOverride` (tests inject a `MockPrompter` directly).
- `extensions/autodev/installer/doctor.ts`: orchestrator-mode non-interactive
  branch now calls `reopenTty(deps.reopenTtyOverride)`. On success it logs
  `"stdin is non-interactive; opened /dev/tty for prompts."` and runs
  `runConfig` with the reopened prompter. On `null` it falls back to the
  existing warning.
- `DoctorDeps.reopenTtyOverride?: ReopenTtyDeps` added for test injection.

## Test

`extensions/autodev/installer/__tests__/doctor-orchestrator.test.ts`:
"doctor orchestrator opens /dev/tty and runs config when stdin is non-interactive"

- Sets `launchConfigFlow: true` with a failing health check so the orchestrator
  branch executes.
- Injects `reopenTtyOverride` with `openSyncOverride: () => 42` and
  `prompterOverride: mockPrompter` (MockPrompter with canned answers).
- Asserts `configFlowLaunched === true`.
- Asserts the `"/dev/tty"` info notice fired in the notify log.

## Verification

```
bun test extensions/autodev/installer/__tests__/doctor-orchestrator.test.ts
  (pass) doctor orchestrator opens /dev/tty and runs config when stdin is non-interactive [33.60ms]
  (pass) doctor orchestrator warns and skips config when /dev/tty reopen fails [22.18ms]
  2 pass, 0 fail

bun test extensions/autodev/installer/__tests__/tty.test.ts
  5 pass, 0 fail

bun run typecheck
  tsc --noEmit → exit 0
```

## Pre-existing failure (NOT T15 scope)

`test/doctor.test.ts` "doctor passes all checks on a fully configured machine"
fails because T4 (parallel task) added a 10th health check (`runMagicContextCheck`)
that shells out to `bunx @cortexkit/magic-context@latest doctor`, but the test's
`STUB_EXEC` doesn't handle that command. This is T4's test debt — T4 must
update `STUB_EXEC` to return success for the MC doctor command. T15 does not
touch health-check code per the task constraints.