# autodev-pi-foundation-code-review-fixes — Code Review Fixes

> **BRANCH:** All work on the `pi-foundation` branch. Do NOT push to `main`.
>
> **PREREQUISITE:** Plans 1-3 complete. This plan fixes issues found in the comprehensive code review before Plan 4 begins.
>
> **SOURCE OF TRUTH:** ARCHITECTURE.md (design), .autodev/reference/ (process), this plan (scope).

## TL;DR

**What you'll get:** Fix 3 critical bugs, 12 major bugs, 4 minor bugs, and 3 TypeScript compile errors found in the comprehensive code review. After this plan, `tsc --noEmit` passes, all guardrail YAML check expressions are correct, the comment checker actually strips slop, and the session factory passes thinkingLevel through.

**Effort:** M — 6 todos across 2 waves.
**Risk:** Low — targeted fixes to existing code, no new architecture.

## Design Specification

| Document | Key sections |
|----------|-------------|
| `ARCHITECTURE.md` | §6 Guardrails, §7-8 Background, §21 Comment Checker, §12 Custom Tools |
| `code-review.md` | Full review document with 29 findings |

## Scope

### Must have

- Fix all 3 TypeScript compile errors (`tsc --noEmit` must pass)
- Fix all 3 critical bugs (C1, C2, C3)
- Fix all 12 major bugs (M1-M12)
- Fix 4 selected minor bugs (m3, m5, m6, m7 — the ones with functional impact)
- Add missing behavioral tests for context injection (M12) and register() calls (m1)
- All existing tests continue to pass (273+)

### Must NOT have

- Must NOT change agent system prompts, descriptions, or names
- Must NOT change the model routing (just updated)
- Must NOT add new features — only fix existing bugs
- Must NOT push to `main`

## Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 (Critical: tsc + C1-C3) | — | T2, T3, T4 | — |
| T2 (Guardrail YAML fixes: M2-M6) | T1 | — | T3, T4 |
| T3 (Background + delegation fixes: M1, M7-m7) | T1 | — | T2, T4 |
| T4 (Tools + loreguard + notepad fixes: M8-M11) | T1 | — | T2, T3 |
| T5 (Comment checker fix: M7) | T1 | — | T2, T3, T4 |
| T6 (Test quality: M12, m1, behavioral tests) | T2, T3, T4, T5 | — | — |

Critical Path: T1 → (T2 ∥ T3 ∥ T4 ∥ T5) → T6

## Todos

### Wave 0 — Critical Fixes (Sequential)

- [ ] 1. Fix 3 TypeScript compile errors + 3 critical bugs

  What to do: Fix all `tsc --noEmit` errors and critical bugs so the codebase compiles and core functionality works:

  **C2 — thinkingLevel type + dropped in factory:**
  - In `extensions/autodev/background/types.ts`: Change `readonly thinkingLevel?: string` to `readonly thinkingLevel?: string | undefined` in `SpawnConfig`, `SessionFactoryConfig`, and `TaskState` (to satisfy `exactOptionalPropertyTypes: true`).
  - In `extensions/autodev/delegation/executor.ts:217`: Use conditional spread: `...(config.thinkingLevel !== undefined ? { thinkingLevel: config.thinkingLevel } : {})` instead of direct assignment.
  - In `extensions/autodev/background/manager.ts:181`: Same conditional spread pattern for the factory call.
  - In `extensions/autodev/background/manager.ts` `defaultSessionFactory`: Add `if (config.thinkingLevel !== undefined) sessionOpts.thinkingLevel = config.thinkingLevel;` before calling `createAgentSession()`.

  **C3 — ToolResult missing `details` field:**
  - In `extensions/autodev/tools/session-handlers.ts:72`: Add `details: {}` to the "Session not found" return.
  - In `extensions/autodev/tools/session-handlers.ts:85`: Add `details: {}` to the session_read success return.
  - In `extensions/autodev/tools/session-handlers.ts:143`: Add `details: {}` to the session_search return.
  - In `extensions/autodev/docs/index.ts:492,511,530`: Add `details: {}` to all three docs tool execute returns.
  - In `extensions/autodev/tools/handlers.ts:80,131,143`: Add `details: {}` to all three error returns.

  **C1 — ci-is-the-hard-gate DSL blocks ALL merges:**
  - In `.autodev/config/guardrails.yaml`: Remove the `check:` field from the `ci-is-the-hard-gate` rule. The async CI checker in the hardcoded fallback handles enforcement correctly. The DSL check `ci_status != 'green'` is broken because `ci_status` is deliberately undefined for merge commands.

  Must NOT do: Do NOT change the async CI checker logic. Do NOT remove the `ci-is-the-hard-gate` rule entirely — only remove its `check:` field.
  Acceptance criteria: `tsc --noEmit` passes with 0 errors. `guardrails.yaml` ci-is-the-hard-gate has no `check:` field. `defaultSessionFactory` passes `thinkingLevel` to `createAgentSession()`.
  Commit: Y | fix(critical): tsc errors + thinkingLevel factory + ci-gate YAML + ToolResult details

