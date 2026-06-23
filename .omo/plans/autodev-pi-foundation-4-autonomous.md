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
> > If any source disagrees, ARCHITECTURE.md wins on design, .autodev/reference/ wins on process, and this plan wins on scope.

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
- **Must NOT push to `main`.** All work is on the `pi-foundation` branch. `main` is frozen. No commits, no pushes to `main` during this work. Upon completion, `main` will be deprecated and `pi-foundation` becomes the new `main`.

## Mock Strategy (No Building in Place)

This plan follows the "no building in place" approach: tests use mocks, not real pi sessions, GitHub API calls, or external services. Real verification happens at deployment time via the installer (T19).

- **T13 (Heartbeat + dispatch)**: Tests mock `gh` CLI output (issues, PRs, labels). Tests mock `createAgentSession` to verify dispatch routing. No real GitHub API calls.
- **T14 (Discord)**: Tests mock Discord REST API (fetch responses). No real Discord bot token needed. Verify message routing logic with mock payloads.
- **T15 (Debate)**: Tests mock `createAgentSession` for each of the 6 sessions (5 independent: proposer, opposer, 3 judges + 1 shared cross-examination). Mock sessions return predetermined arguments. Verify phase transitions, session isolation, and transcript file creation.
- **T16 (Auto-merge + boulder + continuation)**: Tests mock `gh pr checks`, `gh pr merge`, and `gh issue edit` (label transitions). Mock boulder.json state for resume tests. Mock session events for continuation loop tests.
- **T17 (Multi-project)**: Tests mock 2 project configs and verify session scoping. No real GitHub repos needed.
- **T18 (Debug mode)**: Tests verify logging is off by default, on when env var set, and secrets are redacted. Use a temp log file.
- **T19 (Installer)**: This is the ONLY todo that performs real verification. The installer runs real `bun install`, real Magic Context setup, and real `autodev doctor`. But in tests, mock the interactive prompts and external services. The actual installer is tested end-to-end at deployment time, not during development.
- **T20 (Integration modules)**: Tests verify each module registers its tools/handlers. LSP tools return error when no server (mock). Tmux tool returns error when no tmux (mock). Context7/Grep.app mocked. Rules injection no-ops when .omo/rules/ empty. Watch Officer event handler tested with mock tool_call events.

## Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T13 (Heartbeat + crew dispatch) | T7, T8, T9, T10, T11, T12 | T14, T15, T16, T19 | — |
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

- [ ] 13. Build heartbeat, crew dispatch, and CLI commands
  What to do: Build the autonomous orchestrator — the main loop. (a) Heartbeat timer: `setInterval` (default 5 min) that polls GitHub for new `autodev-request` issues across ALL configured project repositories via `gh issue list --label autodev-request --state open --json`. Also checks stalled PRs (autodev-ci-running label > 30 min). Also checks for blocked issues. Uses `gh` CLI. State persisted to .autodev/work-items/. Multi-project support: create a project registry at `.autodev/projects.json` listing all active projects with their working directory, GitHub repo, and current state. The heartbeat polls across ALL registered project repos. Each project gets its own agent sessions scoped to its working directory. Harbor Master tracks the active project and can switch between projects. (b) Crew dispatch: for each new issue, create a crew session via T8's background agent manager (manager.create(...)), NOT raw createAgentSession() — this provides concurrency control, circuit breaker, and model fallback. IntentGate (from T5) first analyzes the issue text to detect true intent (bug, feature, refactor, question). Then dispatch the issue text + IntentGate analysis for triage. Nemo classifies (Simple/Complicated/Complex/Chaotic via Cynefin) and routes: Simple → Ned Land (task category=quick); Complicated+ → Aronnax (plan, then Ned Land implements). Track state transitions via GitHub labels (autodev-request → autodev-planned → autodev-in-progress → autodev-review → autodev-ready → autodev-merged). (c) CLI commands via pi.registerCommand(): `autodev onboard` (launch Harbor Master session), `autodev doctor` (health check: agents loaded, guardrails active, Magic Context healthy, Loreguard DB accessible, docs corpus indexed), `autodev status` (current work items, heartbeat state), `autodev docs query/rebuild`, `autodev debate start/status`.
  Must NOT do: Do NOT poll GitHub more frequently than configured (rate limits). Do NOT create duplicate sessions for the same issue. Do NOT skip label transitions — every state change must update the GitHub label. Do NOT block the heartbeat on a single issue — TRIAGE concurrent (multiple Nemo sessions), but only ONE issue in autodev-in-progress (implementation) at a time via T7 guardrail.
  Parallelization: Wave 4 | Blocked by: T7, T8, T9, T10, T11, T12 (all from Plans 1-3) | Blocks: T14, T15, T16, T19
  References: Pi registerCommand(): `pi.registerCommand("autodev", { description, handler })`. T8's background agent manager: manager.create({ agent, prompt, ... }) — route all session creation through this, NOT raw createAgentSession(). GitHub labels from .autodev/reference/workflow-specification.md §5 Label-as-Truth Convention. `gh` CLI: `gh issue list --label autodev-request --state open --json number,title,body`. `gh pr merge --squash --delete-head`. Cynefin framework from .autodev/reference/workflow-specification.md §3 Debate Protocol. Harbor Master onboarding from .autodev/reference/onboarding-protocol.md.
  Design refs: ARCHITECTURE.md §3 Crew Dispatch Model, ARCHITECTURE.md §14 Heartbeat, ARCHITECTURE.md §30 CLI Commands
  Acceptance criteria: Heartbeat starts and polls GitHub (mock `gh` output in test). A mock `autodev-request` issue → Nemo session created → triage result returned → label transitioned to autodev-planned. CLI commands are registered and their handlers exist: `autodev doctor`, `autodev onboard`, `autodev status`, `autodev docs`, `autodev debate`. `autodev doctor` runs a health check (mocked). `autodev status` shows heartbeat state and work items. Heartbeat stops on `autodev status --stop` or process exit. A test that configures 2 projects and confirms each gets its own agent sessions, working directory, and GitHub repo. Harbor Master tracks the active project and can switch. No context leaks. Heartbeat polls both repos. (Real session verification is a deployment-time activity handled by the installer T19.)
  QA scenarios: happy — heartbeat polls, dispatches, transitions labels; CLI commands work. Failure — heartbeat crashes on gh error (no error handling); or duplicate sessions for same issue; or label not transitioned (gh command fails silently). Evidence: `.omo/evidence/task-13-autodev-pi-foundation.txt` (heartbeat output + dispatch trace + CLI command outputs).
  Commit: Y | feat(orchestrator): heartbeat + crew dispatch + CLI commands

