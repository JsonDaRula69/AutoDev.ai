# T11 CLI Dispatch — Happy Path Evidence

Date: 2026-06-23

## What

Wired `autodev init` and `autodev onboard` into CLI dispatch in both
`scripts/cli.ts` (bin entrypoint) and `extensions/autodev/orchestrator/cli.ts`
(pi extension command surface).

## Changes

### `scripts/cli.ts`
- Exported `cmdInit(parts, opts?)` — parses `--skip-onboard` / `--help` / `--bad-flag`,
  calls `runInit({ projectRoot, notify, skipOnboard })`, prints per-step results.
  Accepts optional `runInitOverride` for test injection (avoids global `mock.module`).
- Exported `cmdOnboard(opts?)` — now accepts optional `runOnboardOverride`.
  Production path: `runOnboard({ projectRoot, notify })`.
- Exported `HELP_SUBCOMMANDS` constant listing all subcommands including `init`.
- Added `case "init": return cmdInit(rest)` to the main switch.
- Guarded the auto-run `main()` with `import.meta.main` so the module is importable
  in tests without `process.exit` firing.
- Updated header comment block and help text strings.

### `extensions/autodev/orchestrator/cli.ts`
- Added `case "init": await handleInit(parts.slice(1), ctx)` to the command switch.
- Rewrote `handleOnboard` to dispatch to `runOnboard` (was a stub).
- Added `handleInit(parts, ctx)` with the same flag parsing as `cmdInit`.
- Updated description + default help text to include `init`.

### Tests
- `scripts/__tests__/cli.test.ts` — 8 tests:
  - cmdInit --skip-onboard → runInit called with skipOnboard=true, returns 0
  - cmdInit no args → runInit called with skipOnboard=false, returns 0
  - cmdInit --bad-flag → usage printed, returns 1, runInit NOT called
  - cmdInit --help → usage printed, returns 0, runInit NOT called
  - help text lists `init` and `onboard`
  - cmdOnboard → runOnboard called with projectRoot, returns 0
  - (T14) cmdDoctor success message when all checks pass
  - (T14) cmdDoctor no success message when checks fail
- `extensions/autodev/orchestrator/__tests__/cli.test.ts` — 5 tests:
  - handleInit --skip-onboard → runInit called with skipOnboard=true
  - handleInit no args → runInit called with skipOnboard=false
  - handleInit --bad-flag → usage printed, runInit NOT called
  - handleOnboard → runOnboard called with ctx.cwd
  - unknown subcommand → help text lists init and onboard

## Verification

```
$ bun test scripts/__tests__/cli.test.ts
8 pass, 0 fail

$ bun test extensions/autodev/orchestrator/__tests__/cli.test.ts
5 pass, 0 fail

$ bun run typecheck
tsc --noEmit — exit 0

$ bun test (full suite)
579 pass, 0 fail
```

## Design notes

- Used **dependency injection** (`runInitOverride`, `runOnboardOverride`,
  `runDoctorOverride`) instead of Bun's global `mock.module` for init/onboard.
  This avoids process-wide module poisoning that broke `init-module.test.ts`
  when both test files ran in the same `bun test` invocation.
- `import.meta.main` guard on `main()` makes `scripts/cli.ts` importable in
  tests without auto-executing the CLI and calling `process.exit`.
- The orchestrator's `handleInit` mirrors `cmdInit` but uses `ctx.ui.notify`
  and `ctx.cwd` instead of the process-level `notify`/`process.cwd()`.