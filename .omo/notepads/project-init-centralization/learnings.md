# Project Init Centralization — Research Findings

## 1. `loadRegistry` / `saveRegistry` Call Sites (projectRoot argument audit)

### Definitions
- `extensions/autodev/orchestrator/projects.ts`
  - `loadRegistry(projectRoot?: string)` line 37
  - `saveRegistry(registry, projectRoot?: string)` line 56
  - `registryPath(projectRoot?: string)` line 28
  - `defaultRegistry(projectRoot?: string)` line 66

### Call sites passing `projectRoot`
- `extensions/autodev/orchestrator/__tests__/orchestrator.test.ts`
  - line 55: `loadRegistry(tmpDir)`
  - line 68: `loadRegistry(tmpDir)`
  - line 81: `saveRegistry(registry, tmpDir)`
  - line 82: `loadRegistry(tmpDir)`
  - line 287: `saveRegistry(registry, tmpDir)`
  - line 289: `loadRegistry(tmpDir)`

### Call sites with NO `projectRoot` argument (use `process.cwd()`)
- `scripts/cli.ts` line 237: `loadRegistry()`
- `extensions/autodev/orchestrator/cli.ts` line 202: `loadRegistry()`
- `extensions/autodev/orchestrator/heartbeat.ts` line 121: `loadRegistry()`

No production call site currently passes `saveRegistry`.

## 2. `autodev init` / `autodev config` routing

### CLI routing
- `scripts/cli.ts` lines 122-130 and 174-189 route `autodev config [sub]` into `extensions/autodev/installer/config-module.ts` `runConfig()`.
- `extensions/autodev/orchestrator/cli.ts` lines 72-189 do the same for the pi-extension command surface.
- Both compute `projectRoot = ctx.cwd ?? process.cwd()` and pass it to `runConfig`.
- `runConfig` only handles `llm`, `voyage`, `discord`, `github`. There is no `init` subcommand handler today.
- `extensions/autodev/installer/install-module.ts` `runInstallFixes` exists but is not wired to `autodev init` in `cli.ts`.
- `extensions/autodev/installer/state.ts` tracks install/config step completion in `.autodev/init-state.json` per project.

### Relevant modules
- `extensions/autodev/installer/config-module.ts`
- `extensions/autodev/installer/install-module.ts`
- `extensions/autodev/installer/state.ts`
- `extensions/autodev/installer/env.ts` (env path resolution)
- `extensions/autodev/installer/auth.ts`
- `extensions/autodev/installer/config-defaults.ts` (downloads `.pi/` files)
- `scripts/cli.ts`
- `extensions/autodev/orchestrator/cli.ts`

## 3. AGENTS.md / CONTEXT.md generation

### Current behavior
- `extensions/autodev/context.ts` **reads** `AGENTS.md`, `CONTEXT.md`, and `.autodev/memory/*.md` at `projectRoot`.
- It does **not** create them.
- There is no AutoDev-owned generator for these files; `/init-deep` is an OMO plugin skill, not part of this repo's runtime.

### Conclusion for `autodev init`
- If `autodev init` is expected to seed `AGENTS.md` / `CONTEXT.md`, it must either:
  1. Copy from `.autodev/reference/templates/`, or
  2. Generate inline fallbacks.

## 4. `.autodev/reference/templates/` status

- Directory does **not exist**.
- `.autodev/reference/` contains only:
  - `.autodev/reference/discord-setup.md`
  - `.autodev/reference/onboarding-protocol.md`
  - `.autodev/reference/README.md`
  - `.autodev/reference/workflow-specification.md`
- There is no `templates/` subtree and no template source for `AGENTS.md` / `CONTEXT.md`.
- If T7 seeds these files, either create `templates/` or generate inline fallback strings.

## 5. GitHub CLI label management (dedup + creation)

### Exact labels required by the AutoDev workflow
From `AGENTS.md` / `README.md` / `ARCHITECTURE.md`:

- `autodev-request`
- `autodev-planned`
- `autodev-in-progress`
- `autodev-review`
- `autodev-ready`
- `autodev-merged`
- `autodev-blocked`
- `autodev-rejected`

### Dedup strategy
1. List existing labels as JSON:
   ```bash
   gh label list --json name
   ```
2. Parse the JSON and compute missing names.
3. Create only missing labels:
   ```bash
   gh label create <name> --color <hex> --description "..."
   ```
   (Optionally use `--force` to update existing labels; this is what `code-review-flow.md` step 6 references.)

### Alternative idempotent path
`code-review-flow.md` line 64 documents: `gh label create --force` used in `steps.ts` 285-334, but `steps.ts` does not exist in this repo. Use `--force` only if updating colors/descriptions is desired; otherwise use list-then-create for dedup.

### Repo creation
```bash
# Create a new public repo under the authenticated user/org
gh repo create <owner>/<repo> --public --source=. --push

# Or create from a bare template
gh repo create <owner>/<repo> --public
```

## 6. Existing `gh` command helper

- `extensions/autodev/orchestrator/heartbeat.ts` has `ghExec(args: string[], cwd?: string)` (line ~160-185) which runs `gh` and returns stdout as a trimmed string.
- `extensions/autodev/autonomy/merge.ts` has a private `ghExec` helper as well (uses `execSync` with `cwd: projectRoot`).
- `extensions/autodev/installer/config-module.ts` uses `execSyncFn(deps, command, options)` which supports an injectable override.
- `extensions/autodev/installer/doctor.ts` runs `exec("gh auth status", ...)` directly.

### Recommendation
Reuse `heartbeat.ts`'s `ghExec` (or extract a shared helper) for `gh label list` / `gh label create` / `gh repo create` calls. It already handles argument arrays and cwd, which fits the project-root pattern used by the registry.

## 7. Registry / projectRoot removal impact

- Removing `projectRoot` from `loadRegistry`/`saveRegistry` means the registry will always resolve against `process.cwd()`.
- The only non-test call sites already use no argument, so production behavior is unchanged.
- Tests in `orchestrator.test.ts` must be updated to write/read from the test's own cwd (via `process.chdir(tmpDir)` or by using a path inside the registry data model instead of a parameter).
- `heartbeat.ts` passes `project.path` to `pollProject`, not to `loadRegistry`; this remains valid because each project is polled from its own directory.

## 8. Files to change for T7 (project init centralization)

- `extensions/autodev/orchestrator/projects.ts` — remove `projectRoot` parameter from public API.
- `extensions/autodev/orchestrator/__tests__/orchestrator.test.ts` — update registry tests to stop passing `tmpDir`.
- `scripts/cli.ts` — add `init` subcommand wiring to `runInstallFixes` / `runConfig` / registry / template generation / label setup.
- `extensions/autodev/orchestrator/cli.ts` — same for the pi-extension command surface.
- `extensions/autodev/installer/install-module.ts` — optionally extend with repo-create/label-create phases.
- New file (or inline): `AGENTS.md` / `CONTEXT.md` fallback generators, or create `.autodev/reference/templates/AGENTS.md.example` and `CONTEXT.md.example`.
# project-init-centralization learnings

## Global install filesystem layout for `autodev`

### Observed Bun behavior (Bun 1.3.14, macOS)

- **Global package root:** `~/.bun/install/global/`
- **Global node_modules:** `~/.bun/install/global/node_modules/`
- **Global bin dir:** `~/.bun/bin/`
- A global install of a package named `autodev` creates the directory/symlink:
  `~/.bun/install/global/node_modules/autodev -> <source>`

### Exact layout under `~/.bun/install/global/node_modules/autodev/`

When `autodev` is installed globally (whether from npm or via `bun link` from a
local directory), the package contents appear as real files/symlinks under that
directory. For the current repo, the relevant paths are:

```text
~/.bun/install/global/node_modules/autodev/
├── package.json                  # package manifest (includes pi.configDir = ".AutoDev")
├── scripts/
│   └── cli.ts                    # CLI entrypoint (global bin target)
├── .pi/
│   ├── settings.json
│   ├── magic-context.jsonc
│   ├── agents/
│   │   ├── aronnax.md
│   │   ├── boatswain.md
│   │   ├── conseil.md
│   │   ├── explore.md
│   │   ├── harbor-master.md
│   │   ├── metis.md
│   │   ├── momus.md
│   │   ├── navigator.md
│   │   ├── ned-land.md
│   │   ├── nemo.md
│   │   ├── oracle.md
│   │   ├── quartermaster.md
│   │   └── watch-officer.md
│   └── skills/
│       ├── autodev-deploy/SKILL.md
│       ├── autodev-implement/SKILL.md
│       ├── autodev-onboard/SKILL.md
│       ├── autodev-review/SKILL.md
│       └── autodev-triage/SKILL.md
├── .autodev/
│   ├── config/
│   │   ├── concurrency.yaml
│   │   ├── debate-protocol.yaml
│   │   ├── dispatch-rules.yaml
│   │   ├── fallback.json
│   │   ├── guardrails.yaml
│   │   ├── mcp.json
│   │   ├── models.json
│   │   ├── standing-orders.md
│   │   └── team-spec.json
│   ├── reference/
│   │   ├── README.md
│   │   ├── discord-setup.md
│   │   ├── onboarding-protocol.md
│   │   └── workflow-specification.md
│   └── templates/
│       ├── ADR-template.md
│       ├── autodev-delivery.md
│       ├── autodev-request.md
│       └── harbor-log.md
└── extensions/autodev/
    ├── context.ts
    ├── index.ts
    └── (all other extension submodules)
```

