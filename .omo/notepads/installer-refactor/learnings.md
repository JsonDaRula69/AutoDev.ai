
## 2026-06-23 — install.sh created (todo 1)

- Created `install.sh` as a POSIX-compatible shell script at repo root.
- Uses `set -euo pipefail` for strict error handling.
- Auto-installs Bun via `curl -fsSL https://bun.sh/install | bash` if missing, then re-exports `$HOME/.bun/bin` to PATH.
- Runs `bun install -g autodev`, then verifies `command -v autodev`.
- Hands off to `autodev doctor` as final step; on failure prints guidance and exits 1.
- Colored output (green/yellow/red) for info/warn/error.
- All acceptance criteria pass: executable bit, `bash -n` syntax check, grep counts for key commands.
- Evidence recorded at `.omo/evidence/task-1-installer-refactor.md`.

## 2026-06-23 — Dead lifecycle hooks removed, bin repointed to standalone cli.ts (todo 2)

- `package.json`: removed `preinstall`/`postinstall` script entries entirely (not empty strings), repointed `bin.autodev` to `./scripts/cli.ts`
- `scripts/preinstall-guard.ts` and `scripts/postinstall.ts` deleted
- `scripts/cli.ts` created as standalone CLI entrypoint — no pi dependency, constructs minimal context, calls handlers directly
- `resolveAuthPath()` and `autoNonInteractive()` copied from `installer/index.ts:138-154` to avoid pi dependency
- `handleDoctor` replicates the pattern from `scripts/postinstall.ts:33-44` — calls `runDoctor` directly with `execSyncOverride`
- `handleConfig` is a stub that prints usage listing `llm`, `voyage`, `discord`, `github` and exits non-zero (full routing in todo 6)
- Doctor header printed BEFORE `runDoctor` call, not after
- No references to `autodev install` or `autodev init` in cli.ts
- Unknown subcommands print usage and exit code 1
- `bun run typecheck` passes clean
- `CI=1 bun run scripts/cli.ts doctor` runs without hanging/crashing (correctly detects local install and exits)
- `bun run scripts/cli.ts config` prints correct usage with llm/voyage/discord/github
- `bun run scripts/cli.ts badcommand` exits with code 1 and prints usage
- Fix: first pass left empty `"preinstall": ""` / `"postinstall": ""` keys and wrong CLI references; amended commit fixes all three defects

## 2026-06-23 — Config module created (todo 4)

- Created `extensions/autodev/installer/config-module.ts` with `runConfig(deps, subcommand?)` and all 4 handlers.
- `ConfigModuleDeps` = `{ projectRoot, authPath, prompter, notify, execSyncOverride? }` — no `nonInteractive` field.
- `ConfigResult` = `{ name, status, message }` with status union `"ok" | "skipped" | "warning" | "error"`.
- **llm handler**: prompts for provider (default `ollama-cloud`), checks `~/.pi/agent/auth.json` and `~/.opencode/auth.json` for import, writes actual secret to `.env` and env-var reference (`$OLLAMA_CLOUD_API_KEY`) to `auth.json`.
- **voyage handler**: prompts for key, Enter → writes empty `VOYAGE_API_KEY=` to `.env` with ONNX fallback warning.
- **discord handler**: confirm (default no), if yes prompts token/channel/liaison, writes all three to `.env`.
- **github handler**: checks `gh auth status` first, then prompts to run `gh auth login --web` via `execSyncOverride` with 5-min timeout.
- `ensureGitignore` runs on first handler invocation via local flag.
- Sub-command routing: undefined/empty → all 4 in order; known sub-command → single handler; unknown → error result.
- No `nonInteractive` field — config is interactive-only. No-TTY prompter returns empty strings; handlers warn and skip.
- TypeScript: `HANDLERS[name]!` non-null assertion needed because `for...of` on `as const` array still types `name` as `string`, not the literal union.
- All acceptance criteria pass: file exists, typecheck clean (no config-module errors), no forbidden terms, `execSyncOverride` present, `nonInteractive` absent.
- Evidence at `.omo/evidence/task-4-installer-refactor.md`.
