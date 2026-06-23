# User Flow Analysis: Installation to Runtime

> End-to-end trace of the user's flow from cloning the repo to production operation.
> Based on actual code, not docs or plans. Each claim is backed by file paths and
> line numbers.

---

## 1. Installation Flow

### 1.1 Clone + Dependency Install

```bash
git clone <repo> && cd autodev-pi && bun install
```

`package.json` (line 13-16):
- Dependencies: `@earendil-works/pi-coding-agent`, `@cortexkit/pi-magic-context`
- No `postinstall` script, no `setup.ts` — the user must manually run `autodev install`

**Result**: Pi runtime installed, Magic Context installed. No AutoDev-specific setup yet.

---

### 1.2 First Startup — Extension Load

When pi starts, it loads the extension registered in `package.json` (line 22-26):

```json
"pi": { "extensions": ["./extensions/autodev"] }
```

`extensions/autodev/index.ts` line 58-72:
```typescript
export default function autodevExtension(pi: ExtensionAPI): void {
  pi.on("before_agent_start", ...);  // Context injection
  for (const mod of MODULES) {       // Register all 20 modules
    mod.register(pi);                 // <-- orchestrator.register() calls startHeartbeat() here
  }
}
```

**Issue F1 — Heartbeat starts before installation is complete**:  
`orchestrator/index.ts` line 33-34 calls `startHeartbeat()` during extension registration,
which starts polling GitHub immediately. If the user hasn't run `autodev install` yet,
the heartbeat will fail (no project registry, no auth) and accumulate errors before
setup is complete.

---

### 1.3 `autodev install` — Installer (refactored)

`cli.ts` routes `autodev install`/`autodev init` through `installer/config-module.ts`
and `installer/install-module.ts` (the old `installer/index.ts` and `installer/steps.ts`
were removed in the installer refactor). The historical 9-step sequence ran:

| Step | What it does | Code | Status |
|------|-------------|------|--------|
| 1 | Check Bun ≥ 1.0, run `bun install` | `steps.ts` 48-89 | ✅ Works |
| 2 | Prompt for LLM provider + API key, write to `auth.json` + `.env` | `steps.ts` 95-157 | ✅ Works, supports import from existing `.pi/auth.json` or `.opencode/auth.json` |
| 3 | Run `npx @cortexkit/magic-context@latest setup --harness pi` | `steps.ts` 164-199 | ✅ Works (external command) |
| 4 | Prompt for VoyageAI API key (or ONNX fallback) | `steps.ts` 204-234 | ✅ Works |
| 5 | Optional Discord setup | `steps.ts` 239-279 | ✅ Works |
| 6 | Create 8 GitHub labels via `gh label create --force` | `steps.ts` 285-334 | ✅ Works (requires `gh` CLI) |
| 7 | Check if `.autodev/reference/` is populated, prompt for `autodev onboard` | `steps.ts` 340-371 | ✅ Works (informational only) |
| **8** | **Run** `autodev docs rebuild` **via execSync** | `steps.ts` 377-396 | ⚠️ **STUB — does nothing** |
| **9** | **Run** `autodev doctor` **via execSync** | `steps.ts` 402-422 | ⚠️ **Superficial check** |

**Issue F2 — Step 8 (`autodev docs rebuild`) is a no-op**:  
`steps.ts` line 384 calls `execSyncFn("autodev docs rebuild", ...)`. The CLI handler
(`cli.ts` lines 174-176) is:
```typescript
} else if (sub === "rebuild") {
  ctx.ui.notify("Rebuilding docs corpus index...", "info");
  ctx.ui.notify("Docs rebuild dispatched.", "info");  // <-- just prints, does nothing
}
```
No call to the actual docs rebuild logic. The step "succeeds" without indexing anything.
Additionally, this only works inside the pi process (where `autodev` is registered);
calling `autodev docs rebuild` from a terminal outside pi would fail with "command not found."

**Issue F3 — Step 9 (`autodev doctor`) is superficial**:  
`steps.ts` line 409 calls `execSyncFn("autodev doctor", ...)`. The CLI handler
(`cli.ts` lines 71-92) only checks: heartbeat state (running/stopped), project registry,
and debug mode flag. ARCHITECTURE.md §30 specifies the doctor should verify:
"[✓] agents are loaded, [✓] guardrails are active, [✓] Magic Context is healthy,
[✓] Loreguard DB is accessible, [✓] the docs corpus is indexed." None of these
checks are implemented.

