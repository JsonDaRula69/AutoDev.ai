# AutoDev pi-foundation Plans 1-3: Remaining Code Review Issues

> **Date:** 2026-06-23
> **Branch:** `pi-foundation`
> **Status:** Post-fix verification. `tsc --noEmit` passes clean (0 errors). `bun test` passes 293/293. 20 of 29 original findings resolved. This document lists the 9 remaining issues only.

---

## Major Bugs (3 remaining)

### M1 — Circuit breaker "event wins" spec NOT enforced

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/background/circuit-breaker.ts`, `manager.ts` |
| **Severity** | MAJOR |

Plan says: "If a final event arrives concurrently with trip, the event wins — idempotent notify, no double-abort."

The double-abort IS prevented (via `isTerminal` guard on both paths). But "event wins" is NOT enforced — whichever runs first wins. If the stale timer fires, the trip completes synchronously and marks the task terminal BEFORE any abort-induced event arrives in a microtask. The event is then discarded via the `isTerminal` check.

In single-threaded JS, there's no true concurrency, so "concurrent" means ordered by the event loop. The current implementation is "first-to-run wins" which is NOT "event wins."

**Fix:** To make the event always win, the trip would need to defer or check for pending events. One approach: in `onCircuitBreakerTrip`, before calling `finishTask`, check if the session has already emitted a terminal event (via a flag set in `handleEvent`).

---

### M2 — `never-deploy-directly` blocks Navigator too

| Field | Value |
|-------|-------|
| **Files** | `.autodev/config/guardrails.yaml`, `extensions/autodev/guardrails/index.ts:522-528` |
| **Severity** | MAJOR |

Plan says "block direct deploy actions by any agent other than the Navigator."

The YAML `applies_to` list correctly excludes `navigator`, but the hardcoded fallback at lines 522-528 blocks ALL deploy bash commands regardless of which agent is running — it never checks agent identity. The `applies_to` config is dead at the code level.

If only non-Navigator agents trigger the guardrail (because the dispatch system respects `applies_to`), behavior is correct. But the guardrail engine itself doesn't enforce `applies_to`, so any agent running a deploy bash command is blocked.

**Fix:** Enforce `applies_to` in the guardrail engine by checking the current agent against the rule's `applies_to` list before blocking, or set `agent` from session context and check `agent === 'navigator'` in the fallback handler.

---

### M8 — `look_at` tool does NO multimodal analysis

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/tools/handlers.ts:130-160` |
| **Severity** | MAJOR |

Plan says "analyze media files (images, PDFs) using pi's multimodal capabilities." The implementation reads the file to verify existence, determines the MIME type, then returns a placeholder string `"Analyzing <path> (<mime>) for: <goal>"`. No multimodal analysis occurs. The tool is a file-existence checker with a formatted string.

**Fix:** Return the file as image content blocks (base64-encoded with MIME type) to the model for multimodal processing, or integrate with pi's multimodal API to pass the file content to the vision-capable model.

---

## Minor Bugs (6 remaining)

### m2 — `todowrite` test name contradicts assertion

| Field | Value |
|-------|-------|
| **File** | `test/tools.test.ts:86` |
| **Severity** | MINOR |

Test named `"todowrite rejects an empty todo array is accepted (no-op)"` asserts `isError: falsy`. The name says "rejects" but the assertion accepts. Misleading test name.

**Fix:** Rename to `"todowrite accepts an empty todo array as a no-op"`.

---

### m4 — Loreguard doc comment says "five pi tools" but registers 6

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/loreguard/index.ts:6, 131` |
| **Severity** | MINOR |

`archive_lore` was added as a 6th tool, but the header comment at line 6 and the registration comment at line 131 still say "five pi tools" / "five Loreguard tools" while listing/registering 6.

**Fix:** Change "five" to "six" in both comments.

---

### m5 — `isPathInPlan` matching is too lenient

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/guardrails/index.ts:353-358` |
| **Severity** | MINOR |

