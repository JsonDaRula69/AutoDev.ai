# T8 Init Module — Failure / Resume Evidence

**Task:** T8 — failure and resume behavior for `autodev init` steps 1-5.

**Date:** 2026-06-23

## Failure scenario: package templates dir missing

**Test:** `runInit failure: package templates dir missing -> step 2 fails, others continue, step 6 NOT marked`

- GIVEN: a mock package with `.autodev/` but NO `templates/` subdir.
- WHEN: `runInit()` is called.
- THEN:
  - Step 1 (`autodev-dirs`): ok=true — `.autodev/` subdirs created independently.
  - Step 2 (`templates`): ok=false, detail contains `"Source templates dir missing"`.
  - Step 3 (`github-template`): ok=false — cascades from step 2 because `autodev-request.md` was never copied into `.autodev/templates/`.
  - Step 4 (`project-marker`): ok=true — independent of templates, runs regardless.
  - Step 5 (`omo-dirs`): ok=true — independent of structure steps.
- AND: state step 6 is NOT marked (structure steps didn't all pass).
- AND: state step 7 IS marked (omo succeeded independently).
- AND: `.autodev/` subdirs were still created (step 1 succeeded before step 2 failed).

**Result:**

```
(pass) runInit failure: package templates dir missing -> step 2 fails, others continue, step 6 NOT marked [8.13ms]
```

## Resume scenario: step 6 done, step 7 retried on re-run

**Test:** `runInit resume: step 6 done, step 7 fails then re-run skips 6 and retries 7`

- GIVEN: `init-state.json` already has step 6 marked complete (simulating a prior partial run that finished structure but not omo).
- WHEN: `runInit()` is called again.
- THEN:
  - Steps 1-3 report `"Already completed (step 6)"` and are skipped (no re-execution of dir/template/github creation).
  - Step 4 (`project-marker`) runs (idempotent write, no dedicated state step).
  - Step 5 (`omo-dirs`) runs and succeeds.
  - State step 7 is now marked complete.
  - `.omo/` subdirs exist after the re-run.

**Result:**

```
(pass) runInit resume: step 6 done, step 7 fails then re-run skips 6 and retries 7 [6.52ms]
```

## Idempotent re-run (fast path)

**Test:** `runInit idempotent: full happy run then re-run returns 'already initialized'`

- GIVEN: a full happy `runInit()` already ran (marker exists, steps 6+7 complete).
- WHEN: `runInit()` is called again.
- THEN: returns a single result `{name: "init", ok: true, detail: "already initialized"}` — no steps re-execute.

**Result:**

```
(pass) runInit idempotent: full happy run then re-run returns 'already initialized' [11.24ms]
```

## Conclusion

- Step failures are isolated: a failed step 2 does not abort steps 4 and 5.
- State step 6 is only marked when ALL three structure steps (1-3) succeed — a partial failure leaves step 6 unmarked so the next run retries the full structure phase.
- State step 7 is marked independently of step 6 — omo creation succeeds or fails on its own.
- The fast path correctly short-circuits only when BOTH the marker exists AND both state steps are complete.