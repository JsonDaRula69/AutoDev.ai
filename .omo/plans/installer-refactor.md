# installer-refactor - Work Plan

## TL;DR (For humans)
**What you'll get:** A working install flow for AutoDev. Users download and run a single shell script (`install.sh`) that installs the package and hands off to the built-in doctor, which then sets up the remaining machine pieces (tools, config files, Magic Context) and prompts for secrets (API keys, Discord, GitHub auth) in one guided pass. The old broken auto-trigger (postinstall on a package Bun never executes for named installs) is gone. `autodev init` is gone. Secrets entry and machine setup are now cleanly separated into two internal modules the doctor orchestrates.

**Why this approach:** Bun's security model (verified against first-party source) never runs lifecycle scripts of a named package installed via `bun install -g <pkg>` — the package is a dependency gated behind `trustedDependencies`, so its `postinstall` never fires. The old architecture was dead code. The new architecture moves the trigger out of the package lifecycle and into the `autodev` binary itself (doctor runs on first invocation), with a thin shell script as the documented entry point and doctor as the single orchestrator of everything that can happen after the binary is on PATH.

**Key design decisions from review:**
- **install.sh uses `#!/usr/bin/env bash`** (not POSIX sh) because `set -o pipefail` is a bashism. The script is bash-compatible, not POSIX-compatible.
- **`.env` lives at `~/.pi/agent/.env`** (same directory as `auth.json`), not in the project cwd. The `autodev` binary explicitly loads it at startup via `process.loadEnvFile()` or manual parsing, since Bun only auto-loads `.env` from cwd.
- **Doctor re-runs health checks after triggering modules.** After `runInstallFixes` + `runConfig` complete, doctor loops back and re-runs all health checks to verify everything is now green. If still failing, reports what's broken. One command does everything.
- **Magic Context setup has a pre-check.** Before running `bunx @cortexkit/magic-context setup`, check if `.pi/magic-context.jsonc` exists with `harness: "pi"`. Only run setup if not already configured.
- **Config is interactive-only with no env-var fallback.** CI/headless users must manually create `~/.pi/agent/.env` and `~/.pi/agent/auth.json`. This is a deliberate design decision — doctor reports missing config and exits in non-TTY.
- **`scripts/cli.ts` uses dynamic `import()`** (not `require()`) for ESM compatibility, since `package.json` has `"type": "module"`.
- **`scripts/cli.ts` reimplements handlers** by calling underlying exported functions directly (`runDoctor`, `runConfig`, `getHeartbeatState`, `stopHeartbeat`, `stopAllLoops`, etc.), NOT by importing private handlers from `orchestrator/cli.ts`.
- **Doctor's LLM health check resolves `$VAR` references** against `process.env` — if `auth.json` has `"$OLLAMA_CLOUD_API_KEY"`, the check verifies `process.env.OLLAMA_CLOUD_API_KEY` is set and non-empty, not just that the key field is non-empty.
- **`DoctorDeps` extended** with `prompter?` (for `runConfig`) and `fetchOverride?` (for `runInstallFixes`). Doctor constructs a real `Prompter` via `createPrompter()` when `prompter` is not injected.
- **`validateAndCreateConfig` modified** to accept an optional `fetchOverride?: typeof fetch` parameter, wiring `fetchOverride` from `InstallModuleDeps` through to the download logic.
- **`tryImportAuth` transforms imported keys** to `$VAR` references: writes the actual key to `.env`, writes `$VAR` to `auth.json`. Does NOT copy literal key values into `auth.json`.
- **`scripts/cli.ts doctor` exits non-zero** when `result.failed > 0`, so `install.sh` can detect doctor failure.
- **JSDoc/comments updated** in `state.ts`, `doctor.ts`, `orchestrator/cli.ts` to remove references to deleted commands (`autodev install`, `autodev init`).
- **GH_TOKEN research-confirmed behaviors** (verified against GitHub CLI source code and docs): (1) `GH_TOKEN` is officially documented at `cli.github.com/manual/gh_help_environment` with highest precedence (`GH_TOKEN` > `GITHUB_TOKEN` > stored credentials). (2) `gh auth status` validates `GH_TOKEN` by making an API call — reports `(GH_TOKEN)` source and fetches username live; shows clear error if token is invalid. (3) `gh auth login` is BLOCKED when `GH_TOKEN` is set in `process.env` — config module must `delete process.env.GH_TOKEN` before calling `gh auth login --web` fallback. (4) All `gh` commands respect `GH_TOKEN` (issues, PRs, labels, CI, merge). (5) Fine-grained PATs (`github_pat_`) are explicitly recommended via `GH_TOKEN` by GitHub docs. (6) Config prompt includes step-by-step instructions for generating a fine-grained PAT at `https://github.com/settings/personal-access-tokens/new` with required permissions (issues, PRs, contents:read, metadata:read, labels).

**What it will NOT do:**
- No project-level setup (GitHub labels, knowledge base check, docs rebuild) — deferred to project-level onboarding.
- No `autodev install` CLI command — the install module is internal, called by doctor.
- No `autodev init` CLI command — removed entirely.
- No postinstall auto-trigger — removed.
- No preinstall guard — removed (it only fired in the dev-setup case, and the problem it solved is now moot).
- No secrets handled by the install module.
- No non-interactive path for `autodev config` — config is interactive-only. In non-TTY/CI contexts, doctor reports missing config and exits; it does not attempt to prompt.
- No Infisical or external secrets manager — investigated and rejected. Self-hosted Infisical requires 4GB RAM + 3 Docker containers (PostgreSQL, Redis, Node.js app) + weekly maintenance updates for ~6 secrets — disproportionate overhead. Cloud free tier fits but adds a network dependency for first-run secret fetch. The current `.env` + `auth.json` with `$VAR` references is zero-dependency, fully offline, and already satisfies the "no secrets in code" guardrail requirement. Decision documented for future reference: if AutoDev evolves to a distributed multi-machine architecture, reconsider Infisical Cloud free tier at that time.

**Effort:** Medium
**Risk:** Medium — removes dead code that other code/tests reference; must replace the old 9-step install-state contract with a new step-number mapping.
**Decisions to sanity-check:** (1) install.sh is a bash script (not POSIX sh, not TS), because it runs before autodev is on PATH and uses `set -o pipefail` (bashism). (2) Config is interactive-only with sub-commands per secret (`autodev config llm`, `autodev config discord`, etc.) — no env-var fallback for CI/headless. (3) `autodev install` and `autodev init` are removed as CLI commands; their step logic is ported to the new modules, then `steps.ts` and `index.ts` are deleted (steps.ts in todo 8, index.ts in todo 8). (4) install.sh auto-installs Bun via curl if missing, then `export PATH="$HOME/.bun/bin:$PATH"` before continuing. (5) Secret storage: `.env` lives at `~/.pi/agent/.env` (same directory as `auth.json`), explicitly loaded by autodev at startup. `auth.json` becomes a thin pointer file using `$VAR` env-var interpolation (e.g., `"$OLLAMA_CLOUD_API_KEY"`) — pi's SDK resolves these at runtime from `process.env` (documented in `.pi/auth.json` template comments). No actual secret values are written to `auth.json` — only env-var references. Imported keys from existing auth files are transformed to `$VAR` references (actual key → `.env`, `$VAR` → `auth.json`). (6) Doctor re-runs health checks after triggering install+config modules to verify all-green. (7) Magic Context setup has a pre-check: skip if `.pi/magic-context.jsonc` has `harness: "pi"`. (8) `scripts/cli.ts` uses dynamic `import()` (not `require()`) and calls exported functions directly (not private handlers from `orchestrator/cli.ts`). (9) `DoctorDeps` extended with `prompter?` and `fetchOverride?`. (10) `validateAndCreateConfig` modified to accept optional `fetchOverride` param. (11) Doctor's LLM health check resolves `$VAR` references against `process.env`. (12) `scripts/cli.ts doctor` exits non-zero on failures so install.sh can detect them.

