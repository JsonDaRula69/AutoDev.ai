# Code Review: Plans 1-4 Completion

> Comprehensive line-by-line code review and completion check against all 4 plan
> files. Conducted after Plans 1 (Core), 2 (Engine), 3 (Knowledge), and 4
> (Autonomous) were marked complete.

**Review date**: 2026-06-23
**Scope**: All extension modules, agent files, test files, config files, build config
**Method**: Read each file, cross-reference against plan specifications and ARCHITECTURE.md
**Test suite**: 479 pass / 0 fail / 1748 expect() calls — `tsc --noEmit` clean

---

## BLOCKERS (Runtime failures in production)

### B1 — `one-task-at-a-time` DSL check blocks completing the active task

| Field | Value |
|-------|-------|
| **File** | `.autodev/config/guardrails.yaml` |
| **Rule ID** | `one-task-at-a-time` |
| **Line** | 62 |
| **Severity** | BLOCKER |

**What's wrong:**

The `check:` field evaluates `active_tasks >= 1` in the DSL evaluator BEFORE the
fallback handler runs (guardrails/index.ts lines 412-423). When an active task
exists and a `todowrite` call tries to COMPLETE it (not start a new one), the
DSL evaluates:

```
active_tasks >= 1  →  1 >= 1  →  true
```

This returns `{ block: true, reason: "one-task-at-a-time" }` immediately, and
the fallback never executes. The fallback is the only code path that recognizes
"the active task is being completed, so it should be allowed." The result: the
crew can never complete a task through `todowrite`.

**Why tests didn't catch this:**

The test YAML in `test/guardrails.test.ts` (lines 82-126) defines
`one-task-at-a-time` WITHOUT a `check:` field:

```yaml
hard_stops:
  - id: one-task-at-a-time
    description: "One task at a time"
    enforcement: block_new_task
```

No `check:` means the DSL evaluator skips it (`expr.trim() === ""`), so the
fallback always handles it. Tests pass because they test the fallback directly.
The production YAML adds `check: "active_tasks >= 1"`, which changes the
behavior path but is not covered by tests.

**Why it was missed in the code review fixes plan:**

The previous round (code-review-fixes plan) removed `check:` fields from
`follow-the-plan` and `never-deploy-directly` for exactly this reason — the DSL
evaluator cannot express the nuanced intent the fallback encodes. The same
treatment was needed for `one-task-at-a-time` but was overlooked.

**Fix:**

Remove the `check:` field from `one-task-at-a-time` in `guardrails.yaml`.
The fallback handler owns this rule's intent:

```yaml
  - id: one-task-at-a-time
    description: "One task at a time. Only one task can be in_progress (active) at a time."
    enforcement: block_new_task
    # No check: — the fallback handles the richer logic that allows completing
    # the active task while blocking new in_progress when one already exists.
    # The DSL evaluator cannot express "block unless the active task is being
    # completed", so the check field is removed and the fallback owns this rule.
```

---

## MEDIUM (Functional gaps)

