# T3 Install Module — Failure Path Evidence

**Task:** T3 — failure-mode verification for `install-module.ts` MC setup.

**Date:** 2026-06-23

## Verification Command

```bash
bun test extensions/autodev/installer/__tests__/install-module.test.ts
```

## Result

All 5 tests pass, including the two failure-path tests below. Full output in `t3-install-module-happy.md`.

## What was verified (failure paths)

### 1. `pi install` exec throws → MC setup reports failure

- **Given:** `PI_CODING_AGENT_DIR` set to a temp agent dir; mock package present so Phase 2 (`config-files`) succeeds.
- **When:** `execSyncOverride` throws specifically on any command containing `pi install npm:@cortexkit/pi-magic-context`.
- **Then:**
  - `runInstallFixes` still returns exactly 3 results.
  - `tools` and `config-files` results are `ok: true`.
  - `magic-context-setup` result is `ok: false` with `detail` containing `"Magic Context registration failed"`.
  - No `magic-context-doctor` result is present (Phase 5 removed).

Test: `"MC setup reports failure when exec throws on pi install"` — PASS.

### 2. `getAgentDir()` fallback when `PI_CODING_AGENT_DIR` unset

- **Given:** `PI_CODING_AGENT_DIR` is deleted from `process.env`.
- **When:** `runInstallFixes` runs with a mock package.
- **Then:**
  - `getAgentDir()` returns the SDK default `~/.pi/agent` (not `~/.AutoDev/agent`).
  - The `pi install npm:@cortexkit/pi-magic-context` call's `cwd` equals the SDK default agent dir.
  - MC setup result is `ok: true` (jsonc written to the fallback dir).
  - The test cleans up the `magic-context.jsonc` it wrote to the real `~/.pi/agent` to avoid polluting the dev machine.

Test: `"getAgentDir fallback: when PI_CODING_AGENT_DIR unset, MC setup uses SDK default ~/.pi/agent"` — PASS.

### 3. Self-heal failure is contained

- **Given:** `magic-context.jsonc` missing from the agent dir.
- **When:** `writeFileSync` to `join(getAgentDir(), "magic-context.jsonc")` succeeds (self-heal).
- **Then:** MC phase reports `ok: true` after self-heal + registration + verify.
- **Failure mode (not separately tested but covered by code path):** if the `writeFileSync` self-heal throws, the MC phase returns `ok: false` with `"Failed to write magic-context.jsonc: <error>"` and does **not** attempt the `pi install` registration. This is the early-return at `install-module.ts:199-205`.

## Scope note on sibling-task typecheck failures

The branch carries incomplete T4 work in `doctor.ts` (references `reopenTty` / `reopenTtyOverride` without importing `tty.ts`). This produces 2 typecheck errors and 2 test failures in `doctor-orchestrator.test.ts`. These are **not introduced by T3** and are explicitly out of scope per the task MUST NOT: "Do NOT touch files outside `install-module.ts`, its tests, and evidence." T3-isolated typecheck (with `doctor.ts`/`tools.ts` reverted to HEAD) exits 0.