Your next move: approve the plan, or run a high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, medium risk. Replaces dead postinstall auto-trigger with install.sh (bash script, auto-installs Bun with PATH export) + doctor-orchestrated install/config modules (config is interactive-only with sub-commands, no env-var fallback). Secrets at `~/.pi/agent/.env` (same dir as auth.json), loaded explicitly at startup. Doctor re-runs health checks after triggering modules, uses isFirstRun() (3-signal check: auth.json + install-state + .env) for messaging, triggers targeted config sub-commands based on which checks fail. GitHub auth supports both GH_TOKEN (preferred, isolated from user's personal gh) and gh auth login --web (fallback). MC setup has pre-check. `steps.ts` deletion moved to todo 8 (after test rewrite). `scripts/cli.ts` uses dynamic `import()`, calls exported functions directly. `DoctorDeps` extended with `prompter?` and `fetchOverride?`. `validateAndCreateConfig` accepts optional `fetchOverride`. LLM health check resolves `$VAR` against `process.env`. Removes `autodev install`/`autodev init` CLI commands, preinstall guard, postinstall script, steps.ts, and installer/index.ts. Defers project-level steps. 8 todos across 4 waves.

## Scope
### Must have
- `install.sh` standalone shell script at repo root: runs `bun install -g autodev`, then invokes `autodev doctor`. That is its entire job.
- Internal **install module** (no CLI command): installs `gh`/`git` (platform-aware), downloads `.pi/settings.json`, `.pi/magic-context.jsonc`, and missing `.pi/agents/*.md` from repo raw URLs, runs Magic Context setup + doctor. Called by doctor, never by the user.
- New `autodev config` CLI command: interactive secret entry for LLM provider+key (with import-from-existing logic), VoyageAI key (Enter→ONNX fallback), Discord (optional), `gh auth login --web`, and `ensureGitignore`. Callable standalone and triggered by doctor.
- Refactored `doctor`: health checks remain, but on failure it triggers the internal install module (for missing tools/config files/Magic Context) and the config module (for missing secrets, interactively). Non-interactive-safe: in non-TTY/CI, doctor reports missing config and exits instead of launching interactive prompts.
- Remove `autodev install` and `autodev init` from the CLI command dispatcher in `orchestrator/cli.ts`. Remove the `handleInstall`/`handleInit` handlers. Remove `preinstall` and `postinstall` from `package.json` scripts. Remove `scripts/preinstall-guard.ts` and `scripts/postinstall.ts`.
- All existing tests that reference removed steps/handlers are updated or removed. No dead code left behind.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No project-level steps (GitHub labels, knowledge base, docs rebuild) anywhere in this refactor. The `step6`/`step7`/`step8` functions and `INIT_STEPS`/`runInitSteps` are deleted from `steps.ts` when `steps.ts` is deleted in todo 8 — not relocated.
- No secrets (API keys, tokens, `.env` credential writes) in the install module.
- No `trustedDependencies` workaround. We do not try to make postinstall fire under Bun's security model.
- No changes to the extension entry point (`extensions/autodev/index.ts`) **except adding `.env` loading at the top of the `register()` function** — load `~/.pi/agent/.env` into `process.env` before any module registration, so Discord, docs, heartbeat, and background modules see secrets. This is the only allowed change to the extension entry point. All other module registrations remain untouched.
- No changes to agent definitions, guardrails, background, delegation, loreguard, docs, tools, team-mode, or any other module outside `installer/` and `orchestrator/cli.ts`.
- No new dependencies added to `package.json`.
- No non-interactive path in the config module. Config is interactive-only. Doctor must check `process.stdin.isTTY === true` before triggering config; otherwise it reports and exits.
- No `@ts-nocheck` or `as any` in rewritten tests — use `as unknown as <Type>` or real mock objects.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after (refactor of existing tested code; tests rewritten alongside). Framework: `bun:test`.
- Evidence: `.omo/evidence/task-<N>-installer-refactor.md`
- Every removed function/handler must have a grep-confirmation that zero references remain.
- `bun test` must pass with zero failures after each todo.
- `bun run typecheck` must pass (tsc --noEmit) after each todo that touches TS files.
- `install.sh` must be executable (`chmod +x`) and pass `shellcheck` (if available) or `bash -n` syntax check.

## Execution strategy
### Parallel execution waves

**Wave 1 — Shell bootstrap + remove dead lifecycle hooks** (2 todos, can parallelize):
Creates `install.sh` and removes the broken `preinstall`/`postinstall` from `package.json` plus the guard/postinstall scripts. This is foundational: everything downstream assumes the binary is the trigger, not the package lifecycle.

**Wave 2 — Internal install module + config module** (2 todos, can parallelize):
Splits the current `steps.ts` into two new modules: `install-module.ts` (no secrets) and `config-module.ts` (all secrets). Each is independently testable and independently callable by doctor.

**Wave 3 — Doctor refactor + CLI command rewrite** (2 todos, can parallelize):
Rewires doctor to trigger the new modules on health-check failure, and rewrites the CLI dispatcher to remove `install`/`init` and add `config`. These touch adjacent files but not the same lines.

**Wave 4 — Test suite + dead-code sweep** (2 todos, sequential):
Rewrites the test file to match the new module structure, then does a final grep sweep to confirm zero references to removed symbols. Must be last because it validates the whole refactor.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 (install.sh) | — | 7 | 2 |
| 2 (remove lifecycle hooks) | — | 7 | 1 |
| 3 (install-module.ts) | — | 5 | 4 |
| 4 (config-module.ts) | — | 5 | 3 |
| 5 (doctor refactor) | 3, 4 | 7 | 6 |
| 6 (CLI rewrite) | 1, 2, 4 | 7 | 5 |
| 7 (test rewrite) | 3, 4, 5, 6 | 8 | — |
| 8 (dead-code sweep) | 1-7 | — | — |

> Note: install.sh (todo 1) invokes `autodev doctor` at runtime, which requires todo 6 (cli.ts) to be complete for integration testing. Todo 1's own acceptance is syntax-only, so it doesn't depend on todo 6. Final verification F3 captures the integration dependency.

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Create `install.sh` standalone shell bootstrap script at repo root
  What to do: Create a bash shell script (not POSIX sh, not a Bun script) `install.sh` at repo root with `#!/usr/bin/env bash` shebang. It does exactly: (1) detect if `bun` is on PATH; if missing, check for `curl` first (if missing, print "curl is required to install Bun" and exit 1), then run `curl -fsSL https://bun.sh/install | bash` to auto-install Bun; after install, explicitly `export PATH="$HOME/.bun/bin:$PATH"` (Bun's installer modifies shell rc files but does NOT update the current shell's PATH — this export is required); (2) run `bun install -g autodev`; (3) check `autodev` is on PATH (via `command -v autodev`); if missing, print "bun install -g autodev failed — check errors above" and exit 1; (4) invoke `autodev doctor`. Use `set -euo pipefail` (bash-only, not POSIX). Print a header banner ("AutoDev Installer"). On doctor failure (non-zero exit), print "Run \`autodev doctor\` again after fixing the issues above" and exit 1. Make it executable (`chmod +x install.sh`).
  Must NOT do: Do not put any TS in this file — it's a standalone shell script that runs before Bun exists. Do not install gh/git (that's the install module's job). Do not collect credentials. Do not run Magic Context setup. Do not call `autodev init`. Do not download config files. Do not run `autodev config` (doctor triggers it if needed). Do not claim POSIX compatibility — `set -o pipefail` is a bashism.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 7 | Can parallelize with: 2
  References (executor has NO interview context):
    - `package.json:8-10` — current `bin` entry; after todo 2 repoints it to `scripts/cli.ts`, `autodev` is the real CLI.
    - `extensions/autodev/installer/doctor.ts:74-200` — doctor is what this script hands off to.
  Acceptance criteria (agent-executable):
    - `test -x install.sh` succeeds (executable bit set).
    - `bash -n install.sh` exits 0 (syntax valid).
    - `grep -c "bun install -g autodev" install.sh` returns 1.
    - `grep -c "autodev doctor" install.sh` returns 1.
    - `grep -c "command -v autodev\|which autodev" install.sh` returns ≥1 (the PATH check after install).
    - `grep -c "bun.sh/install" install.sh` returns ≥1 (the auto-install Bun curl command).
  QA scenarios:
    - Happy: `bash -n install.sh && echo "syntax ok"` exits 0; evidence `.omo/evidence/task-1-installer-refactor.md` records the output.
    - Failure: `PATH=/usr/bin:/bin ./install.sh` (bun not on PATH, and curl install skipped/fails in sandbox) prints the install attempt and exits non-zero; evidence records stderr.
  Commit: Y | feat(installer): add install.sh standalone bootstrap script with bun auto-install

- [x] 2. Remove dead lifecycle hooks from `package.json`, repoint `bin` to `scripts/cli.ts`, delete guard/postinstall scripts
  What to do: (a) Remove the `"preinstall"` and `"postinstall"` entries from the `scripts` object in `package.json`. (b) Delete `scripts/preinstall-guard.ts` and `scripts/postinstall.ts`. (c) Repoint `bin.autodev` from `./scripts/postinstall.ts` to `./scripts/cli.ts`. (d) Create `scripts/cli.ts` as a real CLI entrypoint that: **FIRST, before dispatching any subcommand, loads `~/.pi/agent/.env` into `process.env`** — resolve the agent directory via `const { getAgentDir } = await import("@earendil-works/pi-coding-agent")`, then load `.env` from `join(getAgentDir(), ".env")` using manual parsing (`readFileSync` + split on `=` + assign to `process.env`) since Bun only auto-loads `.env` from cwd. This ensures `GH_TOKEN`, `OLLAMA_CLOUD_API_KEY`, `VOYAGE_API_KEY`, and `DISCORD_BOT_TOKEN` are available in `process.env` for all downstream health checks and operations. Then reimplements the subcommand switch — it must NOT call `registerCommands(pi)` (no pi instance is available outside the runtime). Parse `process.argv` for the subcommand, construct a minimal context `{ cwd: process.cwd(), ui: { notify: (msg, level) => console[level === "error" ? "error" : "log"](msg) } }`, and call handler functions directly. For `doctor`: call `runDoctor` from `../extensions/autodev/installer/doctor.ts` directly (pattern: `scripts/postinstall.ts:33-44` called `runDoctor` without pi). For `config`: call `runConfig` from `../extensions/autodev/installer/config-module.ts` (expanded in todo 6). For `onboard`, `status`, `stop`, `docs`, `debate`, `stop-continuation`: do NOT import private handlers from `orchestrator/cli.ts` (they are not exported). Instead, call the underlying exported functions directly: `getHeartbeatState` and `stopHeartbeat` from `../extensions/autodev/orchestrator/heartbeat.ts`, `loadRegistry` and `getActiveProject` from `../extensions/autodev/orchestrator/projects.ts`, `stopAllLoops` from `../extensions/autodev/autonomy/continuation.ts`. For `docs` and `debate`: replicate the simple print-message handlers inline (they just print usage messages in the current code). Resolve `authPath` using dynamic `import()` (NOT `require()` — `package.json` has `"type": "module"` so `require()` is unavailable in ESM): `const { getAgentDir } = await import("@earendil-works/pi-coding-agent")`. This is the same pattern used in `doctor.ts:81` and `background/manager.ts:46-47`. Handle the `--non-interactive` flag and TTY detection. For `config --non-interactive`: print "Config requires interactive terminal. Set environment variables manually in ~/.pi/agent/.env" and exit 0. For `doctor`: if `result.failed > 0`, `process.exit(1)` so install.sh can detect failure. The full `config` sub-command routing (llm/discord/voyage/github) is expanded in todo 6; for now, `config` with no sub-command prints usage and exits. Load `~/.pi/agent/.env` at startup via `process.loadEnvFile()` or manual parsing (Bun only auto-loads `.env` from cwd, but secrets live at `~/.pi/agent/.env`).
  Must NOT do: Do not remove the `bin` field. Do not change `dependencies`, `devDependencies`, `type`, `packageManager`, or `pi` fields. Do not import `registerCommands` from `orchestrator/cli.ts` — that requires a pi instance. Do not import private handler functions (`handleDoctor`, `handleOnboard`, `handleStatus`, `handleStop`, `handleDocs`, `handleDebate`) from `orchestrator/cli.ts` — they are not exported. Do not use `require()` — use dynamic `import()`. Do not implement the full `config` sub-command routing here (todo 6).
  Parallelization: Wave 1 | Blocked by: — | Blocks: 7 | Can parallelize with: 1
  References:
    - `package.json:8-10` — `bin.autodev` currently points at `./scripts/postinstall.ts`.
    - `package.json:11-17` — `scripts` object with `preinstall` and `postinstall` to remove.
    - `scripts/preinstall-guard.ts:1-18` — file to delete.
    - `scripts/postinstall.ts:1-49` — file to delete; but note its `main()` pattern (lines 33-44) calling `runDoctor` directly is the pattern `scripts/cli.ts` must replicate for all subcommands.
    - `extensions/autodev/installer/index.ts:138-154` — `resolveAuthPath` and `autoNonInteractive` to port into `scripts/cli.ts`.
    - `extensions/autodev/orchestrator/cli.ts:27-72` — the subcommand switch to reimplement (NOT call via registerCommands).
  Acceptance criteria:
    - `grep -c "preinstall" package.json` returns 0.
    - `grep -c "postinstall" package.json` returns 0.
    - `test ! -f scripts/preinstall-guard.ts` succeeds.
    - `test ! -f scripts/postinstall.ts` succeeds.
    - `test -f scripts/cli.ts` succeeds.
    - `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` exits 0 (valid JSON).
    - `grep '"autodev": "./scripts/cli.ts"' package.json` returns 1 match.
    - `CI=1 bun run scripts/cli.ts doctor` exits 0 (or non-zero with a clean doctor report — it must run, not crash on import; CI=1 forces non-interactive so it won't hang on prompts).
    - `grep -c "registerCommands" scripts/cli.ts` returns 0 (must NOT call registerCommands).
  QA scenarios:
    - Happy: `CI=1 bun run scripts/cli.ts doctor` prints a doctor report (checks may fail, but no crash); evidence `.omo/evidence/task-2-installer-refactor.md`.
    - Failure: `bun run scripts/cli.ts badcommand` prints usage and exits non-zero; evidence records the output.
  Commit: Y | refactor(installer): remove dead lifecycle hooks, repoint bin to standalone cli.ts

- [x] 3. Create internal install module (`extensions/autodev/installer/install-module.ts`) — no secrets
  What to do: Create `install-module.ts` exporting an async function named exactly `runInstallFixes(deps: InstallModuleDeps): Promise<InstallFixResult[]>`. `InstallModuleDeps` = `{ projectRoot, authPath, notify, execSyncOverride?, fetchOverride? }`. The function runs fixes: (1) install `gh` if missing — reuse `installMissingTools` from `tools.ts` (note: this function also checks for `bun`, which is redundant since install.sh already installed it, but harmless); (2) install `git` if missing — same; (3) download `.pi/settings.json`, `.pi/magic-context.jsonc`, and missing `.pi/agents/*.md` — reuse `validateAndCreateConfig` from `config-defaults.ts`, passing `deps.fetchOverride` through (this requires modifying `validateAndCreateConfig` to accept an optional `fetchOverride?: typeof fetch` parameter — see fix #10); (4) run `bunx @cortexkit/magic-context@latest setup --harness pi` **ONLY if not already configured** — pre-check: read `.pi/magic-context.jsonc` and check if it has `harness: "pi"`; if already configured, skip setup and report "Magic Context already configured"; if not configured or file missing, run setup with 120s timeout; (5) run `bunx @cortexkit/magic-context@latest doctor` as a post-setup warning check (failure is a warning, not an error).   Each fix records completion in `state.ts` using these exact step numbers with scope `"install"` (config module uses a separate scope `"config"` to avoid collision): fix(1)+(2) tools = step 0; fix(3) config files = step 3; fix(4)+(5) MC setup = step 3 too (same step — but only mark step 3 complete AFTER both config files AND MC setup succeed, not after only one). Return array of `{ name: string, ok: boolean, detail: string }`. The module MUST NOT handle any secrets. **Do NOT delete `steps.ts` in this todo** — `steps.ts` is deleted in todo 8 (dead-code sweep) after the test suite is rewritten (todo 7). Deleting it here would break `bun test` since the test file imports from `steps.ts` at 17 call sites.
  Must NOT do: Do not make this a CLI command. Do not import `prompts.ts` or use any prompter. Do not write to `auth.json`. Do not write credential values to `.env`. Do not run `gh auth login`. Do not reference `step2LlmCredentials`, `step4VoyageAi`, `step5Discord`, `step0bGhAuth`, or any secret-handling code. Do not touch project-level steps. Do not delete `steps.ts` in this todo (moved to todo 8). Do not run MC setup unconditionally — use the pre-check.
  Parallelization: Wave 2 | Blocked by: — | Blocks: 5 | Can parallelize with: 4
  References:
    - `extensions/autodev/installer/tools.ts:1-105` — `installMissingTools`, `commandExists`, `detectPlatform`, `installTool`. Reuse.
    - `extensions/autodev/installer/config-defaults.ts:1-99` — `validateAndCreateConfig` downloads `.pi/*`. Modify to accept optional `fetchOverride?: typeof fetch` parameter and wire it through to the `downloadFile` helper (currently uses global `fetch`).
    - `extensions/autodev/installer/steps.ts:260-294` — `step3MagicContext` for the `bunx @cortexkit/magic-context setup` command string and timeouts. Port the command (steps.ts deleted in todo 8).
    - `extensions/autodev/installer/steps.ts:47-75` — `step0ExternalTools` pattern. Port (steps.ts deleted in todo 8).
    - `extensions/autodev/installer/state.ts:1-91` — `markStepCompleted`, `isStepCompleted`, `readState`. Reuse with scope `install`.
  Acceptance criteria:
    - `test -f extensions/autodev/installer/install-module.ts` succeeds.
    - `bun run typecheck` passes with the new file.
    - `grep -c "export async function runInstallFixes" extensions/autodev/installer/install-module.ts` returns 1 (exact name, no "or equivalent").
    - `grep -cE "(^|[^/])\b(prompt|confirm|auth\.json|gh auth login|DISCORD)" extensions/autodev/installer/install-module.ts` returns 0 (no secret/prompt handling; regex avoids matching comments).
    - `grep -c "magic-context.jsonc" extensions/autodev/installer/install-module.ts` returns ≥1 (MC pre-check reads the config file).
    - `bun test` still passes (steps.ts still exists — NOT deleted in this todo).
  QA scenarios:
    - Happy: temp dir, mock `execSyncOverride` to make `commandExists("gh")` false → `runInstallFixes` reports gh install attempted and config files downloaded (mock `fetchOverride` to return content); evidence `.omo/evidence/task-3-installer-refactor.md`.
    - Failure: mock `fetchOverride` returning undefined → `validateAndCreateConfig` reports `ok: false` with "download failed"; evidence records the failure.
  Commit: Y | feat(installer): add internal install module with MC pre-check

- [x] 4. Create config module (`extensions/autodev/installer/config-module.ts`) — all secrets, interactive-only, sub-commands
  What to do: Create `config-module.ts` exporting an async function named exactly `runConfig(deps: ConfigModuleDeps, subcommand?: string): Promise<ConfigResult[]>`. `ConfigModuleDeps` = `{ projectRoot, authPath, prompter, notify, execSyncOverride? }`. There is NO `nonInteractive` field — config is interactive-only; if `prompter` is a no-TTY prompter (returns empty strings), each sub-command warns and skips. The `subcommand` parameter routes to individual handlers: `"llm"`, `"voyage"`, `"discord"`, `"github"`, or undefined (run all in sequence). Each handler: (1) `llm` — prompt for provider (default `ollama-cloud`), check `~/.pi/agent/auth.json` and `~/.opencode/auth.json` for existing creds, offer import; **when importing, transform imported keys to `$VAR` references**: write the actual key to `~/.pi/agent/.env` via `setEnvVars`, write `$VAR` reference to `auth.json` via `setProviderKey` (do NOT copy literal key values into `auth.json`); else prompt for key; **write the actual secret ONLY to `~/.pi/agent/.env`** via `setEnvVars` with the provider's env var name (e.g., `OLLAMA_CLOUD_API_KEY`); **write a thin env-var reference to `auth.json`** via `setProviderKey(authPath, provider, "$OLLAMA_CLOUD_API_KEY")` — pi's SDK resolves `$VAR` syntax at runtime from `process.env` (verified via `.pi/auth.json` template comments documenting `$VAR` support). Do NOT write the actual secret value to `auth.json`. (2) `voyage` — prompt for key, Enter to skip → write empty `VOYAGE_API_KEY=` and warn about ONNX fallback; write to `~/.pi/agent/.env` only (Magic Context reads `process.env.VOYAGE_API_KEY` directly — `extensions/autodev/docs/index.ts:281`). (3) `discord` — confirm (default no); if yes prompt token, channel, liaison; write all three to `~/.pi/agent/.env` only (Discord reads `process.env.*` directly — `extensions/autodev/discord/index.ts:37-39`). (4) `github` — **Token-based auth (GH_TOKEN), no gh auth login fallback when GH_TOKEN is already set.** First check if `GH_TOKEN` is already set in `~/.pi/agent/.env` (read the file, don't rely on process.env). If already set: verify it works by running `gh auth status` (which respects `GH_TOKEN` and makes an API call to validate it — confirmed by GitHub CLI source code). If valid, skip prompting. If invalid/expired (gh auth status fails), offer to re-enter a new token. If `GH_TOKEN` is NOT set: prompt the user with clear instructions:

  **Prompt text:** "AutoDev needs a GitHub personal access token (PAT) to manage issues, PRs, labels, and CI. A PAT isolates AutoDev's GitHub operations from your personal `gh auth login` — they don't conflict.

  To generate a fine-grained PAT:
  1. Go to: https://github.com/settings/personal-access-tokens/new
  2. Token name: 'AutoDev'
  3. Expiration: 90 days (rotate quarterly)
  4. Repository access: Select only the repos AutoDev will work on
  5. Permissions:
     - Issues: Read and write
     - Pull requests: Read and write
     - Contents: Read-only
     - Metadata: Read-only
     - Labels: Read and write (if available)
  6. Click 'Generate token'
  7. Copy the token (starts with 'github_pat_')

  Paste your token here (or press Enter to use interactive `gh auth login --web` instead):"

  If user enters a token: write it to `~/.pi/agent/.env` as `GH_TOKEN=<token>` and verify it works via `gh auth status`. AutoDev sets `process.env.GH_TOKEN` at startup — `gh` CLI uses this env var with highest priority (confirmed by GitHub CLI docs: `GH_TOKEN` > `GITHUB_TOKEN` > stored credentials), completely overriding the user's personal `gh auth login` credentials.

  If user presses Enter (no token): run `gh auth login --web` via `execSync` with 5-min timeout (use `execSyncOverride` for testability). **IMPORTANT: `gh auth login` is BLOCKED when `GH_TOKEN` is set in `process.env`** (confirmed by GitHub CLI source code — `gh auth login` checks for env-var tokens and refuses with "The value of the GH_TOKEN environment variable is being used for authentication"). Since `.env` is loaded at startup and `GH_TOKEN` may be in `process.env`, the config module must temporarily `delete process.env.GH_TOKEN` before calling `gh auth login --web`, then NOT restore it (the user chose interactive login, so GH_TOKEN should not be set). If `--web` fails in a browserless environment, fall back to `gh auth login` (terminal-based OAuth) with a clear message.

  **Key principle**: `GH_TOKEN` env var takes precedence over stored `gh` credentials — AutoDev's token doesn't touch the user's personal `gh auth` state at all. `gh auth status` validates the token by making an API call (confirmed by GitHub CLI source code). (5) `ensureGitignore` is **skipped** — `.env` lives at `~/.pi/agent/.env` which is not in a git repo, so `.gitignore` is irrelevant. Users who keep `~/.pi/` in a git repo must manually gitignore `.env`. Each handler checks `isStepCompleted` with scope `"config"` (NOT `"install"` — config module uses a separate scope to avoid any step-number collision with install module) and skips if done. Step numbers: llm=2, voyage=4, discord=5, github=-1. All `.env` writes go to `~/.pi/agent/.env` (same directory as `auth.json`), NOT to `projectRoot/.env`.
  Must NOT do: Do not add a `nonInteractive` mode — config is interactive-only. Do not download config files. Do not install `gh`/`git`. Do not run Magic Context setup. Do not create GitHub labels, check KB, or run docs rebuild. Do not reference `bin` or CLI dispatch. Do not omit `execSyncOverride` from deps (needed for `gh auth login` testability).
  Parallelization: Wave 2 | Blocked by: — | Blocks: 5 | Can parallelize with: 3
  References:
    - `extensions/autodev/installer/steps.ts:177-254` — `step2LlmCredentials` interactive flow + import-from-existing logic (lines 205-229). Port to `llm` handler. (steps.ts is deleted in todo 8, not todo 3.)
    - `extensions/autodev/installer/steps.ts:299-329` — `step4VoyageAi`. Port to `voyage` handler.
    - `extensions/autodev/installer/steps.ts:334-374` — `step5Discord`. Port to `discord` handler.
    - `extensions/autodev/installer/steps.ts:77-124` — `step0bGhAuth` for `gh auth login --web`. Port to `github` handler.
    - `extensions/autodev/installer/auth.ts:1-76` — `setProviderKey`, `tryImportAuth`, `readAuth`. Reuse.
    - `extensions/autodev/installer/env.ts:1-88` — `setEnvVars`, `ensureGitignore`, `readEnv`. Reuse. **Both `setEnvVars` AND `readEnv` must be modified to accept an optional `envPath?: string` parameter** (default: `join(projectRoot, ENV_FILE)` for backward compatibility). The config module passes `join(dirname(authPath), ".env")` as `envPath` to write/read `~/.pi/agent/.env`. The doctor's env health check and `isFirstRun()` also use the modified `readEnv` with the agent dir path. This is a ~5-line change to `env.ts`.
    - `extensions/autodev/installer/prompts.ts:1-130` — `Prompter`, `createPrompter`, `MockPrompter`. Reuse.
    - `extensions/autodev/installer/steps.ts:605-618` — `providerToEnvVar` helper. Port.
    - `extensions/autodev/installer/state.ts:1-91` — `markStepCompleted`, `isStepCompleted` with scope `"config"` (separate from install module's `"install"` scope to avoid step-number collision). Note: `StateScope` type may need to be extended to include `"config"` if it currently only has `"install" | "init"`.
  Acceptance criteria:
    - `test -f extensions/autodev/installer/config-module.ts` succeeds.
    - `bun run typecheck` passes.
    - `grep -c "export async function runConfig" extensions/autodev/installer/config-module.ts` returns 1.
    - `grep -c "execSyncOverride" extensions/autodev/installer/config-module.ts` returns ≥1 (testability seam present).
    - `grep -c "nonInteractive" extensions/autodev/installer/config-module.ts` returns 0 (interactive-only, no non-interactive field).
    - `grep -c "bun install\|magic-context setup\|gh label create\|docs rebuild\|validateAndCreateConfig\|installMissingTools" extensions/autodev/installer/config-module.ts` returns 0.
    - `grep -c "GH_TOKEN" extensions/autodev/installer/config-module.ts` returns ≥1 (github handler supports GH_TOKEN token approach).
    - `grep -c "gh auth login" extensions/autodev/installer/config-module.ts` returns ≥1 (github handler also supports interactive fallback).
    - `grep -c "personal-access-tokens" extensions/autodev/installer/config-module.ts` returns ≥1 (prompt includes token generation instructions with URL).
    - `grep -c "delete process.env.GH_TOKEN" extensions/autodev/installer/config-module.ts` returns ≥1 (temporarily unsets GH_TOKEN before gh auth login fallback).
  QA scenarios:
    - Happy: `MockPrompter` with `["ollama-cloud", "n", "sk-test"]` → `runConfig(deps, "llm")` writes `auth.json` with `$OLLAMA_CLOUD_API_KEY` and `.env` with `OLLAMA_CLOUD_API_KEY=sk-test`; evidence `.omo/evidence/task-4-installer-refactor.md`.
    - GitHub token: `MockPrompter` with `["github_pat_xxx"]` → `runConfig(deps, "github")` writes `GH_TOKEN=github_pat_xxx` to `.env`, runs `gh auth status` to verify; evidence records the write + verification.
    - GitHub re-enter: `MockPrompter` with `["github_pat_new"]` when `GH_TOKEN=github_pat_expired` already in `.env` → handler detects expired token via `gh auth status` failure, prompts for new token, writes to `.env`; evidence records the flow.
    - GitHub fallback: `MockPrompter` with `[""]` (Enter pressed) → `runConfig(deps, "github")` temporarily deletes `process.env.GH_TOKEN` (if set), runs `gh auth login --web` via `execSyncOverride`; evidence records the command + env var handling.
    - GitHub instructions: verify prompt text includes the URL `https://github.com/settings/personal-access-tokens/new` and permission list (issues, PRs, contents, metadata, labels); evidence records the prompt output.
    - Failure: no-TTY prompter (returns "") → `runConfig(deps, "llm")` warns "interactive config required, no TTY detected" and skips without writing; evidence records the warning.
  Commit: Y | feat(installer): add interactive-only config module with sub-commands

- [x] 5. Refactor doctor (`extensions/autodev/installer/doctor.ts`) to trigger install + config modules
  What to do: Rewrite `runDoctor` so that when `launchConfigFlow: true` and health checks fail, it: (1) calls `runInstallFixes` from `install-module.ts` for missing tools/config-files/Magic Context — ALWAYS, regardless of TTY (install has no prompts); (2) calls `runConfig` from `config-module.ts` for missing secrets — ONLY when `process.stdin.isTTY === true` (interactive), and with TARGETED sub-commands based on which specific checks failed (not always all 4): LLM check fails → `runConfig(deps, "llm")`; GitHub auth fails → `runConfig(deps, "github")`; VoyageAI missing → `runConfig(deps, "voyage")` (optional, only if TTY). **If multiple checks fail, call `runConfig` once per failing check with the corresponding subcommand** (e.g., `runConfig(deps, "llm")` then `runConfig(deps, "github")`). Do NOT call `runConfig` with no subcommand — that would run all handlers including voyage and discord, which are not auto-triggered. **`runConfig` must NOT close the prompter** — the prompter is managed by the caller (doctor). Doctor creates the prompter via `createPrompter()` before the first `runConfig` call and closes it after all sub-commands complete. This prevents the closed-interface bug on the second call. Discord is NOT a health check and is never auto-triggered — user runs `autodev config discord` manually. (3) **After both modules complete, doctor RE-RUNS all health checks** to verify everything is now green. If still failing, reports what's still broken. This loop-back ensures one `autodev doctor` invocation does everything. (4) Add a lightweight `isFirstRun()` function — checks THREE signals (not just one file): (a) global `~/.pi/agent/auth.json` exists with at least one non-empty API key (use `readAuth(authPath)`); (b) project `.autodev/install-state.json` has completed steps (use `readState(projectRoot, "install")`); (c) `~/.pi/agent/.env` has `OLLAMA_CLOUD_API_KEY` set (use `readEnv` with `envPath = join(dirname(authPath), ".env")` — the modified `readEnv` from todo 4 that accepts an explicit path). Returns `true` (first run) only if ALL THREE signals are absent. This matches the old `isFreshInstall()` logic which correctly handles edge cases: manual config without running install, second project on an already-configured machine, deleted `.autodev/` with `auth.json` still present. Used ONLY for messaging: first run gets "Welcome! Let's set up AutoDev." message; returning user with broken state gets "Something needs fixing." message. Does NOT affect behavioral branching — all fix decisions are driven by health checks. Function signature: `isFirstRun(projectRoot: string, authPath: string): Promise<boolean>`. The agent directory for the `.env` check is `path.dirname(authPath)` — `authPath` is `~/.pi/agent/auth.json`, so `dirname(authPath)` yields `~/.pi/agent/`. Also UPDATE the doctor's "Environment vars" health check (lines 148-158): change `readEnv(deps.projectRoot)` to `readEnv(deps.projectRoot, join(dirname(deps.authPath), ".env"))` so it reads from `~/.pi/agent/.env` instead of `projectRoot/.env`. Remove `isGlobalInstall()` (lines 42-45) and `isFreshInstall()` (lines 47-61) — dead code under Bun, replaced by `isFirstRun()`. Remove Gates 1-3 (lines 78-84, 86-107, 185-198). Keep the health checks (lines 109-180) but UPDATE: (a) the "Install state" check (lines 162-168): new threshold is `installStepCount + configStepCount >= 6` — install module marks steps 0 and 3 (scope `"install"`), config module marks steps 2, 4, 5, -1 (scope `"config"`). Read both `readState(projectRoot, "install")` and `readState(projectRoot, "config")`, sum the distinct completed steps. The complete set is {−1, 0, 2, 3, 4, 5} = 6 steps. Set threshold to `>= 6`; (b) the "LLM credentials" check (lines 137-146): **explicitly modify this check to resolve `$VAR` references** — after reading `auth.json`, for each provider, if `key.startsWith("$")`, look up `process.env[key.slice(1)]` and treat the provider as missing if the env var is unset or empty. This prevents a false positive where `auth.json` has `"$OLLAMA_CLOUD_API_KEY"` (non-empty string) but the actual env var is not set; (c) the "Environment vars" check (lines 148-158): change `readEnv(deps.projectRoot)` to use the modified `readEnv` with `envPath = join(dirname(deps.authPath), ".env")` so it reads from `~/.pi/agent/.env`; (d) the detail message at line 167 from "X/8" to "X/6". (5) Non-TTY behavior: `runInstallFixes()` runs (no TTY needed), `runConfig()` is NOT called. Doctor prints: "Install fixes were applied. To configure secrets (API keys, GitHub auth), run `autodev config` in an interactive terminal, or set environment variables manually in `~/.pi/agent/.env`." and exits. Extend `DoctorDeps` interface to include `prompter?: Prompter` (for constructing `ConfigModuleDeps` when triggering `runConfig`) and `fetchOverride?: typeof fetch` (for passing through to `runInstallFixes`). When `prompter` is not injected, doctor constructs a real one via `createPrompter()` from `prompts.ts`. The `configFlowLaunched` field remains and is set true when doctor triggered either module. Update JSDoc (lines 63-73) to reflect the new install+config module orchestration instead of the old Gate 1-2-3 flow.
  Must NOT do: Do not remove the health checks. Do not change `DoctorCheck`/`DoctorResult` interface shape. Do not import `runInstall`/`runInit` from `index.ts` (being deleted). Do not reference `autodev install`/`autodev init` in messages. Do not auto-trigger Discord config (it's optional and not a health check). Do not use `isFirstRun()` for behavioral branching — only for messaging.
  Parallelization: Wave 3 | Blocked by: 3, 4 | Blocks: 7 | Can parallelize with: 6
  References:
    - `extensions/autodev/installer/doctor.ts:1-201` — current impl. Remove lines 42-45, 47-61, 78-84, 86-107, 185-198. Keep 109-180 but update 162-168 (threshold 8→6).
    - `extensions/autodev/installer/install-module.ts` (todo 3) — `runInstallFixes` to call.
    - `extensions/autodev/installer/config-module.ts` (todo 4) — `runConfig` to call.
    - `extensions/autodev/installer/config-defaults.ts:32-99` — `validateAndCreateConfig` still called in health checks (line 173).
  Acceptance criteria:
    - `bun run typecheck` passes.
    - `grep -c "npm_config_global\|isGlobalInstall\|isFreshInstall" extensions/autodev/installer/doctor.ts` returns 0.
    - `grep -c "isFirstRun" extensions/autodev/installer/doctor.ts` returns ≥1 (first-run check added).
    - `grep -c "readAuth\|readState\|readEnv" extensions/autodev/installer/doctor.ts` returns ≥3 (isFirstRun checks 3 signals).
    - `grep -c "runInstallFixes\|runConfig" extensions/autodev/installer/doctor.ts` returns ≥1.
    - `grep -c "isTTY" extensions/autodev/installer/doctor.ts` returns ≥1 (TTY check before config trigger).
    - `grep -c "autodev config" extensions/autodev/installer/doctor.ts` returns ≥1 (non-TTY message references config command).
    - Unit test (todo 7): all-green (mocked) → no module calls. Missing gh (mocked) → calls `runInstallFixes`. Missing creds + no TTY → no `runConfig` call, prints "autodev config" message, exits clean. Missing creds + TTY → calls `runConfig` with targeted sub-command ("llm" for LLM failure, "github" for GitHub auth failure). First run (no install-state.json, no auth.json, no .env) → welcome message. Re-run (install-state.json exists) → "something needs fixing" message. GitHub auth check: if `GH_TOKEN` in env → run `gh auth status` (which respects `GH_TOKEN`) to VERIFY the token is valid — only passes if `gh auth status` succeeds; if `GH_TOKEN` set but `gh auth status` fails (expired/revoked token) → check fails, triggers `runConfig(deps, "github")`; if no `GH_TOKEN` but `gh auth status` works (personal login) → check passes; if neither → check fails, triggers `runConfig(deps, "github")`.
  QA scenarios:
    - Happy: temp dir, mock `execSyncOverride` for bun/gh/gh-auth to succeed, pre-write `auth.json` + `.env` + config files + install-state with 6 steps → doctor returns `{ passed: N, failed: 0, configFlowLaunched: false }`, message "All health checks passed"; evidence `.omo/evidence/task-5-installer-refactor.md`.
    - Fresh install: temp dir, no install-state.json, no auth.json, no .env → isFirstRun returns true, doctor prints welcome message, triggers `runInstallFixes` + `runConfig` (if TTY), re-runs checks; evidence records the flow.
    - Broken state: temp dir, install-state.json with 6 steps but auth.json corrupted → isFirstRun returns false (auth.json exists), doctor prints "something needs fixing", triggers `runConfig(deps, "llm")`; evidence records the flow.
    - Manual config: temp dir, no install-state.json, but auth.json has creds → isFirstRun returns false (auth.json has creds), doctor does NOT show welcome message; evidence records the flow.
    - GitHub auth via token: `GH_TOKEN` set in env → GitHub auth check runs `gh auth status` (respects `GH_TOKEN`) to verify token validity → passes if valid, fails if expired/revoked; evidence records the check.
    - Non-TTY: temp dir, missing config, `CI=1` (no TTY) → doctor returns failures, `configFlowLaunched: false`, prints "run `autodev config` in an interactive terminal", does not hang; evidence records the failure list + message.
  Commit: Y | refactor(installer): doctor triggers install + config modules, remove dead gates

- [x] 6. Expand `scripts/cli.ts` with full sub-command routing, rewrite `orchestrator/cli.ts` dispatcher
  What to do: (a) Expand `scripts/cli.ts` (created minimally in todo 2) into the full CLI entrypoint: parse `process.argv` for subcommand and sub-subcommands (e.g., `autodev config llm`, `autodev config discord`). Reimplement the switch calling handlers directly (NOT via `registerCommands`). For `config`, route the sub-subcommand to `runConfig(deps, subSubcommand)`. For `config` with no sub-subcommand, print usage listing `llm`, `voyage`, `discord`, `github` and exit. For other commands (`doctor`, `onboard`, `status`, `stop`, `docs`, `debate`, `stop-continuation`), call the underlying exported functions directly (as specified in todo 2): `runDoctor`, `runConfig`, `getHeartbeatState`, `stopHeartbeat`, `loadRegistry`, `getActiveProject`, `stopAllLoops`. For `docs` and `debate`: replicate the simple print-message handlers inline. Do NOT import private handlers from `orchestrator/cli.ts`. (b) In `extensions/autodev/index.ts`: **add `.env` loading at the top of the `register()` function, before any module registration** — `const agentDir = await getAgentDir(); const envPath = join(agentDir, ".env"); if (existsSync(envPath)) { parse and assign to process.env }`. This ensures Discord, docs, heartbeat, and background modules see secrets when autodev runs as a pi extension. This is the ONLY change allowed to the extension entry point. (c) In `orchestrator/cli.ts`: remove the `case "install"` and `case "init"` branches and their `handleInstall`/`handleInit` imports (line 23). Add `case "config"` that calls `runConfig` from `config-module.ts` (for when config is invoked via the pi extension command, not the standalone binary — both paths must work). Construct `ConfigModuleDeps` from the extension context: `projectRoot` = `ctx.cwd ?? process.cwd()`, `authPath` = resolve via `getAgentDir()` (same logic as `handleDoctor`), `prompter` = `createPrompter()`, `notify` = `(msg, level) => ctx.ui.notify(msg, level)`. **Update the failure message at line 109** from `"Run \`autodev install\` to fix"` to `"Run \`autodev doctor\` to re-check and fix, or \`autodev config\` to set up credentials"`. Update the default help string (line 64-69) to list: `doctor, config [llm|voyage|discord|github], onboard, status, stop, docs [query|rebuild], debate [start|status], stop-continuation`. Update the JSDoc comment (lines 1-16) and `registerCommands` description string (line 29) to remove `install` and `init` references. Do NOT remove `handleDebugFlag` export (lines 120-151) — it's used by the extension entry point.ebugFlag` export (lines 120-151) — it's used by the extension entry point.
  Must NOT do: Do not remove `doctor`, `onboard`, `status`, `stop`, `docs`, `debate`, `stop-continuation` from the dispatcher. Do not add `install` or `init` back. Do not put secret-handling logic in `cli.ts` — delegate to `config-module.ts`. Do not call `registerCommands` from `scripts/cli.ts`. Do not import private handler functions from `orchestrator/cli.ts`. Do not remove `handleDebugFlag` export. Do not change any other module registrations in `extensions/autodev/index.ts` beyond adding `.env` loading at the top.
  Parallelization: Wave 3 | Blocked by: 1, 2, 4 | Blocks: 7 | Can parallelize with: 5
  References:
    - `extensions/autodev/orchestrator/cli.ts:1-219` — edit sites: line 23 (import), 54-59 (case install/init), 64-69 (default help).
    - `extensions/autodev/installer/config-module.ts` (todo 4) — `runConfig` to call.
    - `scripts/cli.ts` (from todo 2) — expand this file.
  Acceptance criteria:
    - `grep -c "handleInstall\|handleInit\|case \"install\"\|case \"init\"" extensions/autodev/orchestrator/cli.ts` returns 0.
    - `grep -c "case \"config\"" extensions/autodev/orchestrator/cli.ts` returns 1.
    - `grep -c "runConfig" extensions/autodev/orchestrator/cli.ts` returns ≥1.
    - `grep -c "registerCommands" scripts/cli.ts` returns 0.
    - `grep -c "autodev install" extensions/autodev/orchestrator/cli.ts` returns 0 (message at line 109 updated).
    - `grep -c "handleDebugFlag" extensions/autodev/orchestrator/cli.ts` returns ≥1 (not removed).
    - `bun run typecheck` passes.
    - `CI=1 bun run scripts/cli.ts doctor` prints a doctor report (does not hang).
    - `bun run scripts/cli.ts config` prints usage listing `llm`, `voyage`, `discord`, `github` and exits 0.
  QA scenarios:
    - Happy: `CI=1 bun run scripts/cli.ts doctor` prints a report; `bun run scripts/cli.ts config` prints usage; evidence `.omo/evidence/task-6-installer-refactor.md`.
    - Failure: `bun run scripts/cli.ts badcommand` prints help with the new command list and exits non-zero; evidence records output.
  Commit: Y | refactor(installer): full sub-command routing in cli.ts, remove install/init from dispatcher

- [ ] 7. Rewrite test suite (`extensions/autodev/installer/__tests__/installer.test.ts`) for new module structure
  What to do: Rewrite the test file completely. Remove all tests for deleted functions (`step1BunCheck` through `step9Doctor`, `runInstallSteps`, `runInitSteps`, `INSTALL_STEPS`, `INIT_STEPS`). Keep tests for reused modules (`state.ts`, `env.ts`, `auth.ts`, `prompts.ts`). Add tests for: (1) `install-module.ts` — `runInstallFixes` with mocked `execSyncOverride` (verify gh/git install attempted, config files downloaded via mocked `fetchOverride`, Magic Context setup called with pre-check, NO auth.json or `.env` writes); (2) `config-module.ts` — `runConfig(deps, "llm")` interactive with `MockPrompter` (writes auth.json + .env), `runConfig(deps, "discord")` interactive (writes .env), `runConfig(deps, "github")` with token input (writes GH_TOKEN to .env, runs gh auth status to verify), `runConfig(deps, "github")` with Enter fallback (deletes process.env.GH_TOKEN, calls gh auth login --web via execSyncOverride), `runConfig(deps, "github")` when GH_TOKEN already set in .env and valid (skips prompting), `runConfig(deps, "github")` when GH_TOKEN already set but expired (detects via gh auth status failure, prompts for new token), `runConfig(deps, "github")` prompt includes token generation instructions with URL, no-TTY prompter (warns and skips without writing); (3) refactored doctor — all-green (mocked) path, missing-gh triggers `runInstallFixes`, missing-creds + TTY triggers `runConfig` with targeted sub-command ("llm" for LLM failure, "github" for GitHub auth failure), GitHub auth check with GH_TOKEN in env (passes without gh auth login), GitHub auth check without GH_TOKEN (checks gh auth status), missing-creds + no TTY prints "autodev config" message and exits clean, isFirstRun with no signals (returns true, welcome message), isFirstRun with auth.json creds (returns false, "fixing" message), isFirstRun with install-state steps (returns false), isFirstRun with .env OLLAMA_CLOUD_API_KEY (returns false), doctor re-runs health checks after module triggers; (4) CLI dispatch — `config` sub-command routing, `install`/`init` gone. Remove `@ts-nocheck` and all `as any` — use `as unknown as <Type>` or real `MockPrompter` instances.
  Must NOT do: Do not delete tests for `state.ts`/`env.ts`/`auth.ts`/`prompts.ts`. Do not add tests for project-level steps. Do not use `@ts-nocheck` or `as any`.
  Parallelization: Wave 4 | Blocked by: 3, 4, 5, 6 | Blocks: 8 | Can parallelize with: —
  References:
    - `extensions/autodev/installer/__tests__/installer.test.ts:1-785` — current file, to be rewritten.
    - `extensions/autodev/installer/install-module.ts` (todo 3) — test target.
    - `extensions/autodev/installer/config-module.ts` (todo 4) — test target.
    - `extensions/autodev/installer/doctor.ts` (after todo 5) — test target.
    - `extensions/autodev/orchestrator/cli.ts` (after todo 6) — test target.
  Acceptance criteria:
    - `bun test extensions/autodev/installer/__tests__/installer.test.ts` exits 0, all pass.
    - `bun test` (full suite) exits 0.
    - `grep -c "@ts-nocheck" extensions/autodev/installer/__tests__/installer.test.ts` returns 0.
    - `grep -c "as any" extensions/autodev/installer/__tests__/installer.test.ts` returns 0.
    - No test references `step1`-`step9`, `runInstallSteps`, `runInitSteps`, `handleInstall`, or `handleInit` (grep returns 0).
    - Test count ≥ 20 (covering state, env, auth, prompts, install-module fixes, config-module sub-commands, doctor gates, CLI dispatch).
  QA scenarios:
    - Happy: `bun test` green; evidence `.omo/evidence/task-7-installer-refactor.md` records pass count.
    - Failure: introduce a regression (make `runConfig` skip `.env` write) and confirm a test catches it; evidence records the failing test.
  Commit: Y | test(installer): rewrite suite for install-module + config-module architecture

- [x] 8. Dead-code sweep — delete `index.ts`, confirm zero references to removed symbols
  What to do: (a) Delete `extensions/autodev/installer/index.ts` UNCONDITIONALLY (it is fully orphaned after todo 6 removes the last import of `handleInstall`/`handleInit`, and todo 2/6 ported `resolveAuthPath`/`autoNonInteractive` into `scripts/cli.ts`). Do not check "if near-empty" — just delete it. (b) Delete `extensions/autodev/installer/steps.ts` — moved here from todo 3 to avoid breaking `bun test` between todos 3 and 7. After todo 7 rewrites the test file (removing all 17 imports from `steps.ts`), `steps.ts` is safe to delete. (c) Run a comprehensive grep sweep for every removed symbol and confirm zero hits in source (excluding `.omo/`). Symbols: `preinstall-guard`, `postinstall.ts`, `runInstallSteps`, `runInitSteps`, `INSTALL_STEPS`, `INIT_STEPS`, `INSTALL_STEP_NAMES`, `INIT_STEP_NAMES`, `handleInstall`, `handleInit`, `step0ExternalTools`, `step0bGhAuth`, `step1BunCheck`, `step2LlmCredentials`, `step3MagicContext`, `step4VoyageAi`, `step5Discord`, `step6GitHubLabels`, `step7KnowledgeBase`, `step8DocsRebuild`, `step9Doctor`, `isGlobalInstall`, `isFreshInstall`, `runInstall` (the export from `index.ts`), `runInit` (same). (d) Confirm `package.json` has no `preinstall`/`postinstall` keys, `scripts/preinstall-guard.ts` and `scripts/postinstall.ts` don't exist, `steps.ts` doesn't exist (deleted here), `index.ts` doesn't exist (deleted here). (e) Update JSDoc comments in `state.ts` (lines 6-14) to remove references to `autodev install` and `autodev init`, replacing with references to the new module names (install-module, config-module).
  Must NOT do: Do not delete `.omo/` artifacts. Do not delete test files. Do not remove references in `docs-corpus/` (immutable, out of scope). Do not delete `steps.ts` before todo 7 has rewritten the test file (the test file imports from `steps.ts` at 17 call sites — deleting prematurely breaks `bun test`).
  Parallelization: Wave 4 | Blocked by: 1-7 | Blocks: — | Can parallelize with: —
  References:
    - All files under `extensions/autodev/installer/` and `extensions/autodev/orchestrator/` and `scripts/`.
    - `test/import-check.ts` — may reference deleted files (`installer/index.ts`, `installer/steps.ts`). Verify and update if needed.
  Acceptance criteria:
    - `test ! -f extensions/autodev/installer/index.ts` succeeds (deleted).
    - `test ! -f extensions/autodev/installer/steps.ts` succeeds (deleted here, not in todo 3).
    - `test ! -f scripts/preinstall-guard.ts && test ! -f scripts/postinstall.ts` succeeds.
    - `grep -c "preinstall\|postinstall" package.json` returns 0.
    - Every symbol listed above returns 0 hits from `grep -rn "<symbol>" extensions/ scripts/ package.json` (excluding `.omo/`).
    - `bun test` exits 0. `bun run typecheck` exits 0. `bash -n install.sh` exits 0.
  QA scenarios:
    - Happy: all greps return 0, all commands green; evidence `.omo/evidence/task-8-installer-refactor.md` records the full sweep output.
    - Failure: if any symbol is still referenced, sweep reports it, fix is applied, then re-verified; evidence records what was found and fixed.
  Commit: Y | chore(installer): delete index.ts, final dead-code sweep

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE.
- [x] F1. Plan compliance audit — SKIPPED per user instruction.
- [x] F2. Code quality review — SKIPPED per user instruction.
- [x] F3. Agent-executable integration QA — SKIPPED per user instruction.
- [x] F4. Scope fidelity — SKIPPED per user instruction.

## Commit strategy
One commit per todo (8 commits). Conventional commits: `feat(installer):`, `refactor(installer):`, `test(installer):`, `chore(installer):`. All on the current working branch. No direct pushes to `main` without CI green (per AGENTS.md standing order 8).

## Success criteria
- `install.sh` is the documented and functional entry point for installation.
- `autodev doctor` is the orchestrator: it triggers the internal install module (no secrets) and the config module (all secrets) as needed, and is non-interactive-safe.
- `autodev config` is a standalone CLI command for secret entry.
- `autodev install` and `autodev init` are gone as CLI commands.
- No postinstall/preinstall auto-trigger exists.
- No project-level steps run during the machine phase.
- `bun test` and `bun run typecheck` pass.
- Zero references to removed symbols in source.