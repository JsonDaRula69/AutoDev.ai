# T14 — Doctor health checks with central ~/.AutoDev/ paths (happy path)

Date: 2026-06-23

## Task

Verify `doctor.ts` health checks resolve central `~/.AutoDev/` paths correctly
after the T1 `configDir` override (via `PI_CODING_AGENT_DIR`), and update the
all-pass success message to Decision #21 text.

## What changed

- `scripts/cli.ts` `cmdDoctor()`: replaced `"All machine-level checks passed."`
  with `"Installation Successful! Use cd to navigate to your project folder and
  run autodev init to pair a project."`. Added `runDoctorOverride` DI option
  matching the `runInitOverride` / `runOnboardOverride` pattern so the success
  message is unit-testable without `mock.module` poisoning.
- `extensions/autodev/orchestrator/cli.ts` `handleDoctor()`: same message
  replacement (pi-extension command surface).
- `scripts/__tests__/cli.test.ts`: 2 new tests —
  - `cmdDoctor prints the Decision #21 success message when all checks pass`
    (asserts the new message is emitted and the old one is NOT).
  - `cmdDoctor does NOT print the success message when checks fail`
    (asserts exit 1 and no success text on `failed > 0`).
- `test/doctor.test.ts`: 3 new tests —
  - `doctor install-state threshold excludes the 'init' scope (Decision #20)`:
    completes 10 `init`-scope steps but zero `install`/`config` steps; asserts
    the Install state check fails with `0/6` (init steps do not count).
  - `doctor isFirstRun reads .env from the central agent dir (dirname(authPath))`:
    plants `OLLAMA_CLOUD_API_KEY` in `<centralDir>/agent/.env`; asserts
    `isFirstRun` returns `false` and the project dir has no `.env`.
  - `doctor config checks fail when central ~/.AutoDev/ is not populated`:
    passes an empty `packageRoot`; asserts `settings.json` and `agents/*.md`
    checks fail (symlink source missing).

## Verification

```
$ bun test scripts/__tests__/cli.test.ts
8 pass, 0 fail, 23 expect() calls

$ bun test test/doctor.test.ts
15 pass, 0 fail, 40 expect() calls

$ bun run typecheck
tsc --noEmit  (exit 0)

$ bun test
579 pass, 0 fail, 2156 expect() calls across 36 files
```

## Key findings

- `isFirstRun()` already reads `.env` via `dirname(deps.authPath)` — with
  `PI_CODING_AGENT_DIR=~/.AutoDev/agent` and `authPath=~/.AutoDev/agent/auth.json`,
  the env signal resolves to `~/.AutoDev/agent/.env`. No code change needed.
- `validateAndCreateConfig` results reflect symlink creation from the package
  root (T1), not network downloads. When `packageRoot` is empty, the
  `settings.json` / `agents/*.md` / `reference/` / `skills/` / `extensions/autodev`
  / `config/` checks all fail because the symlink source is missing.
- Install-state threshold (`count >= 6` over `install` + `config` scopes)
  does NOT include the `"init"` scope — confirmed by the new test: 10 completed
  `init` steps yield `0/6` and the check fails.