# T14 — Doctor health checks with central ~/.AutoDev/ paths (failure path)

Date: 2026-06-23

## Failure scenarios verified

### 1. `~/.AutoDev/` not populated → config checks fail

**Given:** `PI_CODING_AGENT_DIR` set to an empty central dir; `packageRoot`
points to an empty temp dir (no `.pi/` or `.autodev/` structure).

**When:** `runDoctor` runs the `validateAndCreateConfig` checks.

**Then:** `settings.json` check is `ok: false`; `agents/*.md` check is
`ok: false`. The symlink source files do not exist, so `linkOrCopy` cannot
create the central symlinks.

Test: `doctor config checks fail when central ~/.AutoDev/ is not populated`
(test/doctor.test.ts).

### 2. Install-state threshold excludes `init` scope (Decision #20)

**Given:** 10 steps completed in the `"init"` scope; zero steps in
`"install"` or `"config"` scopes.

**When:** `runDoctor` runs the Install state check.

**Then:** `ok: false`, `detail` contains `0/6`. The `"init"` scope is NOT
aggregated into the threshold — only `"install"` + `"config"` count.

Test: `doctor install-state threshold excludes the 'init' scope (Decision #20)`
(test/doctor.test.ts).

### 3. cmdDoctor does not print success message on failure

**Given:** `runDoctor` returns `failed: 1, configFlowLaunched: false`.

**When:** `cmdDoctor` formats the output.

**Then:** exit code is `1`; the Decision #21 success message is NOT printed;
the "Some checks failed" warning IS printed.

Test: `cmdDoctor does NOT print the success message when checks fail`
(scripts/__tests__/cli.test.ts).

## Edge case: isFirstRun central .env resolution

**Given:** `authPath = <centralDir>/agent/auth.json` (so `dirname(authPath)` is
`<centralDir>/agent`); `OLLAMA_CLOUD_API_KEY` planted in
`<centralDir>/agent/.env`; no `.env` in the project dir.

**When:** `isFirstRun` runs.

**Then:** returns `false` (signal 3 satisfied from the central `.env`). The
project dir never gets a `.env` — the env signal reads exclusively from the
central agent dir.

Test: `doctor isFirstRun reads .env from the central agent dir (dirname(authPath))`
(test/doctor.test.ts).