`p.endsWith(normalized) || normalized.endsWith(p)` means writing to `bar/foo.ts` matches plan path `foo.ts`. Additionally, `collectPlannedPaths` regex matches any backtick-quoted word (including non-paths like "pending", "read", "completed"). This makes `follow-the-plan` overly permissive — writes to files not explicitly in the plan can pass.

**Fix:** Use exact path matching or basename+directory matching rather than bare suffix matching. Filter `collectPlannedPaths` to only extract strings that look like file paths (contain a `.` or `/`).

---

### m6 — Guardrail YAML `description:` parser captures trailing quote

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/guardrails/evaluator.ts` |
| **Severity** | MINOR |

Greedy `(.*)` in the description regex includes the trailing `"` from quoted YAML values. Descriptions display with a trailing quote in warning messages. Cosmetic.

**Fix:** Change the description regex to use non-greedy `.*?` like the `check:` field regex, or strip trailing quotes after capture.

---

### m8 — No ONNX fallback branching test

| Field | Value |
|-------|-------|
| **File** | `test/docs.test.ts` |
| **Severity** | MINOR |

Plan requires "Local ONNX fallback works when VOYAGE_API_KEY is unset." All tests use mock embeddings and never exercise the real `embed()` function's VoyageAI vs ONNX branching. The mock bypasses it entirely.

**Fix:** Add a test that calls `embed()` with `VOYAGE_API_KEY` unset and verifies it routes to `onnxEmbed` (or mock the ONNX path and verify it's called).

---

### m9 — `evidenceExists` checks for ANY file, not task-specific

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/guardrails/index.ts:238` |
| **Severity** | MINOR |

`evidenceExists(projectRoot)` checks for any `.md` or `.txt` in `.omo/evidence/`. If ANY evidence file exists, ALL commits are allowed, even if the evidence isn't for the current task. The plan doesn't specify per-task evidence matching, so this is arguably acceptable, but it's a loose check.

**Fix:** Accept an optional task ID parameter and check for evidence files matching the current task (e.g. `task-N-*.md` pattern).

---

## Test Quality Gaps (still present)

### `skills.test.ts` — still existence-only

7 tests check file existence + frontmatter shape. A SKILL.md with lorem ipsum >100 chars passes. Zero content verification — no test checks that `autodev-triage` actually describes triage, references Nemo, or mentions Cynefin.

### `magic-context-integration.test.ts` — circular mock tests remain

~12 tests assert that mocks return hardcoded values the mocks were configured to return. `storeLearning` returns `written: false` (nothing was written) and the test accepts this as success.

### Critical missing coverage still unaddressed

1. **`edit` tool with secrets in `newText`** — only `write` tested for `no-secrets-in-code`
2. **Loreguard FTS5 injection / special characters / empty query** — FTS5 is a documented attack surface
3. **`session_search` 50-session limit** — no test with >50 sessions
4. **Skills content correctness** — lorem ipsum passes
5. **End-to-end guardrail flow** — `register()` → `pi.on("tool_call")` → handler → block never exercised
6. **Circuit breaker race condition** — event arriving during trip
7. **Fallback exhausted** — all models tried, what happens?

---

## Summary

| Category | Total | Remaining |
|----------|-------|-----------|
| Critical | 3 | 0 |
| Major | 12 | 3 (M1, M2, M8) |
| Minor | 9 | 6 (m2, m4, m5, m6, m8, m9) |
| Inconsistencies | 5 | 0 (all acknowledged) |
| **Total** | **29** | **9** |

| Build check | Result |
|-------------|--------|
| `bun test` | 293 pass, 0 fail |
| `tsc --noEmit` | 0 errors |
| `@opencode-ai` imports | 0 |
| `oh-my-openagent` in package.json | 0 |

Plans 1-3 and code-review-fixes are 100% checkbox-complete. Plan 4 (autonomous) is 0/10 — next phase, not in scope.