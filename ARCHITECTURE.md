# AutoDev Architecture (pi-based)

> **Source of truth.** This document is the developer-facing system design for the pi-based AutoDev. It describes what the system is, how it is built, and how the pieces fit together. The pi-foundation plan at `.omo/plans/autodev-pi-foundation.md` is the implementation spec; this document is the architectural companion. If they conflict, the plan wins on scope, this document wins on design. The previous `.autodev/ARCHITECTURE.md` is superseded by this file and kept only as a historical reference (see T7 of the pi-foundation plan).

AutoDev is an autonomous engineering team framework built on the pi agent runtime. A crew of 13 specialized agents, themed after the Nautilus submarine, triages GitHub issues, plans work, implements in worktrees, reviews PRs, and auto-merges when every gate is green. There is no home port. The crew operates at depth, fixes what breaks, and surfaces only when it cannot see the bottom.

---

## 1. System Overview

AutoDev runs as a single in-process runtime. Pi is the agent runtime. The AutoDev extension registers tools, commands, and event handlers through pi's ExtensionAPI. Magic Context plugs in as a pi extension for semantic memory. Loreguard is a direct bun:sqlite library for ratified decisions. Discord is a pi extension event handler. The heartbeat is a setInterval timer. GitHub is the coordination surface.

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Host Machine (Bun process)                        │
│                                                                      │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │                    pi Runtime                                │    │
│   │   createAgentSession() per crew role                          │    │
│   │   SessionManager.inMemory() for subagents                     │    │
│   │   SessionManager.create() for persistent sessions            │    │
│   │   ExtensionAPI for tools, commands, events                   │    │
│   │                                                              │    │
│   │   ┌──────────────────────────────────────────────────────┐   │    │
│   │   │  AutoDev Extension (extensions/autodev/index.ts)       │   │    │
│   │   │  Modules: guardrails, background, delegation,         │   │    │
│   │   │  loreguard, docs, tools, team-mode, lsp, tmux,        │   │    │
│   │   │  comment-checker, intent-gate                          │   │    │
│   │   └──────────────────────────────────────────────────────┘   │    │
│   │                                                              │    │
│   │   ┌────────────────────────┐   ┌─────────────────────────┐   │    │
│   │   │  Magic Context         │   │  Loreguard              │   │    │
│   │   │  (pi extension)        │   │  (bun:sqlite library)   │   │    │
│   │   │  shared SQLite DB      │   │  FTS5 ADR store          │   │    │
│   │   │  ctx_* tools           │   │  search_lore tool        │   │    │
│   │   │  historian + dreamer   │   │                          │   │    │
│   │   └────────────────────────┘   └─────────────────────────┘   │    │
│   │                                                              │    │
│   │   ┌────────────────────────┐   ┌─────────────────────────┐   │    │
│   │   │  Discord Bridge         │   │  Heartbeat Timer         │   │    │
│   │   │  (pi extension event)   │   │  (setInterval, gh CLI)   │   │    │
│   │   └────────────────────────┘   └─────────────────────────┘   │    │
│   │                                                              │    │
│   │   ┌─────────────────────────────────────────────────────┐    │    │
│   │   │  Built-in MCPs: Context7, Grep.app                   │    │    │
│   │   └─────────────────────────────────────────────────────┘    │    │
│   └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│           ┌────────────────────────────────────────────┐              │
│           │              GitHub                          │            │
│           │  Issues  PRs  Labels  Comments  CI  Branches  │            │
│           └────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────┘
```

Every box in that diagram is a pi primitive. No HTTP server. No global binary. No subprocess spawning. Sessions run in-process and share memory.

---

## 2. Process Topology

Pi runs as the agent runtime. There is no `opencode serve`, no daemon, no separate process to monitor. AutoDev is a TypeScript extension loaded into pi at startup.

| Component | What it does | pi API used |
|-----------|--------------|-------------|
| pi runtime | Hosts agent sessions, dispatches tools, fires events | `createAgentSession()`, `SessionManager` |
| AutoDev extension | Registers tools, commands, and event handlers | `ExtensionAPI`, `defineTool()`, `pi.on()`, `pi.registerCommand()` |
| Magic Context | Semantic memory, session history, git commit indexing | pi extension (installed, not reimplemented) |
| Loreguard | Ratified decision store with full-text search | `bun:sqlite` direct library, exposed via `defineTool()` |
| Discord bridge | Bidirectional message relay | `pi.on("agent_end")` event handler |
| Heartbeat timer | Polls GitHub on an interval | `setInterval` + `gh` CLI shell calls |
| Built-in MCPs | Context7 docs lookup, Grep.app code search | pi MCP integration |
| GitHub integration | Issues, PRs, labels, CI status | `gh` CLI via shell calls |

The extension is modular. Each subsystem lives in its own directory under `extensions/autodev/` and registers itself independently through the entry point at `extensions/autodev/index.ts`. Parallel todos in the pi-foundation plan can add modules without touching each other's files.

---

## 3. The Crew Dispatch Model

A work item moves through a state machine. Each transition is a stage-gate with evidence requirements. GitHub labels are the single source of truth for state.

```
request ──> triage ──> classify ──> debate ──> plan ──> implement ──> review ──> deploy ──> close
   |          |          |           |         |          |           |          |        |
   v          v          v           v         v          v           v          v        v
