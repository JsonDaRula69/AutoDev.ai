
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