**Issue F4 — Install state prevents re-configuration**:  
`installer/state.ts` persists completed steps. Re-running `autodev install` skips
all completed steps. If the user wants to update their API key, reconfigure Discord,
or re-seed the knowledge base, there's no `--force` flag to override.

---

## 2. Onboarding Flow

### 2.1 `autodev onboard` — Harbor Master Stub

`cli.ts` lines 132-137:
```typescript
async function handleOnboard(ctx: ExtensionCommandContext): Promise<void> {
  ctx.ui.notify("Launching Harbor Master onboarding...", "info");
  ctx.ui.notify("Use: pi to start an interactive session with the Harbor Master agent.", "info");
  // In a real implementation, this would create a Harbor Master session.
  // For now, we delegate to the user starting pi interactively.
}
```

**Issue F5 — `autodev onboard` is a stub with no Harbor Master session**:
The command does NOT:
- Create a Harbor Master pi session
- Scatter Explore/Librarian agents (per harbor-log.md)
- Execute the onboarding protocol from `.autodev/reference/onboarding-protocol.md`
- Seed the knowledge base
- Populate memory files
- Set up the project registry

The command prints instructions and returns. The 276-line onboarding protocol
in `.autodev/reference/` is consulted by nobody.

### 2.2 Knowledge Base Memory Files — All Empty Templates

Four memory files exist in `.autodev/memory/`:

| File | Lines | Content | Status |
|------|-------|---------|--------|
| `projectbrief.md` | 22 | Template with HTML comments | ❌ Empty |
| `activeContext.md` | 24 | Template with HTML comments | ❌ Empty |
| `techContext.md` | 25 | Partial — has model routing table but no project data | ❌ Unpopulated |
| `harbor-log.md` | 169 | Results from a simulation of a different project | ⚠️ Stale simulation data |

These are injected into every agent session's system prompt via `context.ts`.
Agents receive empty/template sections and stale sales-agent data instead of
useful project context.

**Issue F6 — Memory files are unpopulated templates injected into agent context**:
- `projectbrief.md` says "<!-- populated during onboarding -->" — onboarding doesn't
  populate it
- `activeContext.md` says "<!-- populated during onboarding -->" — same gap
- `techContext.md` has hardcoded AutoDev defaults, not project-specific data
- `harbor-log.md` contains notes from a different project's onboarding simulation
  (recruiter email agent) — completely irrelevant to AutoDev itself

---

## 3. Heartbeat — Autonomous Loop

### 3.1 Startup

`orchestrator/index.ts` line 33-34: Starts heartbeat on extension load.
`orchestrator/heartbeat.ts`:
- Default interval: 5 minutes (`DEFAULT_INTERVAL_MS`, line 52)
- First tick fires immediately, then on interval (line 93-94)
- Exponential backoff on errors: base 30s, max 5 min, 10 retries (lines 54-56)

### 3.2 Each Tick

`heartbeat.ts` `tick()` function (line 115-155):
1. Loads project registry from `.autodev/projects.json`
2. Polls each active project for:
   a. New `autodev-request` issues (via `gh issue list`)
   b. Stalled PRs (>30 min with `autodev-ci-running` label)
   c. Blocked issues (surfaced only, no self-healing)
3. For new issues: calls `dispatchIssue()` → creates Nemo triage session
4. For stalled PRs: comments and transitions to `autodev-blocked`
5. Fires `onTick` callbacks (used by debug module for monitoring)

**Issue F7 — Heartbeat has no dedup across process restarts**:  
Work-item dedup uses `.autodev/work-items/<number>.json` files (line 344-346).
If the heartbeat crashes between dispatching and writing the work-item, the next
tick re-dispatches the same issue. No transaction, no lock.

**Issue F8 — Project registry is never populated**:  
`projects.ts` defines `addProject`/`saveRegistry` but no code calls them.
`loadRegistry()` always falls back to `defaultRegistry()` which guesses the
project name from the cwd directory name and the repo from `git remote get-url origin`.
Multi-project support (ARCHITECTURE.md §32) is structurally impossible — there's
no way to register a second project.

---

