# Task 5 — AutoDev pi Docs Cross-Reference Audit

**Date:** 2026-06-22
**Branch:** pi-foundation
**Task:** Cross-reference every architectural claim in README.md, ARCHITECTURE.md, STRUCTURE.md, and ROADMAP.md against the pi-foundation plan, pi's documented API, Magic Context's capabilities, and the immutable workflow/onboarding specs. Fix discrepancies.

## Sources Verified Against

- `.omo/plans/autodev-pi-foundation.md` (339 lines) — the full implementation plan
- `.autodev/reference/workflow-specification.md` (401 lines) — dispatch, debate, guardrails, labels
- `.autodev/reference/onboarding-protocol.md` (276 lines) — Harbor Master interview
- `.autodev/memory/techContext.md` (25 lines) — model routing
- `README.md` (253 lines)
- `ARCHITECTURE.md` (700 lines)
- `STRUCTURE.md` (214 lines)
- `ROADMAP.md` (139 lines)

---

## Cross-Reference Table: ARCHITECTURE.md (32 sections)

| # | Section | Verified | Source | Notes |
|---|---------|----------|--------|-------|
| 1 | System Overview | YES | plan T5/T3/T10/T14 | ASCII diagram matches plan's component list (pi runtime, AutoDev extension, Magic Context, Loreguard, Discord, Heartbeat, built-in MCPs, GitHub). No HTTP server, no global binary, in-process sessions. |
| 2 | Process Topology | YES | plan T5/T3/T10 | Each component's pi API matches: createAgentSession, SessionManager, ExtensionAPI, defineTool, pi.on, bun:sqlite, setInterval + gh CLI. |
| 3 | Crew Dispatch Model | YES | workflow-specification.md §2 | State machine matches: request→triage→classify→debate→plan→implement→review→deploy→close→blocked. Label lifecycle matches §2.3. Cynefin classification matches §3.1. |
| 4 | Agent Session Architecture | YES | plan T4, techContext.md | 13 agents listed (nemo, aronnax, ned-land, conseil, oracle, momus, metis, harbor-master, quartermaster, boatswain, navigator, watch-officer, explore). Model routing matches techContext.md: triage/plan/deploy=glm-5.2:cloud, execute=deepseek-v4-pro, review=deepseek-v4-pro. |
| 5 | Extension Architecture | YES | plan T5 | Modular file layout matches T5's design: index.ts + 11 module directories. Entry point imports all modules. No two parallel todos touch same file. |
| 6 | Guardrail Engine | YES (after fix) | workflow-specification.md §4.1, plan T7 | **FIXED**: Was 5 hard stops, now 6 matching workflow-spec §4.1. Added never-deploy-directly. Renamed evidence-required→evidence-or-it-didnt-happen, ci-is-hard-gate→ci-is-the-hard-gate to match spec exactly. tool_call interception (pi.on("tool_call")) matches plan T7. Rules load from .autodev/config/guardrails.yaml. |
| 7 | Background Agent Management | YES | plan T8 | createAgentSession + SessionManager.inMemory(). Max 5 per key. Circuit breaker 180s. Parent-wake notifier. Error classifier. session.subscribe() for completion. |
| 8 | Model Fallback Chains | YES | plan T8 | 429/500/502/503/504/timeout triggers fallback. Proactive (per-agent config) + reactive (auto-switch). Non-retryable errors (auth, context overflow) do not trigger fallback. |
| 9 | Category System | YES | plan T9 | 8 categories: quick, deep, ultrabrain, visual-engineering, artistry, writing, unspecified-low, unspecified-high. task(category) vs task(subagent_type) mutually exclusive. Delegated sessions cannot re-delegate. |
| 10 | Loreguard | YES | plan T10 | bun:sqlite direct library (not MCP server). FTS5 virtual table. search_lore + suggest_lore tools. DB at .autodev/decisions/loreguard.db. Ratified-only by default, include_drafts param. |
| 11 | Docs Query System | YES | plan T11 | VoyageAI (remote) + local ONNX (Xenova/all-MiniLM-L6-v2). SQLite BLOB + JS cosine similarity (no sqlite-vec). search_docs, docs_status, docs_rebuild tools. DB at .autodev/embeddings/vectors.db. |
| 12 | Custom Tools | YES | plan T12 | todowrite (4-element format), look_at (multimodal), session_list, session_read, session_search. Does not duplicate ctx_* tools. |
| 13 | Skills System | YES | plan T12 | 4 skills: autodev-triage, autodev-implement, autodev-review, autodev-deploy. SKILL.md format with YAML frontmatter. .pi/skills/ or .agents/skills/. Does not include OmO built-ins. |
| 14 | Heartbeat | YES | plan T13 | setInterval 5 min default. Polls gh issue list --label autodev-request. Checks stalled PRs (autodev-ci-running > 30 min). State persisted to .autodev/work-items/. Uses gh CLI, no API library. |
| 15 | Discord Bridge | YES | plan T14 | pi extension event handler. Inbound: Discord→pi session→response. Outbound: agent_end→Discord. Slash commands. Reply polling. Rate limit 5 req/s. Disables if token unset. |
| 16 | Debate Protocol | YES | plan T15, workflow-specification.md §3 | 5 sessions (not 3): Aronnax (proposer), Momus (opposer), Nemo (judge-1), Oracle (judge-2), Conseil (judge-3). 5 phases: independent preparation, structured arguments (Claim→Evidence→Warrant), cross-examination, verdict, implementation verification. Cynefin determines depth. Transcripts to .autodev/debates/<slug>/. |
| 17 | Auto-Merge Pipeline | YES | plan T16 | auto_merge_pr checks 3 gates: CI green (gh pr checks), evidence exists, Oracle review passed. gh pr merge --squash --delete-head. Label autodev-ready→autodev-merged. @autodev hold/proceed. |
| 18 | Boulder State | YES | plan T16 | .omo/boulder.json with active_plan, session_ids, started_at, plan_name, completed_todos. Resume mode (boulder.json exists) vs init mode (no boulder.json). /start-work command. |
| 19 | Continuation Loops | YES | plan T16 | Ralph loop (self-referential until DONE, max 100 iterations), ULW loop (ultrawork mode), todo continuation enforcer. /stop-continuation stops all. Event injection, not blocking. |
| 20 | Team Mode | YES | plan T5 | Hyperplan after onboarding (5 hostile critics critique onboarding results). Always watching during work (background agent manager integrated). Mailbox during onboarding (other agents chime in without interrupting). 12 team_* tools listed. |
| 21 | Comment Checker | YES | plan T5 | Strips AI-slop comments after write/edit. tool_call event handler alongside guardrails. Flagged patterns: restating function name, obvious code, corporate filler. Strips, does not block. |
| 22 | Notepad System | YES | plan T5 | Loreguard-backed. Learnings→ctx_memory (ARCHITECTURE). Decisions→Loreguard (ADR pipeline). Issues→ctx_memory (CONSTRAINTS). Verification→evidence files. Problems→research notes. No parallel knowledge system. |
| 23 | IntentGate | YES | plan T5 | Harbor Master + Nemo. Surfaces hidden intentions before classification. Harbor Master: analyzes initial project description. Nemo: analyzes GitHub issue text (bug/feature/refactor/question). Pre-processing step in dispatch pipeline. |
| 24 | Built-in MCPs | YES | plan T5 | Context7 (library docs lookup) + Grep.app (GitHub code search). Exa explicitly excluded. Agents use pi's built-in web search or ollama web search. |
| 25 | LSP Integration | YES | plan T5 | 6 tools: lsp_diagnostics, lsp_goto_definition, lsp_find_references, lsp_prepare_rename, lsp_rename, lsp_symbols. Requires LSP server (.pi/lsp.json or auto-detected). |
| 26 | Tmux Integration | YES | plan T5 | Interactive bash (interactive_bash pi tool creates/manages tmux sessions). Team visualization (each member gets a tmux pane when tmux_visualization enabled). Monitoring, not control. |
| 27 | Rules Injection | YES | plan T5 | .omo/rules/ directory. Markdown files of project-specific coding standards. Additive to AGENTS.md. Deeper file wins per AGENTS.md precedence. Loaded via context injection system. |
| 28 | Context Injection | YES | plan T5 | DefaultResourceLoader with agentsFilesOverride. Injects: AGENTS.md, CONTEXT.md, .autodev/memory/*.md, .omo/rules/*.md, .autodev/reference/ docs. Magic Context auto-injects project-memory block. Bootstrap context wins; Loreguard overrides both. |
| 29 | Magic Context Integration | YES | plan T3, T6 | Installed as pi extension (not reimplemented). Shared DB at ~/.local/share/cortexkit/magic-context/context.db. All 5 ctx_* tools: ctx_search, ctx_memory, ctx_note, ctx_expand, ctx_reduce. 5 features enabled: git commit indexing, key files pinning, sidekick, user memories, workspaces. Historian + dreamer agents. |
| 30 | CLI Commands | YES | plan T13 | 5 commands: autodev onboard, autodev doctor, autodev status, autodev docs (query/rebuild), autodev debate (start/status). Registered via pi.registerCommand(). |
| 31 | Failure Modes | YES | plan (general) | 10 scenarios (required: 8+): pi process dies, model API outage, GitHub rate limit, Magic Context DB corruption, Loreguard DB locked, heartbeat stalls, Discord connection lost, guardrail false positive, debate deadlock, merge conflict. |
| 32 | Data Flow Diagrams | YES | plan (general) | 2 diagrams: Diagram A (GitHub issue→merge pipeline end-to-end), Diagram B (agent session lifecycle). |

---

## Cross-Reference Table: README.md (8 sections)

| Section | Verified | Source | Notes |
|---------|----------|--------|-------|
| What is AutoDev | YES | plan TL;DR | Accurate description of pi-based autonomous crew. |
| The Crew | YES | plan T4, workflow-spec §1.2 | 13 agents in table. Last 4 ops agents share Engineer identity. |
| Architecture | YES | plan T5, ARCHITECTURE.md §1 | ASCII diagram matches. pi runtime, in-process, no HTTP server. |
| Quick Start | YES | plan T1/T3 | pi commands: bun install, magic-context setup --harness pi, autodev onboard. No npm/node. |
| How It Works | YES | plan T13, workflow-spec §2 | Pipeline: issue→heartbeat→Nemo triage→Aronnax plan→Ned Land implement→Oracle review→CI→auto-merge→liaison deploy→close. Cynefin classification. One task at a time. Auto-merge. Label lifecycle. Guardrails. |
| Configuration | YES | plan T1/T3, STRUCTURE.md | .pi/ and .autodev/ directories documented. Env vars: VOYAGE_API_KEY, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID. |
| Coexistence | YES | plan "IMPORTANT COEXISTENCE" | .pi/ and .opencode/ can both exist. Shared Magic Context DB. Global OpenCode config untouched. |
| Prerequisites | YES | plan T3 | Bun 1.0+, Pi 0.74.0+, LLM provider (glm-5.2:cloud + deepseek-v4-pro), VoyageAI key, git + gh CLI. |

**Source of truth note:** Present at top (line 7).
**OpenCode mentions:** 5 matches, all in Coexistence section (scoped correctly).
**No AI-slop phrases:** Verified (no leverage/seamless/robust/utilize).
**13 agents:** Verified in crew table (lines 27-40).
**Quick Start uses pi commands:** Verified (no OpenCode commands).
**No OpenCode as runtime:** Verified (only coexistence context).

---

## Cross-Reference Table: STRUCTURE.md (8 sections)

| Section | Verified | Source | Notes |
|---------|----------|--------|-------|
| 1. Project Layout | YES | plan T5/T4 | Directory tree matches plan's structure: extensions/autodev/ (11 modules), .pi/ (agents, skills, settings), .autodev/ (reference, evidence, skills, decisions, research, memory, plans, config, scripts, templates), docs-corpus/, .omo/ (plans, evidence, drafts, notepads, boulder.json, rules). |
| 2. Component Map | YES | ARCHITECTURE.md | 32-row table cross-references each directory to ARCHITECTURE.md section. |
| 3. Reference Catalog | YES | plan "Must NOT delete" | 4 immutable files: onboarding-protocol.md, workflow-specification.md, discord-setup.md, README.md. Immutability rules stated. |
| 4. Config Files | YES | plan T1/T3/T5 | 9 config files: .pi/settings.json, .pi/magic-context.jsonc, .pi/auth.json (gitignored), .pi/lsp.json, .autodev/config/guardrails.yaml, dispatch-rules.yaml, debate-protocol.yaml, package.json, .omo/boulder.json. |
| 5. Agent Definitions | YES | plan T4 | 13 agents listed with identity blocks. Engineer shared by 4 ops agents. Explore maps to explore agent. Model routing: glm-5.2:cloud for most, deepseek-v4-pro for Ned Land + Oracle/Momus. |
| 6. Skills | YES (after fix) | plan T12 | **FIXED**: Was 5 skills (including autodev-onboard), now 4 skills matching T12. Onboarding is a CLI command (T13), not a skill. |
| 7. Coexistence Model | YES | plan "IMPORTANT COEXISTENCE" | .pi/ + .opencode/ side-by-side. Shared Magic Context DB. Global OpenCode config untouched. No conflicts. |
| 8. Search Strategy | YES | plan (general) | 8-step pi-aware list: reference docs, search_lore, ctx_search, grep in reference, grep in docs-corpus, search_docs, Context7, Grep.app. Stop when verified, else label autodev-blocked. |

**No .opencode/ as primary config:** Verified (only in Coexistence section).
**Coexistence section present:** Verified (section 7).
**Search strategy updated for pi:** Verified (uses search_lore, ctx_search, search_docs, Context7, Grep.app — not OpenCode tools).

---

## Cross-Reference Table: ROADMAP.md (5 sections)

| Section | Verified | Source | Notes |
|---------|----------|--------|-------|
| Introduction | YES | plan "Future waves" | Correctly describes pi-foundation wave as the initial wave. |
| Near-term enhancements | YES | plan lines 82-88 | 4 features: hashline, session notifications, additional CLI commands, think mode per agent. |
| Medium-term features | YES (after fix) | plan lines 84-89 | **FIXED**: Was 4 features (including .omo/rules/), now 3: MCP OAuth, CodeGraph, unstable agent babysitter. Rules injection removed — it's in T5's initial wave. |
| Long-term waves | YES | plan lines 90-92 | 3 features: multi-project routing, installer, single binary. |
| Magic Context future options | YES | task spec | 3 features: caveman compression, additional embedding providers, desktop app integration. |

**All 11 deferred features listed:** Verified (hashline, session notifications, MCP OAuth, CodeGraph, caveman compression, additional CLI commands, think mode per agent, unstable agent babysitter, multi-project routing, installer, single binary).
**No initial-wave features listed:** Verified (after fix — rules injection removed).
**No timelines:** Verified (wave/priority ordering only).

---

## 12 Specific Claims Verification

| # | Claim | Verified | Evidence |
|---|-------|----------|----------|
| 1 | 13 agents (not 12) | YES | README crew table lines 27-40: Nemo, Aronnax, Ned Land, Conseil, Oracle, Momus, Metis, Harbor Master, Quartermaster, Boatswain, Navigator, Watch Officer, Explore = 13. ARCHITECTURE §4 line 117: "13 agents total" lists all 13. STRUCTURE §5 line 151: "13 agents" lists all 13. |
| 2 | 5 debate sessions (not 3) | YES | ARCHITECTURE §16 line 319: "5 phases across 5 separate pi sessions. Five sessions, not three." Line 321: Aronnax (proposer), Momus (opposer), Nemo (judge-1), Oracle (judge-2), Conseil (judge-3). Matches plan T15. |
| 3 | Guardrail tool_call interception (not OpenCode hooks) | YES | ARCHITECTURE §6 line 151: "Guardrails run as a pi.on("tool_call", ...") event handler". Matches plan T7. |
| 4 | In-process sessions (not HTTP server) | YES | ARCHITECTURE §1 line 56: "No HTTP server. No global binary. No subprocess spawning. Sessions run in-process and share memory." §4 line 109: "createAgentSession()". §7 line 171: "SessionManager.inMemory()". |
| 5 | Magic Context installed (not reimplemented) | YES | ARCHITECTURE §29 line 499: "Magic Context is installed as a pi extension. It is not reimplemented." §2 line 68: "pi extension (installed, not reimplemented)". |
| 6 | No OpenCode dependencies | YES | README: 5 OpenCode mentions, all in Coexistence section. ARCHITECTURE: 3 mentions — line 62 negation ("no opencode serve"), line 111 historical reference ("old OpenCode config"), line 501 coexistence. No OpenCode as runtime dependency. |
| 7 | Team mode adapted for AutoDev | YES | ARCHITECTURE §20: "Hyperplan after onboarding" (line 382), "Mailbox during onboarding" (line 386), "Always watching during work" (line 384). Matches plan T5. |
| 8 | Notepad Loreguard-backed | YES | ARCHITECTURE §22: "Learnings are stored as ARCHITECTURE memories via ctx_memory" (line 406), "Decisions are stored as ADRs via Loreguard" (line 407). Matches plan T5. |
| 9 | IntentGate Harbor Master + Nemo | YES | ARCHITECTURE §23: "Harbor Master onboarding" (line 422), "Nemo triage" (line 424). Both applications mentioned. Matches plan T5. |
| 10 | Built-in MCPs Context7 + Grep.app (NOT Exa) | YES | ARCHITECTURE §24 line 438: "Not Exa. AutoDev does not integrate Exa web search. Agents use pi's built-in web search or ollama web search when they need to search the web. Exa is intentionally excluded." |
| 11 | Magic Context features enabled | YES | ARCHITECTURE §29 lines 513-517: git commit indexing (enabled: true), key files pinning (enabled: true), sidekick (enabled: true), user memories (enabled by default), workspaces (configured if project belongs to workspace). All 5 present. Matches plan T3/T6. |
| 12 | ROADMAP lists all deferred features | YES | ROADMAP lists 11 deferred features (hashline, session notifications, MCP OAuth, CodeGraph, caveman compression, additional CLI commands, think mode per agent, unstable agent babysitter, multi-project routing, installer, single binary) + 2 Magic Context future options (additional embedding providers, desktop app integration). All present. |

---

## Discrepancies Found and Fixed

### Discrepancy 1: ARCHITECTURE.md Guardrail Engine — missing hard stop
**Source:** workflow-specification.md §4.1 lists 6 hard stops.
**Doc said:** 5 hard stops (no-secrets-in-code, evidence-required, follow-the-plan, one-task-at-a-time, ci-is-hard-gate).
**Missing:** never-deploy-directly.
**Also:** Names didn't match spec exactly (evidence-required vs evidence-or-it-didnt-happen, ci-is-hard-gate vs ci-is-the-hard-gate).
**Fix:** Added never-deploy-directly as first hard stop. Renamed evidence-required→evidence-or-it-didnt-happen, ci-is-hard-gate→ci-is-the-hard-gate to match spec exactly. Updated "5 hard stops"→"6 hard stops" and added "(per workflow-specification.md section 4.1)".
**Note:** The task spec said "5 hard stops match workflow-specification.md section 4.1" — but the spec actually has 6. The doc was wrong, not the spec. Fixed to 6.

### Discrepancy 2: README.md Guardrails — missing one-task-at-a-time
**Source:** workflow-specification.md §4.1, ARCHITECTURE.md §6, plan T7.
**Doc said:** 5 hard stops (No direct deploy, No secrets, Evidence, Follow the plan, CI is hard gate).
**Missing:** One task at a time.
**Fix:** Added "One task at a time. If interrupted mid-task, log the new instruction as a GitHub issue and resume the original task." Now 6 hard stops matching the spec.

### Discrepancy 3: STRUCTURE.md Skills — extra 5th skill
**Source:** plan T12 lists 4 skills (autodev-triage, autodev-implement, autodev-review, autodev-deploy).
**Doc said:** 4 skills + "A fifth skill, autodev-onboard, drives the Harbor Master onboarding conversation."
**Problem:** Onboarding is not a skill. It's a CLI command (autodev onboard, T13) that launches a Harbor Master session using the interview protocol from .autodev/reference/onboarding-protocol.md. No SKILL.md file exists for onboarding in T12's scope.
**Fix:** Removed the 5th skill line. Added clarification: "Onboarding is not a skill. The Harbor Master session is launched by the autodev onboard CLI command (T13), which uses the interview protocol from .autodev/reference/onboarding-protocol.md directly. No separate skill file is needed."

### Discrepancy 4: ROADMAP.md — rules injection listed as deferred
**Source:** plan T5 includes rules injection in the initial wave (line 62: "Rules injection (.omo/rules/). Load project-specific rules from .omo/rules/ directory into agent context alongside AGENTS.md. Rules are Markdown files with project-specific coding standards, conventions, and constraints. Injected via the context injection system (T5)."). Plan's "Future waves" section (lines 79-92) does NOT list rules injection.
**Doc said:** Listed ".omo/rules/ rules injection" as a medium-term deferred feature.
**Problem:** Rules injection is in T5's initial wave, not deferred. The ROADMAP entry even hedged ("This one might get pulled into the initial wave if time allows") but the plan is clear: it's in T5.
**Fix:** Removed the ".omo/rules/ rules injection" section from ROADMAP.md. ARCHITECTURE.md §27 and STRUCTURE.md §1 already document it as part of the initial wave.

---

## Final Verification

All 4 discrepancies fixed. Zero "no" entries remaining.

- ARCHITECTURE.md: 32/32 sections verified YES
- README.md: 8/8 sections verified YES
- STRUCTURE.md: 8/8 sections verified YES
- ROADMAP.md: 5/5 sections verified YES
- 12/12 specific claims verified YES

**Files modified:**
- `/Users/djtchill/Projects/autodev-pi/ARCHITECTURE.md` (added never-deploy-directly hard stop, renamed 2 hard stops to match spec)
- `/Users/djtchill/Projects/autodev-pi/README.md` (added one-task-at-a-time hard stop)
- `/Users/djtchill/Projects/autodev-pi/STRUCTURE.md` (removed 5th skill, added clarification)
- `/Users/djtchill/Projects/autodev-pi/ROADMAP.md` (removed rules injection from deferred features)

**Files NOT modified (per MUST NOT DO):**
- `.autodev/reference/workflow-specification.md` (immutable)
- `.autodev/reference/onboarding-protocol.md` (immutable)
- `.autodev/memory/techContext.md` (immutable)
- `.omo/plans/autodev-pi-foundation.md` (T6's job)