blocked    blocked    blocked    blocked   blocked    blocked     blocked   blocked  blocked
```

The heartbeat polls GitHub for issues labeled `autodev-request`. For each new issue, the IntentGate analyzes the issue text to detect true intent (bug, feature, refactor, question) before classification. Then a Nemo pi session is created, the issue is dispatched for triage, and Nemo classifies it using the Cynefin framework:

- **Simple**: best practice applies. Route directly to Ned Land with `task(category="quick")`.
- **Complicated**: expert analysis needed. Route to Aronnax for a single-round plan, then Ned Land implements.
- **Complex**: unknown unknowns. Full 5-phase debate protocol (section 16), then Aronnax plans, then Ned Land implements.
- **Chaotic**: crisis. Watch Officer takes emergency response.

Label lifecycle on the GitHub issue:

```
autodev-request -> autodev-planned -> autodev-in-progress -> autodev-review -> autodev-ready -> autodev-merged
```

Blocked items get `autodev-blocked`. Rejected items get `autodev-rejected`. The Quartermaster enforces label transitions when evidence gates are satisfied.

All planning, progress tracking, and project management happens through GitHub. Issues are the work queue, labels are the state machine, PRs are the delivery mechanism, CI is the quality gate, and comments are the communication channel. No external project management tools or tracking systems are used.

Implemented by T13 in the pi-foundation plan.

---

## 4. Agent Session Architecture

Each crew role gets its own pi AgentSession with a dedicated model, tool set, and system prompt. Sessions are created in-process via `createAgentSession()`. Subagent sessions use `SessionManager.inMemory()` for ephemeral work. Persistent sessions use `SessionManager.create()` for state that must survive across runs.

Agent definitions live in `.pi/agents/` as Markdown files with YAML frontmatter. Each file declares name, description, tools, and model. The system prompt body follows the frontmatter and merges the Nautilus identity text extracted from the old OpenCode config (T2 of the pi-foundation plan) with the role and constraints from the original `.autodev/agents/*.yaml` files.

Model routing per role, from `techContext.md`:

| Role | Model | Used for |
|------|-------|----------|
| Nemo, Aronnax, Metis, Harbor Master, Quartermaster, Boatswain, Navigator, Watch Officer, Conseil, Explore | `ollama-cloud/glm-5.2:cloud` | Triage, planning, deploy, orchestration, research |
| Ned Land | `ollama-cloud/deepseek-v4-pro` | Execution, building, testing |
| Oracle, Momus | `ollama-cloud/deepseek-v4-pro` | Review, critique, adversarial analysis |

13 agents total: nemo, aronnax, ned-land, conseil, oracle, momus, metis, harbor-master, quartermaster, boatswain, navigator, watch-officer, explore. The Engineer identity block is shared across quartermaster, boatswain, navigator, and watch-officer per the README. The Explore identity block maps to the explore subagent. Implemented by T4 in the pi-foundation plan.

---

## 5. Extension Architecture

The AutoDev extension is modular by design. The entry point imports and registers each subsystem independently:

```
extensions/autodev/
  index.ts              <- entry point, imports all modules
  guardrails/index.ts   <- tool_call interception
  background/index.ts    <- subagent spawning + model fallback
  delegation/index.ts    <- category system + task tool
  loreguard/index.ts    <- ADR store + search_lore tool
  docs/index.ts          <- embedding layer + search_docs tool
  tools/index.ts         <- todowrite, look_at, session management
  team-mode/index.ts     <- parallel agent coordination
  lsp/index.ts           <- 6 LSP tools
  tmux/index.ts          <- interactive bash + team visualization
  comment-checker/index.ts <- AI-slop stripping
  intent-gate/index.ts   <- intent analysis before classification
```

Each module exports a registration function that the entry point calls with the shared `ExtensionAPI` instance. Adding a new module means creating a directory and adding one import line to `index.ts`. No two parallel todos touch the same file. The extension is declared in `package.json` under the `pi` manifest key. Implemented by T5 in the pi-foundation plan.

---

## 6. Guardrail Engine

Guardrails run as a `pi.on("tool_call", ...)` event handler that inspects every tool call before it executes. If a call violates a hard stop, the handler returns a block decision with a reason string and the call never runs.

The 6 hard stops, all non-negotiable (per workflow-specification.md section 4.1):

| Hard stop | What it blocks | How it detects |
|-----------|----------------|----------------|
| never-deploy-directly | Direct deploy actions by any agent other than the Navigator | Action type check — deploy is only allowed through the Navigator's liaison-coordinated flow |
| no-secrets-in-code | `write` or `edit` calls containing API keys, tokens, passwords | Regex check on the content being written |
| evidence-or-it-didnt-happen | `bash` calls running `git commit` when no evidence file exists in `.omo/evidence/` for the current task | File existence check |
| one-task-at-a-time | New task creation when a task is already in progress | Active task counter check |
| follow-the-plan | Implementation that deviates from a plan in `.autodev/plans/` | Diff against plan acceptance criteria |
| ci-is-the-hard-gate | `bash` calls running `gh pr merge` when CI status is not green | `gh pr checks` status poll |

Soft stops generate warnings but do not block: suggest-review (large change without review), warn-scope (more than 10 files changed), flag-missing-evidence (review with no evidence file).

Guardrail rules load from `.autodev/config/guardrails.yaml`. Nothing is hardcoded. The expression evaluator design from the old `src/core/guardrail-engine.ts` is reference only, rebuilt from scratch for pi's event model. Implemented by T7 in the pi-foundation plan.

---

## 7. Background Agent Management

Subagent sessions are spawned via `createAgentSession()` with `SessionManager.inMemory()`. Each background task moves through a lifecycle: pending to running to completed, error, or cancelled.

Concurrency is capped at 5 per key (configurable per provider or model). A 6th task queues until a slot frees. Completion is detected by subscribing to session events: `session.subscribe()` fires `agent_end` and `message_end` when the subagent finishes.

A circuit breaker protects against stuck sessions. If a background session produces no events for 180 seconds (configurable), the breaker trips, the session aborts, and the parent is notified.

A parent-wake notifier tells the parent session when a child completes, so the parent can collect results without busy-waiting. An error classifier distinguishes retryable failures (network blips, rate limits) from fatal ones (auth errors, context overflow) to decide whether to retry or surface the error. Implemented by T8 in the pi-foundation plan.

---

## 8. Model Fallback Chains

When a model call fails, the background manager extracts the error info from session events. If the HTTP status is 429, 500, 502, 503, 504, or a timeout, the manager resolves the agent's `fallback_models` chain from config, aborts the current session, and re-prompts with the next model in the chain.

Two modes of fallback:

- **Proactive**: configured per agent. The agent definition lists a primary model and a fallback chain. If the primary fails, the next model takes over.
- **Reactive**: automatic switch on any API error. The manager detects the error class and picks a fallback without prior configuration.

Fallback chains are defined per agent in config, not in code. Non-retryable errors (auth failures, context overflow) do not trigger fallback. The session is disposed and the error surfaces. Implemented by T8 in the pi-foundation plan.

---

## 9. Category System for Task Delegation

The `task` tool routes work by category or by subagent type. The two are mutually exclusive.

Built-in categories:

| Category | Use case | Default model |
|----------|----------|---------------|
| quick | Trivial fixes, typos, small tweaks | `glm-5.2:cloud` |
| deep | Autonomous problem-solving | `deepseek-v4-pro` |
| ultrabrain | Hard logic, deep reasoning | `deepseek-v4-pro` |
| visual-engineering | Frontend, UI work | `glm-5.2:cloud` |
| artistry | Creative work | `glm-5.2:cloud` |
| writing | Docs, prose, READMEs | `glm-5.2:cloud` |
| unspecified-low | General low-effort | `glm-5.2:cloud` |
| unspecified-high | General high-effort | `glm-5.2:cloud` |

`task(category="deep", prompt="...")` spawns a background session with the deep category's model and a system prompt that includes the task and any loaded skill context. `task(subagent_type="explore", prompt="...")` spawns a specific crew agent. `run_in_background=true` returns a task ID immediately for async work. `load_skills=["..."]` injects skill prompts into the spawned session.

Category models load from config (`.autodev/config/` or `.pi/settings.json`), not from code. Custom categories are configurable. Delegated sessions cannot re-delegate (the `task` tool is blocked for them). Implemented by T9 in the pi-foundation plan.

---

## 10. Loreguard

Loreguard is the ratified decisions store. It uses SQLite with FTS5 (full-text search) via `bun:sqlite`, which works because pi runs on Bun. No MCP server. No external process. Direct library access from the AutoDev extension.

Schema: a `decisions` table with id, title, status, content, created_at, ratified_at. An FTS5 virtual table indexes title and content for keyword search.

Operations: create a draft, read by id, full-text search, ratify (draft to ratified), archive. Search returns ratified records only by default. An `include_drafts` parameter returns everything for review workflows.

Exposed as two pi tools via `defineTool()`:

- `search_lore(query, include_drafts=false)` returns matching decisions.
- `suggest_lore(title, content)` creates a draft for human review.

DB path: `.autodev/decisions/loreguard.db`, configurable. Loreguard is the single source of truth for ratified architectural decisions. Magic Context memories are clues; Loreguard records are truth. Implemented by T10 in the pi-foundation plan.

---

## 11. Docs Query System

The docs query system gives agents semantic search over a corpus of 218 files in `docs-corpus/`.

Embedding layer supports two providers: VoyageAI (remote, requires `VOYAGE_API_KEY`) and local ONNX (`Xenova/all-MiniLM-L6-v2`, roughly 90MB, downloads on first use). When the VoyageAI key is unset, the system falls back to local ONNX automatically.

Vector store is SQLite with BLOB storage for embeddings and pure JavaScript cosine similarity. No `sqlite-vec` extension needed. Cosine similarity is dot product divided by the product of norms.

Three pi tools via `defineTool()`:

- `search_docs(query, limit?)` returns ranked document chunks with similarity scores.
- `docs_status()` returns chunk count, doc count, and component breakdown.
- `docs_rebuild()` ingests `docs-corpus/` and returns chunk count and any errors.

DB path: `.autodev/embeddings/vectors.db`, configurable. Implemented by T11 in the pi-foundation plan.

---

## 12. Custom Tools

AutoDev registers custom tools via pi's `defineTool()`. Each tool declares a name, description, TypeBox parameter schema, and an async execute function that returns content and details.

Tools registered:

- `todowrite`: writes, updates, and cancels todos. Enforces a 4-element format: content (WHERE, HOW, to WHY, expect RESULT), status (pending, in_progress, completed, cancelled), priority (high, medium, low). Does not accept malformed todos.
- `look_at`: analyzes media files (images, PDFs) using pi's multimodal capabilities.
- `session_list`: lists sessions via pi's SessionManager API.
- `session_read`: reads session messages and history.
- `session_search`: full-text search across session messages.

These do not duplicate Magic Context's tools (`ctx_search`, `ctx_memory`, `ctx_note`, `ctx_expand`, `ctx_reduce`). Those come from the Magic Context extension. Implemented by T12 in the pi-foundation plan.

---

## 13. Skills System

Skills are ported to pi's SKILL.md format with YAML frontmatter. Each skill file has a name, description, and step-by-step instructions in the body.

Four AutoDev skills:

- `autodev-triage`: triggered on new `autodev-request` issues. Nemo classifies, assesses scope, routes to Aronnax or Ned Land.
- `autodev-implement`: Ned Land executes a plan with evidence-bound QA.
- `autodev-review`: Oracle and Momus review a PR and post findings.
- `autodev-deploy`: post-merge liaison coordination. Alerts the liaison, does not deploy directly.

Skills live in `.pi/skills/` or `.agents/skills/` and are discovered by pi's skill loader. They do not include OmO's built-in skills (git-master, playwright, etc.). Implemented by T12 in the pi-foundation plan.

---

## 14. Heartbeat

The heartbeat is a `setInterval` timer that fires every 5 minutes by default. It is the autonomous loop that keeps the crew working without human initiation.

Each tick does three things:

1. Polls GitHub for new issues labeled `autodev-request` via `gh issue list --label autodev-request --state open --json`. New issues are dispatched to Nemo for triage.
2. Checks for stalled PRs. If a PR has the `autodev-ci-running` label for more than 30 minutes, the heartbeat comments on the PR and labels it `autodev-blocked`.
3. Checks for blocked issues that might need self-healing.

State is persisted to `.autodev/work-items/` so the heartbeat can resume across restarts. The heartbeat uses the `gh` CLI for all GitHub operations, no API library. It stops cleanly on `autodev status --stop` or process exit. Implemented by T13 in the pi-foundation plan.

---

## 15. Discord Bridge

The Discord bridge is a pi extension event handler. It relays messages bidirectionally between Discord and pi sessions.

Inbound: a Discord message arrives, the bridge creates or continues a pi session, dispatches the message as a prompt, and posts the response back to Discord.

Outbound: when a pi session fires `agent_end`, the bridge posts the response to the configured Discord channel.

Slash commands:

- `/autodev status` returns heartbeat state and work items.
- `/autodev task` creates a new GitHub issue.
- `/autodev hold` freezes a PR from auto-merge. `@autodev proceed` releases it.

A reply poller checks Discord for replies to agent messages so human follow-ups reach the right session. Rate limiting prevents more than 5 Discord API requests per second.

Config via environment variables: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID`. If the token is unset, the bridge disables with a warning and the crew continues working through GitHub alone. Implemented by T14 in the pi-foundation plan.

---

## 16. Debate Protocol

The debate protocol handles Complex decisions. It runs 5 phases across 5 separate pi sessions. Five sessions, not three. Independence is the point.

**Phase 1: Independent Preparation.** Five pi sessions start in parallel. Aronnax is the proposer, developing the full argument with evidence citations. Momus is the opposer, developing a critique with counter-evidence. Nemo is judge-1. Oracle is judge-2. Conseil is judge-3. The three judges each run in their own session and review standing orders, reference docs, and relevant Loreguard records. No participant sees another's preparation. That independence is the source of diversity.

**Phase 2: Structured Arguments.** Every claim follows Claim, Evidence, Warrant. Claim is the assertion. Evidence is a specific data point, code reference, or test result. Warrant is why the evidence supports the claim. No unsupported claims are allowed.

**Phase 3: Cross-Examination.** Complex decisions only. Proposer and opposer question each other's evidence in a shared session. Judges may ask clarifying questions. All questions and answers are logged.

**Phase 4: Verdict.** The 3 judges each vote independently in their own sessions. Each provides a verdict (approve, reject, or needs-revision), reasoning, and confidence level. Majority rules for approve or reject. Needs-revision loops back to Phase 2 with specific revision requirements.

**Phase 5: Implementation Verification.** The 3-judge panel verifies that the implementation matches the approved plan. Evidence checkpoints at each phase.

Cynefin classification determines protocol depth. Simple decisions skip debate entirely. Complicated decisions get a single-round debate. Complex decisions get the full 5-phase protocol. Chaotic decisions go to the Watch Officer for emergency response.

Transcripts are written to `.autodev/debates/<slug>/`: metadata.yaml, proposer-arguments.md, opposer-arguments.md, cross-examination.md, verdict.md, implementation-verification.md. Started via `autodev debate start "topic"`. Implemented by T15 in the pi-foundation plan.

---

## 17. Auto-Merge Pipeline

The `auto_merge_pr` pi tool checks three gates before merging:

1. CI status is green (`gh pr checks` returns all passing).
2. Evidence exists in `.omo/evidence/` for the current task.
3. Oracle review passed (the PR has the `autodev-review` label and review comments are clean).

If all three are green, the tool runs `gh pr merge --squash --delete-head`. The label transitions from `autodev-ready` to `autodev-merged`. A completion comment is posted on the issue.

If any gate fails, the merge is blocked with a reason string. No silent failures. The Quartermaster enforces label transitions. Humans can freeze a PR with `@autodev hold` and release it with `@autodev proceed`. Humans intervene to stop things, not to permit them.

The liaison role is optional. It applies when the project is consumed by other agents (e.g., an MCP server for Openclaw agents) — the liaison handles end-user testing since the end user is another agent. For standard projects consumed by humans (web apps, APIs, CLI tools), the liaison may not be applicable. The deployment protocol conditionally includes the liaison based on project type, determined during Harbor Master onboarding.

Implemented by T16 in the pi-foundation plan.

---

## 18. Boulder State

Boulder state tracks work plans across sessions. When a session ends mid-plan, the next session picks up where the last one left off instead of starting over.

State lives in `.omo/boulder.json` with fields: `active_plan`, `session_ids`, `started_at`, `plan_name`, `completed_todos`.

On `/start-work`:

- **Resume mode**: if `boulder.json` exists, read the state, calculate progress, inject a continuation prompt into the new session. The agent knows what was done and what remains.
- **Init mode**: if no `boulder.json` exists, find the latest plan in `.autodev/plans/`, create `boulder.json`, and begin execution.

This prevents the crew from losing context when a session times out, crashes, or is manually interrupted. Implemented by T16 in the pi-foundation plan.

---

## 19. Continuation Loops

Three loops drive agents to completion without stopping halfway.

- **Ralph loop**: self-referential. The agent runs, evaluates its output, and continues until it emits a DONE signal. Max iterations default to 100 to prevent infinite loops.
- **ULW loop**: ultrawork mode. Maximum intensity execution that keeps the agent working through a long task without pausing.
- **Todo continuation enforcer**: injects a system reminder when an agent has incomplete todos. The reminder surfaces at natural work boundaries so the agent cannot quietly abandon unfinished work.

`/stop-continuation` stops all loops. Loops work via event injection, not by blocking the session. The agent continues producing output while the loop monitors for completion signals. Implemented by T16 in the pi-foundation plan.

---

## 20. Team Mode (Adapted for AutoDev)

Team mode brings multiple agents online together with a shared mailbox, shared tasklist, and member management. It is adapted for AutoDev in three ways.

**Hyperplan after onboarding.** When Harbor Master onboarding completes, a hyperplan session starts. Five hostile critics cross-examine the onboarding results before any work begins. The crew critiques its own understanding of the project. This catches misinterpretations before they propagate into plans and code.

**Always watching during work.** The background agent manager is integrated with team mode. Team members observe ongoing work and can flag issues through the team mailbox. They do not interrupt the working agent, but their observations are visible for the next decision point.

**Mailbox during onboarding.** While the Harbor Master is conducting the onboarding interview, other agents can chime in through the team mailbox. Conseil can suggest knowledge-base queries. Metis can flag ambiguities. Momus can challenge assumptions. These contributions reach the Harbor Master without interrupting the conversation flow.

12 team tools: `team_create`, `team_delete`, `team_shutdown_request`, `team_approve_shutdown`, `team_reject_shutdown`, `team_send_message`, `team_task_create`, `team_task_list`, `team_task_update`, `team_task_get`, `team_status`, `team_list`. Implemented by T5 in the pi-foundation plan (team mode is part of the base extension).

---

## 21. Comment Checker

AI-generated code comments are slop. "This function does X" restates the code without adding value. The comment checker catches these after every `write` or `edit` tool call.

It runs as a `tool_call` event handler alongside the guardrails. When a write or edit completes, the handler inspects the result for AI-generated comment patterns. Flagged patterns include restating the function name, explaining obvious code, and using corporate filler phrases.

Flagged comments are either replaced with meaningful comments that explain why, not what, or removed entirely. The checker does not block the write. It strips the slop and lets the good code through. Implemented by T5 in the pi-foundation plan.

---

## 22. Notepad System (Loreguard-backed)

The notepad system accumulates wisdom across subagent tasks. Instead of separate files per task (the old OmO approach), AutoDev uses its existing knowledge systems as the backend.

- **Learnings** are stored as ARCHITECTURE memories via `ctx_memory`.
- **Decisions** are stored as ADRs via Loreguard, going through the draft-to-ratified pipeline.
- **Issues** are stored as CONSTRAINTS memories via `ctx_memory`.
- **Verification** is stored as evidence files in `.omo/evidence/`.
- **Problems** are stored as research notes in `.autodev/research/`.

This integrates the notepad into AutoDev's existing knowledge systems rather than creating a parallel one. Everything is searchable through the tools that already exist: `ctx_search` for memories, `search_lore` for ratified decisions, `search_docs` for the docs corpus. Implemented by T5 in the pi-foundation plan.

---

## 23. IntentGate

IntentGate analyzes true user intent before classifying or acting. Literal interpretation of a request often misses what the user actually wants. IntentGate sits as a pre-processing step in the dispatch pipeline.

Applied in two places:

**Harbor Master onboarding.** When the user gives their initial project description, IntentGate analyzes it to surface hidden intentions. It suggests probing questions the Harbor Master should ask. A user who says "I want a trading bot" might actually need risk controls, compliance checks, and audit trails. IntentGate surfaces that.

Harbor Master is the sole user-facing point of contact. All other agents are invisible to the user. If any agent needs clarification, encounters an issue requiring user input, or surfaces a blocker, it alerts Harbor Master through the team mailbox. Harbor Master then contacts the user via CLI or Discord. Harbor Master remains reachable after onboarding completes — it is a permanent user interface, not just an onboarding agent.

**Nemo triage.** When a GitHub issue arrives, IntentGate analyzes the issue text to detect the true intent. "The dashboard is slow" could be a bug (query performance), a feature request (add caching), or a refactor (restructure the data layer). IntentGate classifies the intent (bug, feature, refactor, question) before Cynefin classification runs.

IntentGate prevents the crew from solving the wrong problem. It does not replace human judgment. It sharpens the question before the crew answers. Implemented by T5 in the pi-foundation plan.

---

## 24. Built-in MCPs

Two MCPs are integrated into AutoDev.

**Context7** provides official library documentation lookup. When Aronnax is planning and needs to check the exact API of a dependency, Context7 returns the current docs without the agent scraping the web. This keeps plans grounded in real APIs, not guesses.

**Grep.app** provides GitHub code search. When the Explore agent needs to find real-world code examples for an unfamiliar pattern, Grep.app searches over a million public repositories. This is for finding how other people solved the same problem, not for copying code.

Not Exa. AutoDev does not integrate Exa web search. Agents use pi's built-in web search or ollama web search when they need to search the web. Exa is intentionally excluded. Implemented by T5 in the pi-foundation plan.

---

## 25. LSP Integration

Six LSP tools give agents IDE precision. They are registered via `defineTool()` and require an LSP server running (configured via `.pi/lsp.json` or auto-detected from the project's languages).

| Tool | What it does |
|------|--------------|
| `lsp_diagnostics` | Returns errors, warnings, and hints for a file or directory |
| `lsp_goto_definition` | Finds where a symbol is defined |
| `lsp_find_references` | Finds all references to a symbol across the workspace |
| `lsp_prepare_rename` | Checks whether a symbol can be renamed at a position |
| `lsp_rename` | Renames a symbol across the workspace and applies the edit |
| `lsp_symbols` | Lists document symbols or searches workspace symbols |

These tools let agents navigate code the way an IDE does. Instead of grepping for a function name and hoping the result is the right one, the agent jumps to the definition, finds all references, and renames safely. Implemented by T5 in the pi-foundation plan.

---

## 26. Tmux Integration

Tmux provides two capabilities for AutoDev.

**Interactive bash.** The `interactive_bash` pi tool creates and manages tmux sessions. An agent can run a command in a persistent shell, see the output, run follow-up commands, and close the session when done. This is for commands that need state between calls, like running a REPL or watching a log file.

**Team visualization.** When team mode is on and `tmux_visualization` is enabled, each team member gets a tmux pane. You can see all agents working in parallel in a single terminal window. This is for monitoring, not for control. The agents work through their normal pi sessions. Tmux just shows you what they are doing.

Implemented by T5 in the pi-foundation plan.

---

## 27. Rules Injection

Project-specific rules live in `.omo/rules/` as Markdown files. These are coding standards, conventions, and constraints that are specific to the project AutoDev is working on.

The context injection system (section 28) loads these files and injects them into agent context alongside AGENTS.md. An agent planning a change sees the project's rules without having to search for them.

Rules are additive to AGENTS.md. AGENTS.md governs crew behavior and process. `.omo/rules/` governs project-specific code style and conventions. If they conflict, the deeper file wins, per the standard AGENTS.md precedence rule. Implemented by T5 in the pi-foundation plan.

---

## 28. Context Injection

Every pi session gets context injected at startup via pi's `DefaultResourceLoader` with `agentsFilesOverride`. The injected files are:

- `AGENTS.md` at project root (standing orders, crew identity, process rules).
- `CONTEXT.md` at project root (operating protocol, drift prevention, knowledge retrieval sequence).
- `.autodev/memory/projectbrief.md` (project identity).
- `.autodev/memory/techContext.md` (technologies, model routing).
- `.autodev/memory/activeContext.md` (current phase, open questions).
- `.omo/rules/*.md` (project-specific coding standards).
- `.autodev/reference/` docs injected as virtual context (immutable technical truth).

Magic Context separately auto-injects a `<project-memory>` block from session history at session start. The agent sees both the curated bootstrap context and the organic working memory. If they conflict, the bootstrap context wins, and Loreguard overrides both. Implemented by T5 in the pi-foundation plan.

---

## 29. Magic Context Integration

Magic Context is installed as a pi extension. It is not reimplemented. It provides semantic memory, session history search, and context management through a shared SQLite DB.

The DB at `~/.local/share/cortexkit/magic-context/context.db` is shared across harnesses. Existing memories, compartments, and tags from OpenCode sessions are accessible from pi sessions. No deletion, no fresh start. AutoDev on pi coexists with any existing OpenCode setup. `.pi/` and `.opencode/` can both exist in the same project.

All 5 ctx_* tools are available:

- `ctx_search`: searches memories, session history, and git commits semantically.
- `ctx_memory`: writes, updates, archives, and merges memories across categories (PROJECT_RULES, ARCHITECTURE, CONSTRAINTS, CONFIG_VALUES, NAMING).
- `ctx_note`: writes working notes for the session, with optional smart note conditions that surface when externally verifiable events occur.
- `ctx_expand`: recovers original conversation from compacted session history.
- `ctx_reduce`: marks spent tool outputs as discardable to reclaim context space.

Features enabled in `.pi/magic-context.jsonc`:

- **Git commit indexing**: `memory.git_commit_indexing.enabled: true` for semantic search over git history.
- **Key files pinning**: `dreamer.pin_key_files.enabled: true` to pin frequently-read files into context.
- **Sidekick agent**: `sidekick.enabled: true` for prompt augmentation via memory retrieval.
- **User memories**: enabled by default. Extracts behavioral patterns about the user.
- **Workspaces**: configured if the project belongs to a workspace for shared memory across projects.

Two hidden agents run in the background: the historian, which auto-extracts memories from sessions, and the dreamer, which consolidates and manages memory over time. Config at `.pi/magic-context.jsonc`. Implemented by T3 and T6 in the pi-foundation plan.

---

## 30. CLI Commands

Five CLI commands are registered via `pi.registerCommand()`.

- `autodev onboard`: launches a Harbor Master session for project onboarding. The Harbor Master conducts the structured interview from the onboarding protocol and seeds the knowledge base.
- `autodev doctor`: health check. Verifies agents are loaded, guardrails are active, Magic Context is healthy, Loreguard DB is accessible, and the docs corpus is indexed. Run after setup to validate configuration.
- `autodev status`: shows current work items, heartbeat state, and active sessions.
- `autodev docs query "..."` searches the docs corpus. `autodev docs rebuild` reingests `docs-corpus/`.
- `autodev debate start "topic"` starts a debate. `autodev debate status` shows active debate state.

Implemented by T13 in the pi-foundation plan.

---

## 31. Debug Mode

Debug mode enables logging for all agent thinking and actions. It is off by default.

When enabled, every agent session logs:
- Model prompts and responses
- Tool calls and results
- Guardrail inspections (pass/block decisions)
- Background task lifecycle events
- Heartbeat poll results

Debug output goes to a configurable log file (default: `.autodev/debug.log`) or stdout. This is for development and troubleshooting — the verbosity makes it unsuitable for normal operation. Enable via `autodev doctor --debug on` or the `AUTODEV_DEBUG=true` environment variable.

---

## 32. Multi-Project Support

AutoDev supports multiple projects simultaneously. Each project is self-contained in its own working directory, linked to its own GitHub repository. Each project has an independent team of agents to enable simultaneous work without confusion.

Harbor Master tracks which project is currently active (the one the user is discussing or working on) and maintains awareness of all other projects and their current states. When the user switches context, Harbor Master notes the switch and the crew adjusts its active work accordingly. Projects do not get mixed up — each has its own `.autodev/` state, its own agent sessions, and its own GitHub label set.

The heartbeat polls GitHub across all configured project repositories. Nemo triages issues per-project, routing work to the project's dedicated crew. Background agents are scoped to their project's working directory.

---

## 33. Failure Modes and Recovery

| Failure | How it is detected | Recovery |
|---------|-------------------|----------|
| pi process dies | Process manager (systemd, pm2, or manual) detects exit | Restart the process. All subsystems come back online from persisted state. |
| Model API outage | Session event returns 429, 500, 502, 503, 504, or timeout | Model fallback chain activates. Session aborts and re-prompts with the next model in the chain. |
| GitHub API rate limit | `gh` CLI returns rate limit error | Heartbeat backs off and retries on the next tick. Work continues from persisted state. |
| Magic Context DB corruption | `ctx_search` returns errors or empty results | Run Magic Context doctor. If the DB is unrecoverable, start fresh. Memories regrow from session work. Loreguard and reference docs are unaffected. |
| Loreguard DB locked | `search_lore` returns a locked error | SQLite file locking issue. Retry with a short backoff. If persistent, check for concurrent writers. |
| Heartbeat stalls | No new issues dispatched, `autodev status` shows stale heartbeat | Watch Officer detects the stall and restarts the heartbeat timer. |
| Discord connection lost | Bridge event handler stops receiving messages | Bridge disables with a warning. Crew continues through GitHub. Bridge reconnects when the token is valid again. |
| Guardrail false positive | A compliant action is blocked | Check the guardrail regex in `.autodev/config/guardrails.yaml`. Adjust the pattern. The block reason tells you which hard stop fired. |
| Debate deadlock | Judges cannot reach a verdict, needs-revision loops repeat | After 3 needs-revision loops, the debate escalates to Nemo for a final decision. |
| Merge conflict | `gh pr view` shows `mergeable: false` | Ned Land rebases on the target branch, re-pushes, and re-enters the verification loop. |

### Watch Officer: Proactive Monitoring

The Watch Officer does not wait for failures. During implementation, it monitors in real time to detect deviations before they happen:

- **Plan deviation**: implementation that diverges from the approved plan
- **API mismatch**: incorrect implementation of a dependency's documented API
- **Dependency incompatibility**: code that conflicts with dependency documentation
- **Assumption errors**: agent assumptions that don't match the actual codebase or project constraints

This is a proactive role, not just reactive self-healing. The Watch Officer observes ongoing agent work and flags issues through the team mailbox before they propagate into committed code.

---

## 34. Data Flow Diagrams

### Diagram A: GitHub issue to merge pipeline (end to end)

```
GitHub issue labeled autodev-request
        |
        v
  Heartbeat polls (setInterval, 5 min)
        |
        v
  IntentGate analyzes issue text
        |
        v
  Nemo session created (createAgentSession)
        |
        v
  Cynefin classification (Simple / Complicated / Complex / Chaotic)
        |
        +--> Simple --> task(category="quick") --> Ned Land implements
        |
        +--> Complicated --> Aronnax plans (single round) --> Ned Land implements
        |
        +--> Complex --> Debate (5 sessions) --> Aronnax plans --> Ned Land implements
        |
        +--> Chaotic --> Watch Officer emergency response
        |
        v
  Ned Land implements in worktree, writes evidence
        |
        v
  Label: autodev-in-progress
        |
        v
  Ned Land opens PR, label: autodev-review
        |
        v
  Oracle reviews PR (Oracle + Momus sessions)
        |
        v
  CI runs (GitHub Actions)
        |
        v
  Evidence + CI green + Oracle clean --> label: autodev-ready
        |
        v
  auto_merge_pr tool checks gates
        |
        v
  gh pr merge --squash --delete-head
        |
        v
  Label: autodev-merged
        |
        v
  Navigator alerts liaison (if applicable), liaison deploys and verifies — OR Navigator confirms deployment directly for human-consumed projects
        |
        v
  Task complete
```

### Diagram B: Agent session lifecycle

```
  createAgentSession({ model, tools, customTools, sessionManager })
        |
        v
  Session created (in-process, shared memory)
        |
        v
  Context injected (AGENTS.md, CONTEXT.md, memory files, reference docs, rules)
        |
        v
  Magic Context auto-injects <project-memory> block
        |
        v
  Prompt dispatched to model
        |
        v
  Model generates tool call
        |
        v
  pi.on("tool_call") fires --> Guardrail engine inspects
        |
        +--> Hard stop violated --> block with reason, tool call never runs
        |
        +--> Soft stop triggered --> warn, tool call runs
        |
        +--> All clear --> tool executes
        |
        v
  Tool result returned to model
        |
        v
  Comment checker inspects write/edit results, strips AI-slop
        |
        v
  Model generates next tool call or final response
        |
        v
  session.subscribe() fires agent_end
        |
        v
  Parent-wake notifier tells parent session (if subagent)
        |
        v
  Response delivered
        |
        v
  Session disposed (or persisted via SessionManager.create)
```

---

## Cross-Reference Index

| Section | pi-foundation todo |
|---------|-------------------|
| Agent Session Architecture | T4 |
| Extension Architecture | T5 |
| Guardrail Engine | T7 |
| Background Agent Management | T8 |
| Model Fallback Chains | T8 |
| Category System | T9 |
| Loreguard | T10 |
| Docs Query System | T11 |
| Custom Tools | T12 |
| Skills System | T12 |
| Heartbeat | T13 |
| Discord Bridge | T14 |
| Debate Protocol | T15 |
| Auto-Merge Pipeline | T16 |
| Boulder State | T16 |
| Continuation Loops | T16 |
| Team Mode | T5 |
| Comment Checker | T5 |
| Notepad System | T5 |
| IntentGate | T5 |
| Built-in MCPs | T5 |
| LSP Integration | T5 |
| Tmux Integration | T5 |
| Rules Injection | T5 |
| Context Injection | T5 |
| Magic Context Integration | T3, T6 |
| CLI Commands | T13 |
| Debug Mode | (new todo — pi-foundation plan) |
| Multi-Project Support | (new todo — pi-foundation plan) |

Features not in the pi-foundation plan are documented in `ROADMAP.md` as future waves. This architecture covers only what the pi-foundation plan builds, including multi-project support.