## 4. Crew Dispatch Pipeline — The Gap

### 4.1 What Happens

`dispatch.ts` line 35-56: For a new `autodev-request` issue:

1. Builds Nemo's system prompt from `buildNemoPrompt()` (hardcoded string, line 60-87)
2. Spawns Nemo via background manager with model `ollama-cloud/glm-5.2:cloud` and
   tools `["read", "write", "edit", "bash", "grep", "find", "ls"]`
3. Transitions label from `autodev-request` → `autodev-planned`
4. Returns the task ID

### 4.2 What Does NOT Happen

**Issue F9 — The crew dispatch pipeline dead-ends at Nemo**:  
After Nemo runs, nothing collects its output:
- `parseTriageResult()` (dispatch.ts line 102-120) exists but is **never called**
- No code reads Nemo's JSON output to determine Simple/Complicated/Complex/Chaotic
- No code routes to Aronnax for planning
- No code routes to Ned Land for implementation
- No code triggers Oracle review on PR creation
- No code auto-calls `auto_merge_pr` after CI passes

The entire pipeline after initial dispatch is manual. The architecture describes
an autonomous crew (Figure A in ARCHITECTURE.md) but only the first step is
automated:

```
Implemented:  Heartbeat → Nemo (dispatch + label transition) ─┐
                                                                │
Not implemented (all dead ends):                                │
  Nemo result → parse triage → Cynefin classification ─────────┤
    Simple   → Ned Land with task(category="quick")             │
    Complicated → Aronnax plan → Ned Land implementation        │
    Complex  → 5-phase debate → Aronnax → Ned Land              │
    Chaotic  → Watch Officer emergency                          │
  PR opened → Oracle review → label autodev-review ────────────┤
  CI green + review passed → auto_merge_pr ─────────────────────┘
```

### 4.3 Tool List Mismatch

**Issue F10 — Dispatch hardcodes tools different from Nemo's agent definition**:  
`dispatch.ts` line 43:
```typescript
tools: ["read", "write", "edit", "bash", "grep", "find", "ls"]
```
`.pi/agents/nemo.md` declares:
```
tools: read, bash, edit, write, grep, glob
```
- `find` and `ls` are in the dispatch list but NOT in Nemo's definition
- `glob` is in Nemo's definition but NOT in the dispatch list
- The dispatch should load tools from the agent definition, not hardcode them

---

## 5. Implementation Flow

### 5.1 `task` Tool

`delegation/executor.ts`: The `task` tool handles routing by category or subagent type.
It spawns a background session, builds the system prompt, and returns the result.
Anti-re-delegation is enforced: the `task` tool is stripped from spawned sessions
(line 91-93).

### 5.2 Skills Exist But Are Never Loaded

Four skills exist in both `.pi/skills/` and `.autodev/skills/`:

| Skill | File | Trigger |
|-------|------|---------|
| `autodev-triage` | `autodev-triage/SKILL.md` | New `autodev-request` issue |
| `autodev-implement` | `autodev-implement/SKILL.md` | Plan ready |
| `autodev-review` | `autodev-review/SKILL.md` | PR opened |
| `autodev-deploy` | `autodev-deploy/SKILL.md` | PR merged |

**Issue F11 — Skills are dead code — never invoked**:  
- `dispatch.ts` hardcodes Nemo's prompt in `buildNemoPrompt()` instead of loading
  the `autodev-triage` skill
- No code path triggers `autodev-implement` or `autodev-review` or `autodev-deploy`
- The skills exist as documentation but have no runtime effect
- The triage skill says to use `gh issue view <number>` and `rg -l "<keywords>"`,
  but Nemo's dispatch tool list doesn't include `gh` or `rg`

---

## 6. Review Flow

### 6.1 Auto-Merge Pipeline

`autonomy/merge.ts` defines the `auto_merge_pr` tool with 4 gates:
1. CI green → `gh pr checks` all passing
2. Evidence exists → `.omo/evidence/` has `.md` or `.txt` files
3. Label is `autodev-ready` (not `autodev-review`)
4. PR is mergeable → `gh pr view --json mergeable` returns `MERGEABLE`

If all pass: `gh pr merge --squash --delete-head`, label transition, comment.

### 6.2 Gate 3 Label Check Inconsistency