### B2 — Reference docs not injected into agent context

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/context.ts` |
| **Line** | 150-170 (around `loadMemoryFiles`) |
| **Severity** | MEDIUM |

**What's wrong:**

ARCHITECTURE.md §28 (Context Injection) specifies that `.autodev/reference/`
docs should be injected into every agent session as "immutable technical truth":

> `.autodev/reference/` docs injected as virtual context (immutable technical truth).

The actual implementation in `context.ts` only loads AGENTS.md, CONTEXT.md, and
`.autodev/memory/*.md`. There is no code path that reads from `.autodev/reference/`.

**Impact:**

Agents don't automatically see the four reference specs:
- `onboarding-protocol.md` — Harbor Master interview protocol
- `workflow-specification.md` — Dispatch state machine, guardrails, label lifecycle
- `discord-setup.md` — Discord bridge configuration
- `README.md` — Reference directory overview

These files are accessible via `search_docs` (if indexed) or grep, but they are
not automatically present in agent context at session startup. The architecture
spec is explicit about injection, not just discoverability.

**Fix:**

Add a `loadReferenceFiles()` function alongside `loadMemoryFiles()` and include
the reference block in the augmented system prompt. Structure similar to the
memory loader:

```typescript
function loadReferenceFiles(root: string): string {
  const refDir = resolve(root, ".autodev", "reference");
  if (!existsSync(refDir)) return "";
  const files = readdirSync(refDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (files.length === 0) return "";

  const sections = files.map((name) => {
    const content = readOptional(resolve(root, ".autodev", "reference", name));
    if (content === undefined) return undefined;
    return `<!-- autodev-reference: ${name} -->\n${content}`;
  }).filter(Boolean);

  if (sections.length === 0) return "";
  return `\n\n# Reference Docs (Immutable Truth)\n\n${sections.join("\n\n")}\n`;
}
```

Then include it in the `augmentSystemPrompt` return:

```typescript
const memoryBlock = loadMemoryFiles(root);
const referenceBlock = loadReferenceFiles(root);
const result = [event.systemPrompt];
if (memoryBlock) result.push(memoryBlock);
if (referenceBlock) result.push(referenceBlock);
return { systemPrompt: result.join("") };
```

---

### B5 — Race condition in notepad registration prevents Loreguard routing

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/notepad/index.ts` |
| **Lines** | 39-46, 235-255 |
| **Severity** | MEDIUM |

**What's wrong:**

The `register()` function has a race condition that permanently disables the Loreguard decision routing path:

```typescript
// 1. Async dynamic import started (promise is void'd — runs in background)
void initSuggestLore();

// 2. Synchronous check: search_lore IS registered at this point
const active = pi.getActiveTools();
searchLoreAvailable = Array.isArray(active) && active.includes("search_lore");
// → searchLoreAvailable = true ✓

// 3. But suggestLoreImpl is undefined (dynamic import hasn't resolved yet)
if (suggestLoreImpl === undefined) {
    searchLoreAvailable = false;  // ← ALWAYS fires, overrides the true
}
```

Then `initSuggestLore()` resolves asynchronously and sets `suggestLoreImpl`, but **never re-sets `searchLoreAvailable = true`**. The flag stays `false` permanently.

**Impact:**

Every single call to `storeDecision()` takes the fallback path (`ctx_memory:ARCHITECTURE`) instead of routing to Loreguard ADRs. This subverts the entire purpose of the notepad system — decisions are never written as draft ADRs through `suggest_lore`, so they never enter the draft→ratified lifecycle.

The fallback path is functional (it works), but the primary route (Loreguard ADRs) is dead code. The test path works because `setSuggestLoreImpl()` + `setSearchLoreAvailable(true)` are synchronous.

**Fix:**

In `initSuggestLore()`, re-set `searchLoreAvailable` when the import succeeds:

```typescript
async function initSuggestLore(): Promise<void> {
  try {
    const mod = await import("../loreguard/index.js");
    suggestLoreImpl =
      typeof mod.suggestLore === "function"
        ? (mod.suggestLore as typeof suggestLoreImpl)
        : undefined;
    // If loreguard imports successfully and search_lore was registered,
    // re-enable the loreguard routing path that was disabled by the
    // suggestLoreImpl === undefined check in register().
    if (suggestLoreImpl !== undefined) {
      searchLoreAvailable = true;
    }
  } catch {
    suggestLoreImpl = undefined;
  }
}
```

This ensures that after the async import resolves, the flag that was erroneously forced to `false` during synchronous registration is re-set to `true`.

---

### B6 — Watch Officer plan scope reader constructs broken file path

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/watch-officer-monitor/index.ts` |
| **Line** | 51 |
| **Severity** | MEDIUM |

**What's wrong:**

The `readPlanScope()` function constructs a path to the active plan file but assumes `active_plan` is just a plan name (e.g., `"autodev-pi-foundation"`) when it is actually a full absolute path.

In `boulder.ts`, `createBoulderState()` stores `active_plan` as:

```typescript
// planPath = join(plansDir, f) = "/Users/.../.omo/plans/foo.md"
active_plan: planPath,
```

Then `readPlanScope()` does:

```typescript
const activePlan = readActivePlan(projectRoot);
// activePlan = "/Users/.../.omo/plans/foo.md"
const planPath = resolve(projectRoot, ".omo", "plans", `${activePlan}.md`);
// planPath = "/Users/.../.omo/plans//Users/.../.omo/plans/foo.md.md"
```

**Impact:**

`readPlanScope()` always either returns `undefined` (the path doesn't exist) or throws (if somehow it did exist). The Watch Officer's plan deviation detection is entirely broken:

- `readPlanScope()` returns `undefined`
- `isWithinPlanScope()` always returns `true` (no active plan → no scope check)
- **Every plan deviation goes undetected**

**Root cause:**

The code was written assuming `active_plan` was a bare filename like `"plan-name"` but it's actually a full path like `"/Users/.../plan-name.md"`. The `createBoulderState` function stores `planPath` (the full path), and there's no normalization.

**Fix:**

Handle both possible path formats — if `activePlan` already looks like an absolute file path, use it directly:

```typescript
function readPlanScope(projectRoot: string): string | undefined {
  const activePlan = readActivePlan(projectRoot);
  if (!activePlan) return undefined;
  // activePlan may be a full path (from createBoulderState) or a bare name.
  const planPath = existsSync(activePlan)
    ? activePlan
    : resolve(projectRoot, ".omo", "plans", `${activePlan}.md`);
  if (!existsSync(planPath)) return undefined;
  try {
    return readFileSync(planPath, "utf8");
  } catch {
    return undefined;
  }
}
```

---

## LOW (Documentation / comment issues)

### B3 — Missing Navigator exemption comment on `never-deploy-directly`

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/guardrails/index.ts` |
| **Line** | ~523 |
| **Severity** | LOW |

**What's wrong:**

The code review fixes plan's M2 fix required a comment explaining that agent
identity is not available in `tool_call` events, so the Navigator exemption
for `never-deploy-directly` cannot be enforced at the guardrail level. This
comment was never added.

Looking at line 523:

```typescript
// never-deploy-directly: block bash deploy-like commands.
if (hardStopIds.has("never-deploy-directly") && event.toolName === "bash") {
```

No mention of the Navigator exemption limitation.

**Fix:**

Add the explaining comment:

```typescript
// never-deploy-directly: block bash deploy-like commands.
// NOTE: Agent identity (Navigator exemption) is not available in the
// tool_call event — all agents are blocked from deploy actions by this
// hard stop. T13 dispatch can pass agent identity to the guardrail
// context if per-agent exemptions are needed in the future.
```

---

### B4 — Stale evidence path in guardrails YAML description

| Field | Value |
|-------|-------|
| **File** | `.autodev/config/guardrails.yaml` |
| **Rule ID** | `evidence-or-it-didnt-happen` |
| **Line** | 26 |
| **Severity** | LOW |

**What's wrong:**

The rule description says:

```
Every change that touches runtime behavior must be proven on a real surface.
Write proof to .autodev/evidence/ before committing.
```

But the actual code uses `.omo/evidence/` (the pi-foundation convention). The
path `.autodev/evidence/` is the legacy OmO path. This mismatch is confusing
for anyone reading the config trying to understand where evidence files go.

**Fix:**

Update the description to reference the correct path:

```
Write proof to .omo/evidence/ before committing.
```

---

## CONTRADICTIONS & INCONSISTENCIES (Design concerns)

### C1 — Agent identity body vs role description mismatch (operations agents)

| Field | Value |
|-------|-------|
| **Files** | `.pi/agents/{quartermaster,boatswain,navigator,watch-officer}.md` |
| **Severity** | INFO |

**What's wrong:**

The 4 operations agents share the Engineer identity body verbatim:

> You are the Engineer, the systems integrity officer on a self-sustaining
> engineering team. Your function is verification: you run the tests, you
> watch the CI, you confirm that what was built actually works.

But their YAML descriptions describe different specialities:

| Agent | Description says |
|-------|------------------|
| quartermaster | "GitHub operations specialist — manages label transitions, monitors CI, creates/manages issues, computes EVM metrics" |
| boatswain | "QA gates. Test execution and evidence validation before review." |
| navigator | "Deployment readiness. Coordinates deployment and verifies health post-merge." |
| watch-officer | "Health monitoring, self-healing, and escalation routing. 4-tier fault management." |

The watch-officer adds a **Proactive Monitoring** section that partly corrects
this. The other three have no role-specific preamble before the shared body.
A quartermaster will see "run tests and verify CI" as its main self-concept
while its actual job is label management and board sync — a system-prompt
mismatch that may cause the agent to self-identify incorrectly.

This is by-design per ARCHITECTURE.md §4 (the Engineer identity block is
shared), but it creates a real prompt-incoherence issue. The watch-officer
addressed it; the others should too.

**Recommendation:**

Add role-specific preamble sections for quartermaster, boatswain, and navigator
before the shared Engineer body. Each should describe the agent's actual role:

- **quartermaster**: GitHub operations, label gates, EVM metrics, board sync
- **boatswain**: Evidence validation, QA gate enforcement
- **navigator**: Deployment coordination, post-deploy health verification

Keep the Engineer body as the shared "operating principles" section. Follow
the watch-officer pattern: preamble → shared body → constraints/capabilities.

---

### C2 — Unused model in models.json allowlist

| Field | Value |
|-------|-------|
| **File** | `.autodev/config/models.json` |
| **Severity** | INFO |

The allowlist contains 5 models. One is not referenced by any agent:

| Model | In allowlist | Used by |
|-------|:---:|:--------|
| `ollama-cloud/glm-5.2:cloud` | ✅ | nemo, aronnax, harbor-master, metis, conseil |
| `ollama-cloud/deepseek-v4-pro` | ✅ | oracle, momus |
| `ollama-cloud/kimi-k2.7-code` | ✅ | ned-land |
| `ollama-cloud/deepseek-v4-flash` | ✅ | explore, quartermaster, boatswain, navigator, watch-officer |
| `ollama-cloud/glm-5.1:cloud` | ✅ | **Not referenced by any agent** |

`glm-5.1:cloud` is dead config. Either remove it or add a comment documenting
it as a fallback reserve (it is the next model the reactive fallback would try
if `glm-5.2:cloud` were exhausted).

---

### C3 — Static import inconsistency in `boulder.ts`

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/autonomy/boulder.ts` |
| **Lines** | 14, 266 |
| **Severity** | INFO |

**What's wrong:**

Line 14 imports specific functions from `node:fs/promises`:
```typescript
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
```

But line 266 dynamically imports the same module to access `stat`:
```typescript
const stat = await import("node:fs/promises").then((m) => m.stat(pf.path));
```

This works but is inconsistent. `stat` should be included in the static import:

```typescript
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
```

And line 266 simplified to:
```typescript
const fileStat = await stat(pf.path);
```

Wait, `stat` would shadow the outer scope if used directly. So it should be
aliased in the import:
```typescript
import { readFile, writeFile, readdir, mkdir, stat as statFile } from "node:fs/promises";
```

---

### C4 — `stop-continuation` command registered twice

| Field | Value |
|-------|-------|
| **Files** | `extensions/autodev/autonomy/index.ts` (line 88), `extensions/autodev/orchestrator/cli.ts` (line 55) |
| **Severity** | INFO |

**What's wrong:**

`stop-continuation` is registered in two places:
1. `autonomy/index.ts` — as a standalone `pi.registerCommand("stop-continuation", ...)`
2. `orchestrator/cli.ts` — as a subcommand `autodev stop-continuation`

Both work — the first is a top-level command, the second is a subcommand under
`autodev`. Both call `stopAllLoops()`. This is not a bug but it's duplicative
and may confuse developers.

**Recommendation:**

Pick one registration point. The orchestrator CLI handler (`autodev stop-continuation`) is the canonical location since all other stopping is accessed through `autodev` subcommands. Remove the standalone registration in `autonomy/index.ts`.

---

### C5 — Fragile global require mock in autonomy test

| Field | Value |
|-------|-------|
| **File** | `extensions/autodev/autonomy/__tests__/autonomy.test.ts` |
| **Lines** | 14-15, 28-30, 33-35 |
| **Severity** | INFO |

**What's wrong:**

The test replaces `require("node:child_process").execSync` globally to mock
`gh` CLI output:

```typescript
const mockExecSync = mock<(args: string) => string>(() => "");
const originalExecSync = require("node:child_process").execSync;

beforeEach(() => {
  (require("node:child_process") as any).execSync = mockExecSync;
});

afterEach(() => {
  (require("node:child_process") as any).execSync = originalExecSync;
});
```

This works on Bun (which provides `require()` as a global even in ESM modules),
but is fragile — it mutates a cached module's exports globally. If:
- Bun changes its module caching behavior
- The `execSync` binding is inlined at import time
- A second test file imports from `node:child_process` between tests

...the mock may not take effect or may leak across test files. The module-level
`require()` inside `merge.ts` (line 226) and `heartbeat.ts` (line 179) means
the mock works for those specific call sites, but the mechanism is fragile.

**Recommendation (not a blocker):**

Refactor the `ghExec()` helper into a small utility module and inject it rather
than relying on global require mocking. The current approach works for now but
creates a maintenance risk.

---

## VERIFICATION SUMMARY

### Verified correct

| Check | Result | Evidence |
|-------|--------|----------|
| TypeScript type check | ✅ PASS | `tsc --noEmit` exit code 0 |
| All 479 tests | ✅ PASS | 0 failures, 1748 expect() calls |
| Agent model assignments | ✅ Match ARCHITECTURE.md §4 | All 13 agents checked |
| Extension module structure | ✅ Correct | 20 modules, each with `register(pi)` export |
| Context injection mechanism | ✅ Correct | Uses `before_agent_start` event (per memory #511) |
| Comment checker | ✅ Correct | Reads disk, strips slop, rewrites back |
| Notepad fallout logic (M11) | ✅ Correct | Falls back to `ctx_memory` correctly when `search_lore` unavailable |
| Session_read truncation (M9) | ✅ Correct | No stale `.slice(0, 2000)` on line 85 |
| Session schemas | ✅ Correct | `name`, `description`, `model` as plain strings, no missing required fields |
| thinkingLevel propagation | ✅ Correct | Conditional spread in both executor and background manager |
| Anti-re-delegation | ✅ Correct | `task` tool filtered from spawned sessions, spawned agents cannot re-delegate |
| Heartbeat double-start guard | ✅ Correct | `startHeartbeat()` checks existing timer before creating new one |
| Guardrail evaluation order | ✅ Correct | DSL first, fallback second — allows richer fallback for nuanced rules |
| Active-task cleanup | ✅ Correct | Non-active completion doesn't clear `active-task.json` |
| Loreguard auto-ratify | ✅ Correct | 3 approvals AND zero rejections required |
| Loreguard archive | ✅ Complete | `archive_lore` tool, search excludes archived by default |
| Debug mode | ✅ Complete | 29 tests, event wiring, heartbeat integration, auto-init from env var |
| MCP integrations | ✅ Complete | Context7 (2 tools) + Grep.app (1 tool) registered |
| Auto-merge pipeline | ✅ Complete | 4-gate check in `auto_merge_pr` tool |
| Boulder state | ✅ Complete | Resume/init modes, progress calculation, continuation prompt |
| Continuation loops | ✅ Complete | Ralph loop, ULW stub, todo enforcer, `stop-continuation` |
| Plan 4 integration modules | ✅ Complete | LSP (6 tools), tmux, MCP integrations, rules-injection, watch-officer monitor |

### Priority action items

| # | Severity | File | Issue | Fix effort |
|---|----------|------|-------|------------|
| B1 | **BLOCKER** | `.autodev/config/guardrails.yaml` | DSL check `active_tasks >= 1` blocks completing the active task — crew can never finish via `todowrite` | 2 lines |
| B2 | **MEDIUM** | `extensions/autodev/context.ts` | Reference docs `.autodev/reference/` never injected into agent context despite ARCHITECTURE.md spec | ~30 lines |
| B5 | **MEDIUM** | `extensions/autodev/notepad/index.ts` | Race condition in `register()` always disables Loreguard routing — all decisions go to `ctx_memory` fallback | 3 lines |
| B6 | **MEDIUM** | `extensions/autodev/watch-officer-monitor/index.ts` | `readPlanScope()` constructs double-nested path — plan deviation detection entirely broken | 5 lines |
| B3 | LOW | `extensions/autodev/guardrails/index.ts` | Missing Navigator exemption comment on `never-deploy-directly` fallback | 3 lines |
| B4 | LOW | `.autodev/config/guardrails.yaml` | Stale evidence path `.autodev/evidence/` should be `.omo/evidence/` | 1 line |
| C1 | INFO | `.pi/agents/{quartermaster,boatswain,navigator}.md` | Agent identity body doesn't match role description for 3 operations agents | ~20 lines each |
| C4 | INFO | `autonomy/index.ts` + `orchestrator/cli.ts` | `stop-continuation` registered twice (standalone + subcommand) | 5 lines |