- [ ] 2. Fix guardrail YAML check expressions (M2-M6)

  What to do: Fix 5 guardrail YAML check expressions that are broken in `.autodev/config/guardrails.yaml`:

  **M3 — no-secrets-in-code wrong action_type:**
  Change `check: "action_type == 'commit' AND contains_secrets(diff)"` to `check: "action_type == 'write' AND contains_secrets(diff)"`.

  **M4 — one-task-at-a-time wrong operator:**
  Change `check: "active_tasks > 1"` to `check: "active_tasks >= 1"`.

  **M5 — follow-the-plan undefined variables:**
  Remove the `check:` field from the `follow-the-plan` rule. The hardcoded fallback handles this correctly via path-scoping. The DSL variables `plan_exists` and `implementation_deviates_from_plan` don't exist in `GuardrailContext`.

  **M6 — never-modify-debate-transcripts wrong path:**
  Change `check: "path_starts_with('.autodev/reference/')"` to `check: "path_starts_with('.autodev/debates/')"`. Copy-paste error from never-modify-reference-docs.

  **M2 — never-deploy-directly blocks Navigator:**
  The DSL check `agent != 'navigator'` fails because `agent` is undefined for bash deploy commands. Remove the `check:` field from `never-deploy-directly` — the hardcoded fallback handles deploy detection. To implement the Navigator exemption properly: in the hardcoded fallback for `never-deploy-directly` (guardrails/index.ts), add a comment noting that agent identity is not available in the tool_call event, so all deploys are blocked until T13 (dispatch) can pass agent identity to the guardrail context. This is a known limitation documented in the code.

  Must NOT do: Do NOT change the hardcoded fallback logic (it works correctly). Only fix the YAML check expressions.
  Acceptance criteria: All YAML check expressions either work correctly with the GuardrailContext or have their `check:` field removed (relying on fallback). `no-secrets-in-code` check uses `action_type == 'write'`. `one-task-at-a-time` check uses `>= 1`. `never-modify-debate-transcripts` check uses `.autodev/debates/`. `follow-the-plan` and `never-deploy-directly` have no `check:` field.
  Commit: Y | fix(guardrails): correct YAML check expressions for 5 rules

- [ ] 3. Fix background + delegation issues (M1, m7)

  What to do:

  **M1 — Circuit breaker "event wins" not enforced:**
  In `extensions/autodev/background/manager.ts`, in the `onCircuitBreakerTrip` method (or equivalent), add a check: before calling `finishTask`, check if the task has already received a terminal event (agent_end). Add a flag `receivedTerminalEvent` to the task state, set it in `handleEvent` when `agent_end` arrives. In the trip handler, if `receivedTerminalEvent` is true, skip the abort and let the event processing complete normally.

  **m7 — Fallback respawn bypasses concurrency check:**
  In `extensions/autodev/background/manager.ts` `handleSessionError`: instead of calling `void this.startTask(id)` directly, call `this.spawn(id)` which goes through the concurrency check. Also call `this.drainQueue()` after freeing the old slot to process queued tasks.

  Acceptance criteria: Circuit breaker trip checks for terminal event flag before aborting. Fallback respawn goes through spawn() (concurrency checked). drainQueue called after slot freed.
  Commit: Y | fix(background): circuit breaker event-wins + fallback concurrency

- [ ] 4. Fix tools + loreguard + notepad issues (M8-M11)

  What to do:

  **M9 — session_read truncates to 2000 chars:**
  In `extensions/autodev/tools/session-handlers.ts:83`: Remove the `.slice(0, 2000)` from the session_read return. The 2000-char limit is only for session_search (line 102, SEARCH_ENTRY_CHAR_LIMIT). session_read should return full message content.

  **M10 — Loreguard FTS5 loses relevance ranking:**
  In `extensions/autodev/loreguard/operations.ts` `searchDecisions`: After getting FTS rowids ordered by rank, preserve that order in the final results. Instead of `ORDER BY id`, use a CASE statement or array sorting to match the FTS rank order. One approach: fetch results in FTS order by iterating the rowids and fetching each by id, then filtering by status.

  **M11 — notepad uses require() in ESM:**
  In `extensions/autodev/notepad/index.ts:29`: Replace `require("../loreguard/index.js")` with a top-level ESM `import { suggestLore } from "../loreguard/index.js"` wrapped in a try/catch using dynamic import. Since `storeDecision` is sync, use a lazy accessor pattern: declare `let suggestLoreImpl: typeof import("../loreguard/index.js").suggestLore | undefined` and initialize it in an async `init()` function called from `register()`. If init hasn't run or import failed, `suggestLoreImpl` is undefined and the fallback to ctx_memory activates.

  **m3 — suggestLore category lacks enum:**
  In `extensions/autodev/loreguard/tools.ts`: Change `Type.String()` for the category parameter to `Type.Union([Type.Literal("fact"), Type.Literal("onboarding"), Type.Literal("design")])` (TypeBox enum pattern).

  Acceptance criteria: session_read returns full messages (no truncation). Loreguard search returns results in FTS rank order. notepad uses ESM import (no require()). suggestLore schema validates category as enum.
  Commit: Y | fix(tools+loreguard+notepad): session_read truncation + FTS5 ranking + ESM import + category enum

