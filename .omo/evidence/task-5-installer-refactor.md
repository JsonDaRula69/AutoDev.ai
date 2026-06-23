# Task 5 — installer-refactor: doctor.ts refactor

**Date:** 2026-06-23
**File:** `extensions/autodev/installer/doctor.ts`

## Summary

Rewrote `runDoctor` as the orchestrator. Removed `isGlobalInstall()`, `isFreshInstall()`, the local-install guard (Gate 1), the fresh-install gate (Gate 2), and the old `runInstall` auto-fix branch (Gate 3). Added `isFirstRun()` (3-signal check: `auth.json` creds resolved against `process.env`, `.autodev/install-state.json` steps, `~/.pi/agent/.env` `OLLAMA_CLOUD_API_KEY`) used ONLY for messaging. When `launchConfigFlow: true` and checks fail: calls `runInstallFixes` (always, no prompts), then calls `runConfig` with targeted sub-commands ONLY when `process.stdin.isTTY === true`, then re-runs all health checks. Updated GitHub auth check to verify token validity via `gh auth status`. Updated LLM credentials check to resolve `$VAR` references against `process.env`. Updated Environment vars check to read from `join(dirname(authPath), ".env")`. Updated Install state check: aggregates `install` + `config` scopes, threshold `>= 6`, detail `X/6`. Extended `DoctorDeps` with `prompter?` and `fetchOverride?`.

## Acceptance criteria

| Criterion | Expected | Actual |
|---|---|---|
| `bun run typecheck` | passes | ✓ clean (`tsc --noEmit` no output) |
| `grep -cE "npm_config_global\|isGlobalInstall\|isFreshInstall"` | 0 | 0 ✓ |
| `grep -c "isFirstRun"` | ≥1 | 2 ✓ |
| `grep -cE "readAuth\|readState\|readEnv"` | ≥3 | 10 ✓ |
| `grep -cE "runInstallFixes\|runConfig"` | ≥1 | 5 ✓ |
| `grep -c "isTTY"` | ≥1 | 1 ✓ |
| `grep -c "autodev config"` | ≥1 | 1 ✓ |
| `grep -cE 'from "\./index\.js"\|runInit'` | 0 | 0 ✓ |
| `grep -cE "autodev install\|autodev init"` | 0 | 0 ✓ |
| `DoctorDeps.prompter?` present | yes | 1 ✓ |
| `DoctorDeps.fetchOverride?` present | yes | 1 ✓ |

## Test results

```
bun run typecheck → clean (tsc --noEmit, no output)
bun test test/doctor.test.ts → 7 pass, 1 fail (pre-existing "doctor detects missing agent files")
bun test extensions/autodev/installer/__tests__/installer.test.ts → 33 pass, 0 fail
bun test (full suite) → 487 pass, 1 fail (same pre-existing agent-files failure)
```

### Pre-existing failure (unrelated)

`test/doctor.test.ts:149 "doctor detects missing agent files"` fails on clean `main` before this change (verified in task-3 learnings). The test deletes `nemo.md` then expects the agents check to be `ok:false`, but `runDoctor` reports `ok:true`. This is a doctor-logic bug in the agents check (not in the code touched by this todo) — deferred to a separate fix.

### Test assertion update (threshold 8→6)

`test/doctor.test.ts:125` expected `"2/8"` in the Install state detail. The plan-mandated threshold change (8→6) makes the detail now read `"2/6 install steps completed"`. Updated the assertion to `"2/6"` to match the new, correct behavior.

## Behavior summary

- **All green:** `launchConfigFlow: true` → returns immediately with `configFlowLaunched: false`.
- **Failures + `launchConfigFlow: true`:**
  1. `isFirstRun()` determines messaging (welcome vs "something needs fixing").
  2. `runInstallFixes(...)` called unconditionally (no prompts, safe in CI).
  3. `runConfig(..., sub)` called per failing check → sub-command, ONLY when `process.stdin.isTTY === true`. Sub-commands mapped: LLM fail → `"llm"`, GitHub auth fail → `"github"`, Env fail → `"llm"` (+ `"voyage"` if VoyageAI missing). Discord never auto-triggered.
  4. Prompter created via `createPrompter()` once (if not injected), closed after all sub-commands. `runConfig` does NOT close it.
  5. All health checks re-run; result returns re-checked counts with `configFlowLaunched: true`.
- **Non-TTY:** `runInstallFixes` runs; `runConfig` skipped; message: "Non-interactive environment detected. Run `autodev config` in an interactive terminal to set up credentials."