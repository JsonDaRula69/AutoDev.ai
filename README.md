# AutoDev

**Autonomous Development Team. DevTeam in a Box.**

AutoDev bundles a full engineering crew into one self-contained package running on pi. You point it at a project, run an onboarding conversation, and a team of specialized agents starts planning, building, reviewing, and shipping work through GitHub. No global installs, no separate services to wire up, no manual agent orchestration.

> **Source of truth:** This document is the design specification for AutoDev on pi. The implementation plan at `.omo/plans/autodev-pi-foundation.md` follows this specification.

---

## What is AutoDev

AutoDev is an autonomous engineering team framework built around a Nautilus-themed crew of agents. Each agent has a fixed role with enforced capabilities and hard constraints, so the crew operates as a cohesive unit rather than a loose collection of chatbots. The captain triages, the architect plans, the implementer builds, the reviewer challenges, and the critic finds gaps before any code gets written.

The crew runs on pi, a minimalist agent runtime that provides in-process sessions, custom tools, lifecycle events, and extensions. Three pieces ride on top of pi: Magic Context for semantic memory across sessions, Loreguard for ratified decisions, and a custom pi extension that orchestrates the crew. The extension handles dispatch, guardrails, debate, background agents, model fallback, and the heartbeat that polls GitHub for new work.

You talk to the Harbor Master once, at onboarding. After that, the crew works autonomously. It reads GitHub issues, triages them, plans the work, implements it in worktrees, reviews its own PRs, runs CI, and merges when all gates pass. You intervene only when you want to stop something, not when you want to permit it.

---

## The Crew

The crew is themed after the Nautilus, a self-sustaining submarine that operates at depth with no home port. Every member depends on the others. A leak ignored by one sinks them all.

| Agent | Role | Responsibilities |
|-------|------|------------------|
| Captain Nemo | Captain | Triage incoming work, delegate, set course. Final authority on disputes. |
| Harbor Master | Onboarding | Dockside conversationalist. Interviews you about the project and seeds the knowledge base. |
| Professor Aronnax | Architect | Study deeply, design before building, produce validated implementation plans. |
| Metis | Strategist | Surface hidden intentions and ambiguities before planning begins. |
| Ned Land | Implementer | Build, test, deliver. Executes well-defined plans with evidence-bound QA. |
| Oracle | Reviewer | Review PRs before humans see them. Find what will break before it breaks. |
| Momus | Critic | Review plans for gaps, ambiguities, and executability blockers. |
| Conseil | Steward | Search, retrieve, and guard the knowledge base. Loreguard and reference docs are truth. |
| Explore | Investigator | Map the codebase, identify patterns, report concrete findings with file paths. |
| Engineer | Engine Room | Run tests, watch CI, verify evidence, check regressions. |
| Boatswain | Operations | QA gates. Test execution and evidence validation before review. |
| Navigator | Operations | Deployment readiness. Coordinates deployment and verifies health post-merge. |
| Quartermaster | Operations | Stage-gate label enforcement. Manages GitHub label transitions and board sync. |
| Watch Officer | Operations | Self-healing and health monitoring. Runs the heartbeat and handles fault escalation. |

The last four (Boatswain, Navigator, Quartermaster, Watch Officer) share the Engineer identity. They are distinct agents with specialized roles, but the same engine-room model and capability set powers each one. The dispatch engine routes work to the right operational agent based on task type, so you never have to pick which one runs.

---

## Architecture

AutoDev runs on pi as a single in-process system. No HTTP server, no global binary, no separate daemon. The crew lives inside one process.

```
  ┌─────────────────────────────────────────────────────────┐
  │                      pi runtime                           │
  │            (createAgentSession per crew role)             │
  │                                                           │
  │   ┌───────────────────────────────────────────────────┐   │
  │   │            AutoDev pi extension                     │   │
  │   │                                                      │   │
  │   │   guardrails   background    delegation   loreguard  │   │
  │   │   debate       docs          tools         skills    │   │
  │   └───────────────────────────────────────────────────┘   │
  │                        ▲                                   │
  │   ┌────────────────────┴──────────────────────────────┐   │
  │   │  Magic Context       Loreguard       Heartbeat       │   │
  │   │  (SQLite + historian) (SQLite FTS5)  (GitHub poll)   │   │
  │   │            (dreamer)                                 │   │
  │   └───────────────────────────────────────────────────┘   │
  │                                                           │
  └───────────────┬───────────────────────────┬───────────────┘
                  │                           │
           ┌──────▼──────┐             ┌───────▼───────┐
           │   GitHub    │             │   Discord     │
           │ (issues, PRs)│             │   (comms)     │
           └─────────────┘             └───────────────┘
```