### Global install without publishing

A global install of the **local** package is possible without publishing using
`bun link`:

```bash
bun link          # in the local autodev repo
```

This creates:

```text
~/.bun/install/global/node_modules/autodev -> /path/to/local/autodev
```

`bun install -g .` inside the repo also works, but it appears to produce the
same symlink outcome (the global node_modules entry points to the local
source directory).

**Note:** `bun install -g autodev` from the registry will not work until the
package is actually published to the npm registry. `bun link` is the correct
local-emulation mechanism for T1.

### Files to symlink from central `~/.AutoDev/` to the global package

Per the project-init-centralization plan (T1), `config-defaults.ts` will create
symlinks in `~/.AutoDev/` pointing *into* the installed package directory. The
relevant source paths under the global package are:

| Central target (`~/.AutoDev/`) | Source under global package |
|---|---|
| `agent/settings.json` | `~/.bun/install/global/node_modules/autodev/.pi/settings.json` |
| `agents/*.md` (13 files) | `~/.bun/install/global/node_modules/autodev/.pi/agents/*.md` |
| `reference/` | `~/.bun/install/global/node_modules/autodev/.autodev/reference/` |
| `skills/` | `~/.bun/install/global/node_modules/autodev/.pi/skills/` |
| `agent/extensions/autodev` | `~/.bun/install/global/node_modules/autodev/extensions/autodev` |
| `config/*.yaml\|json\|md` (9 files) | `~/.bun/install/global/node_modules/autodev/.autodev/config/*` |

`magic-context.jsonc` is written as a real file in `~/.AutoDev/agent/`, not
symlinked, because it contains AutoDev-specific defaults.

### Emulation for tests

For T1 unit tests that do not require a real global install:

1. Create a temporary directory mirroring the global package layout (`.pi/`,
   `.autodev/`, `extensions/autodev/`).
2. Pass that directory as `packageRoot` to `validateAndCreateConfig()` (the
   `fetchOverride` parameter should be replaced by `packageRoot?: string`).
3. Verify symlinks are created in `~/.AutoDev/` pointing at the temp package
   directory.
4. On Windows or when symlink permission is unavailable, expect the copy fallback
   with the documented warning.

### Key takeaways

- The exact global install path is deterministic:
  `~/.bun/install/global/node_modules/autodev/`.
- `bun link` is sufficient to emulate `bun install -g autodev` for local
  development and CI tests; no npm publish is required for T1.
- A real `bun install -g autodev` from the registry requires the package to be
  published, which is out of scope for this plan per Decision #12.

# project-init-centralization learnings

## `getAgentDir()` behavior with `pi.configDir`

Date: 2026-06-23

### Findings

- `getAgentDir()` is exported from `@earendil-works/pi-coding-agent`.
- It does **NOT** read the current project's `package.json`. It reads the SDK's own `package.json` (`node_modules/@earendil-works/pi-coding-agent/package.json`) at module-load time.
- That SDK `package.json` contains:
  ```json
  "piConfig": {
    "configDir": ".pi"
  }
  ```
- Therefore `CONFIG_DIR_NAME` is hardcoded to `.pi` by the installed SDK.
- `getAgentDir()` returns `join(homedir(), CONFIG_DIR_NAME, "agent")`.
- On this machine (macOS, user `djtchill`) the result is `/Users/djtchill/.pi/agent`.

### Test results

1. Baseline (current `package.json`, no `pi.configDir`):
   - `getAgentDir()` -> `/Users/djtchill/.pi/agent`

2. With `pi.configDir: ".AutoDev"` added to the **project** `package.json`:
   - `getAgentDir()` -> `/Users/djtchill/.pi/agent` (unchanged)

### Conclusion

- Adding `pi.configDir` to the **project** `package.json` is **not honored** by the SDK's `getAgentDir()`.
- The only way to change the config dir is via the SDK's own `package.json` (not feasible for consumers) or via the env override `PI_CODING_AGENT_DIR`.
- The path is always an absolute path (`/Users/<user>/.pi/agent`), never a tilde path (`~/.pi/agent`).
- There is **no existing `~/.AutoDev/` directory** on this machine.
- `~/.pi/agent/` exists and currently contains only `auth.json`.

### Impact on project-init-centralization

The branch's assumption that centralized paths resolve via `getAgentDir()` from the SDK is correct, but the assumption that we can point them at `~/.AutoDev/agent/` by setting `pi.configDir` in the project's `package.json` is **false**. If we want AutoDev to use `~/.AutoDev`, we need a different mechanism (e.g. env override, wrapping path resolution, or a custom config helper).

### Verification notes

- `bun run typecheck` passes both before and after adding `pi.configDir` to the project's `package.json`.
- `bun test` shows the same pre-existing failure (`doctor detects missing agent files`) with and without `pi.configDir`. Adding `pi.configDir` does not introduce new failures.

# project-init-centralization learnings

## `getAgentDir()` behavior with `pi.configDir`

Date: 2026-06-23

### Findings

- `getAgentDir()` is exported from `@earendil-works/pi-coding-agent`.
- It does **NOT** read the current project's `package.json`. It reads the SDK's own `package.json` (`node_modules/@earendil-works/pi-coding-agent/package.json`) at module-load time.
- That SDK `package.json` contains:
  ```json
  "piConfig": {
    "configDir": ".pi"
  }
  ```
- Therefore `CONFIG_DIR_NAME` is hardcoded to `.pi` by the installed SDK.
- `getAgentDir()` returns `join(homedir(), CONFIG_DIR_NAME, "agent")`.
- On this machine (macOS, user `djtchill`) the result is `/Users/djtchill/.pi/agent`.

### Test results

1. Baseline (current `package.json`, no `pi.configDir`):
   - `getAgentDir()` -> `/Users/djtchill/.pi/agent`

2. With `pi.configDir: ".AutoDev"` added to the **project** `package.json`:
   - `getAgentDir()` -> `/Users/djtchill/.pi/agent` (unchanged)

### Conclusion

- Adding `pi.configDir` to the **project** `package.json` is **not honored** by the SDK's `getAgentDir()`.
- The only way to change the config dir is via the SDK's own `package.json` (not feasible for consumers) or via the env override `PI_CODING_AGENT_DIR`.
- The path is always an absolute path (`/Users/<user>/.pi/agent`), never a tilde path (`~/.pi/agent`).
- There is **no existing `~/.AutoDev/` directory** on this machine.
- `~/.pi/agent/` exists and currently contains only `auth.json`.

### Impact on project-init-centralization

The branch's assumption that centralized paths resolve via `getAgentDir()` from the SDK is correct, but the assumption that we can point them at `~/.AutoDev/agent/` by setting `pi.configDir` in the project's `package.json` is **false**. If we want AutoDev to use `~/.AutoDev`, we need a different mechanism (e.g. env override, wrapping path resolution, or a custom config helper).

### Verification notes

- `bun run typecheck` passes both before and after adding `pi.configDir` to the project's `package.json`.
- `bun test` shows the same pre-existing failure (`doctor detects missing agent files`) with and without `pi.configDir`. Adding `pi.configDir` does not introduce new failures.


# project-init-centralization learnings

## T2 — `loadAgent` / `listAgentNames` / `loadAgentFallbackChains` centralization

Date: 2026-06-23

### What changed

- `extensions/autodev/delegation/agents.ts` and `extensions/autodev/background/fallback.ts` now resolve agent Markdown files via `join(getAgentDir(), "..", "agents")` instead of `resolve(projectRoot, ".pi/agents")`.
- `getAgentDir()` is imported from `@earendil-works/pi-coding-agent` (already a dependency; re-exported from `dist/config.js`).
- `projectRoot` parameter kept on all three public functions for API compatibility but prefixed `_projectRoot` to mark unused. Call sites in `executor.ts` (line 194) and `delegation/index.ts` (line 37, passes `ctx.cwd`) are unchanged.

### Test isolation pattern

- `getAgentDir()` reads `PI_CODING_AGENT_DIR` from `process.env` on every call (not module load), so tests can redirect resolution per-test without dynamic imports.
- Set `PI_CODING_AGENT_DIR = join(tempRoot, "agent")` in `beforeEach`; plant agent fixtures at `join(tempRoot, "agents", "<name>.md")`. The sibling `agents/` dir is what `join(getAgentDir(), "..", "agents")` resolves to.
- Restore/delete the env var in `afterEach` to avoid cross-test leakage. Save the prior value (`savedEnv = process.env["PI_CODING_AGENT_DIR"]`) and either delete it (if `undefined` originally) or restore it.
- Existing `test/delegation.test.ts` was updated with this pattern; its `writeAgent` helper now writes to `join(projectRoot, "agents")` instead of `join(projectRoot, ".pi", "agents")`.

### Pre-existing test debt flagged (not T2 scope)

- `test/delegation.test.ts` is 414 pure LOC — over the 250 LOC ceiling. It is the T9 delegation suite and was already oversized before T2. Splitting it is T9-owner work, not in scope for T2 (MUST NOT: touch files outside the two modules, their tests, and evidence).
- `test/doctor.test.ts` "doctor detects missing agent files" fails on baseline (pre-existing, documented above). The doctor module checks `.pi/agents` directly and is out of T2 scope.

### Conclusion

