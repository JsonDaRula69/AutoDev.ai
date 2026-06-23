# T10 — Harbor Master Onboard Auto-Launch (Failure / Edge Cases)

Date: 2026-06-23

## Failure modes covered

### 1. Pi SDK unavailable
- **Trigger:** `createAgentSession` import fails or session creation throws.
- **Behavior:** `runOnboard` catches the error, emits a warning with the error message, and emits the manual onboarding stub instructions (run `pi` manually, select Harbor Master model, paste protocol, save to projectbrief.md).
- **Return code:** 1.
- **Test:** `runOnboard pi SDK unavailable: sessionFactory throws -> fallback stub, returns 1`.

### 2. Harbor Master agent definition missing
- **Trigger:** `loadAgent(projectRoot, "harbor-master")` returns `undefined` (no `~/.AutoDev/agents/harbor-master.md`).
- **Behavior:** `runOnboard` emits a warning ("Harbor Master agent definition not found"), emits the stub instructions, and returns without creating a session.
- **Return code:** 1.
- **Test:** `runOnboard missing agent: loadHarborMaster undefined -> fallback stub, returns 1`.

### 3. Memory write failure
- **Trigger:** `.autodev/memory/projectbrief.md` cannot be written (permission denied, disk full).
- **Behavior:** `runOnboard` emits a warning but still returns 0 (the session ran; only the post-session artifact write failed).
- **Test:** `runOnboard memory write fails: warning emitted, returns 0`.

### 4. Step 10 skipped via `skipOnboard=true`
- **Trigger:** `InitModuleDeps.skipOnboard === true`.
- **Behavior:** `runInit()` marks state step 11 complete without launching a session. The result `detail` says "Skipped (--skip-onboard). Step 11 marked."
- **Test:** `T10 skipOnboard=true: step 11 marked, no session launched`.

### 5. Step 10 already complete (re-run idempotency)
- **Trigger:** `isStepCompleted(projectRoot, 11, "init")` returns true.
- **Behavior:** `runInit()` skips step 10 entirely, emitting "Already completed (step 11)."
- **Test:** `T10 re-run with step 11 complete: step 10 skipped`.

### 6. Onboard import failure
- **Trigger:** dynamic `import("../../../scripts/onboard.js")` fails inside `runStep10Onboard`.
- **Behavior:** `runStep10Onboard` catches the error and returns `{ name: "onboard", ok: false, detail: "Onboard failed: <msg>" }`. State step 11 is NOT marked (because `onboardResult.ok` is false).
- **Note:** This path is not exercised by a dedicated test because it requires a module-resolution failure that is hard to simulate without mocking the module system. The catch-all in `runStep10Onboard` covers it.

## Guard against unintended session launch in tests

All pre-existing init-module tests (T8/T9) now pass `skipOnboard: true` to avoid triggering the real pi session creation during the step-1-through-9 test suite. Without this flag, `runStep10Onboard` would dynamically import `scripts/onboard.js` and attempt a real `createAgentSession`, which fails in the test environment (no auth, no model registry). The `skipOnboard` flag is the test isolation seam.

## Verification

- `bun run typecheck`: EXIT 0.
- `bun test` (full suite): 539 pass, 0 fail.