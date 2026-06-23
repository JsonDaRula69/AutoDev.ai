# T15 — /dev/tty reopen: failure path evidence

Date: 2026-06-23

## Scenario

`process.stdin` is not a TTY AND there is no controlling terminal available
(true CI, daemonized process, container without `/dev/tty`). Doctor
orchestrator mode should warn the user and skip config (existing behavior),
not crash or hang.

## What was implemented

- `reopenTty()` returns `null` when `openSync(TTY_DEVICE, "r+")` throws
  (ENOENT, EPERM, or any other error).
- `reopenTty()` also returns `null` if `openSync` succeeds but stream
  creation throws (partial-state guard — no fd leaked to callers).
- `doctor.ts` orchestrator-mode non-interactive branch: when `reopenTty`
  returns `null`, it logs the warning:
  `"Non-interactive environment detected and no controlling terminal available. Run 'autodev config' in an interactive terminal to set up credentials."`
  and skips the config flow (does not call `runConfig`).

## Tests

### Unit (`tty.test.ts`)

- "reopenTty returns null when openSync throws ENOENT (no controlling terminal)":
  `openSyncOverride` throws an ENOENT error → `reopenTty` returns `null`,
  stream factories never called.
- "reopenTty returns null when createReadStream throws after open":
  `openSyncOverride` returns fd 7, `createReadStreamOverride` throws →
  `reopenTty` returns `null`, `createWriteStreamOverride` never called.

### Integration (`doctor-orchestrator.test.ts`)

"doctor orchestrator warns and skips config when /dev/tty reopen fails":
- `reopenTtyOverride` with `openSyncOverride` that throws ENOENT.
- Asserts `configFlowLaunched === true` (install ran, just not config).
- Asserts the warning message contains both "Non-interactive environment"
  and "no controlling terminal".
- Asserts the warning level is `"warning"`.

## Verification

```
bun test extensions/autodev/installer/__tests__/tty.test.ts
  (pass) reopenTty returns null when openSync throws ENOENT [0.19ms]
  (pass) reopenTty returns null when createReadStream throws after open [0.15ms]

bun test extensions/autodev/installer/__tests__/doctor-orchestrator.test.ts
  (pass) doctor orchestrator warns and skips config when /dev/tty reopen fails [22.18ms]

bun run typecheck → exit 0
```

## Windows note

On Windows, `TTY_DEVICE` is `\\.\CONIN$`. Line-mode prompts work through it.
Raw-mode (keypress-level) reads may throw EPERM — acceptable because the
config flow only uses `rl.question()` (line mode), not raw keypress capture.