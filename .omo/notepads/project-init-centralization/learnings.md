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
