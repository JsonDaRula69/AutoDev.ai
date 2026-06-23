# AutoDev pi-foundation Plans 1-3: Comprehensive Code Review

> **Date:** 2026-06-23
> **Branch:** `pi-foundation`
> **Method:** 4 parallel deep-review agents (Plan 1, Plan 2, Plan 3, test-quality audit) + cross-plan `tsc --noEmit` + `bun test` suite run.
> **Test result:** 273 pass, 0 fail. But passing tests != correct code. `tsc --noEmit` fails with 3 errors.
> **Plan files reviewed:** `.omo/plans/autodev-pi-foundation-1-core.md`, `autodev-pi-foundation-2-engine.md`, `autodev-pi-foundation-3-knowledge.md`

---

## Table of Contents

1. [Critical Bugs](#1-critical-bugs-must-fix-before-proceeding)
2. [Major Bugs](#2-major-bugs)
3. [Minor Bugs](#3-minor-bugs)
4. [Inconsistencies](#4-inconsistencies)
5. [Test Quality Assessment](#5-test-quality-assessment)
6. [Summary Statistics](#6-summary-statistics)

---

## 1. Critical Bugs (must fix before proceeding)

### C1 — `ci-is-the-hard-gate` DSL blocks ALL PR merges regardless of CI status

| Field | Value |
|-------|-------|
| **Files** | `extensions/autodev/guardrails/index.ts`, `.autodev/config/guardrails.yaml:40` |
| **Severity** | CRITICAL |
| **Status** | Unfixed |

The real `guardrails.yaml` has `check: "action_type == 'merge' AND ci_status != 'green'"`. But `buildGuardrailContext` deliberately sets `ci_status = undefined` for merge commands (intending the async CI checker to own enforcement). In the DSL evaluator, `undefined != 'green'` evaluates to `true`, so the DSL blocks every `gh pr merge` call before the async checker ever runs.

**In production, no PR can ever merge.**

Tests pass because the test YAML omits `check:` fields (empty expressions are skipped via `if (expr.trim() === "") continue;`), masking the bug entirely. The test YAML at `test/guardrails.test.ts` line 98-100 has no `check:` line for `ci-is-the-hard-gate`, so the DSL path is never exercised in tests.

**Root cause:** The context deliberately leaves `ci_status` undefined for merge commands so the async CI checker (which calls `gh pr checks`) owns the real enforcement. But the DSL check `ci_status != 'green'` treats `undefined` as "not green" and blocks immediately, never reaching the async fallback.

**Fix:** Remove the `check:` field from the `ci-is-the-hard-gate` rule in `guardrails.yaml` (leave enforcement to the async fallback), OR set `ci_status = "unknown"` in the context and change the check to `ci_status == 'unknown'` with a different enforcement path.

---

### C2 — `thinkingLevel` silently dropped by the default session factory

| Field | Value |
|-------|-------|
| **Files** | `extensions/autodev/background/manager.ts:45-74`, `extensions/autodev/delegation/executor.ts:217` |
| **Severity** | CRITICAL (type error + functional failure) |
| **Status** | Unfixed — df2ed3c claimed M5 fix but it is incomplete |

`tsc --noEmit` produces 2 errors:

```
extensions/autodev/background/manager.ts(181,49): error TS2379: Argument of type
  '{ ...; thinkingLevel: string | undefined; }' is not assignable to parameter of
  type 'SessionFactoryConfig' with 'exactOptionalPropertyTypes: true'.
  Types of property 'thinkingLevel' are incompatible.
    Type 'string | undefined' is not assignable to type 'string'.

extensions/autodev/delegation/executor.ts(217,9): error TS2375: Type
  '{ ...; thinkingLevel: string | undefined; }' is not assignable to type 'SpawnConfig'
  with 'exactOptionalPropertyTypes: true'.
```

Beyond the type error, the `defaultSessionFactory` receives `config.thinkingLevel` in `SessionFactoryConfig` but **never passes it to `createAgentSession()`**:

```ts
const sessionOpts: Record<string, unknown> = {
  cwd,
  tools: [...config.tools],
  customTools: config.customTools as never,
  sessionManager: SessionManager.inMemory(),
  resourceLoader,
  modelRegistry,
  authStorage,
};
// config.thinkingLevel is NEVER used here
if (model !== undefined) sessionOpts.model = model;
const { session } = await createAgentSession(sessionOpts as never);
```

The ultrabrain category's `thinkingLevel: "xhigh"` is plumbed through types, the mock, and the manager — then dropped on the floor in the real factory. The plan says "this is a createAgentSession() parameter, NOT a model string suffix." It is neither.

**Fix:** Add `if (config.thinkingLevel !== undefined) sessionOpts.thinkingLevel = config.thinkingLevel;` to `defaultSessionFactory`. Fix the `exactOptionalPropertyTypes` incompatibility by using conditional spread or explicit `undefined` handling.

---

### C3 — Tool execute returns missing required `details` field (TypeScript compile errors)

| Field | Value |
|-------|-------|
| **Files** | `extensions/autodev/tools/session-handlers.ts:72`, `extensions/autodev/docs/index.ts:492,511,530`, `extensions/autodev/tools/handlers.ts:80,131,143` |
| **Severity** | CRITICAL (type error) |
| **Status** | Unfixed |

`tsc --noEmit` fails:

```
extensions/autodev/tools/session-handlers.ts(72,5): error TS2741: Property 'details'
  is missing in type '{ content: { type: "text"; text: string; }[]; }' but required
  in type 'ToolResult'.
```

Multiple tool execute handlers return `{ content: [...] }` without the required `details: {}` field. The local `ToolResult` interface in `handlers.ts:33` requires `details: Record<string, unknown>`. `bun test` passes because it bypasses type checking, but `tsc --noEmit` fails — the code does not compile under strict TypeScript.

**Affected locations:**
- `session-handlers.ts:72` — session not found return
- `session-handlers.ts:85` — session read success return
- `session-handlers.ts:143` — session search return
- `docs/index.ts:492` — search_docs execute return
- `docs/index.ts:511` — docs_status execute return
- `docs/index.ts:530` — docs_rebuild execute return
- `handlers.ts:80` — todowrite validation error return
- `handlers.ts:131` — look_at missing path return
- `handlers.ts:143` — look_at cannot read file return

**Fix:** Add `details: {}` to every `ToolResult` return that omits it.

---

## 2. Major Bugs

### M1 — Circuit breaker "event wins" spec NOT enforced

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/background/circuit-breaker.ts`, `manager.ts` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

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
| **Status** | Unfixed |

Plan says "block direct deploy actions by any agent other than the Navigator."

The DSL check is `action_type == 'deploy' AND agent != 'navigator'`. But `agent` is only set for `review` tool calls (line 488-491 of index.ts), not for bash deploy commands. For bash deploy, `agent` is `undefined`. So `agent != 'navigator'` → `undefined != 'navigator'` → `true` → blocks ALL deploy commands including Navigator's.

The hardcoded fallback also blocks ALL deploy bash regardless of agent (lines 522-528 don't check agent). So both DSL and fallback block everyone. The "only Navigator can deploy" feature is NOT implemented — everyone is blocked.

**Fix:** Set `agent` from the session context or event metadata for bash calls, and check `agent === 'navigator'` to allow Navigator deploys in the fallback handler.

---

### M3 — `no-secrets-in-code` YAML check targets wrong action_type

| Field | Value |
|-------|-------|
| **File** | `.autodev/config/guardrails.yaml` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

YAML check is `action_type == 'commit' AND contains_secrets(diff)`. But:
- For `write`/`edit` tool calls (where secrets live), `action_type = "write"` — check is false.
- For `git commit` bash calls, `action_type = "commit"` but `diff` is empty (extractWrittenText returns "" for non-write/edit) — `contains_secrets("")` is false.

So the DSL path NEVER fires for this rule. The hardcoded fallback saves it for write/edit by checking `event.toolName === "write" || "edit"`. But the YAML config is wrong — it would never trigger via the evaluator.

**Fix:** Change the YAML check to `action_type == 'write' AND contains_secrets(diff)` or remove the `check:` field and rely on the fallback.

---

### M4 — `one-task-at-a-time` YAML check uses wrong operator

| Field | Value |
|-------|-------|
| **File** | `.autodev/config/guardrails.yaml` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

YAML check is `active_tasks > 1`. But `active_tasks` is 0 or 1 (one active task tracked in `active-task.json`). So `> 1` is never true. Should be `>= 1` or `active_tasks == 1`.

The hardcoded fallback handles it correctly via the todowrite logic, but the DSL path is dead.

**Fix:** Change to `active_tasks >= 1` or remove the `check:` field.

---

### M5 — `follow-the-plan` DSL check uses undefined context variables

| Field | Value |
|-------|-------|
| **File** | `.autodev/config/guardrails.yaml` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

YAML check is `action_type == 'implement' AND plan_exists AND implementation_deviates_from_plan`. The variables `plan_exists` and `implementation_deviates_from_plan` are NOT in the `GuardrailContext` interface. They resolve to `undefined` (falsy), making the AND always false. DSL never fires.

The hardcoded fallback handles it by checking if the write target path is in the active plan's scope. But the DSL path is dead.

**Fix:** Either populate these variables in the context, or remove the `check:` field and rely on the fallback.

---

### M6 — `never-modify-debate-transcripts` YAML checks wrong path

| Field | Value |
|-------|-------|
| **File** | `.autodev/config/guardrails.yaml` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

YAML check is `path_starts_with('.autodev/reference/')` but the description says "Debate transcripts" which live in `.autodev/debates/`. Copy-paste error from the `never-modify-reference-docs` rule. The DSL checks the wrong directory.

The hardcoded fallback correctly uses `DEBATES_DIR` for debate transcripts, so the fallback works. But the DSL path is broken.

**Fix:** Change the YAML path check to `.autodev/debates/`.

---

### M7 — Comment checker only NOTIFIES, never STRIPS

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/comment-checker/index.ts:151-170` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

Plan says "Strips AI-slop from comments after edit/write tool calls." The `tool_result` handler calls `stripSlop()` to detect slop, emits a `ctx.ui.notify()` warning, and returns `undefined`. The file on disk retains the slop. The pure `stripSlop()` function computes `cleaned` content but it is never applied — the handler returns `undefined` (no-op), not a modified result.

The module name says "strip" but it only "flags."

**Fix:** Either return a modified tool result that replaces the file content, or use `pi.on("tool_call")` (pre-execution) to mutate the input before the write happens, or post-process the file on disk after detection.

---

### M8 — `look_at` tool does NO multimodal analysis

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/tools/handlers.ts:130-155` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

Plan says "analyze media files (images, PDFs) using pi's multimodal capabilities." The implementation reads the file to verify existence, determines the MIME type, then returns a placeholder string `"Analyzing <path> (<mime>) for: <goal>"`. No multimodal analysis occurs. The tool is a file-existence checker with a formatted string.

**Fix:** Return the file as image content blocks to the model for multimodal processing, or integrate with pi's multimodal API.

---

### M9 — `session_read` truncates messages to 2000 chars (plan says this is for `session_search` only)

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/tools/session-handlers.ts:83` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

The plan specifies the 2000-char limit for `session_search` only ("limit message text to 2000 chars per entry for search"). `session_read` applies the same truncation via `entryText(e).slice(0, 2000)`, silently cutting off message content when reading a session. A user reading a full session gets truncated messages with no indication.

**Fix:** Remove the `.slice(0, 2000)` from `session_read` (line 83). Keep it only in `session_search`.

---

### M10 — Loreguard FTS5 search loses relevance ranking

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/loreguard/operations.ts` (`searchDecisions`) |
| **Severity** | MAJOR |
| **Status** | Unfixed |

The FTS query returns rowids `ORDER BY rank` (relevance), but the final SELECT re-sorts `ORDER BY id`, destroying the ranking:

```ts
const ftsRows = db.prepare("SELECT rowid AS id FROM decisions_fts WHERE decisions_fts MATCH ? ORDER BY rank").all(query);
// ... then ...
const rows = db.prepare(`SELECT ... FROM decisions WHERE id IN (${placeholders})${statusClause} ORDER BY id`).all(...ids);
```

Results come back in ID order, not relevance order. Tests don't catch this because they only check result count and title, not order.

**Fix:** Use a JOIN with the FTS table, or sort the results array to match the FTS rowid order.

---

### M11 — `notepad` uses `require()` in ESM module

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/notepad/index.ts:29` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

`const mod = require("../loreguard/index.js")` — the project is `"type": "module"` with `verbatimModuleSyntax` in tsconfig. Works under Bun's `require` interop, but violates ESM purity and would break under strict Node ESM.

**Fix:** Use a dynamic `await import()` wrapped in an async initialization function, or restructure to use a top-level ESM import with a lazy accessor.

---

### M12 — Context injection has NO behavioral test

| Field | Value |
|-------|-------|
| **File** | `test/extension-load.test.ts:88-92` |
| **Severity** | MAJOR |
| **Status** | Unfixed |

Plan T5 acceptance: "A test that loads the extension and verifies the context injection configuration includes AGENTS.md, CONTEXT.md, and .autodev/memory/ files."

The test only checks `typeof mod.loadContextFiles === "function"` — never calls it, never verifies content is loaded. Pure greenlight. The test passes even if `loadContextFiles` returned `[]`.

**Fix:** Add a test that calls `loadContextFiles(process.cwd())` and asserts the result includes AGENTS.md, CONTEXT.md, and `.autodev/memory/*.md` content.

---

## 3. Minor Bugs

### m1 — `register()` never called for ANY of the 15 modules in tests

| Field | Value |
|-------|-------|
| **File** | `test/extension-load.test.ts` |
| **Severity** | MINOR |
| **Status** | Unfixed |

Every module's `register()` function is completely untested. The test only checks `typeof register === "function"`. A no-op `register` passes every test. The entire pi extension wiring layer (`pi.on()`, `pi.registerTool()`, `pi.registerCommand()`) is unverified.

---

### m2 — `todowrite` test name contradicts assertion

| Field | Value |
|-------|-------|
| **File** | `test/tools.test.ts` |
| **Severity** | MINOR |
| **Status** | Unfixed |

Test named `"todowrite rejects an empty todo array is accepted (no-op)"` asserts `isError: falsy`. The name says "rejects" but greenlights acceptance. Misleading test name.

---

### m3 — `suggestLore` category schema lacks enum constraint

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/loreguard/tools.ts:26-29` |
| **Severity** | MINOR |
| **Status** | Unfixed |

Schema uses `Type.String()` with no `enum`. Invalid categories silently coerce to `"fact"` in the executor:

```ts
const cat = params.category === "onboarding" || params.category === "design"
  ? params.category
  : "fact";
```

The DB CHECK constraint would reject invalid categories, but the executor coerces before hitting DB. Silent data quality issue.

**Fix:** Use `Type.String({ enum: ["fact", "onboarding", "design"] })` in the schema.

---

### m4 — Loreguard doc comment says "five pi tools" but registers 6

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/loreguard/index.ts` header comment |
| **Severity** | MINOR |
| **Status** | Unfixed |

`archive_lore` was added as M7 fix (commit df2ed3c), but the header comment still says "registers five pi tools" while listing 6. Documentation inconsistency.

---

### m5 — `isPathInPlan` matching is too lenient

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/guardrails/index.ts` |
| **Severity** | MINOR |
| **Status** | Unfixed |

`p.endsWith(normalized) || normalized.endsWith(p)` means writing to `bar/foo.ts` matches plan path `foo.ts`. Additionally, `collectPlannedPaths` regex matches any backtick-quoted word (including non-paths like "pending", "read", "completed"). This makes `follow-the-plan` overly permissive — writes to files not explicitly in the plan can pass.

---

### m6 — Guardrail YAML `description:` parser captures trailing quote

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/guardrails/evaluator.ts` |
| **Severity** | MINOR |
| **Status** | Unfixed |

Greedy `(.*)` in the description regex includes the trailing `"` from quoted YAML values. Descriptions display with a trailing quote in warning messages. Cosmetic.

---

### m7 — Fallback respawn bypasses concurrency check

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/background/manager.ts` |
| **Severity** | MINOR |
| **Status** | Unfixed |

`handleSessionError` calls `void this.startTask(id)` directly (bypassing `spawn`'s concurrency check). If the fallback model's provider is already at max concurrency, the respawn exceeds the limit. Also doesn't call `drainQueue` after freeing the old slot, so queued tasks for the old provider wait longer than necessary.

---

### m8 — No ONNX fallback branching test

| Field | Value |
|-------|-------|
| **File** | `test/docs.test.ts` |
| **Severity** | MINOR |
| **Status** | Unfixed |

Plan requires "Local ONNX fallback works when VOYAGE_API_KEY is unset." All tests use mock embeddings and never exercise the real `embed()` function's VoyageAI vs ONNX branching. The mock bypasses it entirely.

---

### m9 — `evidenceExists` checks for ANY file, not task-specific

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/guardrails/index.ts` |
| **Severity** | MINOR |
| **Status** | Unfixed |

Checks for any `.md` or `.txt` in `.omo/evidence/`. If ANY evidence file exists, ALL commits are allowed, even if the evidence isn't for the current task. The plan doesn't specify per-task evidence matching, so this is arguably acceptable, but it's a loose check.

---

## 4. Inconsistencies

### I1 — Plan 1 text says `DefaultResourceLoader`, implementation uses `before_agent_start`

| Field | Value |
|-------|-------|
| **Files** | `.omo/plans/autodev-pi-foundation-1-core.md:49,139`, `extensions/autodev/context.ts:7-12` |
| **Resolution** | Implementation is correct (ratified by project memory id 511) |

Plan T5 specifies context injection via `DefaultResourceLoader` with `agentsFilesOverride`. Implementation uses `pi.on("before_agent_start", ...)` because extensions cannot construct the session loader (sessions are created by pi internally, not by the extension). Project memory id 511 ratifies this as the correct approach. Plan text is stale.

---

### I2 — Comment checker uses `tool_result` event, plan says `tool_call`

| Field | Value |
|-------|-------|
| **Files** | `.omo/plans/autodev-pi-foundation-1-core.md:51,144`, `extensions/autodev/comment-checker/index.ts:152` |
| **Resolution** | Implementation is semantically more correct |

Plan says "tool_call event handler." Implementation uses `tool_result` (post-execution). `tool_result` fires after the write/edit completes, so the handler can inspect what was actually written. `tool_call` fires before execution and can only inspect intent. The plan's own wording ("inspects write/edit results") implies post-execution, contradicting its "tool_call event handler" phrase. The implementation resolved this contradiction correctly.

---

### I3 — Plan says "4 custom skills" in Must NOT section, "5 skills" everywhere else

| Field | Value |
|-------|-------|
| **File** | `.omo/plans/autodev-pi-foundation-3-knowledge.md:84` |
| **Resolution** | Plan typo. Implementation correctly ports 5. |

Plan line 84: "only AutoDev's 4 custom skills." Plan line 71: lists 5 skills. Plan line 162: "5 AutoDev skills." The "Must NOT" section has a typo — should be 5. Implementation correctly ports 5.

---

### I4 — `engineer.yaml` has `model_preference: deepseek-v4-flash` (not in allowlist)

| Field | Value |
|-------|-------|
| **Files** | `src-agents/engineer.yaml:4`, `.pi/agents/{quartermaster,boatswain,navigator,watch-officer}.md` |
| **Resolution** | Implementation correctly overrides to `glm-5.2:cloud` |

Source YAML specifies `deepseek-v4-flash` (a model NOT in `models.json`). Implementation correctly overrides to `glm-5.2:cloud` per the plan's routing table (triage/plan/deploy ops = glm-5.2:cloud). The stale source preference is ignored.

---

### I5 — 6 "stub" modules have real implementations (from Plans 2-3 merge)

| Field | Value |
|-------|-------|
| **Resolution** | Expected post-merge, not a Plan 1 bug |

Plan 1 T5 says 11 modules should be stubs. Currently 6 have full implementations (guardrails, background, delegation, loreguard, docs, tools) because Plans 2-3 were merged into `pi-foundation`. The 5 remaining stubs (lsp, tmux, mcp-integrations, rules-injection, watch-officer-monitor) are correctly stubs. This is expected since the branch accumulates all sub-plans.

---

## 5. Test Quality Assessment

### Overall: 273 tests, ~178 strong, ~95 weak/greenlight

### Strong Files (genuinely verify behavior)

| File | Tests | Verdict |
|------|-------|---------|
| `guardrails.test.ts` | 41 | Every hard stop tested for block + allow with specific reasons. Expression evaluator unit-tested with 14 cases. |
| `loreguard.test.ts` | 30 | 3-distinct-approver verified, rejection-blocks-ratification verified, FTS5 search verified, archive idempotency verified. |
| `docs.test.ts` | 28 | Cosine similarity math properties (identical=1.0, zero=0.0, symmetric, negative=-1.0), ranking verified, empty-state hint content verified. |
| `background.test.ts` | 21 | Concurrency (6th queued), fallback (actual model verified), circuit breaker (aborted + error + timeout), parent notification verified. |
| `delegation.test.ts` | 24 | Actual model/agent/tools/thinkingLevel verified via FakeSpawner. Error paths verified with specific error codes. |
| `notepad.test.ts` | 11 | File persistence verified by reading files back. Backend routing verified. |
| `comment-checker.test.ts` | 10 | Pattern detection + line/column numbers verified. |
| `intent-gate.test.ts` | 16 | Classification + hidden intentions + Cynefin mapping + probing questions verified. |

### Weak Files (greenlight risk)

#### `extension-load.test.ts` — 20 tests, ALL `typeof === "function"` tautologies

**A `register()` function that does nothing passes every test.** No module's `register()` is ever called. Context injection behavior (`loadContextFiles`, `augmentSystemPrompt`) is never exercised — only checked for export existence. This is the #1 systemic gap.

**Critical missing:**
- No test invokes `register()` on any module with a fake `ExtensionAPI`
- No test verifies `loadContextFiles()` returns AGENTS.md, CONTEXT.md, memory files
- No test verifies `augmentSystemPrompt()` actually appends context

#### `skills.test.ts` — 7 tests, file existence + frontmatter shape only

**A SKILL.md with lorem ipsum >100 chars passes.** Zero content verification. No test checks that `autodev-triage` actually describes triage, references Nemo, or mentions Cynefin.

**Critical missing:**
- Skill content correctness (does autodev-triage describe triage?)
- Skill references to valid tools/agents
- Markdown validity

#### `magic-context-integration.test.ts` — 26 tests, ~12 are circular

The ctx_* mock tests assert that mocks return hardcoded values the mocks were configured to return. `storeLearning` returns `written: false` (nothing was written) and the test accepts this as success. The "integration" never integrates.

**Critical missing:**
- No test verifies AutoDev's `storeLearning` actually invokes `ctx_memory`
- No test verifies the `written: false` descriptor would be consumed by a real ctx_memory call

### Critical Missing Coverage (ranked by risk)

1. **`register()` never called for ANY of the 15 modules** — the entire pi extension wiring layer is untested
2. **`edit` tool with secrets in `newText`** — only `write` tested for `no-secrets-in-code`
3. **Loreguard FTS5 injection / special characters / empty query** — FTS5 is a documented attack surface
4. **ONNX fallback branching** — real `embed()` function's VoyageAI vs ONNX switch never tested
5. **`session_search` 50-session limit** — no test with >50 sessions
6. **Skills content correctness** — lorem ipsum passes
7. **End-to-end guardrail flow** — `register()` → `pi.on("tool_call")` → handler → block is never exercised
8. **`todowrite` with invalid status/priority at runtime** — type-level only, no runtime validation test
9. **Circuit breaker race condition** — event arriving during trip
10. **Fallback exhausted** — all models tried, what happens?

---

## 6. Summary Statistics

| Category | Count |
|----------|-------|
| Critical bugs | 3 |
| Major bugs | 12 |
| Minor bugs | 9 |
| Inconsistencies | 5 |
| Total findings | 29 |
| TypeScript compile errors (`tsc --noEmit`) | 3 |
| Tests passing (`bun test`) | 273/273 |
| Strong tests | ~178 |
| Weak/greenlight tests | ~95 |
| Critical missing coverage items | 10 |

### df2ed3c commit verification

The df2ed3c commit claimed to fix 8 major bugs (M1-M8). Verification results:

| Claimed fix | Status |
|-------------|--------|
| M1 notepad search_lore fallback | **Fixed** — verified in notepad.test.ts |
| M2 guardrail cleanup precision | **Not fully fixed** — YAML check expressions still broken (C1, M3, M4, M5, M6) |
| M3 guardrail DSL evaluator | **Not fully fixed** — DSL evaluator works but YAML configs have wrong expressions that cause incorrect production behavior (C1) |
| M4 background factory wiring | **Not fully fixed** — factory receives thinkingLevel but drops it (C2) |
| M5 thinkingLevel wiring | **Not fully fixed** — plumbed through types but dropped in defaultSessionFactory (C2) |
| M6 rejection blocks ratification | **Fixed** — verified in loreguard.test.ts |
| M7 loreguard archive operation | **Fixed** — verified in loreguard.test.ts |
| M8 session_read path resolution | **Partially fixed** — path resolution works but truncation issue remains (M9) |

### Build status

| Check | Result |
|-------|--------|
| `bun test` | 273 pass, 0 fail |
| `tsc --noEmit` | **3 errors** (C2 x2, C3 x1) |
| `grep -r "@opencode-ai" extensions/ .pi/` | 0 (pass) |
| `grep "oh-my-openagent\|oh-my-opencode" package.json` | 0 (pass) |