- Agent resolution is now centralized via `getAgentDir()` from the SDK.
- The env override `PI_CODING_AGENT_DIR` is the only test-time redirection mechanism; `pi.configDir` in a project `package.json` is NOT honored by the SDK (confirmed in earlier section).
- When T1 creates `~/.AutoDev/agent/` and symlinks `~/.AutoDev/agents/` → global package `.pi/agents/`, these loaders will pick up the centralized agents automatically with no further code change, because `getAgentDir()` will return `~/.AutoDev/agent/` (via `PI_CODING_AGENT_DIR` set by T1's env wiring) and `join(.., "agents")` resolves to `~/.AutoDev/agents/`.

# T1 Implementation Learnings

Date: 2026-06-23

## What changed

- `install.sh`: exports `PI_CODING_AGENT_DIR="$HOME/.AutoDev/agent"` for the current session, persists to `~/.zshrc`/`~/.bashrc`/`~/.profile` (detected via `$BASH_VERSION`/`$ZSH_VERSION`), and adds `set -gx` to `~/.config/fish/config.fish` when fish is installed.
- `extensions/autodev/installer/config-defaults.ts`: rewrote `validateAndCreateConfig` from GitHub-raw downloads to symlink creation from the global npm package (`~/.bun/install/global/node_modules/autodev/`). Removed `fetchOverride`. Added optional `packageRoot` (tests) and `ValidateAndCreateConfigOverrides.symlinkOverride` (EPERM simulation). Writes `magic-context.jsonc` as a real file with AutoDev defaults. Windows/EPERM fallback uses `fs.cpSync` with a warning detail.
- `extensions/autodev/installer/doctor.ts` and `install-module.ts`: replaced `fetchOverride` field with `packageRoot` field; `validateAndCreateConfig` now called with `packageRoot` only.
- New tests: `extensions/autodev/installer/__tests__/config-defaults.test.ts` (6 tests covering env var baseline, env var override, happy-path symlinks, missing source, idempotency, EPERM copy fallback).
- Updated `test/doctor.test.ts` to use the new `packageRoot` DI and `PI_CODING_AGENT_DIR` env var (no more `.pi/` file scaffolding in the project dir — symlinks come from the mock package).

## Key decisions

- `linkOrCopy` returns a `copied` flag so multi-file call sites (agents, config) can surface the `COPY_FALLBACK_WARNING` instead of a generic "symlinked" detail.
- `detailFor(r, createdMsg)` helper preserves the copy-fallback warning when `linkOrCopy` fell back to copying; single-file call sites use it directly.
- `centralHome = join(agentDir, "..")` — the central home is the parent of the agent dir. When `PI_CODING_AGENT_DIR=~/.AutoDev/agent`, centralHome is `~/.AutoDev/`. When unset, centralHome is `~/.pi/`.
- `ConfigCheckResult` interface is unchanged (name/ok/detail/created) so callers like `doctor.ts` don't need a type change beyond the signature.

## Gotchas

- `getAgentDir()` is cached at module load — setting `PI_CODING_AGENT_DIR` after import does NOT change its return value in the same process if the SDK module was already imported elsewhere. Tests set the env var before `import("../config-defaults.js")` to ensure fresh resolution. (Confirmed: the SDK reads `process.env[ENV_AGENT_DIR]` on each call, not at module load — but `CONFIG_DIR_NAME` is a module-level const. The env var path is read live.)
- The pi SDK's `CONFIG_DIR_NAME` is hardcoded from its own `package.json` (`pkg.piConfig?.configDir || ".pi"`), so `pi.configDir` in the consuming project's `package.json` is ignored. `PI_CODING_AGENT_DIR` is the only override path.
- `symlinkSync(target, path, type)` — the `type` arg ("dir"/"file"/"junction") is only required on Windows. On macOS it's accepted but ignored. Passing it unconditionally is safe.

## Verification

- `bun test`: 489 pass, 0 fail.
- `bun run typecheck`: tsc --noEmit EXIT 0.

# T6 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/installer/config-module.ts`: `handleDiscord` confirm prompt rewritten to embed a 7-step Discord bot setup walkthrough (Developer Portal → New Application, Bot tab → Reset Token, Message Content Intent, OAuth2 URL Generator with bot scope + Send Messages/Read Message History perms, invite bot, enable Developer Mode, Copy channel ID) and a pointer to `~/.AutoDev/reference/discord-setup.md`. Confirm default remains `false` (skip). Env-writing logic unchanged.
- New test file `extensions/autodev/installer/__tests__/config-module.test.ts` (6 tests): happy, skip, no-TTY, already-configured, walkthrough-text presence, confirm-defaults-false.

## Key decisions

- The 7-step walkthrough lives in the **confirm** prompt text (not a separate `prompt` call), so the user sees the full setup guide before deciding whether to proceed. This mirrors `handleGithub`, which embeds its PAT-generation steps in the `prompt` text. Discord's flow is a yes/no first (do you want to set up?), so the walkthrough belongs on the confirm.
- `MockPrompter` discards the question text (`_question`), so the walkthrough-presence test uses a custom recording prompter that captures the `confirm` and `prompt` question strings and asserts `toContain` for each of the 7 steps + the reference pointer.
- The no-TTY test uses a custom prompter (`confirm → true`, `prompt → ""`) rather than `MockPrompter`, because `MockPrompter.confirm` returns the default when the answer queue is empty, and the Discord confirm default is `false` — which would skip before reaching the token prompt. The real `createNoTtyPrompter.confirm` returns `defaultYes` (so it would also skip for Discord). The no-TTY **warning** path is only reachable when confirm passes but the token prompt returns empty — e.g. a partially-interactive terminal. The test pins that branch.

## Gotchas

- `agentEnvPath(deps)` = `join(dirname(deps.authPath), ".env")`. Tests must create `authPath` inside a subdirectory (e.g. `<tmp>/agent/auth.json`) so the `.env` lands at `<tmp>/agent/.env`, not `<tmp>/.env`.
- `markStepCompleted` for `STEP_DISCORD=5` uses `scope="config"` (the `CONFIG_SCOPE` constant). Tests that pre-mark the step must pass `"config"` as the scope, not the default `"install"`.
- The pre-existing `bun run typecheck` has errors in `install-module.ts`, `doctor.ts`, and `tools.ts` (unrelated to T6). T6's changed files (`config-module.ts`, `config-module.test.ts`) produce zero typecheck errors.

## Verification

- `bun test extensions/autodev/installer/__tests__/config-module.test.ts`: 6 pass, 0 fail.
- `bun run typecheck`: no errors referencing config-module files.

# T3 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/installer/install-module.ts`: removed Phase 5 (`runMagicContextDoctorPhase`), removed `hasMagicContextHarnessPi` + `stripJsonc` helpers (the JSONC parser was only used by the harness-pi pre-check, which Decision #14 replaces with a simple file-existence check). `runInstallFixes` now returns exactly 3 results: `tools`, `config-files`, `magic-context-setup`. MC setup uses `pi install npm:@cortexkit/pi-magic-context` (non-interactive) with `cwd: getAgentDir()` instead of the prior `bunx @cortexkit/magic-context@latest setup --harness pi` wizard with `cwd: projectRoot`. Added a self-heal fallback: if `magic-context.jsonc` is missing from the agent dir at MC-phase time, it writes `DEFAULT_MAGIC_CONTEXT_JSONC` before registration.
- New test file `extensions/autodev/installer/__tests__/install-module.test.ts` (5 tests): 3-result happy path, cwd-is-agent-dir + no-wizard, exec-throws failure, self-heal, getAgentDir fallback.

## Key decisions

- **Decision #14 implementation:** the MC pre-check is now "does `join(getAgentDir(), "magic-context.jsonc")` exist?" — no JSONC parsing, no `harness: "pi"` detection. T1's `validateAndCreateConfig` writes the defaults; T3 just verifies (and self-heals if missing). This removes ~62 LOC of `stripJsonc` + `hasMagicContextHarnessPi` that had no other caller.
- **Self-heal fallback:** if T1's config phase somehow didn't write `magic-context.jsonc` (partial failure, manual deletion), the MC phase writes `DEFAULT_MAGIC_CONTEXT_JSONC` directly rather than failing. This keeps the install resilient without re-introducing the interactive wizard. The self-heal write is early-returned on failure (does not attempt `pi install` if the config file can't be written).
- **`execSyncOverride` dual-purpose:** the same override serves both `installMissingTools` (Phase 1, expects `ExecFn` returning `string`) and `execFn` (Phase 3 MC install, expects a function returning `Buffer`). Tests pass a single `makeRecordingExec` returning `Buffer.from("")` — tools.ts ignores the return value, install-module wraps it. The `as never` cast on line 122 bridges the type mismatch in production.

## Gotchas

- **Sibling-task typecheck debt:** the branch carries incomplete T4 `doctor.ts` work (references `reopenTty`/`reopenTtyOverride` without importing `tty.ts`). This produces 2 `tsc` errors in `doctor.ts:161` and 2 test failures in `doctor-orchestrator.test.ts`. These are **not T3-introduced** — reverting only `doctor.ts` + `tools.ts` to HEAD makes `bun run typecheck` exit 0 with T3's `install-module.ts` in place. T3 MUST NOT touch `doctor.ts`, so this debt is left for T4 to resolve.
- **File at the 250-LOC ceiling:** `install-module.ts` is exactly 250 lines after the refactor (was 314). The removal of `stripJsonc` (42 LOC) + `hasMagicContextHarnessPi` (12 LOC) + `runMagicContextDoctorPhase` (21 LOC) offset the added self-heal block. If the next edit adds lines, the file must be split first per the 250-LOC rule. Candidate split: extract `runToolsPhase` + `runConfigFilesPhase` into a `phases.ts`, leaving `runInstallFixes` + `runMagicContextSetupPhase` + `execFn` in `install-module.ts`.
- **`getAgentDir()` reads `PI_CODING_AGENT_DIR` live** (confirmed in T2 learnings) — tests set the env var in `try/finally` with save/restore and don't need dynamic imports. The fallback test (env unset) cleans up the `magic-context.jsonc` it writes to the real `~/.pi/agent` to avoid polluting the dev machine.
- **`MC_INSTALL_CMD` vs `MC_SETUP_CMD`:** the constant was renamed from `MC_SETUP_CMD`/`MC_DOCTOR_CMD` to `MC_INSTALL_CMD`. Any external importer of these constants (none found in the repo) would break — they were not exported, so this is safe.

## Verification

- `bun test extensions/autodev/installer/__tests__/install-module.test.ts`: 5 pass, 0 fail.
- `bun run typecheck` (T3-isolated, sibling files reverted): EXIT 0.
- Evidence: `.omo/evidence/project-init-centralization/t3-install-module-happy.md`, `t3-install-module-failure.md`.

# T5 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/installer/tools.ts`: added `detectPackageManager(notify?, execOverride?)`, `installPackageManager(plat, notify?, execOverride?)`, `PackageManagerDetectionResult` interface, and PM pre-check inside `installMissingTools`. Refactored `commandExists` into `commandExists` (public, real exec) + `commandExistsWith(cmd, exec)` (internal, accepts execOverride) so `installMissingTools` threads the test execOverride through gh/git/bun presence checks.
- New tests: `extensions/autodev/installer/__tests__/tools.test.ts` (10 tests: detect happy/fail for each PM candidate, installMissingTools PM pre-check happy + failure, installPackageManager per-platform darwin/linux/win32 + `--yes` flag).
- Evidence: `.omo/evidence/project-init-centralization/t5-pm-detect-happy.md`, `t5-pm-detect-failure.md`.

## Key decisions

- `PM_CANDIDATES = ["brew", "apt-get", "winget"]` — ordered tuple, first `command -v` hit wins. brew > apt-get > winget priority matches the existing `installTool` branch order (darwin → linux → win32).
- `isNonInteractive()` checks three signals: `CI` env var, `stdout.isTTY === false`, and `--yes`/`-y` in `process.argv`. This covers CI runners, piped stdin, and explicit user opt-in.
- win32 is intentionally non-scriptable: winget ships via the App Installer Store package and cannot be bootstrapped from a shell. `installPackageManager` returns `{ installed: false }` with a Settings instruction instead of attempting an exec that would always fail.
- `installMissingTools` aborts early (returns only the failed PM result) when bootstrap fails — no point attempting `brew install gh` when brew itself didn't install.
- `commandExists` refactor: the public export keeps its old signature `(cmd: string) => boolean` for backward compat. The new `commandExistsWith(cmd, exec)` is module-private and used inside `installMissingTools` so the test execOverride applies to presence checks too. Without this, tests that mock `gh --version` in execOverride never took effect because `commandExists` called real `execSync`.

## Gotchas

- Pre-existing uncommitted dirty changes in `doctor.ts` and `install-module.ts` (from a prior task, likely T3/T4) introduce 2 typecheck errors (`reopenTty` / `reopenTtyOverride` undefined). These are NOT caused by T5 — confirmed by stashing only `tools.ts` and observing the same doctor.ts errors. They are out of T5 scope (MUST NOT touch files outside tools.ts, its tests, and evidence).
- `process.stdout.isTTY` can be `undefined` (not just `false`) in some runtimes; guard with `process.stdout != null && process.stdout.isTTY === false`.
- `process.argv` includes the bun executable and script path; checking `includes("--yes")` is safe because user flags appear after the script name.
- Test file uses `// @ts-nocheck` at the top (matching the pattern in `installer.test.ts` and `config-defaults.test.ts`) because `bun:test` mock types are complex for strict mode. This is the established convention in this `__tests__/` directory.

## Verification

- `bun test extensions/autodev/installer/__tests__/tools.test.ts`: 10 pass, 0 fail.
- `bun test` (full suite): 517 pass, 0 fail.
- `bun run typecheck`: 0 new errors from T5 changes (pre-existing doctor.ts errors unchanged).
- Pure LOC: `tools.ts` 199 (healthy), `tools.test.ts` 200 (warning band edge, one cohesive SUT).

# T15 — /dev/tty reopen for doctor-to-config interactive transition

Date: 2026-06-23

## What changed

- New `extensions/autodev/installer/tty.ts` exports `reopenTty(deps)` and
  `withReopenedTty(deps, fn)`. It opens `/dev/tty` (Unix) or `\\.\CONIN$`
  (Windows) via `openSync(..., "r+")`, creates read/write streams from the fd,
  builds a readline interface, and returns a `Prompter` via
  `createPrompterFromRl`. Returns `null` on any failure (no controlling
  terminal, CI, stream-creation error).
- `doctor.ts` orchestrator-mode non-interactive branch now calls
  `reopenTty(deps.reopenTtyOverride)` before falling back to the warn-and-skip
  path. On success it runs `runConfig` with the reopened prompter; on `null`
  it emits the existing warning.
- `DoctorDeps.reopenTtyOverride?: ReopenTtyDeps` added for test injection.
- `ReopenTtyDeps.prompterOverride?: Prompter` lets doctor integration tests
  inject a `MockPrompter` directly, bypassing stream/interface creation.
- New tests: `__tests__/tty.test.ts` (5 unit tests), `__tests__/doctor-orchestrator.test.ts` (2 integration tests).

## Key decisions

- `reopenTty` is a standalone helper (not inlined in `prompts.ts`) because the
  `/dev/tty` reopen logic is orthogonal to prompter construction — `prompts.ts`
  already had a private `createTtyPrompter` doing similar work, but doctor
  needs the `null`-on-failure signal to decide between "run config" and
  "warn and skip". The helper returns `null` (not a no-op prompter) so the
  caller can branch.
- `prompterOverride` in `ReopenTtyDeps` is the test seam: after `openSync`
  succeeds, if `prompterOverride` is set, `reopenTty` returns it directly
  instead of creating streams. This avoids needing to fake the readline
  layer in doctor integration tests.
- Windows `\\.\CONIN$` raw-mode may throw EPERM; config prompts only use
  `rl.question()` (line mode), so this is acceptable per the task spec.

## Coordination with T4

- T4 (parallel task) added a 10th health check (`runMagicContextCheck`) to
  `doctor.ts` in the same uncommitted working tree. The two changesets are
  in different sections of the file (T4: lines 14-93 + line 404; T15: import
  line, DoctorDeps field, orchestrator non-interactive branch lines 242-268).
  No conflict.
- Pre-existing test failure: `test/doctor.test.ts` "doctor passes all checks
  on a fully configured machine" fails because T4's `runMagicContextCheck`
  shells out to `bunx @cortexkit/magic-context@latest doctor` but the test's
  `STUB_EXEC` doesn't handle that command. This is T4's test debt (T4 must
  update `STUB_EXEC`), NOT T15's. T15 must not touch health-check code per
  task constraints.

## Verification

- `bun test extensions/autodev/installer/__tests__/tty.test.ts`: 5 pass, 0 fail.
- `bun test extensions/autodev/installer/__tests__/doctor-orchestrator.test.ts`: 2 pass, 0 fail.
- `bun run typecheck`: tsc --noEmit exit 0.
- `bun test` (full suite): 516 pass, 1 fail (the T4 pre-existing failure described above).

# T4 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/installer/doctor.ts`: added a 10th standing health check named `"Magic Context"` that shells out to `bunx @cortexkit/magic-context@latest doctor` (same `exec` pattern as the Bun/gh checks, with `encoding: "utf-8"`, `stdio: "pipe"`, `timeout: 30_000`). On first failure it calls the new exported helper `writeMagicContextDefaults(getAgentDir())` (which writes the T1 `DEFAULT_MAGIC_CONTEXT_JSONC` block as a real file) and retries the doctor once.
  - First success → `ok: true, detail: "healthy"`.
  - First fail → write defaults → retry success → `ok: true, detail: "healthy (after defaults written)"`.
  - Both attempts fail → `ok: false, detail: "MC doctor failed after retry: <error>"`.
  - Defaults write itself fails → `ok: false, detail: "MC doctor failed; defaults write failed: ...; first error: ..."` (retry skipped).
- `runHealthChecks` JSDoc updated to say "10 health checks" and enumerate `Magic Context` as the 10th.
- `test/doctor.test.ts`: updated the "passes all checks" test to expect the 14-entry checks array (13 from `validateAndCreateConfig` + `Magic Context`), and added 4 new tests: happy path, first-fail-then-succeed (asserts the written file equals `DEFAULT_MAGIC_CONTEXT_JSONC` byte-for-byte), double-fail (asserts the `MC doctor failed after retry` detail), and a direct unit test of `writeMagicContextDefaults`.

## Key decisions

- **Reuse T1's `DEFAULT_MAGIC_CONTEXT_JSONC`** from `magic-context-defaults.ts` rather than duplicating the JSONC string. Single source of truth.
- **`writeMagicContextDefaults` is exported** so T15 (doctor orchestrator mode) and future callers can invoke it directly without re-implementing the write.
- **The MC check uses `getAgentDir()` from the pi SDK** (already imported in T1's `config-defaults.ts`) to resolve the central agent dir, honoring `PI_CODING_AGENT_DIR`. This is consistent with how the rest of the centralization wave resolves paths.
- **The check is appended after `validateAndCreateConfig` results**, so the `magic-context.jsonc` config-defaults check (which may write the file on first run) runs before the MC doctor. This means on a fresh install the MC doctor's first attempt may already succeed because config-defaults wrote the file — the retry path is for the case where the file exists but is misconfigured/empty.
- **Test stub `makeMcExecStub`** controls MC doctor behavior via a mutable call counter array, so first and second invocations can fail or succeed independently. Non-MC commands always succeed in the stub.

## Gotchas

- **`validateAndCreateConfig` writes `magic-context.jsonc` too** (via `writeMagicContext` in `config-defaults.ts`). So on a fully-configured machine, the file already exists before the MC check runs. The happy-path test originally asserted the file does NOT exist after a successful first attempt — that assertion was wrong because config-defaults wrote it earlier in the same `runDoctor` call. Fixed to assert it exists.
- **`doctor.ts` is now 361 pure LOC** (was 295 before T4, already over the 250 ceiling). T4's MUST NOT constraint ("Do NOT touch files outside `doctor.ts`, its tests, and evidence") forbids the recommended split. The pre-existing smell is carried; a follow-up should extract `runMagicContextCheck` + `writeMagicContextDefaults` + `tryMcDoctor` into a sibling `magic-context-check.ts` module. Flagged here so it is not lost.
- **`makeMcExecStub` type signature** needed `readonly ("ok" | "fail")[]` (not `"ok" | "fail"[]`) to satisfy `noUncheckedIndexedAccess` + the union element type. Without `readonly`, TS parses the union as `"ok" | ("fail"[])`.

## Verification

- `bun run typecheck`: tsc --noEmit EXIT 0.
- `bun test test/doctor.test.ts`: 12 pass, 0 fail.
- `bun test` (full suite): 521 pass, 0 fail.

# T7 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/orchestrator/projects.ts`: removed the `projectRoot?: string` parameter from `registryPath`, `loadRegistry`, and `saveRegistry`. Imported `getAgentDir` from `@earendil-works/pi-coding-agent`. The registry now resolves to `join(getAgentDir(), "..", "projects.json")` — i.e. `~/.AutoDev/projects.json` when `PI_CODING_AGENT_DIR` is set (T1's env wiring). `saveRegistry` still creates the central dir via `mkdir(join(path, ".."), { recursive: true })`. `defaultRegistry(projectRoot?)` is unchanged — it keeps the optional `projectRoot` for deriving name/repo from cwd.
- `extensions/autodev/orchestrator/__tests__/orchestrator.test.ts`: added a `beforeEach`/`afterEach` pair that saves, sets, and restores `PI_CODING_AGENT_DIR` to `join(tmpDir, "agent")` so `getAgentDir()` resolves into the test's temp tree (matching the T2/T3/T5 pattern). 4 registry tests rewritten for the machine-level path (no `projectRoot` arg). Multi-project test updated to drop `tmpDir` arg. 2 new tests: "saveRegistry writes machine-level file and creates missing dir" and "saveRegistry creates the central dir when it does not exist" (deeply nested path).
- Evidence: `.omo/evidence/project-init-centralization/t7-registry-happy.md`, `t7-registry-failure.md`.

## Key decisions

- **`registryPath()` is now zero-arg.** The old `DEFAULT_REGISTRY_PATH` relative constant was removed entirely; the path is always computed from `getAgentDir()`. This is the same resolution pattern T2 used for agent Markdown files (`join(getAgentDir(), "..", "agents")`).
- **`defaultRegistry` keeps `projectRoot`.** The task spec said "keep `projectRoot` for deriving name/repo from cwd" — `guessProjectName` and `guessRepo` both take a `cwd` string, so the parameter is still meaningful even though it no longer affects where the file is read from / written to.
- **`mkdir` parent is `join(path, "..")`, not `dirname(path)`.** Both work, but `join(path, "..")` matches the pre-existing pattern in `saveRegistry` and is consistent with how the central home is derived elsewhere (`centralHome = join(agentDir, "..")` in T1).
- **Test isolation via `PI_CODING_AGENT_DIR`, not `process.chdir`.** `chdir` would pollute other tests in the same file (heartbeat, CLI) that depend on `process.cwd()`. Redirecting `getAgentDir()` via the env var is surgical and restored in `afterEach`.

## Gotchas

- **`getAgentDir()` reads `PI_CODING_AGENT_DIR` live** (confirmed in T2 learnings), so the `beforeEach` env-var set takes effect immediately — no dynamic import needed. The `import("../projects.js")` inside each test re-evaluates the module, but even a cached import would see the new env value because `getAgentDir()` reads it on each call.
- **Pre-existing unused imports removed.** The old `projects.ts` imported `existsSync` from `node:fs` and `resolve` from `node:path` but never used them. The refactor dropped both. `tsc --noEmit` exit 0 confirms no unused-import errors.
- **No production caller needed updating.** `scripts/cli.ts`, `extensions/autodev/orchestrator/cli.ts`, and `extensions/autodev/orchestrator/heartbeat.ts` all already called `loadRegistry()` with no argument (confirmed in the notepad's call-site audit). Only the test file passed `tmpDir` and that was updated.
- **`orchestrator.test.ts` is now 326 pure LOC** (was 295). The file is over the 250-LOC ceiling. The pre-existing smell is carried — T7's MUST NOT constraint ("Do NOT touch files outside projects.ts, its tests, and evidence") forbids the split. Candidate split for a follow-up: extract the registry tests into `__tests__/projects.test.ts` and keep dispatch/heartbeat/CLI tests in `orchestrator.test.ts`.

## Verification

- `bun test extensions/autodev/orchestrator/__tests__/orchestrator.test.ts`: 20 pass, 0 fail.
- `bun test` (full suite): 522 pass, 0 fail.
- `bun run typecheck`: tsc --noEmit EXIT 0.

# T8 Implementation Learnings

Date: 2026-06-23

## What changed

- New file `extensions/autodev/installer/init-module.ts` implements `runInit(deps: InitModuleDeps): Promise<InstallFixResult[]>` for `autodev init` steps 1-5:
  - Step 1: Create 9 `.autodev/` subdirs (evidence, decisions, work-items, debates, embeddings, research, memory, plans, scripts). NOT config/skills/reference (centralized via symlinks by T1).
  - Step 2: Copy 4 templates (ADR-template.md, autodev-delivery.md, autodev-request.md, harbor-log.md) from the central package (default `~/.bun/install/global/node_modules/autodev/.autodev/templates/`, overridable via `deps.packageRoot`) into `.autodev/templates/`.
  - Step 3: Create `.github/ISSUE_TEMPLATE/` and copy `autodev-request.md` from `.autodev/templates/`.
  - Step 4: Write `.autodev/project` marker JSON `{name, path, repo}` (repo from `git remote get-url origin` via `execSyncOverride`).
  - Step 5: Create 5 `.omo/` subdirs (plans, evidence, rules, drafts, notepads).
- New test file `extensions/autodev/installer/__tests__/init-module.test.ts` (5 tests: happy, failure, resume, idempotent re-run, marker JSON shape).

## Key decisions

- **Steps 1-3 share state step 6 ("structure").** Step 6 is only marked complete when ALL three structure steps succeed. A partial failure (e.g. step 2 fails because the package templates dir is missing) leaves step 6 unmarked, so the next `runInit()` retries the full structure phase. This matches the plan's Decision #8 (idempotency/resume via state.ts).
- **Step 5 uses state step 7 ("omo").** Independent of step 6 — omo creation succeeds or fails on its own. If step 6 passed but step 5 failed, re-running init skips steps 1-3 (already done) and retries only step 5.
- **Step 4 (marker) has NO dedicated state step.** It's an idempotent write that runs on every invocation (unless the fast-path short-circuits). This is correct because the marker JSON can change (repo URL updated, cwd moved) and re-writing it is harmless.
- **Fast path:** if `.autodev/project` exists AND state steps 6+7 are both complete, `runInit()` returns a single `{ok: true, detail: "already initialized"}` result without running any step. This avoids redundant `mkdirSync`/`cpSync` calls on repeat invocations.
- **`InitModuleDeps` reuses `InstallFixResult` from `install-module.ts`.** Same `{name, ok, detail}` shape — keeps the result type consistent across install and init lifecycles. Imported as a type-only import to avoid pulling the install module's runtime side effects.
- **`execSyncOverride` is threaded through to `guessRepo()`** (step 4 repo detection) so tests can mock `git remote get-url origin` without shelling out. The same override will be used by T9/T10 for `gh` commands.

## Gotchas

- **Step 3 cascades from step 2.** If step 2 fails (package templates dir missing), `autodev-request.md` is never copied into `.autodev/templates/`, so step 3's source file check fails. This is intentional — step 3 depends on step 2's output. The test asserts both fail; the failure evidence documents this cascade.
- **`basename(projectRoot)` for the marker name.** The plan says `<dir-name>` — `basename` of the project root gives the directory name. `guessProjectName` in `projects.ts` does the same (`cwd.split("/").filter(Boolean).pop()`). Consistent.
- **`readState` is imported from `state.js` in the test** to verify state steps were recorded. The test file uses `// @ts-nocheck` (matching the established `__tests__/` convention) so the `any` casts on result objects don't trip strict mode.
- **`packageRoot` default.** When `deps.packageRoot` is undefined, `defaultPackageRoot()` returns `~/.bun/install/global/node_modules/autodev/`. Tests always pass an explicit `packageRoot` (a temp mock package) so they never touch the real global install.
- **File size:** `init-module.ts` is ~190 pure LOC — healthy, well under the 250 ceiling. T9/T10 will add steps 6-10 to the same `runInit()` function; if the file crosses 250 LOC, split the steps into a `steps.ts` helper module BEFORE adding the new lines.

## Verification

- `bun test extensions/autodev/installer/__tests__/init-module.test.ts`: 5 pass, 0 fail.
- `bun test` (full suite): 527 pass, 0 fail.
- `bun run typecheck`: tsc --noEmit EXIT 0.
- Evidence: `.omo/evidence/project-init-centralization/t8-init-dirs-happy.md`, `t8-init-dirs-failure.md`.

# T9 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/installer/init-module.ts`: extended `runInit()` with steps 6-9.
  - Step 6: `loadRegistry()` → `addProject({name, path, repo})` → `setActiveProject(name)` → `saveRegistry()`. Hard-fails (throws) if registry write fails. Uses `guessRepo()` (already in module) for repo derivation.
  - Step 7: `runStep7Doc()` shared helper for AGENTS.md and CONTEXT.md. Checks if file exists in project root; if not, copies from `<packageRoot>/.autodev/reference/templates/<file>` if available, else writes inline fallback (`FALLBACK_AGENTS_MD` / `FALLBACK_CONTEXT_MD`).
  - Step 8: `gh auth status` pre-check → `gh repo view <repo>` → `gh repo create <name> --private --source=.` if missing. Skips labels if repo just created.
  - Step 9: `gh label list --json name` → diff against 8 required labels → `gh label create <name> --color <hex> --description "<desc>"` for each missing. Best-effort (warns per-label failure, continues).
- `runSteps8to9()` returns `{results, ran}` — the `ran` flag is false when gh auth fails (skipped), so `runInit` does NOT mark state step 9. This is the key asymmetry: step 9 is only marked when the gh steps actually executed.
- State steps: 6+7 (registry+docs) = step 8; 8+9 (repo+labels) = step 9.
- Fast path now checks all four state steps (6, 7, 8, 9) + marker.
- Imported `loadRegistry`, `addProject`, `setActiveProject`, `saveRegistry` from `../orchestrator/projects.js`.
- `REQUIRED_LABELS` constant: 8 labels with hex colors and descriptions matching the AutoDev workflow spec.
- Tests: 5 new T9 tests + 5 existing T8 tests updated (result count 5→10, added `withAgentDir` + `makeGhExec` helpers, `PI_CODING_AGENT_DIR` isolation).

## Key decisions

- **Step 6 hard-fails (throws), all other steps return `{ok: false}` and continue.** A broken registry means AutoDev can't track the project — no point proceeding to docs/repo/labels. Implemented as `throw new Error(...)` in `runInit` after `runStep6Registry` returns `!ok`.
- **`runSteps8to9` returns `ran: boolean`.** When gh auth fails, the steps are skipped (results are `{ok: true, detail: "Skipped..."}`) but `ran: false`. `runInit` only marks state step 9 if `ran && allOk`. This prevents a skipped-due-to-auth run from being treated as "complete" on the next invocation.
- **Inline fallbacks for AGENTS.md/CONTEXT.md.** The notepad confirmed `.autodev/reference/templates/` doesn't exist. Step 7 checks `<packageRoot>/.autodev/reference/templates/<file>` first (forward-compat: if T1 or a future task seeds templates there), else writes the inline fallback strings. The fallback AGENTS.md includes the standing-orders header pointer + placeholder sections for project/conventions/build. CONTEXT.md has placeholder sections for brief/architecture/tech-stack/active-context.
- **`REQUIRED_LABELS` colors.** Chose distinct hex colors following GitHub's label conventions: yellow (request), green (planned), blue (in-progress), purple (review), teal (ready), dark-purple (merged), red (blocked), light-blue (rejected). Descriptions match the workflow spec.
- **`gh repo create <name> --private --source=.`.** Uses the repo name (last segment of owner/repo) and `--private` per the task spec. Does NOT pass `--push` (the task spec only says create; pushing is a separate concern).

## Gotchas

- **T8 tests needed `PI_CODING_AGENT_DIR` isolation.** Without it, `runStep6Registry` writes to the real `~/.pi/agent/../projects.json` (or `~/.AutoDev/projects.json` if T1's env is set), polluting the dev machine. Added `withAgentDir(tmpRoot)` helper that sets/restores `PI_CODING_AGENT_DIR` to a temp dir, matching the T1-T7 pattern.
- **T8 test result counts changed 5→10.** Steps 6-9 add 5 results (registry, agents-md, context-md, repo-check, labels). Updated all T8 tests to expect 10 and verify the new names are present.
- **`makeGhExec` replaces `makeGitExec` for T8 tests.** The new mock handles both git and gh commands. T8 tests that don't care about gh pass `{authed: false}` so steps 8-9 are skipped (no gh calls, no registry pollution from label creation). The idempotent test passes `{authed: true, existingLabels: REQUIRED_LABELS}` so all labels exist and no create calls are made.
- **File size: `init-module.ts` is 464 pure LOC.** Over the 250 ceiling. T9's MUST NOT constraint ("Do NOT touch files outside init-module.ts, its tests, and evidence") forbids the split. Marked `allow: SIZE_OK - T9 task constraints forbid touching files outside init-module.ts; split into steps-helpers deferred to post-merge follow-up.` Post-merge follow-up: extract steps 1-5 into `init-steps-structure.ts`, steps 6-9 into `init-steps-registry-gh.ts`, leaving `init-module.ts` as the orchestrator.
- **`readFileSync` import added.** Initially only imported `cpSync`, `existsSync`, `mkdirSync`, `writeFileSync` from `node:fs`. Added `readFileSync` for potential future use, but actually it's not used — removed. Only `cpSync`, `existsSync`, `mkdirSync`, `writeFileSync` are needed.
- **`execOverride ?? execSync` pattern.** Steps 8-9 use `const exec = execOverride ?? execSync` at the top of `runSteps8to9`, then pass `exec` down to `runStep8Repo` and `runStep9Labels`. This avoids threading the override through every function signature. The `guessRepo` helper still takes `execOverride?` directly for backward compat with step 4.

## Verification

- `bun test extensions/autodev/installer/__tests__/init-module.test.ts`: 10 pass, 0 fail.
- `bun test` (full suite): 532 pass, 0 fail.
- `bun run typecheck`: tsc --noEmit EXIT 0.
- Evidence: `.omo/evidence/project-init-centralization/t9-init-gh-happy.md`, `t9-init-gh-failure.md`.

# T10 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/installer/init-module.ts`: added step 10 to `runInit()`.
  - `STEP_ONBOARD = 11` constant (step 10 is tracked as state step 11, not step 10, to avoid collision with the plan's step-10 label while keeping the state numbering sequential after step 9).
  - Fast-path check now includes `onboardDone` (state step 11).
  - Step-10 block: if `onboardDone` → "Already completed (step 11)"; if `skipOnboard===true` → mark step 11, emit skipped result; else → `runStep10Onboard()` in-process (dynamic import of `scripts/onboard.js`), mark step 11 on success.
  - `runStep10Onboard()` helper wraps `runOnboard({ projectRoot, notify })` in an `InstallFixResult`.
- New file `scripts/onboard.ts`: `runOnboard(opts: OnboardOptions): Promise<number>` — the real Harbor Master onboard launcher.
  - Resolves agent definition via `loadAgent()` from `extensions/autodev/delegation/agents.js`.
  - Resolves onboarding protocol from `~/.AutoDev/reference/onboarding-protocol.md` via `getAgentDir()` from the pi SDK.
  - Builds combined system prompt (agent body + protocol injection).
  - Creates a real pi `AgentSession` via `createAgentSession()` (lazy dynamic import; falls back to stub on failure).
  - Runs the session via `session.prompt()` with an onboarding greeting.
  - Writes `.autodev/memory/projectbrief.md` (placeholder seeded post-session).
  - Fallback: emits manual onboarding instructions when pi SDK unavailable or agent definition missing.
  - All collaborators (`sessionFactory`, `loadHarborMaster`, `loadOnboardingProtocol`, `writeMemory`) are injectable for tests.
- `scripts/cli.ts`: rewrote `cmdOnboard()` to dispatch to `runOnboard({ projectRoot: process.cwd(), notify })` — removed the stub message.
- New test file `scripts/__tests__/onboard.test.ts` (5 tests: happy, missing agent, pi SDK unavailable, memory write fail, default memory writer).
- Updated `extensions/autodev/installer/__tests__/init-module.test.ts`: all 10 existing tests now pass `skipOnboard: true` and expect 11 results; added 2 new T10 tests (skipOnboard=true, re-run with step 11 complete).

## Key decisions

- **Step 10 tracked as state step 11, not step 10.** The plan refers to the init step as "step 10" but the state numbering already uses 6-9 for the prior steps. Using state step 10 for onboard would be confusing because the plan's "step 10" label and the state "step 10" are different concepts. Using state step 11 keeps the state numbering sequential after step 9 and avoids ambiguity. The `STEP_ONBOARD = 11` constant documents this.
- **`runOnboard` is a separate module (`scripts/onboard.ts`), not inlined in `init-module.ts`.** `init-module.ts` is already 464 pure LOC (over the 250 ceiling with a `SIZE_OK` allow). Inlining the onboard logic would push it further over. The new `scripts/onboard.ts` is ~180 pure LOC and owns a single responsibility: launching the Harbor Master session. `init-module.ts` step 10 is a thin 15-line block that delegates to it.
- **All collaborators injectable.** `OnboardOptions` exposes `sessionFactory`, `loadHarborMaster`, `loadOnboardingProtocol`, and `writeMemory` as optional injection points. Production uses the default implementations (lazy SDK imports). Tests inject fakes — no real pi SDK, no real filesystem writes to the dev machine. This matches the DI pattern established by T1-T9.
- **Fallback to stub instructions.** When the pi SDK is unavailable or the Harbor Master agent definition is missing, `runOnboard` emits manual onboarding instructions (run `pi` manually, select model, paste protocol, save to projectbrief.md). This keeps `autodev onboard` usable even when the SDK isn't fully configured. Return code 1 signals fallback; 0 signals a real session ran.
- **`cmdOnboard()` dispatches, doesn't implement.** The task spec said T11 wires CLI commands; T10 implements `cmdOnboard`. The implementation is a 5-line dispatch to `runOnboard`. T11 can layer additional CLI flags (--skip-onboard, --non-interactive) on top without touching `onboard.ts`.

## Gotchas

- **Pre-existing tests needed `skipOnboard: true`.** Without it, `runStep10Onboard` dynamically imports `scripts/onboard.js` and attempts a real `createAgentSession`, which fails in tests (no auth, no model registry). Adding `skipOnboard: true` to all 10 existing tests keeps them focused on steps 1-9 and avoids the real SDK. The 2 new T10 tests explicitly exercise the skip and idempotent paths.
- **`require()` vs `import()` for `loadAgent`.** `loadHarborMasterDefault` uses `require()` (synchronous) instead of a dynamic `import()` because `runOnboard` is an `async` function but the agent loader is sync. `require()` works under Bun for ESM with the `.js` extension. Using `await import()` would also work but adds an unnecessary await for a sync operation.
- **`AgentSession.prompt()` is the SDK's interactive entrypoint.** The pi SDK's `AgentSession` exposes `prompt(text)` which sends a message to the agent. For the embedded onboarding use case, we call `prompt()` with an onboarding greeting and let the session's own event loop drive the conversation. This is the documented SDK pattern (see pi README "Programmatic Usage"). The full TUI interactive mode is driven by pi's CLI entrypoint, not by `AgentSession` directly — but for `autodev onboard` the programmatic path is sufficient.
- **System prompt injection.** The combined system prompt (agent body + protocol) is built but not directly set on the session — `AgentSession` does not expose a public system-prompt setter. The production `createSessionDefault` relies on AGENTS.md discovery (the session loads `.pi/agents/harbor-master.md` automatically via the resource loader). The `buildSystemPrompt` output is used for the fallback stub message and for the memory artifact placeholder. A future task can wire the protocol injection via `--append-system-prompt` or a custom resource loader if tighter control is needed.
- **File size: `init-module.ts` is now ~490 pure LOC.** Still over the 250 ceiling (carried `SIZE_OK` allow from T9). The step-10 block added ~25 LOC. Post-merge follow-up: extract steps into `init-steps-*.ts` modules as noted in T9 learnings.

## Verification

- `bun run typecheck`: tsc --noEmit EXIT 0.
- `bun test scripts/__tests__/onboard.test.ts`: 5 pass, 0 fail.
- `bun test extensions/autodev/installer/__tests__/init-module.test.ts`: 12 pass, 0 fail.
- `bun test` (full suite): 539 pass, 0 fail.
- Evidence: `.omo/evidence/project-init-centralization/t10-onboard-happy.md`, `t10-onboard-failure.md`.

# T13 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/delegation/skills.ts`: rewrote skill resolution to a
  two-layer model:
  - `getCentralSkillsDir()` → `join(getAgentDir(), "..", "skills")` (the
    per-user central store, `~/.AutoDev/skills/` when `PI_CODING_AGENT_DIR`
    is set by T1's env wiring).
  - `getProjectSkillsDir(projectRoot)` → `resolve(projectRoot, ".autodev",
    "skills")` (project-level overrides).
  - `resolveSkill(projectRoot, name)` now checks the project override
    FIRST, then falls back to central. Returns `undefined` if neither has
    the skill.
  - New `loadAllSkills(projectRoot): readonly SkillEntry[]` merges central
    skills into a `Map<string, SkillEntry>`, then overlays project skills
    (same name → project wins). Returns the merged list. `[]` when
    neither layer exists.
  - New `SkillEntry` interface: `{ name, content, source: "central" |
    "project" }`.
  - New `listSkillDirs(dir)` helper: `readdirSync(dir, { withFileTypes:
    true })`, filters to directories containing `SKILL.md`.
  - Removed old `SKILL_SEARCH_PATHS = [".autodev/skills", ".pi/skills"]`
    constant (replaced by layered resolution).
  - `stripFrontmatter` and `buildSkillPromptBlock` unchanged in behavior;
    `buildSkillPromptBlock` still delegates to `resolveSkill`, so it
    transparently picks up the new layered resolution.
- New test file `extensions/autodev/delegation/__tests__/skills.test.ts`
  (14 tests): happy 5-skill central load, source marker, project override
  (same name wins), project-only add, no-central-dir `[]`, project-only
  with central missing, `resolveSkill` override + fallback + absent +
  central-missing, `buildSkillPromptBlock` happy + empty + not-found +
  project-override body.

## Key decisions

- **Project wins on collision.** `loadAllSkills` uses a `Map<string,
  SkillEntry>`; central skills are inserted first, then project skills
  `set` overwrites the entry for the same name. The `source` field
  records which layer the winning copy came from, so callers can audit
  provenance. This matches the task spec: "same filename overrides
  central."
- **`resolveSkill` checks project first, not central first.** The task
  spec says project `.autodev/skills/` "adding/overriding" — override
  semantics mean the project copy must win when both exist. Checking
  project first and falling back to central is the simplest expression
  of that. (Note: this differs from the old behavior, which checked
  `.autodev/skills` first then `.pi/skills` — the order is preserved for
  the project layer, but the central fallback is now `getAgentDir()`-
  based instead of `.pi/skills`.)
- **`loadAllSkills` is additive to the public API.** The existing
  `resolveSkill` + `buildSkillPromptBlock` remain for name-based lookup.
  `loadAllSkills` is new for callers that want the full merged set (e.g.
  a future "list all available skills" UI). It does not replace
  `resolveSkill`.
- **`Dirent` type import.** `listSkillDirs` uses `readdirSync(dir, {
  withFileTypes: true })` which returns `Dirent[]`. Under `tsc --noEmit`
  with strict settings, the inferred `string[]` annotation caused a
  type mismatch. Annotated as `readonly import("node:fs").Dirent[]` to
  satisfy the checker without a top-level import.

## Gotchas

- **Sibling-task test interaction.** The full `bun test` run shows 8
  failures in `guardrails/__tests__/` and `dispatch.test.ts`/
  `cli.test.ts`. These are from uncommitted sibling-task changes
  (`guardrails/index.ts` modified, new test files added) and are NOT
  caused by T13. Running T13's skills tests + guardrails tests in
  isolation: 19 pass, 0 fail. T13's MUST NOT constraint forbids touching
  those files.
- **`getAgentDir()` reads `PI_CODING_AGENT_DIR` live.** Confirmed in T2
  learnings; T13 tests use the same `beforeEach`/`afterEach` env-var
  save/set/restore pattern as T2/T7/T8. Central skills are planted at
  `<tempRoot>/skills/` (the sibling of `<tempRoot>/agent`), project
  skills at `<projectRoot>/.autodev/skills/`.
- **`readdirSync` with `withFileTypes: true` needs a type annotation.**
  Without `readonly Dirent[]`, `tsc` inferred `string[]` and the
  `entry.isDirectory()` / `entry.name` accesses failed typecheck. This
  is a known Bun/Node typing quirk when the array is assigned to a
  `string[]` variable first.

## Verification

- `bun test extensions/autodev/delegation/__tests__/skills.test.ts`: 14 pass, 0 fail.
- `bun run typecheck` (T13 scope): no errors in skills.ts or skills.test.ts.
- `bun test` (full suite): 556 pass, 8 fail (all pre-existing sibling-task, not T13).
- Pure LOC: `skills.ts` 171, `skills.test.ts` 147 (both healthy).
- Evidence: `.omo/evidence/project-init-centralization/t13-skills-happy.md`, `t13-skills-failure.md`.

# T12 Implementation Learnings

Date: 2026-06-23

## What changed

- `extensions/autodev/guardrails/index.ts`: imported `getAgentDir` from `@earendil-works/pi-coding-agent`. Added `DEFAULT_GUARDRAILS_CONFIG` (9 hard stops + 5 soft stops mirroring the immutable reference YAML rule IDs + check expressions). Rewrote `loadGuardrailsConfig(projectRoot)` with 3-tier resolution: project `.autodev/config/guardrails.yaml` (file-level override, checked first) → central `join(getAgentDir(), "..", "config", "guardrails.yaml")` → `DEFAULT_GUARDRAILS_CONFIG`.
- `extensions/autodev/orchestrator/dispatch.ts`: imported `getAgentDir`, `readFileSync`, `existsSync`, `resolve`, `join`. Added `DispatchRule`, `DispatchRulesConfig` interfaces, `DEFAULT_DISPATCH_CONFIG` (6 dispatch rules mirroring the reference route table), `parseDispatchYaml(text)` minimal focused parser for the `dispatch_rules:` list shape, and `loadDispatchConfig(projectRoot)` with the same 3-tier resolution.
- New test files: `extensions/autodev/guardrails/__tests__/guardrails.test.ts` (5 tests), `extensions/autodev/orchestrator/__tests__/dispatch.test.ts` (5 tests). Both use the `PI_CODING_AGENT_DIR` env-var isolation pattern (set in `beforeEach`, restored in `afterEach`) to redirect `getAgentDir()` into a temp central tree.
- Evidence: `.omo/evidence/project-init-centralization/t12-engines-happy.md`, `t12-engines-failure.md`.

## Key decisions

- **Precedence is project > central > defaults, NOT central > project.** The task spec says "First check central; if project exists, use it instead." This means project is the override. Implementation checks project first (early return), then central, then defaults. The "both exist → project wins" and "no deep merge" tests pin this.
- **File-level override, NOT deep merge.** Per MUST NOT. When project config exists, it replaces central entirely — verified by the "no deep merge" test where project with empty `hard_stops` yields zero hard stops even though central had one.
- **`DEFAULT_*_CONFIG` is an exported const, not a function.** Tests assert `cfg === DEFAULT_GUARDRAILS_CONFIG` for the no-config case, proving the fallback is a stable reference returned directly (not a fresh object each call). This makes the defaults test a referential-equality check, not just a shape check.
- **Central path via `join(getAgentDir(), "..", "config", <file>)`.** Consistent with T2 (agents at `join(getAgentDir(), "..", "agents")`) and T7 (registry at `join(getAgentDir(), "..", "projects.json")`). When `PI_CODING_AGENT_DIR=~/.AutoDev/agent`, central config resolves to `~/.AutoDev/config/`.
- **Minimal YAML parser for dispatch-rules.yaml.** Mirrors the guardrails parser approach. Parses only the `dispatch_rules:` list (trigger/from/to/condition/evidence/route). Ignores `state_machine:` and other top-level sections — the dispatch engine doesn't use the state machine at runtime; it uses the route table. The parser detects non-`dispatch_rules` top-level keys (`^[a-z_]+:\s*$` at column 0) and skips them.

## Gotchas

- **`exactOptionalPropertyTypes: true` requires `| undefined` on optional interface props.** `DispatchRule.evidence?: string` rejected the parser's `{ evidence: string | undefined }` intermediate object. Fix: `evidence?: string | undefined` (and same for `route`). This is the strict-mode rule documented in the TS reference; the guardrails `HardStopRule` didn't hit this because its `check`/`enforcement` are required `string`, not optional.
- **`register()` behavior improvement, not a regression.** Before T12, `loadGuardrailsConfig(process.cwd())` returned empty config `{ hard_stops: [], soft_stops: [] }` when no project config existed — meaning NO rules were enforced. After T12, it returns central or `DEFAULT_GUARDRAILS_CONFIG` — rules ARE enforced. This is strictly better. The existing `test/guardrails.test.ts` always plants a project config, so it sees no change.
- **Pre-existing failures are sibling-task debt.** 13 failures in `init-module.test.ts`, `doctor-orchestrator.test.ts`, `cli.test.ts` (T8/T9/T10/cmdDoctor) — all in untracked test files for incomplete sibling tasks. T12-scoped tests: 79 pass, 0 fail. Clean tree (stashing T12): 311 pass, 0 fail (but doesn't include untracked sibling test files).
- **`parseDispatchYaml` route sub-map parsing.** The `route:` key introduces a nested map (`simple: ned_land`, etc.). The parser collects `key: value` pairs into `current.route` while `current.route` is defined. The regex `^\s+([a-z_]+):\s*(\S+)\s*$` is intentionally narrow (lowercase + underscore keys, no quotes) to avoid matching `from:`/`to:`/`condition:` which are parsed earlier in the `if` chain.
- **Dispatch `DEFAULT_DISPATCH_CONFIG` route is `Record<string,string>`.** The reference YAML's `route:` has 4 keys (simple/complicated/complex/chaotic). The hardcoded default includes all 4. The `route` field is optional on `DispatchRule` — rules without a route (e.g. `plan_complete`) omit it.

## Verification

- `bun test extensions/autodev/guardrails/__tests__/guardrails.test.ts`: 5 pass, 0 fail.
- `bun test extensions/autodev/orchestrator/__tests__/dispatch.test.ts`: 5 pass, 0 fail.
- `bun test test/guardrails.test.ts` (regression): 49 pass, 0 fail.
- `bun test` (T12-scoped: guardrails + dispatch + orchestrator + existing guardrails): 79 pass, 0 fail.
- `bun run typecheck`: tsc --noEmit EXIT 0.
- Pure LOC: `guardrails/index.ts` 719 (pre-existing, over 250 ceiling — T12 MUST NOT forbids split; carried smell), `dispatch.ts` 222 (healthy), `guardrails.test.ts` 121 (healthy), `dispatch.test.ts` 156 (healthy).
- Evidence: `.omo/evidence/project-init-centralization/t12-engines-happy.md`, `t12-engines-failure.md`.

# T14 Implementation Learnings

Date: 2026-06-23

## What changed

- `scripts/cli.ts` `cmdDoctor()`: replaced the all-pass success message
  `"All machine-level checks passed."` with Decision #21 text
  `"Installation Successful! Use cd to navigate to your project folder and run autodev init to pair a project."`.
  Added a `runDoctorOverride` DI option (matching the `runInitOverride` /
  `runOnboardOverride` pattern already in cli.ts) so the success message is
  unit-testable without `mock.module`.
- `extensions/autodev/orchestrator/cli.ts` `handleDoctor()`: same message
  replacement on the pi-extension command surface.
- `scripts/__tests__/cli.test.ts`: 2 new tests (success message printed on
  all-pass; NOT printed on failure). Uses DI (`runDoctorOverride`), not
  `mock.module`, consistent with the rest of the file.
- `test/doctor.test.ts`: 3 new tests:
  - Install-state threshold excludes `"init"` scope (Decision #20): 10
    completed `init` steps → `0/6` → check fails.
  - `isFirstRun` reads `.env` from `dirname(authPath)` (central agent dir).
  - Config checks fail when `packageRoot` is empty (central ~/.AutoDev/ not
    populated).

## Key decisions

- **DI over `mock.module` for cmdDoctor.** The cli.test.ts file header
  documents that DI is preferred over `mock.module` to "avoid poisoning other
  tests in the same process." `mock.module` for `doctor.js` registered after
  the first `await import("../cli.js")` does NOT override the cached dynamic
  import inside cli.ts — confirmed empirically (happy-path test returned exit 1
  because the real `runDoctor` ran with failing `execSync`). The
  `runDoctorOverride` DI seam matches `runInitOverride`/`runOnboardOverride`
  exactly.
- **No change to the 10-check structure.** T4's 10 health checks are
  untouched; T14 only verifies they resolve central paths and updates the
  success message. `isFirstRun()` and the env check already resolve via
  `dirname(authPath)` / `getAgentDir()`, so they pick up `~/.AutoDev/agent/`
  automatically when `PI_CODING_AGENT_DIR` is set (T1's env wiring).
- **Install-state threshold (`count >= 6` over `install` + `config` scopes)
  does NOT include `"init"`.** The new test pins this: completing `init` steps
  alone leaves the check at `0/6`. This is Decision #20.

## Gotchas

- **`mock.module` caching:** Bun's `mock.module` factory applies once per
  specifier; registering a second mock for the same specifier after the module
  is already imported has no effect. The DI approach sidesteps this entirely.
- **`cmdDoctor` is exported.** It was previously a private function; T14
  exports it (`export async function cmdDoctor(...)`) so the test can import
  it. `cmdConfig` / `cmdStatus` etc. remain private — only the tested handlers
  are exported, matching the existing `cmdInit` / `cmdOnboard` exports.
- **`handleDoctor` in orchestrator/cli.ts is NOT exported** (pi-extension
  command surface, not unit-tested directly). Its message was updated for
  consistency but has no dedicated test; the cli.ts test covers the message
  contract.

## Verification

- `bun test scripts/__tests__/cli.test.ts`: 8 pass, 0 fail.
- `bun test test/doctor.test.ts`: 15 pass, 0 fail.
- `bun run typecheck`: tsc --noEmit exit 0.
- `bun test` (full suite): 579 pass, 0 fail.
- Evidence: `.omo/evidence/project-init-centralization/t14-doctor-paths-happy.md`,
  `t14-doctor-paths-failure.md`.
