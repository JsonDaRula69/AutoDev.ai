# Task 4 — Config Module (config-module.ts)

**Date:** 2026-06-23
**Plan:** `.omo/plans/installer-refactor.md` todo 4

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `test -f extensions/autodev/installer/config-module.ts` | ✅ | File exists |
| `bun run typecheck` passes (no config-module errors) | ✅ | Zero errors in config-module.ts; only pre-existing errors in doctor.ts/cli.ts (to be fixed in later todos) |
| `grep -c "export async function runConfig"` returns 1 | ✅ | 1 match |
| `grep -c "execSyncOverride"` returns ≥1 | ✅ | 2 matches |
| `grep -c "nonInteractive"` returns 0 | ✅ | 0 matches |
| `grep -cE "bun install\|magic-context setup\|gh label create\|docs rebuild\|validateAndCreateConfig\|installMissingTools"` returns 0 | ✅ | 0 matches |

## Verification Commands

```bash
# File exists
test -f extensions/autodev/installer/config-module.ts && echo "EXISTS"

# Typecheck (config-module only)
bun run typecheck 2>&1 | grep "config-module" || echo "No config-module errors"

# Export check
grep -c "export async function runConfig" extensions/autodev/installer/config-module.ts

# Testability seam
grep -c "execSyncOverride" extensions/autodev/installer/config-module.ts

# No nonInteractive
grep -c "nonInteractive" extensions/autodev/installer/config-module.ts

# No forbidden terms
grep -cE "bun install|magic-context setup|gh label create|docs rebuild|validateAndCreateConfig|installMissingTools" extensions/autodev/installer/config-module.ts
```

## Key Design Decisions

- **No `nonInteractive` field** — config is interactive-only. If the prompter returns empty strings (no TTY), handlers warn and skip without writing secrets.
- **Secrets go to `.env` only** — `auth.json` stores env-var references (e.g., `"$OLLAMA_CLOUD_API_KEY"`). pi's SDK resolves `$VAR` syntax at runtime from `process.env`, which Bun auto-loads from `.env`.
- **`execSyncOverride`** is in deps for testability of `gh auth login --web`.
- **`ensureGitignore`** runs on first handler invocation via a local flag.
- **Sub-command routing**: `undefined`/empty runs all 4 handlers in order; known sub-command runs only that handler; unknown returns error result.
- **Import from existing auth**: checks `~/.pi/agent/auth.json` and `~/.opencode/auth.json` for existing credentials before prompting for a new key.
