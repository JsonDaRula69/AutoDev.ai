# autodev-pi-foundation-4-autonomous — Autonomous System

> **BRANCH:** All work in this plan is conducted on the `pi-foundation` branch. Do NOT push to `main`. The `pi-foundation` branch was created from `main` as a fresh start — all commits land here. `main` is frozen and will not receive any pushes during this work. Upon completion of all sub-plans, `main` will be deprecated and `pi-foundation` will become the new `main` branch (via branch rename or fast-forward merge at the user's discretion).

> **PREREQUISITE:** This plan depends on `.omo/plans/autodev-pi-foundation-1-core.md`, `.omo/plans/autodev-pi-foundation-2-engine.md`, and `.omo/plans/autodev-pi-foundation-3-knowledge.md` being complete. The base extension (T5), guardrails (T7), background agent manager (T8), category system (T9), Loreguard (T10), docs query (T11), and custom tools/skills (T12) must all be in place before this plan can execute.
>
> > **SOURCE OF TRUTH:** During implementation, agents must refer to these resources:
> > 1. **ARCHITECTURE.md** (root) — the system design specification (§3 Crew Dispatch, §14 Heartbeat, §15 Discord, §16 Debate, §17 Auto-Merge, §18 Boulder, §19 Continuation, §30 CLI, §31 Debug, §32 Multi-Project)
> > 2. **STRUCTURE.md** (root) — the directory map and reference catalog
> > 3. **.autodev/reference/** — immutable specs (workflow-specification.md for dispatch state machine, debate protocol, guardrails, labels; onboarding-protocol.md for Harbor Master; discord-setup.md for Discord config)
> > 4. **docs-corpus/pi/** — pi SDK documentation (extensions.md for events, sdk.md for createAgentSession, settings.md, rpc.md)
> > 5. **docs-corpus/magic-context/** — Magic Context documentation
> > 6. **This plan file** — the implementation specification
> >
> > If any source disagrees: `.autodev/reference/workflow-specification.md` is immutable and supersedes all other docs on process and guardrail definitions. `ARCHITECTURE.md` wins on system design. `README.md` wins on user-facing design. This plan wins only on scope. Note: `STRUCTURE.md` §5 model routing is stale — use `ARCHITECTURE.md` §4 for current model assignments. Note: `.autodev/reference/discord-setup.md` is stale (references old OmO format) — use this plan's T14 section and `ARCHITECTURE.md` §15 for Discord config.

> **SPLIT FROM:** This is sub-plan 4 of 4 from the master plan `.omo/plans/autodev-pi-foundation.md`. Execute last — after Plans 1, 2, and 3.

## TL;DR (For humans)

**What you'll get:** Autonomous system: heartbeat with multi-project GitHub polling, crew dispatch with Cynefin classification, Discord bridge, 5-phase debate protocol, auto-merge with evidence/CI/review gates, boulder state for cross-session tracking, continuation loops, debug mode, and the deployment installer.

**Effort:** XL — 7 todos across 2 waves.
**Risk:** High — this is the autonomous loop that makes the crew self-sustaining. Mitigated by: all infrastructure from Plans 1-3 in place, clear design specs, and test-first approach.

## Design Specification

This plan implements the design described in the following documents. If this plan and the docs disagree, the docs win.

| Document | What it specifies | Key sections |
|----------|-------------------|--------------|
| `README.md` | User-facing design: crew roles, quick start, workflow, configuration, coexistence | §How It Works (pipeline), §Configuration (.pi/ + .autodev/) |
| `ARCHITECTURE.md` | Developer-facing system design: 35 sections covering every component | §3 Crew Dispatch Model, §14 Heartbeat, §15 Discord, §16 Debate, §17 Auto-Merge, §18 Boulder, §19 Continuation, §30 CLI Commands, §31 Debug Mode, §32 Multi-Project Support |
| `STRUCTURE.md` | Directory map and reference catalog: where every file lives | §1 Project Layout (directory tree) |
| `ROADMAP.md` | Future waves: features NOT in this plan | §Near-term (hashline, notifications, CLI commands, think mode, inter-agent communication), §Medium-term (MCP OAuth, CodeGraph, babysitter), §Long-term (single binary) |

## Scope

### Must have

- **Crew dispatch: GitHub → triage → route.** Build the orchestrator. A heartbeat timer polls GitHub for `autodev-request` issues. For each new issue: create a pi AgentSession for Nemo, dispatch the issue for triage (classify Simple/Complicated/Complex/Chaotic), route to Aronnax (plan) or Ned Land (execute) based on classification.
- **Heartbeat: GitHub polling timer.** setInterval (default 5 min) that polls GitHub for new autodev-request issues, checks stalled PRs (autodev-ci-running > 30 min), triggers self-healing. Uses `gh` CLI.
- **CLI commands via pi.registerCommand().** autodev onboard (Harbor Master onboarding), autodev doctor (health check), autodev status (project status), autodev docs (query/rebuild), autodev debate (start/status).
- **Discord bridge as pi extension.** Inbound: Discord message → pi session prompt. Outbound: session response → Discord message. Slash commands. Reply polling. Rate limiting. Config via env vars (DISCORD_CHANNEL_ID, DISCORD_LIAISON_CHANNEL_ID, DISCORD_BOT_TOKEN).
- **Debate protocol.** 5-phase: independent preparation, structured arguments (Claim→Evidence→Warrant), cross-examination, 3-judge verdict, implementation verification. Cynefin classification (Simple/Complicated/Complex/Chaotic). Debate transcripts to .autodev/debates/<slug>/.
- **Auto-merge.** When evidence + CI green + Oracle review pass → `gh pr merge`. Custom tool `auto_merge_pr` that checks all gates before merging. Label transition to autodev-merged. Quartermaster label enforcement.
- **Boulder state.** Cross-session work plan tracking. .omo/boulder.json with active_plan, session_ids, started_at. Resume mode vs init mode on /start-work.
- **Continuation loops.** Ralph loop (self-referential until DONE), ULW loop (ultrawork mode), todo continuation enforcer. These drive agents to completion without stopping halfway.
- **Multi-project support.** AutoDev supports multiple projects simultaneously. Each project is self-contained in its own working directory, linked to its own GitHub repository. Each project has an independent team of agents. Harbor Master tracks which project is currently active and maintains awareness of all other projects and their states. The heartbeat polls GitHub across all configured project repositories. Nemo triages issues per-project. Background agents are scoped to their project's working directory.
- **Debug mode.** Debug mode enables logging for all agent thinking and actions (model prompts, tool calls, guardrail decisions, background task events, heartbeat results). Off by default. Configurable log file (default: `.autodev/debug.log`) or stdout. Enable via `autodev doctor --debug on` or `AUTODEV_DEBUG=true` env var.
- **Installer module.** An `autodev install` CLI command handles deployment-time setup: dependency installation, credential prompting, Magic Context setup, GitHub label creation, knowledge base seeding, and health verification. Interactive by default, non-interactive mode for CI/automation.
- **GitHub as sole project management channel.** All planning, progress tracking, and project management happens through GitHub. Issues are the work queue, labels are the state machine, PRs are the delivery mechanism, CI is the quality gate, comments are the communication channel. No external PM tools.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- **Must NOT install or depend on OmO (oh-my-openagent).** Build directly on pi primitives.
- **Must NOT depend on OpenCode packages.** Zero OpenCode dependencies.
- **Must NOT reimplement semantic memory.** Magic Context Pi extension provides ctx_search, ctx_memory, ctx_note, ctx_expand, ctx_reduce, historian, dreamer. Install it, don't rebuild it.
- **Must NOT build a single binary.** Future wave. Out of scope.
- **Must NOT make the liaison role mandatory.** The liaison is optional — it applies only when the project is consumed by other agents (e.g., an MCP for Openclaw agents). For human-consumed projects, the crew coordinates deployment directly.
- **Must NOT poll GitHub more frequently than configured (rate limits).**
- **Must NOT create duplicate sessions for the same issue.**
- **Must NOT skip label transitions — every state change must update the GitHub label.**
- **Must NOT block the heartbeat on a single issue — process issues concurrently.**
- **Must NOT use @openclaw/discord — build directly with fetch().**
- **Must NOT skip Phase 1 (independent preparation) — independence is the source of diversity.**
- **Must NOT auto-merge if any gate fails (CI red, no evidence, no review).**
- **Must NOT let ralph loop run indefinitely (max iterations default 100).**
- **Must NOT enable debug mode by default — it's too verbose for normal operation.**
- **Must NOT log secrets (API keys, tokens) — redact them.**
- **Must NOT hardcode credentials — always prompt or read from env vars.**

## Mock Strategy (No Building in Place)

This plan follows the "no building in place" approach: tests use mocks, not real pi sessions, GitHub API calls, or external services. Real verification happens at deployment time via the installer (T19).

- **T13 (Heartbeat + dispatch)**: Tests mock `gh` CLI output (issues, PRs, labels). Tests mock `createAgentSession` to verify dispatch routing. No real GitHub API calls.
- **T14 (Discord)**: Tests mock Discord REST API (fetch responses). No real Discord bot token needed. Verify message routing logic with mock payloads.
- **T15 (Debate)**: Tests mock `createAgentSession` for each of the 6 sessions (5 independent: proposer, opposer, 3 judges + 1 shared cross-examination). Mock sessions return predetermined arguments. Verify phase transitions, session isolation, and transcript file creation.
- **T16 (Auto-merge + boulder + continuation)**: Tests mock `gh pr checks`, `gh pr merge`, and `gh issue edit` (label transitions). Mock boulder.json state for resume tests. Mock session events for continuation loop tests.

- **T18 (Debug mode)**: Tests verify logging is off by default, on when env var set, and secrets are redacted. Use a temp log file.
- **T19 (Installer)**: This is the ONLY todo that performs real verification. The installer runs real `bun install`, real Magic Context setup, and real `autodev doctor`. But in tests, mock the interactive prompts and external services. The actual installer is tested end-to-end at deployment time, not during development.
- **T20 (Integration modules)**: Tests verify each module registers its tools/handlers. LSP tools return error when no server (mock). Tmux tool returns error when no tmux (mock). Context7/Grep.app mocked. Rules injection no-ops when .omo/rules/ empty. Watch Officer event handler tested with mock tool_call events.

## Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T13 (Heartbeat + crew dispatch + multi-project) | T7, T8, T9, T10, T11, T12 | T14, T15, T16, T19 | — |
| T14 (Discord bridge) | T13 | — | T15, T16 |
| T15 (Debate protocol) | T13 | — | T14, T16 |
| T16 (Auto-merge + boulder + continuation) | T13 | — | T14, T15 |
| T18 (Debug mode) | T5 | — | T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16 |
| T19 (Installer) | T13 | — | T14, T15, T16, T18 |
| T20 (Integration modules) | T5 | — | T14, T15, T16, T18, T19 |

Critical Path: T13 → T16

## Todos
> Implementation + Test = ONE todo. Never separate.

### Wave 4 — Autonomous Loop (Parallel after T13)

- [x] 13. Build heartbeat, crew dispatch, and CLI commands
  What to do: Build the autonomous orchestrator — the main loop. (a) Heartbeat timer: `setInterval` (default 5 min) that polls GitHub for new `autodev-request` issues across ALL configured project repositories via `gh issue list --label autodev-request --state open --json`. Also checks stalled PRs (autodev-ci-running label > 30 min). Also checks for blocked issues. Uses `gh` CLI. State persisted to `.autodev/work-items/<issue-number>.json` with fields `{issue_number, dispatched_at, state, project}`. Before dispatch, check this file for a previously recorded `dispatched_at` timestamp — if the issue has already been dispatched and is not `autodev-blocked`, skip it. Persist `dispatched_at` immediately after creating the Nemo session. (b) Multi-project support: create a project registry at `.autodev/projects.json` with schema `{projects: [{name: string, path: string, repo: string, active: boolean}]}`. The heartbeat polls across ALL registered project repos. Each project gets its own agent sessions scoped to its working directory. Harbor Master tracks the active project (the one the user is discussing) and maintains awareness of all other projects' states. When a user switches context, Harbor Master notes the switch. (c) Crew dispatch: for each new issue, create a crew session via T8's background agent manager — call `backgroundManager.spawn({ model, systemPrompt, tools, agentName })` which returns a taskId, NOT raw `createAgentSession()` — this provides concurrency control (provider-level, max 5), circuit breaker, and model fallback. Background task completion is detected via `manager.getTask(taskId)` or the `onParentWake` callback — NOT `pi.on("agent_end")` (that fires for the main session, not background subagents). IntentGate (from T5) first analyzes the issue text to detect true intent (bug, feature, refactor, question). If intent is "question," route to Harbor Master (the sole user-facing contact) rather than dispatching to Nemo. Then dispatch the issue text + IntentGate analysis for triage. Nemo classifies (Simple/Complicated/Complex/Chaotic via Cynefin) and routes: Simple → Ned Land (task category=quick); Complicated+ → Aronnax (plan, then Ned Land implements). The `one-task-at-a-time` guardrail (T7) enforces serialization of IMPLEMENTATION (only one issue in `autodev-in-progress` at a time) — but TRIAGE is concurrent (multiple Nemo sessions can run in parallel). The guardrail checks `active-task.json` for the in-progress todo, and the heartbeat must also check the GitHub label count: if any issue has `autodev-in-progress`, block new implementation dispatch. Track state transitions via GitHub labels on the ISSUE: `autodev-request → autodev-planned → autodev-in-progress → autodev-review → autodev-ready → autodev-merged`. When a PR is opened for the issue, the PR inherits the issue's state. `autodev-review` and `autodev-ready` are applied to the PR by the Quartermaster and mirrored to the issue. The PR↔issue linkage is persisted in `.autodev/work-items/<issue-number>.json` with a `pr_number` field. (d) CLI commands via pi.registerCommand(): `autodev onboard` (launch Harbor Master session), `autodev doctor` (health check: agents loaded, guardrails active, Magic Context healthy, Loreguard DB accessible, docs corpus indexed), `autodev status` (current work items, heartbeat state), `autodev stop` (stops the heartbeat timer — sets a flag checked by the heartbeat loop), `autodev docs query "..."` (search docs corpus), `autodev docs rebuild` (reindex docs corpus), `autodev debate start "topic"`, `autodev debate status`.
  Must NOT do: Do NOT poll GitHub more frequently than configured (rate limits). Do NOT create duplicate sessions for the same issue — check `.autodev/work-items/<issue-number>.json` for `dispatched_at` before dispatching. Do NOT skip label transitions — every state change must update the GitHub label. Do NOT block the heartbeat on a single issue — TRIAGE concurrent (multiple Nemo sessions), but only ONE issue in autodev-in-progress (implementation) at a time. The heartbeat checks GitHub for any issue labeled `autodev-in-progress` before dispatching new implementation work. Do NOT pass raw issue text to agent sessions without length-limiting (max 50,000 chars) — treat all GitHub issue text as untrusted input. Do NOT use `pi.on("agent_end")` for background task completion — use `manager.getTask()` or `onParentWake`.
  Parallelization: Wave 4 | Blocked by: T7, T8, T9, T10, T11, T12 (all from Plans 1-3) | Blocks: T14, T15, T16, T19
  References: Pi registerCommand(): `pi.registerCommand("autodev", { description, handler })`. T8's background agent manager: `backgroundManager.spawn({ model, systemPrompt, tools, agentName })` — returns a taskId string, NOT a session object. Background task completion: poll `manager.getTask(taskId)` or use `onParentWake` callback. Do NOT use `pi.on("agent_end")` for background tasks — that fires for the main session only. GitHub labels from .autodev/reference/workflow-specification.md §5 Label-as-Truth Convention. `gh` CLI: `gh issue list --label autodev-request --state open --json number,title,body`. `gh pr merge --squash --delete-head`. Cynefin framework from .autodev/reference/workflow-specification.md §3 Debate Protocol. Harbor Master onboarding from .autodev/reference/onboarding-protocol.md. Retry/backoff: exponential backoff on `gh` CLI errors (base 30s, max 5 min, max 10 retries) before surfacing.
  Design refs: ARCHITECTURE.md §3 Crew Dispatch Model, ARCHITECTURE.md §14 Heartbeat, ARCHITECTURE.md §30 CLI Commands
  Acceptance criteria: Heartbeat starts and polls GitHub (mock `gh` output in test). A mock `autodev-request` issue → Nemo session created via `backgroundManager.spawn()` → triage result returned → label transitioned to autodev-planned. Issue dedup: second poll for same issue does NOT create a duplicate session (`.autodev/work-items/<issue>.json` checked). CLI commands are registered and their handlers exist: `autodev doctor`, `autodev onboard`, `autodev status`, `autodev stop`, `autodev docs query`, `autodev docs rebuild`, `autodev debate start`, `autodev debate status`. `autodev doctor` runs a health check (mocked). `autodev status` shows heartbeat state and work items. `autodev stop` stops the heartbeat timer. A test that configures 2 projects in `.autodev/projects.json` and confirms each gets its own agent sessions, working directory, and GitHub repo. Harbor Master tracks the active project and can switch. No context leaks. Heartbeat polls both repos. `gh` CLI errors trigger exponential backoff (not crash). (Real session verification is a deployment-time activity handled by the installer T19.)
  QA scenarios: happy — heartbeat polls, dispatches, transitions labels; CLI commands work. Failure — `gh` CLI returns error (exponential backoff retry, not crash); or duplicate sessions for same issue (dedup via work-items file); or label not transitioned (gh command fails silently); or issue text exceeds 50K chars (truncated). Evidence: `.omo/evidence/task-13-autodev-pi-foundation.txt` (heartbeat output + dispatch trace + CLI command outputs).
  Commit: Y | feat(orchestrator): heartbeat + crew dispatch + CLI commands

- [x] 14. Build Discord bridge as pi extension
  What to do: Build the Discord bridge as part of the AutoDev pi extension. Inbound: Discord message → create/continue a pi session → dispatch message as prompt → post response back to Discord. Outbound: agent messages posted to Discord channel. Slash commands: /autodev status, /autodev task, /autodev hold. Reply polling (poll Discord for replies to agent messages). Rate limiting (Discord API limits). Config via env vars: DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, DISCORD_LIAISON_CHANNEL_ID. Register as pi event handler: on agent_end, post response to Discord.
  Must NOT do: Do NOT use @openclaw/discord — build directly with fetch(). Do NOT block the pi session on Discord API calls. Do NOT hardcode channel IDs — use env vars. Do NOT exceed 5 Discord API requests per second. Do NOT pass raw Discord messages to pi sessions without length-limiting (max 10,000 chars) — treat all Discord input as untrusted. Do NOT retry Discord reconnection indefinitely (max 3 attempts).
  Parallelization: Wave 4 | Blocked by: T13 | Blocks: nothing | Can parallelize with: T15, T16
  References: Discord API: https://discord.com/developers/docs/intro. Discord REST: `POST /channels/{channel_id}/messages` with `Authorization: Bot {token}`. Env vars: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID` (per this plan's T19 installer spec). WARNING: `.autodev/reference/discord-setup.md` is STALE — it references the old OmO format (`oh-my-openagent.jsonc`, OpenClaw, `@oh-my-opencode/openclaw-core`) and wrong env var names. Use this plan's T14 section and ARCHITECTURE.md §15 as the implementation spec, NOT discord-setup.md. Pi event: `pi.on("agent_end", async (event, ctx) => { ... })` — post response to Discord. Inbound messages are dispatched to pi sessions via `session.prompt(text)`. Do NOT use `pi.sendUserMessage()` — it does not exist in the pi SDK. Rate limiting: max 5 Discord API requests per second. Reconnection: on network drop, disable with warning; do not retry indefinitely (max 3 reconnect attempts with exponential backoff).
  Design refs: ARCHITECTURE.md §15 Discord Bridge
  Acceptance criteria: With DISCORD_BOT_TOKEN set, bridge connects and polls for messages. A mock Discord message → pi session created → response posted back (mock Discord API in test). Slash commands registered: /autodev status returns heartbeat state. Rate limiting enforced (no more than 5 requests per second). Reply polling detects replies to agent messages.
  QA scenarios: happy — bridge connects, messages flow bidirectionally, slash commands work. Failure — DISCORD_BOT_TOKEN unset (bridge disables with warning); or rate limit hit (requests queued); or session not created (API key missing for model). Evidence: `.omo/evidence/task-14-autodev-pi-foundation.txt` (bridge startup + mock message flow + slash command output).
  Commit: Y | feat(discord): bidirectional Discord bridge as pi extension

- [x] 15. Build debate protocol
  What to do: Build the 5-phase debate protocol for Complex decisions. Phase 1: Independent preparation — each participant prepares their position in SEPARATE pi sessions (created via T8's background agent manager for circuit breaker protection — NOT raw createAgentSession()) (6 sessions total: 5 independent (Aronnax proposer, Momus opposer, Nemo judge-1, Oracle judge-2, Conseil judge-3) + 1 shared cross-examination session for Phase 3). Each judge must be in its own session to ensure independence. Phase 2: Structured arguments — every claim follows Claim→Evidence→Warrant format. Phase 3: Cross-examination (Complex only) — proposer and opposer question each other's evidence (in a shared cross-examination session). Phase 4: Verdict — 3 judges each vote independently in their own sessions (approve/reject/needs-revision), majority rules. Phase 5: Implementation verification — 3-judge panel verifies implementation matches approved plan. Debate transcripts written to .autodev/debates/<slug>/: metadata.yaml, proposer-arguments.md, opposer-arguments.md, cross-examination.md, verdict.md, implementation-verification.md. Cynefin classification determines protocol: Simple (no debate), Complicated (single-round), Complex (full 5-phase), Chaotic (Watch Officer emergency). Register as pi command: `autodev debate start "topic"`.
  Must NOT do: Do NOT skip Phase 1 (independent preparation) — independence is the source of diversity. Do NOT allow unsupported claims in Phase 2. Do NOT let judges collaborate before voting in Phase 4.
  Parallelization: Wave 4 | Blocked by: T13 | Blocks: nothing | Can parallelize with: T14, T16
  References: Debate spec: .autodev/reference/workflow-specification.md section 3 (debate phases, Cynefin classification, transcript format). Pi session creation: route all 6 sessions through T8's `backgroundManager.spawn({ model, systemPrompt, tools, agentName })` — NOT raw `createAgentSession()`. Pi session events: use `manager.getTask(taskId)` or `onParentWake` to collect arguments from each session — NOT `pi.on("agent_end")` (that's for the main session only). Pi session.prompt(): dispatch debate prompts to each session. Cynefin: Simple/Complicated/Complex/Chaotic from .autodev/reference/workflow-specification.md §3 Debate Protocol. Debate recovery: if a judge session errors during the debate, restart that judge's session once; if it errors again, mark the debate as `autodev-blocked` and surface to Harbor Master.
  Design refs: ARCHITECTURE.md §16 Debate Protocol
  Acceptance criteria: A test that starts a debate with a mock Complex topic and confirms all 5 phases execute with 6 sessions total (5 independent: proposer, opposer, judge-1, judge-2, judge-3 + 1 shared cross-examination for Complex topics). Complicated topics skip Phase 3 and use 5 sessions. Structured arguments with Claim→Evidence→Warrant. Cross-examination (Complex only). 3 independent verdicts (each judge in own session). Implementation verification. Transcript files written to .autodev/debates/<slug>/. `autodev debate start "topic"` command works. Cynefin classification: Simple topic → no debate (direct to Ned Land). Judges do NOT see each other's preparation (confirmed by checking session isolation). Judge session error → debate marked `autodev-blocked` after 1 retry.
  QA scenarios: happy — 5-phase debate completes, transcripts written, verdict reached. Failure — a phase skipped (only 4 phases); or judges collaborate (not independent); or transcript files missing. Evidence: `.omo/evidence/task-15-autodev-pi-foundation.txt` (debate trace + transcript files + verdict).
  Commit: Y | feat(debate): 5-phase debate protocol with 3-judge panel

- [ ] 16. Build auto-merge, boulder state, and continuation loops
  What to do: Build three systems: (a) Auto-merge — a custom pi tool `auto_merge_pr` that checks FOUR gates: (1) CI status green (`gh pr checks --json name,state` returns all passing), (2) evidence exists in `.omo/evidence/` for the current task (at least one `.md` or `.txt` file), (3) PR has `autodev-ready` label (meaning Oracle review passed AND review comments are clean — per workflow-specification.md §2.3, `autodev-ready` means "review clean, CI green"; `autodev-review` only means "review started" which is NOT sufficient), (4) PR is mergeable (`gh pr view --json mergeable` returns `MERGEABLE` — handles merge conflicts per ARCHITECTURE.md §33 Failure Modes). If all four gates pass: `gh pr merge --squash --delete-head`. Transition label to `autodev-merged`. Post completion comment on the issue. NOTE: The `ci-is-the-hard-gate` guardrail rule in `.autodev/config/guardrails.yaml` has NO `check:` field (removed in code review fixes) — the async CI check is performed by this tool, NOT by the guardrail DSL. Do NOT re-add a DSL check for CI. (b) Boulder state — cross-session work plan tracking. `.omo/boulder.json` with {active_plan, session_ids, started_at, plan_name, completed_todos}. On `/start-work`: if boulder.json exists → resume (read state, calculate progress, inject continuation prompt); if not → init (find latest plan in `.omo/plans/`, create boulder.json, begin execution). (c) Continuation loops — ralph loop (self-referential until completion signal). DONE detection: monitor background session events via `manager.getTask()` or `onParentWake` (NOT `pi.on("agent_end")` for background sessions). After each session event, scan agent output for regex `/<promise>DONE<\/promise>/` AND check if the agent called the `loop_done` pi tool. Either signal stops the loop. Max iterations (100) is the backstop. ULW loop (ultrawork mode, maximum intensity), todo continuation enforcer (inject system reminder when agent has incomplete todos). `/stop-continuation` stops all loops. The liaison role is optional. It applies when the project is consumed by other agents (e.g., an MCP server for Openclaw agents) — the liaison handles end-user testing. For standard human-consumed projects (web apps, APIs, tools), the crew coordinates deployment directly. The deployment protocol conditionally includes the liaison based on project type, determined during Harbor Master onboarding.
  Must NOT do: Do NOT auto-merge if any gate fails (CI red, no evidence, no `autodev-ready` label, or PR not mergeable). Do NOT check `autodev-review` as the merge gate — that label means "review started," not "review passed." `autodev-ready` is the correct merge gate label. Do NOT let ralph loop run indefinitely (max iterations default 100). Do NOT block the session on continuation loops — they work via event injection.
  Parallelization: Wave 4 | Blocked by: T13 | Blocks: nothing | Can parallelize with: T14, T15
  References: Pi defineTool(): register auto_merge_pr tool. GitHub merge: `gh pr merge --squash --delete-head --pr <number>`. CI check: `gh pr checks <number> --json name,state`. Mergeability check: `gh pr view <number> --json mergeable`. Label transition: `gh issue edit <number> --remove-label autodev-ready --add-label autodev-merged`. Evidence: `.omo/evidence/` (at least one `.md` or `.txt` file). Plan files at `.omo/plans/<slug>.md`. Continuation loop events: use `manager.getTask()` or `onParentWake` for background sessions; `pi.on("agent_end")` for the main session only.
  Design refs: ARCHITECTURE.md §17 Auto-Merge Pipeline, ARCHITECTURE.md §18 Boulder State, ARCHITECTURE.md §19 Continuation Loops
  Acceptance criteria: A test that calls `auto_merge_pr` with all 4 gates green (CI passing, evidence exists, `autodev-ready` label present, PR mergeable) → merge succeeds, label transitions to autodev-merged. A test that calls `auto_merge_pr` with CI red → blocked with reason. A test with PR not mergeable → blocked with reason. A test with `autodev-review` label (but not `autodev-ready`) → blocked (review not yet passed). Boulder state: create boulder.json, resume, confirm progress calculated. Ralph loop: start, run 3 iterations with mock agent, confirm continuation until DONE (both regex and loop_done tool signals tested) or max iterations. Todo enforcer: agent with incomplete todos → system reminder injected.
  QA scenarios: happy — auto-merge gates work, boulder resumes, loops continue until done. Failure — merge with CI red (gate failed); or boulder.json corrupted (resume fails); or ralph loop infinite (max iterations not enforced). Evidence: `.omo/evidence/task-16-autodev-pi-foundation.txt` (merge test + boulder test + loop test).
  Commit: Y | feat(autonomy): auto-merge + boulder state + continuation loops

### Wave 4b — Multi-Project, Debug, and Installer (Parallel after T13)

- [ ] 18. Build debug mode
  What to do: Implement debug mode logging. When enabled (via `autodev doctor --debug on` or `AUTODEV_DEBUG=true` env var), every agent session logs: model prompts and responses, tool calls and results, guardrail inspections (pass/block decisions), background task lifecycle events, heartbeat poll results. Output goes to a configurable log file (default: `.autodev/debug.log`, configurable via `AUTODEV_DEBUG_LOG` env var) or stdout (set `AUTODEV_DEBUG_LOG=stdout`). Debug mode is OFF by default. The logging should be structured (JSON lines) for easy parsing. Log rotation: max file size 50MB; when exceeded, rotate to `.autodev/debug.log.1` (keep last 3 rotated files). Redaction: reuse the guardrail engine's secret detection regexes (SECRET_PATTERNS from `guardrails/evaluator.ts`) to redact API keys, tokens, and passwords in log output before writing. Add a `--debug` flag to CLI commands that enables debug output for that command's session. Use pi's event system to capture events for logging: `pi.on("tool_call")` for tool calls, `pi.on("agent_end")` for main session completion, and `manager.getTask()` / `onParentWake` for background session events.
  Must NOT do: Do NOT enable debug mode by default — it's too verbose for normal operation. Do NOT log secrets (API keys, tokens) — redact using guardrail engine's SECRET_PATTERNS. Do NOT block the session on logging — use async logging. Do NOT let the log file grow unbounded — enforce 50MB rotation with max 3 rotated files.
  Parallelization: Wave 4b | Blocked by: T5 | Blocks: nothing | Can parallelize with: T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16
  References: ARCHITECTURE.md §31 Debug Mode. Pi events: pi.on("tool_call"), pi.on("agent_end"), session.subscribe(). Config: AUTODEV_DEBUG env var, `autodev doctor --debug on/off`.
  Design refs: ARCHITECTURE.md §31 Debug Mode
  Acceptance criteria: With AUTODEV_DEBUG=true, the debug logging infrastructure is active: log file created at `.autodev/debug.log`, structured as JSON lines, captures pi events (tool_call, agent_end). Event-specific logging (guardrail decisions from T7, background events from T8, heartbeat results from T13) is wired but fully verified at deployment by T19 — development tests verify infra, env toggle, and redaction only. With debug off (default), no debug logging occurs. `autodev doctor --debug on` enables debug mode. Secrets are redacted in logs. A `--debug` flag on CLI commands enables debug for that session.
  QA scenarios: happy — debug logging works, secrets redacted, off by default. Failure — debug logs contain secrets (redaction failed); or debug mode is on by default (too verbose); or logging blocks the session (sync logging). Evidence: `.omo/evidence/task-18-autodev-pi-foundation.txt` (debug log sample + redaction test + off-by-default test).
  Commit: Y | feat(debug): structured debug mode logging for agent thinking and actions

- [ ] 19. Build installer module
  What to do: Build the `autodev install` CLI command — the single entry point for deploying AutoDev to a new environment. The installer runs a structured credential setup flow:

  **Step 1 — Environment check:** Verify Bun is installed (>= 1.0). If not, print install instructions and exit. Run `bun install` to install pi + Magic Context dependencies.

  **Step 2 — LLM provider credentials:** Prompt: "Which LLM provider are you using?" (default: ollama-cloud). Prompt for the API key (or env var name). Check for existing credentials in `~/.pi/agent/auth.json` (the pi agent directory resolved by `getAgentDir()`, NOT project-local `.pi/`) or `.opencode/auth.json` and offer to import. Write credentials to the pi agent directory's `auth.json` (path resolved via `getAgentDir()`, typically `~/.pi/agent/auth.json`) — this is where the background manager's `defaultSessionFactory` reads auth from. Also write the env var (e.g., `OLLAMA_CLOUD_API_KEY=...`) to a new `.env` file (gitignored) at the project root for persistence across restarts. If the user provides an env var name instead of a literal key, write `OLLAMA_CLOUD_API_KEY=$VAR_NAME` to `.env` as a reference.

  **Step 3 — Magic Context setup:** Run `npx @cortexkit/magic-context@latest setup --harness pi` and run its `doctor` check. This configures the shared SQLite DB and historian/dreamer.

  **Step 4 — VoyageAI API key (default remote embeddings; skippable → ONNX fallback):** Prompt: "Enter your VoyageAI API key for semantic embeddings (used by Magic Context AND Loreguard):". This is requested but skippable — the user can press Enter to skip. If the user provides a key: write `VOYAGE_API_KEY=...` to `.env` (gitignored). The `.pi/magic-context.jsonc` already references `${VOYAGE_API_KEY}` for Magic Context embeddings. Loreguard's docs query system (T11) also uses VoyageAI as its primary embedding provider when the key is set. If the user skips (no key provided): inform them that local ONNX embeddings will be used as a fallback (slower, ~90MB download on first use) and continue. Write `VOYAGE_API_KEY=` (empty) to `.env` so the fallback activates.

  **Step 5 — Discord (OPTIONAL):** Prompt: "Do you want to set up Discord integration? (y/n)". If yes: prompt for `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, and `DISCORD_LIAISON_CHANNEL_ID` (optional — leave empty if no separate liaison channel). Write all to `.env` (gitignored). If no: skip — the Discord bridge will disable with a warning at runtime. The user can set these env vars later.

  **Step 6 — GitHub labels:** Create the AutoDev label set on the project repo via `gh label create`: autodev-request, autodev-planned, autodev-in-progress, autodev-review, autodev-ready, autodev-merged, autodev-blocked, autodev-rejected. Use `gh label create --force` to be idempotent.

  **Step 7 — Knowledge base seeding:** If `.autodev/reference/` is empty, prompt the user to run `autodev onboard` next to seed it. Do NOT auto-run onboarding — it's a conversational process.

  **Step 8 — Docs corpus indexing:** Run `autodev docs rebuild` to index the docs-corpus/ files into the vector store.

  **Step 9 — Health verification:** Run `autodev doctor` to verify everything works: agents loaded, guardrails active, Magic Context healthy, Loreguard DB accessible, docs corpus indexed, config files present.

  **Non-interactive mode:** The `--non-interactive` flag reads all credentials from env vars instead of prompting: `OLLAMA_CLOUD_API_KEY`, `VOYAGE_API_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID`. Missing optional vars (Discord) are silently skipped. Missing required vars (LLM key, VoyageAI key) cause a warning but don't abort — the user can set them later via `.env`.

  **`.env` file:** All credential env vars are written to a `.env` file at the project root (gitignored). This ensures credentials persist across restarts without requiring the user to export them in their shell profile. The `.env` file is created if it doesn't exist, and credential lines are appended/updated if it does. Add `.env` to `.gitignore` if not already present.

  Register as a pi command: `autodev install`.
  Must NOT do: Do NOT hardcode credentials — always prompt or read from env vars. Do NOT skip the doctor check at the end. Do NOT make the installer mandatory for development — developers use `bun install` directly. Do NOT write credentials to any tracked file — only to the pi agent dir's `auth.json` (resolved by `getAgentDir()`) and `.env` (both gitignored). Do NOT auto-run onboarding — it's a conversational process the user initiates. Do NOT abort if VoyageAI key is not provided — use local ONNX fallback and continue. VoyageAI is the default embeddings provider when a key is provided; ONNX is the fallback when no key is set. Do NOT abort if Discord credentials are missing — skip and continue. Do NOT abort on partial failure — record completed steps to `.autodev/install-state.json` so the installer can resume. Idempotent steps: re-running `autodev install` should be safe (e.g., `gh label create --force`, append-only `.env`).
  Parallelization: Wave 4b | Blocked by: T13 | Blocks: nothing | Can parallelize with: T14, T15, T16, T18
  References: ARCHITECTURE.md §30 CLI Commands. Pi registerCommand(). GitHub labels from .autodev/reference/workflow-specification.md §5 Label-as-Truth Convention. Magic Context setup: npx @cortexkit/magic-context@latest setup --harness pi. Discord config: env vars `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID` (per this plan's T14 and T19 Step 5 — NOT `.autodev/reference/discord-setup.md` which is stale). Pi auth format: `docs-corpus/pi/providers.md`. Auth file location: `getAgentDir() + "/auth.json"` (typically `~/.pi/agent/auth.json`), per `background/manager.ts` `defaultSessionFactory`. VoyageAI: used by Magic Context (`.pi/magic-context.jsonc` `${VOYAGE_API_KEY}`) and Loreguard docs query (T11 embedding layer).
  Design refs: ARCHITECTURE.md §30 CLI Commands. NOTE: T19 is the only todo that performs real verification (bun install, Magic Context setup, doctor check). All other todos use mocks during development. T19 bridges development and deployment.
  Acceptance criteria: `autodev install` command exists and is registered. Running it (in a test env) walks through all 9 steps: Bun check, LLM credentials → pi agent dir `auth.json` + `.env`, Magic Context setup, VoyageAI key → `.env`, Discord (optional) → `.env`, GitHub labels created, knowledge base seeding prompt, docs rebuild, doctor verification. `.env` file created (gitignored) with all credential env vars. `.gitignore` includes `.env`. Credentials written to `getAgentDir()/auth.json` (NOT project-local `.pi/auth.json`). `.autodev/install-state.json` records completed steps for resume. A `--non-interactive` flag reads from env vars. Tests: the `--non-interactive` path is tested with env vars (deterministic). The interactive path is tested by mocking process.stdin/readline to return predetermined values. Both paths covered. Idempotent re-run test: running `autodev install` twice does not fail. Evidence: `.omo/evidence/task-19-autodev-pi-foundation.txt`.
  QA scenarios: happy — installer runs end to end, config files created, labels created, doctor passes. Failure — installer crashes (no error handling); or credentials hardcoded (security); or doctor check skipped. Evidence: `.omo/evidence/task-19-autodev-pi-foundation.txt`.
  Commit: Y | feat(installer): autodev install command for deployment-time setup

- [ ] 20. Fill in 5 integration module stubs (lsp, tmux, mcp-integrations, rules-injection, watch-officer-monitor)
  What to do: Replace stub register() functions in 5 modules with real logic: (a) lsp/ — register 6 LSP tools via defineTool(): `lsp_diagnostics`, `lsp_goto_definition`, `lsp_find_references`, `lsp_prepare_rename`, `lsp_rename`, `lsp_symbols`. Each tool degrades gracefully (returns a helpful error) if no LSP server is configured for the file's language. LSP server config read from `.pi/lsp.json`. (b) tmux/ — register `interactive_bash` tool via defineTool(). Errors if tmux is not installed. Uses tmux to create and manage persistent shell sessions. (c) mcp-integrations/ — register Context7 (`context7_query-docs`, `context7_resolve-library-id`) and Grep.app (`grep_app_searchGitHub`) tools via defineTool(). NOT Exa. (d) rules-injection/ — load `.omo/rules/*.md` files and inject them into agent context via the `before_agent_start` event handler (same mechanism as T5's context injection). No-op if `.omo/rules/` is empty or doesn't exist. This is distinct from T5's context injection (which loads AGENTS.md, CONTEXT.md, and `.autodev/memory/*.md`); rules-injection adds project-specific coding standards from `.omo/rules/`. (e) watch-officer-monitor/ — register a `tool_call` event handler via `pi.on("tool_call")` that inspects tool calls for plan deviations (write targets outside the active plan's scope), API mismatches (incorrect API usage vs docs-corpus), and wrong assumptions. Flags are sent via the team mailbox using `team_send_message` (from T5's team-mode module) to the Harbor Master. Does NOT block the tool call — only flags.
  Must NOT do: Do NOT require LSP server for extension load. Do NOT hardcode API keys. Do NOT block working agent.
  Parallelization: Wave 4b | Blocked by: T5 | Blocks: nothing | Can parallelize with: T14, T15, T16, T18, T19
  References: ARCHITECTURE.md §24-27, §33. Pi defineTool() and pi.on("tool_call").
  Design refs: ARCHITECTURE.md §24, §25, §26, §27, §33
  Acceptance criteria: All 5 modules have real register() logic. LSP registers all 6 tools: `lsp_diagnostics`, `lsp_goto_definition`, `lsp_find_references`, `lsp_prepare_rename`, `lsp_rename`, `lsp_symbols` — each returns a graceful error when no LSP server is configured. `interactive_bash` registered and returns error when tmux not installed. Context7 (`context7_query-docs`, `context7_resolve-library-id`) + Grep.app (`grep_app_searchGitHub`) registered. Rules injection loads `.omo/rules/*.md` into context via `before_agent_start` (no-op if empty). Watch Officer event handler flags deviations via `team_send_message` to Harbor Master (does NOT block the call).
  QA scenarios: happy — all 5 register, graceful degradation. Failure — stub not replaced. Evidence: `.omo/evidence/task-20-autodev-pi-foundation.txt`.
  Commit: Y | feat(integration): 5 integration modules with real logic

## Pre-Existing Issue Policy

When a subagent discovers an issue it categorizes as "pre-existing" (i.e., code from a prior plan that has a bug or gap, but is outside the current todo's scope), the subagent must NOT fix it — that would be scope creep. However, the issue must NOT be silently ignored. The subagent must:

1. **Record the issue** in a `## Pre-Existing Issues Found` section at the end of its evidence file (`.omo/evidence/task-<N>-autodev-pi-foundation.txt`).
2. **Include**: file path, line number(s), description of the issue, severity, and suggested fix.
3. **Notify**: the subagent's final message must include a `## Pre-Existing Issues` summary listing all such findings.

After each todo completes, the orchestrator (Nemo or the continuation loop) must:
1. **Read the evidence file** and extract any pre-existing issues.
2. **Create a follow-up task** to fix each pre-existing issue before the next todo begins.
3. **Only proceed to the next todo** when ALL pre-existing issues from the previous todo have been addressed (either fixed or explicitly deferred with a recorded reason).

This ensures no issue is lost. A problem is still a problem, even if it was pre-existing.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Verify scope — heartbeat (with multi-project polling), dispatch, Discord, debate, auto-merge, boulder, continuation, debug, installer, 5 integration modules filled in. Confirm all pre-existing issues from every todo's evidence file have been addressed or explicitly deferred.
- [ ] F2. Code quality — heartbeat logic, dispatch state machine, debate session isolation, merge gate logic, installer flow
- [ ] F3. Manual QA — mock GitHub issue → triage → plan → implement → review → merge pipeline (mocked), Discord mock, debate mock, installer mock
- [ ] F4. Code-vs-plan compliance audit — for each todo (T13-T20), read the actual implemented code and compare line-by-line against the plan's "What to do", "Must NOT do", and "Acceptance criteria" sections. Verify every acceptance criterion is met by actual code (not just by tests passing). Flag any acceptance criterion that is unimplemented, partially implemented, or contradicts the plan. Read the actual files — do not trust test output alone. Output a per-todo compliance table: {todo, criterion, status (MET/UNMET/PARTIAL), evidence (file:line or test name)}. All criteria must be MET before the plan is declared complete.

## Commit strategy

- One commit per code-changing todo (T13, T14, T15, T16, T18, T19, T20).
- Commit types: `feat(orchestrator)` (T13), `feat(discord)` (T14), `feat(debate)` (T15), `feat(autonomy)` (T16), `feat(debug)` (T18), `feat(installer)` (T19), `feat(integration)` (T20).
- Evidence committed alongside code in `.omo/evidence/`.
- Atomic commits — each todo is independently revertable.
- All commits land on the `pi-foundation` branch.

## Success criteria

1. Heartbeat polls GitHub for autodev-request issues and dispatches triage.
2. Crew dispatch: GitHub issue → Nemo triage → route to Aronnax/Ned Land → label transitions.
3. Discord bridge connects and relays messages bidirectionally.
4. Debate protocol executes 5 phases with 3-judge panel for Complex decisions.
5. Auto-merge: CI green + evidence + `autodev-ready` label + PR mergeable → gh pr merge, label to autodev-merged.
6. Boulder state tracks work plans across sessions (resume/init mode).
7. Continuation loops (ralph, ULW, todo enforcer) drive agents to completion.
8. CLI commands work: autodev onboard, autodev doctor, autodev status, autodev stop, autodev docs query, autodev docs rebuild, autodev debate start, autodev debate status.
9. Multi-project support works (part of T13's heartbeat — independent crews per project, no context leaks).
10. Debug mode implemented (off by default).
11. Installer module works (autodev install handles deployment-time setup).
12. `grep -r "@opencode-ai" extensions/ .pi/ src/` returns zero (zero OpenCode package imports).
13. `grep -r "oh-my-openagent\|oh-my-opencode" package.json` returns zero (zero OmO dependencies).
14. Liaison role is conditional on project type (agent-consumed vs human-consumed).
15. All planning and PM goes through GitHub (issues, PRs, labels, CI).
16. All 15 extension modules have real register() logic — zero stubs remaining (4 foundation from T5 + 6 core from Plans 2-3 + 5 integration from T20).
17. All pre-existing issues discovered during implementation have been addressed or explicitly deferred with a recorded reason.
18. F4 code-vs-plan compliance audit passes — every acceptance criterion in every todo is verified as MET by actual code.