- [ ] 14. Build Discord bridge as pi extension
  What to do: Build the Discord bridge as part of the AutoDev pi extension. Inbound: Discord message → create/continue a pi session → dispatch message as prompt → post response back to Discord. Outbound: agent messages posted to Discord channel. Slash commands: /autodev status, /autodev task, /autodev hold. Reply polling (poll Discord for replies to agent messages). Rate limiting (Discord API limits). Config via env vars: DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, DISCORD_LIAISON_CHANNEL_ID. Register as pi event handler: on agent_end, post response to Discord.
  Must NOT do: Do NOT use @openclaw/discord — build directly with fetch(). Do NOT block the pi session on Discord API calls. Do NOT hardcode channel IDs — use env vars.
  Parallelization: Wave 4 | Blocked by: T13 | Blocks: nothing | Can parallelize with: T15, T16
  References: Discord API: https://discord.com/developers/docs/intro. Discord REST: `POST /channels/{channel_id}/messages` with `Authorization: Bot {token}`. Env vars from .autodev/reference/discord-setup.md. Pi event: `pi.on("agent_end", async (event, ctx) => { ... })` — post response to Discord. Pi sendMessage: `pi.sendUserMessage(text)`.
  Design refs: ARCHITECTURE.md §15 Discord Bridge
  Acceptance criteria: With DISCORD_BOT_TOKEN set, bridge connects and polls for messages. A mock Discord message → pi session created → response posted back (mock Discord API in test). Slash commands registered: /autodev status returns heartbeat state. Rate limiting enforced (no more than 5 requests per second). Reply polling detects replies to agent messages.
  QA scenarios: happy — bridge connects, messages flow bidirectionally, slash commands work. Failure — DISCORD_BOT_TOKEN unset (bridge disables with warning); or rate limit hit (requests queued); or session not created (API key missing for model). Evidence: `.omo/evidence/task-14-autodev-pi-foundation.txt` (bridge startup + mock message flow + slash command output).
  Commit: Y | feat(discord): bidirectional Discord bridge as pi extension

