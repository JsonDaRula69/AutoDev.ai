# T10 — Harbor Master Onboard Auto-Launch (Happy Path)

Date: 2026-06-23

## Task

Implement plan T10: add step 10 to `runInit()` to auto-launch Harbor Master onboard, and rewrite `cmdOnboard()` in `scripts/cli.ts` to create a real pi session.

## Changes

### `extensions/autodev/installer/init-module.ts`
- Added `STEP_ONBOARD = 11` constant (step 10 tracked as state step 11).
- Extended `runInit()` fast-path check to include `onboardDone`.
- Added step-10 block after step 9: if `onboardDone` → "Already completed (step 11)"; if `skipOnboard=true` → mark step 11, emit skipped result; else → `runStep10Onboard()` in-process (dynamic import of `scripts/onboard.js`), mark step 11 on success.
- Added `runStep10Onboard()` helper that calls `runOnboard({ projectRoot, notify })` and wraps the result in an `InstallFixResult`.
- Updated module header docstring to document step 10 / state step 11.

### `scripts/onboard.ts` (new)
- `runOnboard(opts: OnboardOptions): Promise<number>` — the real onboard launcher.
- Resolves Harbor Master agent definition via `loadAgent()` from `extensions/autodev/delegation/agents.js` (central `~/.AutoDev/agents/harbor-master.md`).
- Resolves onboarding protocol from `~/.AutoDev/reference/onboarding-protocol.md`.
- Builds combined system prompt (agent body + protocol injection).
- Creates a real pi `AgentSession` via `createAgentSession()` from `@earendil-works/pi-coding-agent` (lazy import; falls back to stub on failure).
- Runs the session via `session.prompt()` with an onboarding greeting.
- Writes `.autodev/memory/projectbrief.md` (placeholder seeded post-session).
- Fallback: emits manual onboarding instructions when pi SDK unavailable or agent definition missing.
- All collaborators (`sessionFactory`, `loadHarborMaster`, `loadOnboardingProtocol`, `writeMemory`) are injectable for tests.

### `scripts/cli.ts`
- Rewrote `cmdOnboard()` to dispatch to `runOnboard({ projectRoot: process.cwd(), notify })` — removed the stub message.

## Tests

### `extensions/autodev/installer/__tests__/init-module.test.ts`
- Updated all 10 existing tests to pass `skipOnboard: true` and expect 11 results (10 original + 1 onboard).
- Added "T10 skipOnboard=true: step 11 marked, no session launched" — verifies step 11 marked and no session launched.
- Added "T10 re-run with step 11 complete: step 10 skipped" — verifies step 10 skipped when step 11 already complete.

### `scripts/__tests__/onboard.test.ts` (new, 5 tests)
- Happy: injected fake session → prompt called, dispose called, memory written, returns 0.
- Missing agent: `loadHarborMaster` undefined → fallback stub, returns 1, no session created.
- Pi SDK unavailable: `sessionFactory` throws → fallback stub, returns 1.
- Memory write fails: `writeMemory` returns false → warning emitted, returns 0.
- Default memory writer writes `.autodev/memory/projectbrief.md`.

## Verification

- `bun run typecheck`: tsc --noEmit EXIT 0.
- `bun test scripts/__tests__/onboard.test.ts`: 5 pass, 0 fail.
- `bun test extensions/autodev/installer/__tests__/init-module.test.ts`: 12 pass, 0 fail.
- `bun test` (full suite): 539 pass, 0 fail.

## Outcome

Step 10 auto-launches the Harbor Master onboard session in-process (not subprocess). `cmdOnboard()` now creates a real pi session. Fallback to manual instructions when the pi SDK is unavailable. T11 can wire the CLI commands to dispatch to this implementation directly.