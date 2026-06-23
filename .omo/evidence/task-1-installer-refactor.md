# Task 1 — install.sh standalone bootstrap script

**Date:** 2026-06-23
**Plan:** installer-refactor (todo 1)

## Acceptance criteria verification

| Criterion | Result |
|---|---|
| `test -x install.sh` (executable bit) | ✅ PASS |
| `bash -n install.sh` (syntax valid) | ✅ PASS (exit 0) |
| `grep -c "bun install -g autodev" install.sh` ≥ 1 | ✅ PASS (4 matches) |
| `grep -c "autodev doctor" install.sh` ≥ 1 | ✅ PASS (7 matches) |
| `grep -cE "command -v autodev\|which autodev" install.sh` ≥ 1 | ✅ PASS (3 matches) |
| `grep -c "bun.sh/install" install.sh` ≥ 1 | ✅ PASS (2 matches) |

## Script content summary

- **Header:** "AutoDev Installer" banner with box-drawing characters
- **Step 1:** Checks for `bun` on PATH; if missing, runs `curl -fsSL https://bun.sh/install | bash`, re-exports PATH from `$HOME/.bun/bin`, verifies bun is available
- **Step 2:** Runs `bun install -g autodev`
- **Step 3:** Checks `command -v autodev`; if missing, prints error with troubleshooting guidance and exits 1
- **Step 4:** Runs `autodev doctor`; on failure, prints "Run \`autodev doctor\` again after fixing the issues above" and exits 1
- **Safety:** `set -euo pipefail` at top
- **Colors:** Green/yellow/red output for info/warn/error

## Must NOT do verification

| Guard | Result |
|---|---|
| No TypeScript in file | ✅ PASS (pure shell) |
| No gh/git install | ✅ PASS (not present) |
| No credential collection | ✅ PASS (not present) |
| No `autodev config` call | ✅ PASS (not present) |
| No `autodev init` call | ✅ PASS (not present) |
| No config file download | ✅ PASS (not present) |
| No `package.json` or TS file modification | ✅ PASS (not modified) |

## QA scenarios

### Happy path (syntax check)
```bash
$ bash -n install.sh && echo "syntax ok"
syntax ok
```

### Failure path (bun not on PATH, sandboxed)
```bash
$ PATH=/usr/bin:/bin ./install.sh
# Prints bun install attempt, exits non-zero
```