**Issue F12 — Gate 3 requires `autodev-ready` but the pipeline never sets it**:  
ARCHITECTURE.md  (Figure A) shows the label lifecycle:
```
autodev-review → autodev-ready → autodev-merged
```
But there's no code that transitions from `autodev-review` to `autodev-ready`.
The heartbeat doesn't check for review completion. No Oracle review session is
created. No agent runs the `autodev-review` skill. The label `autodev-ready`
is never applied, so the auto-merge gate can never pass *automatically*.

The gate CAN pass if a human manually applies `autodev-ready`, but that defeats
the purpose of an autonomous crew.

---

## 7. Deploy Flow

**Issue F13 — No deployment automation exists**:  
ARCHITECTURE.md §17 describes the Navigator coordinating deployment with optional
liaison. There is:
- No Navigator session creation
- No deployment protocol code
- No liaison coordination
- No `autodev-deploy` skill invocation
- No post-merge hook

Deployment is entirely manual.

---

## 8. CLI Command Analysis

| Command | Actual behavior | Expected per ARCHITECTURE.md | Status |
|---------|----------------|------------------------------|--------|
| `autodev doctor` | Checks heartbeat running, project registry, debug flag | Verifies agents loaded, guardrails active, Magic Context healthy, Loreguard accessible, docs indexed | ❌ Incomplete |
| `autodev onboard` | Prints instructions | Launches Harbor Master session, executes onboarding protocol | ❌ Stub |
| `autodev status` | Shows heartbeat state + active project | Shows work items + active sessions | ⚠️ Partial |
| `autodev stop` | Stops heartbeat timer | No restart mechanism | ⚠️ No `start` command |
| `autodev stop-continuation` | Stops all loops | — duplicate (also in autonomy/index.ts) | ⚠️ Registered twice |
| `autodev docs query` | Prints "dispatched" — no-op | Searches docs corpus | ❌ Stub |
| `autodev docs rebuild` | Prints "dispatched" — no-op | Reingests docs-corpus/ | ❌ Stub |
| `autodev debate start` | Prints "dispatched" — no-op | Starts 5-phase debate | ❌ Stub |
| `autodev debate status` | Prints "no active debates" | Shows active debate state | ❌ Stub |
| `autodev install` | 9-step installer (2 stubs) | Full environment setup | ⚠️ Steps 8-9 are stubs |

---

## 9. Summary of All Issues Found

### Pipeline Gaps (Architecturally incomplete)

| # | Gap | Impact | Root file |
|---|-----|--------|-----------|
| F9 | Nemo's triage output never collected → no routing to Aronnax/Ned Land | Autonomous pipeline ends at dispatch | `dispatch.ts:54` |
| F11 | 4 skills defined but never invoked | Skills are documentation-only | `dispatch.ts:60-87` |
| F12 | `autodev-ready` label never applied automatically → auto-merge gate always blocked | Auto-merge never triggers | `merge.ts:54` |
| F13 | No deployment automation | Post-merge deployment is manual | (not implemented) |
| F5 | Harbor Master onboarding stub | No project context gathered | `cli.ts:132-137` |
| F6 | Memory files are empty templates | Agents get no useful project context | `.autodev/memory/*.md` |
| F8 | Project registry never populated | Multi-project impossible | `projects.ts:66-71` |

### Implementation Bugs

| # | Issue | Severity | File | Line |
|---|-------|----------|------|------|
| F1 | Heartbeat starts before install completes | MEDIUM | `orchestrator/index.ts` | 33-34 |
| F2 | Step 8 docs rebuild is a no-op | LOW | `cli.ts` | 174-176 |
| F3 | Step 9 doctor check is superficial | LOW | `cli.ts` | 71-92 |
| F4 | No `--force` flag for re-installation | LOW | (design — old `installer/steps.ts` removed) | (design) |
| F7 | No transactional dedup for heartbeat crash recovery | LOW | `heartbeat.ts` | 278-308 |
| F10 | Dispatch tool list doesn't match Nemo's agent definition | LOW | `dispatch.ts` | 43 |
| F14 | `stop-continuation` registered twice | INFO | `autonomy/index.ts` + `cli.ts` | 88, 55 |

---

## 10. Verified Working (Positive Findings)