### Wave 1 — Polish (Parallel after T1)

- [ ] 5. Fix comment checker to actually strip (M7)

  What to do: The comment checker currently only notifies — it never strips slop from files. The plan says "Strips AI-slop from comments after edit/write tool calls."

  In `extensions/autodev/comment-checker/index.ts`: The `tool_result` handler calls `stripSlop()` to detect slop and emits a `ctx.ui.notify()` warning, then returns `undefined` (no-op). The file on disk retains the slop.

  Fix approach: After detecting slop, read the file from disk, apply the cleaned content from `stripSlop()`, and write it back. This is a post-processing approach:
  1. After detecting slop in a write/edit result, extract the file path from the tool result
  2. Read the file content from disk
  3. Apply `stripSlop()` to get the cleaned content
  4. Write the cleaned content back to disk using `Bun.write()` or `fs.writeFileSync()`
  5. Notify the user that slop was stripped

  Alternative: If pi's tool_result event supports returning a modified result, return the cleaned content as the modified tool result. Check if the event handler can return a modified result object.

  Add a test that verifies: after a write with slop, the file on disk has the slop removed.

  Acceptance criteria: After a write/edit with AI-slop comments, the file on disk has the slop stripped. Test verifies file content before and after.
  Commit: Y | fix(comment-checker): actually strip AI-slop from files, not just notify

- [ ] 6. Add behavioral tests (M12, m1)

  What to do: Add the missing behavioral tests identified in the code review:

  **M12 — Context injection behavioral test:**
  In `test/extension-load.test.ts`: Add a test that calls `loadContextFiles(process.cwd())` and asserts the result includes entries for AGENTS.md, CONTEXT.md, and at least one `.autodev/memory/*.md` file. The test should verify actual file content is loaded, not just that the function exists.

  **m1 — register() called with fake ExtensionAPI:**
  Create `test/extension-register.test.ts`: For each of the 15 modules, create a fake `ExtensionAPI` (mock object with `on()`, `registerTool()`, `registerCommand()`, `getActiveTools()`, `getAllTools()`, etc. as no-op functions that record calls). Call `register(fakePi)` on each module. Verify:
  - No module throws during registration
  - Modules that should register tools (team-mode, loreguard, docs, tools, delegation) actually call `fakePi.registerTool()`
  - Modules that should register event handlers (guardrails, comment-checker, watch-officer-monitor) call `fakePi.on()`
  - Modules that should register commands (T13 CLI — not yet implemented, skip) — skip for now
  - Stub modules (lsp, tmux, mcp-integrations, rules-injection) don't register anything

  Acceptance criteria: Context injection test verifies actual file content loaded. register() test calls register on all 15 modules with fake ExtensionAPI. At least 5 modules verified to call registerTool or on.
  Commit: Y | test: behavioral tests for context injection + register() calls

## Final verification wave

- [ ] F1. `tsc --noEmit` passes with 0 errors
- [ ] F2. `bun test` passes with 273+ tests (all existing + new)
- [ ] F3. All guardrail YAML check expressions are correct or removed
- [ ] F4. Comment checker actually strips files (not just notifies)
- [ ] F5. session_read returns full messages (no truncation)
- [ ] F6. Loreguard search returns FTS-ranked results
- [ ] F7. thinkingLevel is passed through to createAgentSession

## Commit strategy

- One commit per todo (T1-T6).
- All commits land on `pi-foundation`.
- Evidence at `.omo/evidence/task-N-code-review-fixes.txt`.

## Success criteria

1. `tsc --noEmit` passes with 0 errors.
2. `bun test` passes with 273+ tests.
3. All 3 critical bugs fixed (C1, C2, C3).
4. All 12 major bugs fixed (M1-M12).
5. 4 minor bugs fixed (m3, m5, m6, m7).
6. Context injection has behavioral test.
7. register() tested with fake ExtensionAPI for all 15 modules.
8. Comment checker strips slop from files on disk.
9. session_read returns full message content.
10. Loreguard search preserves FTS5 relevance ranking.
11. All guardrail YAML check expressions correct or removed.
12. `grep -r "@opencode-ai" extensions/ .pi/` returns zero.
13. `grep "oh-my-openagent" package.json` returns zero.