The pi runtime spins up one agent session per crew role. Each agent gets its Nautilus identity, model assignment, and tool set from its agent definition file.

The AutoDev extension sits on top of pi and does the heavy lifting. It is modular: guardrails, background agents, delegation, loreguard, docs query, custom tools, and skills each live in their own module. This keeps parallel development clean.

Magic Context provides semantic memory via a shared SQLite database. It auto-injects a project-memory block into every session and gives agents search across full conversation history. The historian and dreamer components surface relevant context automatically.

Loreguard stores ratified decisions as immutable truth. It is a direct bun:sqlite library with FTS5 full-text search. Agents check it before any decision that touches production.

The heartbeat timer polls GitHub for new work. The Discord bridge carries communication between the crew and the liaison. Both run as part of the extension, not as separate processes.

The detailed architecture lives in `ARCHITECTURE.md`.

---

## Quick Start

Four steps get you from clone to a running crew.

```bash
git clone https://github.com/JsonDaRula69/AutoDev.ai.git
cd AutoDev.ai
bun install
npx @cortexkit/magic-context@latest setup --harness pi
autodev onboard
```

What each step does:

1. **Clone** the repo.
2. **`bun install`** pulls down pi, Magic Context, and the AutoDev extension dependencies. Pi runs on Bun, so Node is not required.
3. **`npx @cortexkit/magic-context@latest setup --harness pi`** configures Magic Context as a pi extension. It detects any existing shared database and reuses it, so memories from prior sessions carry over.
4. **`autodev onboard`** launches the Harbor Master.

### What Happens During Onboarding

The Harbor Master is not a form or a checklist. It is a conversation. The Harbor Master asks open-ended questions, listens, reflects back what it hears, and probes the fuzzy parts of your goal. While you talk, it quietly dispatches Explore agents to map the codebase and gather documentation for anything you mention.

The interview adapts to you. A non-technical founder gets plain-language questions about what the system does and what is at stake. A senior engineer gets direct questions about invariants, failure modes, and blast radius. The Harbor Master calibrates its vocabulary from your first answer and adjusts if your signals shift mid-conversation.

Everything gets recorded in a Harbor Log. It is a journal of the conversation, not a spec. When you are done, the crew has what it needs to start working: a project charter, an architecture snapshot, a constraint map, and a knowledge gap list.

Onboarding takes 5 to 10 minutes. When it completes, the crew is ready for work.

After onboarding, you interact only with the Harbor Master. The rest of the crew is invisible to you. If any agent hits a blocker or needs clarification, it alerts the Harbor Master through the team mailbox, and the Harbor Master contacts you via CLI or Discord. The Harbor Master is a permanent interface — not just an onboarding tool.

---

## How It Works

The crew works through GitHub. You file an issue, the crew picks it up, and the pipeline runs.

```
GitHub issue (autodev-request)
  -> Heartbeat polls and finds it
  -> Nemo triages (Cynefin: Simple / Complicated / Complex / Chaotic)
  -> Aronnax plans (with Metis pre-analysis, Momus gap review)
  -> Ned Land implements in a worktree, writes evidence, opens PR
  -> Oracle reviews the PR
  -> CI runs
  -> Evidence + CI + Oracle all green? Auto-merge.
  -> Liaison deploys and verifies (if applicable — agent-consumed projects only)
  -> Nemo closes the issue
```

### Triage and Classification

Nemo classifies every incoming issue using the Cynefin framework before routing it:

- **Simple** goes straight to Ned Land. Known problem, known solution, no debate needed.
- **Complicated** goes to Aronnax for a single-round debate. Expert analysis required.
- **Complex** triggers the full five-phase debate protocol. Probe, sense, respond.
- **Chaotic** goes to the Watch Officer for emergency response. Act first, analyze later.

### One Task at a Time

The crew works one task at a time. If interrupted with new instructions while working, it logs the new instruction as a GitHub issue and resumes the original task. No context switching. This is a hard stop, enforced by the guardrail engine.

### Auto-Merge

AutoDev merges when evidence, CI, and Oracle review all pass. No human approval step blocks the pipeline. Humans can still intervene. `@autodev hold` on a PR freezes it. `@autodev proceed` releases it. But the default is autonomy. The crew ships when the verification gates are green, not when someone clicks approve.

The liaison role is optional. It applies when the project is used by other agents (like an MCP server) — the liaison handles end-user testing because the end user is another agent. For standard projects (web apps, APIs, tools consumed by humans), the crew coordinates deployment directly.