- [ ] 15. Build debate protocol
  What to do: Build the 5-phase debate protocol for Complex decisions. Phase 1: Independent preparation — each participant prepares their position in SEPARATE pi sessions (created via T8's background agent manager for circuit breaker protection — NOT raw createAgentSession()) (6 sessions total: 5 independent (Aronnax proposer, Momus opposer, Nemo judge-1, Oracle judge-2, Conseil judge-3) + 1 shared cross-examination session for Phase 3). Each judge must be in its own session to ensure independence. Phase 2: Structured arguments — every claim follows Claim→Evidence→Warrant format. Phase 3: Cross-examination (Complex only) — proposer and opposer question each other's evidence (in a shared cross-examination session). Phase 4: Verdict — 3 judges each vote independently in their own sessions (approve/reject/needs-revision), majority rules. Phase 5: Implementation verification — 3-judge panel verifies implementation matches approved plan. Debate transcripts written to .autodev/debates/<slug>/: metadata.yaml, proposer-arguments.md, opposer-arguments.md, cross-examination.md, verdict.md, implementation-verification.md. Cynefin classification determines protocol: Simple (no debate), Complicated (single-round), Complex (full 5-phase), Chaotic (Watch Officer emergency). Register as pi command: `autodev debate start "topic"`.
  Must NOT do: Do NOT skip Phase 1 (independent preparation) — independence is the source of diversity. Do NOT allow unsupported claims in Phase 2. Do NOT let judges collaborate before voting in Phase 4.
  Parallelization: Wave 4 | Blocked by: T13 | Blocks: nothing | Can parallelize with: T14, T16
  References: Debate spec: .autodev/reference/workflow-specification.md section 3 (debate phases, Cynefin classification, transcript format). Pi createAgentSession(): create separate sessions for proposer, opposer, each judge. Pi session.subscribe(): collect arguments from each session. Pi session.prompt(): dispatch debate prompts. Cynefin: Simple/Complicated/Complex/Chaotic from .autodev/reference/workflow-specification.md §3 Debate Protocol.
  Design refs: ARCHITECTURE.md §16 Debate Protocol
  Acceptance criteria: A test that starts a debate with a mock Complex topic and confirms all 5 phases execute: 5 independent sessions (proposer, opposer, judge-1, judge-2, judge-3), structured arguments with Claim→Evidence→Warrant, cross-examination, 3 independent verdicts (each judge in own session), implementation verification. Transcript files written to .autodev/debates/<slug>/. `autodev debate start "topic"` command works. Cynefin classification: Simple topic → no debate (direct to Ned Land). Judges do NOT see each other's preparation (confirmed by checking session isolation).
  QA scenarios: happy — 5-phase debate completes, transcripts written, verdict reached. Failure — a phase skipped (only 4 phases); or judges collaborate (not independent); or transcript files missing. Evidence: `.omo/evidence/task-15-autodev-pi-foundation.txt` (debate trace + transcript files + verdict).
  Commit: Y | feat(debate): 5-phase debate protocol with 3-judge panel

- [ ] 16. Build auto-merge, boulder state, and continuation loops
  What to do: Build three systems: (a) Auto-merge — a custom pi tool `auto_merge_pr` that checks: CI status (gh pr checks --json), evidence exists in .omo/evidence/, Oracle review passed (label autodev-review on PR). If all green: `gh pr merge --squash --delete-head`. Transition label to autodev-merged. Post completion comment on the issue. (b) Boulder state — cross-session work plan tracking. .omo/boulder.json with {active_plan, session_ids, started_at, plan_name, completed_todos}. On `/start-work`: if boulder.json exists → resume (read state, calculate progress, inject continuation prompt); if not → init (find latest plan in .omo/plans/, create boulder.json, begin execution). (c) Continuation loops — ralph loop (self-referential until completion signal). DONE detection supports both methods: (1) regex scan `/<promise>DONE<\/promise>/` on agent output after each agent_end event, AND (2) a `loop_done` pi tool the agent can call. Either signal stops the loop. Max iterations (100) is the backstop. ULW loop (ultrawork mode, maximum intensity), todo continuation enforcer (inject system reminder when agent has incomplete todos). `/stop-continuation` stops all loops. The liaison role is optional. It applies when the project is consumed by other agents (e.g., an MCP server for Openclaw agents) — the liaison handles end-user testing. For standard human-consumed projects (web apps, APIs, tools), the crew coordinates deployment directly. The deployment protocol conditionally includes the liaison based on project type, determined during Harbor Master onboarding.
  Must NOT do: Do NOT auto-merge if any gate fails (CI red, no evidence, no review). Do NOT merge without the autodev-ready label. Do NOT let ralph loop run indefinitely (max iterations default 100). Do NOT block the session on continuation loops — they work via event injection.
  Parallelization: Wave 4 | Blocked by: T13 | Blocks: nothing | Can parallelize with: T14, T15
  References: Pi defineTool(): register auto_merge_pr tool. Pi events: pi.on("agent_end") for continuation detection. GitHub merge: `gh pr merge --squash --delete-head --pr <number>`. CI check: `gh pr checks <number> --json name,state`. Label transition: `gh issue edit <number> --remove-label autodev-ready --add-label autodev-merged`. Plan files at .omo/plans/<slug>.md.
  Design refs: ARCHITECTURE.md §17 Auto-Merge Pipeline, ARCHITECTURE.md §18 Boulder State, ARCHITECTURE.md §19 Continuation Loops
  Acceptance criteria: A test that calls `auto_merge_pr` with CI green + evidence + review → merge succeeds, label transitions. A test that calls `auto_merge_pr` with CI red → blocked with reason. Boulder state: create boulder.json, resume, confirm progress calculated. Ralph loop: start, run 3 iterations with mock agent, confirm continuation until DONE or max iterations. Todo enforcer: agent with incomplete todos → system reminder injected.
  QA scenarios: happy — auto-merge gates work, boulder resumes, loops continue until done. Failure — merge with CI red (gate failed); or boulder.json corrupted (resume fails); or ralph loop infinite (max iterations not enforced). Evidence: `.omo/evidence/task-16-autodev-pi-foundation.txt` (merge test + boulder test + loop test).
  Commit: Y | feat(autonomy): auto-merge + boulder state + continuation loops

### Wave 4b — Multi-Project, Debug, and Installer (Parallel after T13)

- [ ] 18. Build debug mode
  What to do: Implement debug mode logging. When enabled (via `autodev doctor --debug on` or `AUTODEV_DEBUG=true` env var), every agent session logs: model prompts and responses, tool calls and results, guardrail inspections (pass/block decisions), background task lifecycle events, heartbeat poll results. Output goes to a configurable log file (default: `.autodev/debug.log`) or stdout. Debug mode is OFF by default. The logging should be structured (JSON lines) for easy parsing. Add a `--debug` flag to CLI commands that enables debug output for that command's session. Use pi's event system to capture events for logging.
  Must NOT do: Do NOT enable debug mode by default — it's too verbose for normal operation. Do NOT log secrets (API keys, tokens) — redact them. Do NOT block the session on logging — use async logging.
  Parallelization: Wave 4b | Blocked by: T5 | Blocks: nothing | Can parallelize with: T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16
  References: ARCHITECTURE.md §31 Debug Mode. Pi events: pi.on("tool_call"), pi.on("agent_end"), session.subscribe(). Config: AUTODEV_DEBUG env var, `autodev doctor --debug on/off`.
  Design refs: ARCHITECTURE.md §31 Debug Mode
  Acceptance criteria: With AUTODEV_DEBUG=true, the debug logging infrastructure is active: log file created at `.autodev/debug.log`, structured as JSON lines, captures pi events (tool_call, agent_end). Event-specific logging (guardrail decisions from T7, background events from T8, heartbeat results from T13) is wired but fully verified at deployment by T19 — development tests verify infra, env toggle, and redaction only. With debug off (default), no debug logging occurs. `autodev doctor --debug on` enables debug mode. Secrets are redacted in logs. A `--debug` flag on CLI commands enables debug for that session.
  QA scenarios: happy — debug logging works, secrets redacted, off by default. Failure — debug logs contain secrets (redaction failed); or debug mode is on by default (too verbose); or logging blocks the session (sync logging). Evidence: `.omo/evidence/task-18-autodev-pi-foundation.txt` (debug log sample + redaction test + off-by-default test).
  Commit: Y | feat(debug): structured debug mode logging for agent thinking and actions

- [ ] 19. Build installer module
  What to do: Build the `autodev install` CLI command that handles deployment-time setup. This is the single entry point for deploying AutoDev to a new environment. The installer: (a) verifies Bun is installed (>= 1.0) — if not, prompts to install it; (b) runs `bun install` to install pi + Magic Context dependencies; (c) prompts for LLM provider credentials and writes to `.pi/auth.json` (gitignored); (d) sets up Magic Context: `npx @cortexkit/magic-context@latest setup --harness pi` and runs `doctor`; (e) prompts for or detects the VoyageAI API key and writes to `.pi/magic-context.jsonc`; (f) creates GitHub labels on the project repo (autodev-request, autodev-planned, etc.); (g) seeds the knowledge base from onboarding if `.autodev/reference/` is empty; (h) runs `autodev docs rebuild` to index the docs corpus. (i) runs `autodev doctor` to verify everything works. The installer is interactive (prompts the user) but can also run non-interactively with env vars for CI/automation. Register as a pi command: `autodev install`.
  Must NOT do: Do NOT hardcode credentials — always prompt or read from env vars. Do NOT skip the doctor check at the end. Do NOT make the installer mandatory for development — developers use `bun install` directly.
  Parallelization: Wave 4b | Blocked by: T13 | Blocks: nothing | Can parallelize with: T14, T15, T16, T17, T18
  References: ARCHITECTURE.md §30 CLI Commands. Pi registerCommand(). GitHub labels from .autodev/reference/workflow-specification.md §5 Label-as-Truth Convention. Magic Context setup: npx @cortexkit/magic-context@latest setup --harness pi.
  Design refs: ARCHITECTURE.md §30 CLI Commands. NOTE: T19 is the only todo that performs real verification (bun install, Magic Context setup, doctor check). All other todos use mocks during development. T19 bridges development and deployment.
  Acceptance criteria: `autodev install` command exists and is registered. Running it (in a test env) prompts for credentials, sets up config files, creates GitHub labels, and runs doctor. A `--non-interactive` flag reads from env vars. Tests: the `--non-interactive` path is tested with env vars (deterministic). The interactive path is tested by mocking process.stdin/readline to return predetermined values. Both paths covered. Evidence: `.omo/evidence/task-19-autodev-pi-foundation.txt`.
  QA scenarios: happy — installer runs end to end, config files created, labels created, doctor passes. Failure — installer crashes (no error handling); or credentials hardcoded (security); or doctor check skipped. Evidence: `.omo/evidence/task-19-autodev-pi-foundation.txt`.
  Commit: Y | feat(installer): autodev install command for deployment-time setup

- [ ] 20. Fill in 5 integration module stubs (lsp, tmux, mcp-integrations, rules-injection, watch-officer-monitor)
  What to do: Replace stub register() functions in 5 modules with real logic: (a) lsp/ — 6 LSP tools via defineTool(), degrades gracefully if no LSP server. (b) tmux/ — interactive_bash tool, errors if tmux not installed. (c) mcp-integrations/ — Context7 + Grep.app tools, NOT Exa. (d) rules-injection/ — load .omo/rules/*.md into context, no-op if empty. (e) watch-officer-monitor/ — tool_call event handler for plan deviations, API mismatches, flags via team mailbox.
  Must NOT do: Do NOT require LSP server for extension load. Do NOT hardcode API keys. Do NOT block working agent.
  Parallelization: Wave 4b | Blocked by: T5 | Blocks: nothing | Can parallelize with: T14, T15, T16, T18, T19
  References: ARCHITECTURE.md §24-27, §33. Pi defineTool() and pi.on("tool_call").
  Design refs: ARCHITECTURE.md §24, §25, §26, §27, §33
  Acceptance criteria: All 5 modules have real register() logic. lsp_diagnostics registered. interactive_bash registered. Context7 + Grep.app registered. Rules injection works. Watch Officer flags via mailbox.
  QA scenarios: happy — all 5 register, graceful degradation. Failure — stub not replaced. Evidence: `.omo/evidence/task-20-autodev-pi-foundation.txt`.
  Commit: Y | feat(integration): 5 integration modules with real logic

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Verify scope — heartbeat (with multi-project polling), dispatch, Discord, debate, auto-merge, boulder, continuation, debug, installer, 5 integration modules filled in
- [ ] F2. Code quality — heartbeat logic, dispatch state machine, debate session isolation, merge gate logic, installer flow
- [ ] F3. Manual QA — mock GitHub issue → triage → plan → implement → review → merge pipeline (mocked), Discord mock, debate mock, installer mock

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
5. Auto-merge: CI green + evidence + review → gh pr merge, label to autodev-merged.
6. Boulder state tracks work plans across sessions (resume/init mode).
7. Continuation loops (ralph, ULW, todo enforcer) drive agents to completion.
8. CLI commands work: autodev onboard, autodev doctor, autodev status, autodev docs, autodev debate.
9. Multi-project support works (part of T13's heartbeat — independent crews per project, no context leaks).
10. Debug mode implemented (off by default).
11. Installer module works (autodev install handles deployment-time setup).
12. `grep -r "@opencode-ai" extensions/ .pi/ src/` returns zero (zero OpenCode package imports).
13. `grep -r "oh-my-openagent\|oh-my-opencode" package.json` returns zero (zero OmO dependencies).
14. Liaison role is conditional on project type (agent-consumed vs human-consumed).
15. All planning and PM goes through GitHub (issues, PRs, labels, CI).
16. All 15 extension modules have real register() logic — zero stubs remaining (4 foundation from T5 + 6 core from Plans 2-3 + 5 integration from T20).
