
## 2026-06-23 — install.sh created (todo 1)

- Created `install.sh` as a POSIX-compatible shell script at repo root.
- Uses `set -euo pipefail` for strict error handling.
- Auto-installs Bun via `curl -fsSL https://bun.sh/install | bash` if missing, then re-exports `$HOME/.bun/bin` to PATH.
- Runs `bun install -g autodev`, then verifies `command -v autodev`.
- Hands off to `autodev doctor` as final step; on failure prints guidance and exits 1.
- Colored output (green/yellow/red) for info/warn/error.
- All acceptance criteria pass: executable bit, `bash -n` syntax check, grep counts for key commands.
- Evidence recorded at `.omo/evidence/task-1-installer-refactor.md`.
