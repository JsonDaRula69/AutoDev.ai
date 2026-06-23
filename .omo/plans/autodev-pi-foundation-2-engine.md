# autodev-pi-foundation-2-engine — Crew Engine

> **BRANCH:** All work in this plan is conducted on the `pi-foundation` branch. Do NOT push to `main`. The `pi-foundation` branch was created from `main` as a fresh start — all commits land here. `main` is frozen and will not receive any pushes during this work. Upon completion of all sub-plans, `main` will be deprecated and `pi-foundation` will become the new `main` branch (via branch rename or fast-forward merge at the user's discretion).

> **PREREQUISITE:** This plan depends on `.omo/plans/autodev-pi-foundation-1-core.md` being complete. The base extension (T5) and 13 agents (T4) must be in place before this plan can execute.

> **SPLIT FROM:** This is sub-plan 2 of 4 from the master plan `.omo/plans/autodev-pi-foundation.md`. Execute after Plan 1 completes. Plan 3 (Knowledge + Tools) can parallelize with this plan after Plan 1 completes.

## TL;DR (For humans)

**What you'll get:** Crew engine: guardrail engine with 6 hard stops via tool_call interception, background agent manager with concurrency control + circuit breaker + model fallback chains, and the task delegation system with 8 built-in categories.

**Effort:** M — 3 todos across 1 wave.
**Risk:** Medium — guardrails and background agents are critical infrastructure. Mitigated by: clear design specs, pi's proven event system, and test-first approach.

## Design Specification

This plan implements the design described in the following documents. If this plan and the docs disagree, the docs win.

| Document | What it specifies | Key sections |
|----------|-------------------|--------------|
| `README.md` | User-facing design: crew roles, quick start, workflow, configuration, coexistence | §The Crew (13 agents), §How It Works (pipeline), §Configuration (.pi/ + .autodev/) |
| `ARCHITECTURE.md` | Developer-facing system design: 34 sections covering every component | §6 Guardrails, §7-8 Background + Fallback, §9 Category System |
| `STRUCTURE.md` | Directory map and reference catalog: where every file lives | §1 Project Layout (directory tree), §4 Config Files (9 config files) |
| `ROADMAP.md` | Future waves: features NOT in this plan | §Near-term (hashline, notifications, CLI commands, think mode, inter-agent communication), §Medium-term (MCP OAuth, CodeGraph, babysitter), §Long-term (single binary) |

## Scope

### Must have

- **Guardrail engine via tool_call interception.** Implement hard stops (no-secrets-in-code, evidence-required, follow-the-plan, one-task-at-a-time, ci-is-hard-gate) as pi `tool_call` event handlers that block violating actions. Write tests: plant a secret in a file write → blocked; write evidence then commit → allowed.
- **Background agent management.** Spawn subagent sessions via `createAgentSession()` with `SessionManager.inMemory()`. Concurrency control (max 5 per key). Poll completion via session.subscribe() events. Circuit breaker (stale timeout 180s). Parent-wake notifier. Error classifier for retry decisions.
- **Model fallback chains.** When a model call fails (429, 500, 502, 503, 504), extract error info, resolve the agent's fallback_models chain from config, abort current session, re-prompt with fallback model. Proactive (configured per agent) + reactive (auto-switch on API errors).
- **Category system for task delegation.** Built-in categories: quick, deep, ultrabrain, visual-engineering, artistry, writing, unspecified-low, unspecified-high. Custom categories configurable. `task(category="...")` routes to Sisyphus-Junior equivalent with category-optimized model. `task(subagent_type="...")` invokes specific crew agent.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- **Must NOT install or depend on OmO (oh-my-openagent).** Build directly on pi primitives.
- **Must NOT depend on OpenCode packages.** Zero OpenCode dependencies.
- **Must NOT reimplement semantic memory.** Magic Context Pi extension provides ctx_search, ctx_memory, ctx_note, ctx_expand, ctx_reduce, historian, dreamer. Install it, don't rebuild it.
- **Must NOT build a single binary.** Future wave. Out of scope.
- **Must NOT push to `main`.** All work is on the `pi-foundation` branch. `main` is frozen. No commits, no pushes to `main` during this work. Upon completion, `main` will be deprecated and `pi-foundation` becomes the new `main`.

## Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T7 (Guardrails via tool_call) | T5 | T13 | T6, T8, T9, T10, T11, T12 |
| T8 (Background agent + model fallback) | T5 | T9, T13 | T6, T7, T10, T11, T12 |
| T9 (Category system + task delegation) | T8 | T13 | T6, T7, T10, T11, T12 |

Critical Path: T5 (from Plan 1) → T8 → T9

## Todos
> Implementation + Test = ONE todo. Never separate.

### Wave 2 — Crew Engine (Parallel after T5)

- [ ] 7. Build guardrail engine via tool_call interception
  What to do: Implement AutoDev's hard stops as pi `tool_call` event handlers that block violating actions. Register a `tool_call` event listener in the AutoDev extension that inspects every tool call and blocks if a hard stop is violated. Hard stops: (1) never-deploy-directly — block direct deploy actions by any agent other than the Navigator (action type check); (2) no-secrets-in-code — block `write`/`edit` calls that contain API keys, tokens, passwords (regex check); (3) evidence-or-it-didnt-happen — block `bash` calls that run `git commit` if no evidence file exists in .omo/evidence/ for the current task; (4) one-task-at-a-time — block new task creation if a task is already in progress; (5) follow-the-plan — block implementation that deviates from a plan in .autodev/plans/; (6) ci-is-the-hard-gate — block `bash` calls that run `gh pr merge` if CI is not green. Also implement soft stops (warnings): suggest-review, warn-scope, flag-missing-evidence. Write tests: plant a secret in a write call → blocked; write evidence then commit → allowed; merge without CI → blocked.
  Must NOT do: Do NOT block all tool calls — only violating ones. Do NOT make soft stops block execution. Do NOT hardcode guardrail rules in the event handler — load from .autodev/config/guardrails.yaml.
  Parallelization: Wave 2 | Blocked by: T5 | Blocks: T13 | Can parallelize with: T6, T8, T9, T10, T11, T12
  References: Pi tool_call event: `pi.on("tool_call", async (event, ctx) => { if (violates) return { block: true, reason: "..." } })`. Hard stops from .autodev/reference/workflow-specification.md section 4.1. Guardrail config at .autodev/config/guardrails.yaml. Pi docs: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md.
  Design refs: ARCHITECTURE.md §6 Guardrail Engine
  Acceptance criteria: A test that calls `write` with content containing `sk-ant-...` (API key pattern) → blocked with reason "no-secrets-in-code". A test that calls `bash` with `git commit` when .omo/evidence/ is empty → blocked with reason "evidence-required". A test that writes evidence then calls `bash` with `git commit` → allowed. A test that calls `bash` with `gh pr merge` when CI status is not green → blocked with reason "ci-is-hard-gate". Guardrail rules loaded from .autodev/config/guardrails.yaml (not hardcoded).
  QA scenarios: happy — all 6 hard stops block violations, allow compliant actions. Failure — a hard stop doesn't block (regex wrong); or blocks compliant actions (false positive); or rules hardcoded (not from config). Evidence: `.omo/evidence/task-7-autodev-pi-foundation.txt` (test outputs for each hard stop).
  Commit: Y | feat(guardrails): hard/soft stops via pi tool_call interception

- [ ] 8. Build background agent management and model fallback
  What to do: Build two systems: (a) Background agent manager — spawn subagent sessions via `createAgentSession()` with `SessionManager.inMemory()`. Track task lifecycle (pending→running→completed/error/cancelled). Concurrency control (max 5 per key, configurable per provider/model). Poll completion via `session.subscribe()` events (listen for agent_end, message_end). Circuit breaker (stale timeout 180s, configurable). Parent-wake notifier (notify parent session when child completes). Error classifier (retryable vs fatal). (b) Model fallback — when a model call fails (429, 500, 502, 503, 504, timeout), extract error info from session events, resolve the agent's `fallback_models` chain from config, abort current session, re-prompt with fallback model. Support both proactive (configured per agent) and reactive (auto-switch on API errors) fallback. Config in .autodev/config/ or .pi/settings.json.
  Must NOT do: Do NOT use subprocess spawning — use in-process createAgentSession(). Do NOT block the parent session while waiting for background tasks. Do NOT retry non-retryable errors (auth failures, context overflow).
  Parallelization: Wave 2 | Blocked by: T5 | Blocks: T9, T13 | Can parallelize with: T6, T7, T10, T11, T12
  References: Pi SDK: `createAgentSession({ sessionManager: SessionManager.inMemory(), model, tools, customTools })`. Session events: `session.subscribe((event) => { ... })` — event types: agent_start, agent_end, message_end, tool_execution_start/end. Session abort: `session.abort()`. Session dispose: `session.dispose()`. Pi docs: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md.
  Design refs: ARCHITECTURE.md §7 Background Agent Management, ARCHITECTURE.md §8 Model Fallback Chains
  Acceptance criteria: A test that spawns 3 background sessions concurrently and confirms all 3 complete. A test that spawns a session with a bad model and confirms fallback to the configured fallback model. A test that spawns a session that hangs and confirms circuit breaker triggers after stale timeout. A test that confirms parent session is notified when child completes. Concurrency limit enforced (6th task queued when limit is 5).
  QA scenarios: happy — background tasks spawn, complete, notify parent; fallback works on model failure; circuit breaker triggers on hang. Failure — background task leaks (not disposed); or fallback doesn't trigger (error not detected); or concurrency limit not enforced. Evidence: `.omo/evidence/task-8-autodev-pi-foundation.txt` (test outputs).
  Commit: Y | feat(orchestration): background agent manager + model fallback chains

- [ ] 9. Build category system and task delegation
  What to do: Build the task delegation system. Built-in categories: quick (trivial fixes), deep (autonomous problem-solving), ultrabrain (hard logic), visual-engineering (frontend/UI), artistry (creative), writing (docs/prose), unspecified-low (general low-effort), unspecified-high (general high-effort). Category model assignments loaded from config (.autodev/config/ or .pi/settings.json) — NOT hardcoded. Default model mapping: quick=glm-5.2:cloud, deep=deepseek-v4-pro, ultrabrain=deepseek-v4-pro (with thinkingLevel="xhigh" if supported), visual-engineering=glm-5.2:cloud, artistry=glm-5.2:cloud, writing=glm-5.2:cloud, unspecified-low=glm-5.2:cloud, unspecified-high=glm-5.2:cloud. All model strings must be validated against the provider API before use. Custom categories configurable in .autodev/config/. Register a `task` pi tool via `defineTool()` that accepts either `category` or `subagent_type` (mutually exclusive). When category is given: spawn a background session (via T8's manager) with the category's model and a system prompt that includes the task description + skill context. When subagent_type is given: spawn a specific crew agent (explore, oracle, etc. from T4's 13 agents). Support `run_in_background: true` for async execution. Support `load_skills` parameter to inject skill prompts (NOTE: skills are ported in T12 which runs in a later wave — implement the parameter interface now, but it will return no skills until T12 completes).
  Must NOT do: Do NOT allow category and subagent_type together (mutually exclusive). Do NOT let Sisyphus-Junior equivalent re-delegate (block task tool for delegated sessions). Do NOT hardcode models — load from config.
  Parallelization: Wave 2 | Blocked by: T8 | Blocks: T13 | Can parallelize with: T6, T7, T10, T11, T12
  References: Pi defineTool(): `defineTool({ name, label, description, parameters: Type.Object({...}), execute: async (id, params) => ({ content, details }) })`. Categories: quick, deep, ultrabrain, visual-engineering, artistry, writing, unspecified-low, unspecified-high. Pi docs: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md (defineTool, customTools). TypeBox for schemas: `import { Type } from "@sinclair/typebox"`.
  Design refs: ARCHITECTURE.md §9 Category System for Task Delegation
  Acceptance criteria: A test that calls `task(category="quick", prompt="fix typo")` and confirms a background session is spawned with the quick category model. A test that calls `task(subagent_type="explore", prompt="find all tests")` and confirms an Explore agent session is spawned. A test that calls `task(category="quick", run_in_background=true)` and confirms it returns a task ID immediately. A test that calls `task(category="invalid")` and gets an error. Category models loaded from config (not hardcoded).
  QA scenarios: happy — task delegates to correct category/agent, background mode works, invalid category rejected. Failure — wrong model used (config not loaded); or background mode blocks (not async); or invalid category accepted. Evidence: `.omo/evidence/task-9-autodev-pi-foundation.txt` (test outputs).
  Commit: Y | feat(delegation): category system + task tool for crew dispatch

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Verify scope — 6 hard stops, background manager, category system
- [ ] F2. Code quality — guardrail logic, session lifecycle, model fallback
- [ ] F3. Manual QA — mock tests for each hard stop, concurrent session test, fallback test, category routing test

## Commit strategy

- One commit per code-changing todo (T7, T8, T9).
- Commit types: `feat(guardrails)` (T7), `feat(orchestration)` (T8), `feat(delegation)` (T9).
- Evidence committed alongside code in `.omo/evidence/`.
- Atomic commits — each todo is independently revertable.
- All commits land on the `pi-foundation` branch.

## Success criteria

1. Guardrails enforce all 6 hard stops (never-deploy-directly, no-secrets-in-code, evidence-or-it-didnt-happen, one-task-at-a-time, follow-the-plan, ci-is-the-hard-gate) via tool_call interception.
2. Background agent manager spawns concurrent sessions with concurrency limits, circuit breaker, and parent notification.
3. Model fallback chains work (proactive + reactive) — failed model calls fall back to configured alternatives.
4. Category system routes task delegation to appropriate models (quick, deep, ultrabrain, etc.).
5. `grep -r "@opencode-ai" extensions/ .pi/ src/` returns zero (zero OpenCode package imports).
6. `grep -r "oh-my-openagent\|oh-my-opencode" package.json` returns zero (zero OmO dependencies).