### Label Lifecycle

GitHub labels are the single source of truth for workflow state. The Quartermaster transitions labels when evidence gates are satisfied. The board is a view layer that reflects label state, not a separate system.

```
autodev-request  ->  autodev-planned  ->  autodev-in-progress
  ->  autodev-review  ->  autodev-ready  ->  autodev-merged
```

Blocked: `autodev-blocked`. Rejected: `autodev-rejected`.

### Multiple Projects

AutoDev can work on multiple projects at the same time. Each project lives in its own directory with its own GitHub repo and its own crew of agents. The Harbor Master tracks which project is currently active and keeps context on all projects so nothing gets mixed up.

### Guardrails

The guardrail engine enforces hard stops programmatically. No agent can override them:

- **No direct deploy.** Submit PRs, pass CI, alert the liaison.
- **No secrets in code.** API keys, tokens, and credentials never go in source files.
- **Evidence or it didn't happen.** Every commit that touches runtime behavior must be proven on a real surface.
- **One task at a time.** If interrupted mid-task, log the new instruction as a GitHub issue and resume the original task.
- **Follow the plan.** If a plan exists, implement what it says. No unrequested improvements.
- **CI is the hard gate.** No merge unless CI is green.

Soft stops generate warnings but do not block. These include scope warnings, missing evidence flags, and review suggestions.

---

## Configuration

AutoDev keeps config in two directories.

### `.pi/` (runtime config)

This directory holds pi-specific configuration.

| File | Purpose |
|------|---------|
| `settings.json` | Pi project settings. Agent paths, extension registration, tool configuration. |
| `magic-context.jsonc` | Magic Context config. Embedding provider, API key reference, dreamer model. **Gitignored.** |
| `auth.json` | LLM provider credentials. **Gitignored.** |
| `agents/` | Crew agent definitions in Markdown with YAML frontmatter. One file per agent. |

### `.autodev/` (project state)

This directory holds the project-specific knowledge base.

| Path | Purpose |
|------|---------|
| `reference/` | Immutable technical docs. Populated during onboarding. Never modified during normal operation. |
| `memory/` | Bootstrap context: project brief, tech context, active context, harbor log. |
| `evidence/` | QA proof artifacts written before every commit. |
| `plans/` | Implementation plans from Aronnax. |
| `config/` | Guardrails, dispatch rules, debate protocol, project constraints. |
| `skills/` | Custom skill definitions. |
| `decisions/` | Architecture decision record source files. |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `VOYAGE_API_KEY` | VoyageAI API key for Magic Context embeddings. |
| `DISCORD_BOT_TOKEN` | Discord bot token for the bridge. |
| `DISCORD_CHANNEL_ID` | Discord channel for crew communication. |

Secrets live in gitignored files or environment variables. They never go in source.

### Setting API Keys

Before onboarding, create `.pi/auth.json` with your LLM provider credentials. The format follows pi's auth spec for your provider. Also set the `VOYAGE_API_KEY` environment variable so Magic Context can reach the embedding model.

If credentials are missing, AutoDev warns you during onboarding.

---

## Coexistence

AutoDev on pi coexists with OpenCode. The two can live in the same project without conflict.

- `.pi/` and `.opencode/` can both exist in the same project directory. Each harness reads its own config.
- The Magic Context SQLite database is shared across harnesses. Memories, compartments, and tags from OpenCode sessions are accessible from pi sessions, and vice versa. No data is duplicated or overwritten.
- Your global OpenCode config at `~/.config/opencode/` is not touched. The pi-based setup lives entirely in `.pi/` and `.autodev/`.

You can run AutoDev on pi in a project that already has an OpenCode setup. The crew picks up where it left off, with full memory continuity.

---

## Prerequisites

- **Bun 1.0 or later.** Pi runs on Bun. Node is not required.
- **Pi 0.74.0 or later.** The agent runtime that hosts the crew.
- **An LLM provider.** AutoDev ships configured for Ollama Cloud with `glm-5.2:cloud` for triage, planning, and deployment, and `deepseek-v4-pro` for execution and review. Be aware that autonomous agents burn tokens. You need valid credentials for at least one model per role.
- **VoyageAI API key.** Powers Magic Context embeddings. Set as the `VOYAGE_API_KEY` environment variable.
- **Git and GitHub with `gh` CLI.** The crew works through GitHub issues, PRs, labels, and CI. A local git install, a GitHub repository, and the `gh` CLI authenticated are all required.

Run `autodev doctor` after setup to validate your configuration, agent definitions, and guardrails in one pass.

---

## License

MIT. See `package.json` for details.