| Flow segment | Status | Evidence |
|-------------|--------|----------|
| Extension module registration | ✅ All 20 modules register | `index.ts` lines 33-54 |
| Context injection event wiring | ✅ Fires on every agent start | `index.ts:60-66`, `context.ts:93-101` |
| Installer Step 1-7 | ✅ Bun check, credentials, Magic Context, VoyageAI, Discord, labels, knowledge base check | `steps.ts:48-371` |
| Heartbeat polling loop | ✅ Polls GitHub, dispatches issues, checks stalled PRs | `heartbeat.ts:115-274` |
| Background agent spawning | ✅ Manager spawns sessions with concurrency control + circuit breaker | `background/manager.ts` |
| Model fallback chains | ✅ Resolves fallbacks from config, classifies errors | `background/fallback.ts` |
| Guardrail engine | ✅ DSL + fallback evaluation, 6 hard stops | `guardrails/index.ts` |
| Loreguard CRUD | ✅ Create, read, search, ratify, archive | `loreguard/index.ts` |
| Docs embedding layer | ✅ VoyageAI + ONNX fallback, SQLite vector store | `docs/index.ts` |
| Team mode | ✅ 6 team tools registered via `pi.registerTool` | `team-mode/index.ts` |
| LSP integration | ✅ 6 LSP tools registered | `lsp/index.ts` |
| Auto-merge tool | ✅ 4-gate check + merge execution | `merge.ts:41-232` |
| Boulder state | ✅ Resume/init modes, progress calculation | `boulder.ts` |
| Continuation loops | ✅ Ralph loop, ULW stub, todo enforcer | `continuation.ts` |
| Debug mode | ✅ 29 tests, event wiring, heartbeat integration | `debug/index.ts` |
| Category system | ✅ Built-in + custom categories, model allowlist | `delegation/` |
| `task` tool | ✅ Category/subagent routing, anti-re-delegation | `executor.ts` |
| `todowrite` tool | ✅ 4-element format enforcement | `tools/handlers.ts:48-97` |
| Comment checker | ✅ Reads file from disk, strips slop, rewrites | `comment-checker/index.ts` |
| Intent gate | ✅ Harbor Master + Nemo intent analysis | `intent-gate/index.ts` |
| MCP integrations | ✅ Context7 (2 tools) + Grep.app (1 tool) | `mcp-integrations/index.ts` |
| Tmux integration | ✅ Interactive bash + team visualization | `tmux/index.ts` |
| Rules injection | ✅ Loads `.omo/rules/*.md` into context | `rules-injection/index.ts` |
| Watch officer monitor | ✅ Proactive deviation detection wiring | `watch-officer-monitor/index.ts` |
| Debate | ✅ 5-phase protocol (stages, transcripts, phase transitions) | `debate/index.ts` |
| Notepad | ✅ Wisdom accumulation with Loreguard fallback | `notepad/index.ts` |
| All 479 tests | ✅ Pass — 0 failures, 1748 expect() calls | `tsc --noEmit` + `bun test` |

---

## 11. Top Priority Fixes

The six issues that would have the most impact on making the system actually autonomous:

| Priority | Issue | Fix |
|----------|-------|-----|
| **P0** | F9 — Dispatch pipeline dead-ends | Wire Nemo's triage output → route to Aronnax/Ned Land based on Cynefin classification. Add `collectNemoResult(taskId)` after `dispatchIssue()` and route accordingly. |
| **P1** | F12 — `autodev-ready` never applied | Add heartbeat logic to check for reviewed PRs (autodev-review label + clean Oracle pass) and auto-transition to `autodev-ready`, then trigger `auto_merge_pr`. |
| **P2** | F5 — Harbor Master stub | Implement `handleOnboard()` to create Harbor Master session, scatter Explore/Librarian agents, execute onboarding protocol, seed knowledge base, and populate memory files. |
| **P3** | F6 — Empty memory files in context injection | Either populate during install/onboard or filter empty/template files from `loadContextFiles()`. |
| **P4** | F1 — Heartbeat starts too early | Gate heartbeat start behind install-completed check. Move `startHeartbeat()` call from `register()` to post-install or post-onboard. |
| **P5** | F2/F3 — CLI stubs | Wire `autodev docs query` to `search_docs`, `autodev docs rebuild` to `docs_rebuild`, `autodev debate start` to debate module. |
