---
slug: autodev-pi-foundation
status: drafting
intent: unclear
pending-action: write .omo/plans/autodev-pi-foundation.md
approach: Fresh start on pi — new branch, delete all code, keep identity/design artifacts, rebuild AutoDev as pi extensions from scratch using existing design specs
---

# Draft: autodev-pi-foundation

## Components (topology ledger)

| id | outcome | status | evidence path |
|----|---------|--------|---------------|
| fresh-branch | New branch on AutoDev.ai with all code deleted, only identity/design artifacts kept | deferred | TBD |
| pi-install | pi (@earendil-works/pi-coding-agent) installed and verified as the foundation | deferred | TBD |
| agent-port | 12 crew agents ported to pi's Markdown+YAML frontmatter format | deferred | TBD |
| autodev-extension | Base pi extension that registers AutoDev's tools, commands, and event handlers | deferred | TBD |
| context-injection | AGENTS.md, CONTEXT.md, .autodev/memory/ loaded via pi's DefaultResourceLoader | deferred | TBD |
| guardrail-engine | Hard/soft stops enforced via pi's tool_call event interception | deferred | TBD |
| crew-dispatch | GitHub issue → triage → route to agent session (the missing orchestrator) | deferred | TBD |
| background-agent | Task lifecycle: spawn agent sessions, poll completion, collect results, concurrency control | deferred | TBD |
| model-fallback | Error detection → fallback chain resolution → abort+re-prompt with new model | deferred | TBD |
| loreguard | ADR store (bun:sqlite) + search_lore tool | deferred | TBD |
| docs-query | Embedding layer (VoyageAI) + vector store + search_docs tool | deferred | TBD |
| semantic-memory | Project memory injection + ctx_search tool (replaces Magic Context) | deferred | TBD |
| heartbeat | Timer loop polling GitHub for new issues, stalled PRs, triggering self-healing | deferred | TBD |
| discord-bridge | Inbound message → pi session → outbound response, slash commands | deferred | TBD |
| debate-protocol | 5-phase debate (independent prep, structured arguments, cross-exam, verdict, verify) | deferred | TBD |
| auto-merge | CI green + evidence + review → gh pr merge, label transition | deferred | TBD |
| cli-commands | autodev onboard, autodev doctor, autodev status as pi commands | deferred | TBD |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
|-----------|----------------|-----------|-------------|
| In-process sessions vs subprocess | In-process (createAgentSession) | Lower latency, shared memory, no serialization overhead. The subagent extension example uses subprocess but the SDK supports in-process. | Yes — can switch to subprocess model later |
| Agent definition format | Pi's Markdown+YAML frontmatter (same as AutoDev's src/agents/*.md) | Both systems use the same format. Agent definitions port with minimal changes. | Yes |
| Model routing | One AgentSession per crew role, each with its assigned model | Matches AutoDev's current model routing (techContext.md: triage/plan/deploy=glm-5.2:cloud, execute=deepseek-v4-pro, review=deepseek-v4-pro) | Yes |
| Session persistence | pi's JSONL format (~/.pi/agent/sessions/) | Replaces OpenCode's session management. pi's tree-based branching is a superset. | No — pi format is the format |
| MCP | pi says "No MCP" but supports it via extensions. Loreguard runs as MCP. | Must build an MCP extension for pi OR convert Loreguard to direct library calls (which was already the Wave 1 plan). | Yes — can do either |
| TUI | pi's built-in TUI | Replaces OpenCode's TUI (createOpencodeTui). pi's TUI is built-in and replaceable. | Yes |

## Findings (cited)

### AutoDev's architecture split (verified 2026-06-22)
- **Standalone (zero OpenCode dependency):** src/core/ (13 files: agent-registry, guardrail-engine, dispatch-engine, debate-protocol, heartbeat, evm-metrics, boatswain, navigator, quartermaster, watch-officer, onboarding-engine, types, index), src/discord/ (8 files), src/secrets/ (3 files), src/integrations/ (5 files), src/agents/ (26 files: 13 .md + 13 .yaml), src/config/ (3 files), src/types/ (1 file), src/__tests__/ (1 file). Total: ~60 files.
  - Evidence: grep for @opencode-ai in non-plugin src/ returns only src/cli/onboarding-launcher.ts:11 (createOpencodeServer) and src/cli/autodev.ts:634 (createOpencodeTui).
  - Core subsystems only import from node:fs, node:path, node:child_process, js-yaml, and each other.

- **OpenCode-coupled:** src/plugin/ (2,628 files) — the OmO plugin. Depends on @opencode-ai/plugin (~200+ files: PluginInput, Hooks, ToolDefinition, tool()) and @opencode-ai/sdk (~50 files: createOpencodeServer, createOpencodeClient, AgentConfig, Message, Part, Event, session types).
  - src/cli/onboarding-launcher.ts — uses createOpencodeServer() (1 call), then raw fetch() to HTTP API for session.create/session.prompt
  - src/cli/autodev.ts — uses createOpencodeTui() (1 dynamic import)

### Pi's capabilities (verified via docs research 2026-06-22)
- **SDK:** createAgentSession() creates independent in-process sessions. Each session has: prompt(), steer(), followUp(), subscribe(), setModel(), setThinkingLevel(), abort(), dispose(), compact(), navigateTree(). Multiple sessions run concurrently in one process.
- **Extension API:** 20+ lifecycle events (tool_call with blocking, session_start, agent_start/end, turn_start/end, message_start/update/end, before_agent_start, context, etc.). registerTool(), registerCommand(), registerProvider(), setActiveTools(), sendMessage(), appendEntry(), events bus.
- **Tools:** Built-in (read, bash, edit, write, grep, find, ls). Custom via defineTool(). Fully replaceable via setActiveTools() + tool_call interception. No built-in permissions — build via tool_call event.
- **Context:** Virtual AGENTS.md via DefaultResourceLoader. Per-turn context via before_agent_start event. System prompt override. All programmatic.
- **Sessions:** JSONL with tree structure. SessionManager.create/inMemory/continueRecent/open. Branching, forking, cloning.
- **Subagent example:** examples/extensions/subagent/ — demonstrates multi-agent with agent definition files (Markdown+YAML frontmatter), single/parallel/chain execution modes, output streaming, usage tracking, abort propagation.

### OpenCode instability (from project memory)
- Memory 482: "Upstream OpenCode (anomalyco/opencode) is unstable — bad updates have broken AutoDev's setup before."
- Memory 485: "AutoDev's core design goal is full autonomy: strip flexibility and open-endedness from the upstream OpenCode base and replace it with structure and reinforcement mechanisms."

## Decisions (with rationale)

1. **Switch to pi** — AutoDev's core subsystems are standalone; the 2,628-file OmO plugin exists only because OpenCode lacks multi-agent orchestration. Pi provides the same primitives with minimalism.
2. **Fresh start, not migration** — Delete ALL code. Rebuild from scratch on pi using latest versions. Avoids stale OpenCode coupling, never-wired engines, broken symlinks, lost Wave 1 work, import graph issues, and half-implemented plans.
3. **Keep only identity + design artifacts** — Agent files (26), identity overrides (10 prompt_append blocks), process specs (.autodev/reference/, .autodev/config/, .autodev/memory/), docs corpus (218 files), process docs (AGENTS.md, CONTEXT.md), skills (.autodev/skills/).
4. **OmO = reference only** — Use OmO's design patterns (agent routing, team mode, task delegation, model fallback, background agent) as a blueprint for pi extensions. Don't install or port OmO code.
5. **In-process sessions** — createAgentSession() per crew role, no subprocess spawning. Lower latency, shared memory.
6. **New branch on AutoDev.ai repo** — Same repo, fresh branch, clean slate.
7. **Abandon OpenCode fork** — Wave 2.5 plan superseded. No need to clone JsonDaRula69/opencode or port code into it.

## Scope IN

- Create a new branch on JsonDaRula69/AutoDev.ai for the fresh start
- Delete ALL code: src/, .opencode/, package.json, node_modules/, dist/, .autodev/embeddings/, .autodev/discord/, tsconfig.json
- Keep ONLY: src/agents/ (26 files), .autodev/reference/, .autodev/config/, .autodev/memory/, .autodev/skills/, docs-corpus/, AGENTS.md, CONTEXT.md, .autodev/ARCHITECTURE.md, .autodev/KNOWLEDGE-ARCHITECTURE.md, .autodev/HEARTBEAT.md, .autodev/SETUP.md, .autodev/AUDITOR.md, .autodev/nautilus-charter.md
- Extract the 10 prompt_append identity blocks from .opencode/oh-my-openagent.json BEFORE deleting .opencode/
- Install pi (@earendil-works/pi-coding-agent) as the foundation
- Port agent identity files to pi's agent definition format (Markdown+YAML frontmatter — same format, minimal changes)
- Build AutoDev as a pi extension that implements: crew dispatch, guardrails, heartbeat, Discord bridge, docs query, Loreguard, debate protocol
- Use OmO's design patterns as reference for: agent routing, team mode, task delegation, model fallback, background agent management
- Wire the autonomous loop (heartbeat → GitHub poll → triage → plan → implement → review → merge → deploy) that was missing on OpenCode

## Scope OUT (Must NOT have)

- Must NOT migrate any existing code (src/plugin/, src/core/, src/cli/, src/discord/, etc.) — fresh start only
- Must NOT install or depend on OmO (oh-my-openagent) — reference patterns only
- Must NOT clone or use the OpenCode fork (JsonDaRula69/opencode)
- Must NOT depend on @opencode-ai/sdk or @opencode-ai/plugin
- Must NOT implement multi-project routing (future wave)
- Must NOT build installer/single binary (future wave)
- Must NOT delete the agent identity files, process specs, or docs corpus — these are the design to implement

## Research completed (2026-06-22)

### CRITICAL FINDING: Magic Context already has a Pi extension

`@cortexkit/pi-magic-context` exists on npm. Magic Context ALREADY supports Pi (requires Pi >= 0.74.0). The Pi extension shares the same SQLite database as OpenCode; project memories and embeddings pool across both. This means we do NOT need to reimplement semantic memory — we install Magic Context directly as a Pi extension.

Magic Context provides (via Pi extension):
- ctx_search (memories + conversation history + git commits, semantic + FTS5)
- ctx_memory (5-category cross-session memory: PROJECT_RULES, ARCHITECTURE, CONSTRAINTS, CONFIG_VALUES, NAMING)
- ctx_note (deferred intentions + smart notes with surface_conditions)
- ctx_expand (compartment expansion)
- ctx_reduce (cache-aware context reduction)
- Historian compartmentalization (background history compression into tiered summaries)
- Dreamer (overnight memory consolidation: dedup, verify, archive, improve, maintain-docs)
- Auto-search hints (background ctx_search each turn)
- Temporal awareness (time gap markers, dated compartments)
- Git commit indexing (opt-in)
- Decay rendering (deterministic fidelity based on context pressure)
- Emergency overflow recovery
- SQLite-backed storage with 40 schema migrations
- Cross-harness project identity (git root hash)

Setup: `npx @cortexkit/magic-context@latest setup --harness pi`

### OmO deep-dive findings (from bg_82f80385)

OmO has 22 workspace packages, 11 built-in agents, 8 categories, 54+ lifecycle hooks, 20-39 tools, 12 team_* tools, 8 built-in skills, 12+ CLI commands, 20 feature modules.

Key packages relevant to AutoDev (harness-agnostic cores):
- `delegate-core` — task delegation logic
- `team-core` — team mode runtime (mailbox, tasklist, state)
- `rules-engine` — AGENTS.md/.omo/rules injection
- `comment-checker-core` — AI slop removal from comments
- `hashline-core` — hash-anchored edit line IDs
- `boulder-state` — cross-session work tracking
- `model-core` — model capability definitions, fallback chains
- `skills-loader-core` — skill loading and resolution
- `agents-md-core` — AGENTS.md injection
- `tmux-core` — tmux pane management

OmO is doing a "Multi-Harness Agent OS Refactor" to support OpenCode, Codex, Pi, and others. The core packages above are being separated from the OpenCode adapter. We use them as DESIGN REFERENCES, not installed dependencies.

**OmO features to reimplement as pi extensions (by priority):**

Tier 1 (Core): agent definitions + model routing, category system for task delegation, background agent management, model fallback chains, custom tools, skills system, lifecycle hooks via pi events, config system

Tier 2 (Enhancement): team mode, ralph/ULW loop, boulder state, IntentGate, notepad system

Tier 3 (Optional): tmux integration, comment checker, session notifications, sparkshell

**OmO features we DON'T need (AutoDev has its own or not relevant):**
- OpenClaw (AutoDev has its own Discord module design)
- Claude Code compatibility shims
- OpenCode plugin system / hooks / TUI
- Codex CLI Light edition
- Native platform binaries

### Pi subagent extension analysis (from bg_213e0086)

The subagent extension uses subprocess spawning (pi --mode json -p --no-session). Key patterns: Markdown+YAML agent definitions, chain execution with {previous} substitution, parallel worker pool (4 concurrent, 8 max), JSON event streaming, usage tracking, SIGTERM→SIGKILL abort.

In-process adaptation confirmed feasible: Replace spawn() with createAgentSession(), JSON parsing with session.subscribe(), proc.kill with session.dispose().

## Approval gate
status: awaiting-approval
pending-action: write .omo/plans/autodev-pi-foundation.md
approach: 5-wave fresh-start plan — Wave 0 (fresh branch + identity extraction + pi install + Magic Context install), Wave 1 (base extension + agent port + context injection), Wave 2 (guardrails + crew dispatch + background agent + model fallback), Wave 3 (Loreguard + docs query + custom tools + skills), Wave 4 (heartbeat + discord + debate + auto-merge)