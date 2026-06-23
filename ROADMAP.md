# ROADMAP

> **Source of truth:** This document tracks features not yet implemented in AutoDev on pi. See ARCHITECTURE.md for what IS built.

## Introduction

The pi-foundation wave builds the core autonomous engineering team. Thirteen crew agents come online with the full Nautilus identity. Guardrails enforce the hard stops. Crew dispatch routes GitHub issues through triage. Background agents handle parallel work. Model fallback keeps sessions alive when a provider hiccups. Loreguard stores ratified decisions. Docs query gives the crew semantic search over the knowledge base. Custom tools, skills, the heartbeat, the Discord bridge, debate protocol, auto-merge, boulder state, continuation loops, team mode, the comment checker, the notepad, IntentGate, built-in MCPs, LSP integration, tmux, Magic Context integration, rules injection, and the CLI commands all land in that first wave.

This roadmap tracks what comes AFTER that foundation is solid. It's organized by priority and dependency, not by date. Three waves: near-term enhancements that build on what's already there, medium-term features that need moderate effort, and long-term waves that require significant work. A final section covers opt-in and future enhancements to Magic Context itself.

Each entry says what the feature is, why it's deferred, which wave it belongs to, and what depends on it. No implementation details here. This is a roadmap, not a plan.

## Near-term enhancements

These features could be added quickly once the pi-foundation wave is complete. They fill gaps the foundation leaves open without requiring major new infrastructure.

### Hashline edit tool

Content-hash validated edits. Pi ships with its own edit tool that works fine for the initial wave. Hashline adds cryptographic verification that edits apply to the exact content they were written against, so an edit can't silently land on a stale version of a file.

- **Why deferred:** Pi's built-in edit tool is sufficient for the initial wave.
- **Wave:** Near-term.
- **Depends on:** Pi-foundation completion.

### Session notifications

Desktop alerts when a task completes. "Ned Land finished implementing the auth fix" pops up on your screen without you checking Discord or the terminal.

- **Why deferred:** The Discord bridge already provides notification capability. Desktop notifications are a UX enhancement on top of that.
- **Wave:** Near-term.
- **Depends on:** Discord bridge (T14).

### Additional CLI commands

Three commands beyond the core set: `autodev install` for a guided setup wizard, `autodev cleanup` to remove stale sessions and temp files, `autodev refresh-model-capabilities` to re-validate which models are actually available from your provider.

- **Why deferred:** The core CLI commands (onboard, doctor, status, docs, debate) cover essential operations. These three are conveniences.
- **Wave:** Near-term.
- **Depends on:** CLI command system (T13).

### Think mode per agent

Pi supports a `thinkingLevel` option, but per-agent configuration isn't wired yet. The idea is to let Oracle run at xhigh while Ned Land runs at medium, tuning reasoning effort to the task.

- **Why deferred:** A global thinkingLevel setting is sufficient for the initial wave.
- **Wave:** Near-term.
- **Depends on:** Agent session architecture (T4).

## Medium-term features

These features need moderate effort. They add real capability but don't reshape the system.

### MCP OAuth

OAuth authentication flow for MCP servers. The initial wave's built-in MCPs (Context7, Grep.app) don't need OAuth, so there's no authentication flow to build yet. Add this when AutoDev integrates MCP servers that sit behind OAuth.

- **Why deferred:** The initial wave's MCPs don't require OAuth.
- **Wave:** Medium-term.
- **Depends on:** Built-in MCP integration (T5).

### CodeGraph bootstrap

Codebase exploration integration for the Explore agent. CodeGraph provides call-graph analysis: callers, callees, impact analysis. That goes beyond grep-based exploration and lets the crew reason about what a change touches without manual tracing.

- **Why deferred:** Grep plus LSP tools provide sufficient codebase exploration for the initial wave.
- **Wave:** Medium-term.
- **Depends on:** Explore agent (T4), LSP integration (T5).

### Unstable agent babysitter

Full agent monitoring beyond the circuit breaker. The initial wave's background agent manager (T8) includes a circuit breaker that kills sessions stuck past a 180-second stale timeout. The full babysitter adds progressive backoff, session health scoring, automatic restart with context preservation, and anomaly detection.

- **Why deferred:** The circuit breaker handles the most common failure mode, stuck sessions. Full babysitter is for edge cases.
- **Wave:** Medium-term.
- **Depends on:** Background agent manager (T8).

## Long-term waves

Major features that require significant effort. Each one reshapes how AutoDev operates.

### Multi-project routing

Point AutoDev at multiple projects at once. Nemo triages across all of them. Each project gets its own .autodev/ state. Sessions are scoped per project so context doesn't leak between them.

- **Why deferred:** Single-project operation is the core use case and must be solid before adding multi-project complexity.
- **Wave:** Long-term.
- **Depends on:** Complete pi-foundation (all 16 todos).

### Installer

One-command setup. `curl ... | sh` or `npx autodev-init`. The installer handles pi installation, Magic Context setup, credential configuration, GitHub label creation, and knowledge base seeding in a single guided flow.

- **Why deferred:** The manual setup steps are documented and manageable for early adopters. A polished installer is for broader adoption.
- **Wave:** Long-term.
- **Depends on:** Complete pi-foundation, multi-project routing.

### Single binary

Compiled distribution via `bun build --compile`. The result is a standalone binary with no Node.js, no Bun, no npm required on the target machine. You download one file and run it.

- **Why deferred:** Bun is a lightweight prerequisite, and source-level execution keeps development iteration fast during the foundation phase.
- **Wave:** Long-term.
- **Depends on:** Complete pi-foundation, installer.

## Magic Context future options

Opt-in features and future enhancements to Magic Context itself. These aren't AutoDev features per se, they're Magic Context capabilities AutoDev could enable.

### Caveman text compression

Aggressive context compression that summarizes conversation history hard. Off by default. Turn it on when you're under extreme token budget pressure and standard compaction isn't enough.

- **Why deferred:** Magic Context's standard compaction is sufficient for normal operation. Caveman mode is for edge cases.
- **Wave:** Opt-in feature. Enable in `.pi/magic-context.jsonc` when needed.
- **Depends on:** Magic Context integration (T3, T6).

### Additional embedding providers

Support for embedding providers beyond VoyageAI. OpenAI, Cohere, and local ONNX models. The initial wave uses VoyageAI with a local ONNX fallback, which covers the common cases.

- **Why deferred:** VoyageAI plus local ONNX fallback covers the initial use case.
- **Wave:** Future Magic Context enhancement.
- **Depends on:** Docs query system (T11).

### Desktop app integration

A Magic Context desktop app for visual memory browsing and management. Click through memories, inspect compartments, manage tags without touching the CLI.

- **Why deferred:** The CLI and ctx_* tools provide full functionality. A desktop app is a convenience layer.
- **Wave:** Future Magic Context enhancement.
- **Depends on:** Nothing in AutoDev. Magic Context ships this independently.