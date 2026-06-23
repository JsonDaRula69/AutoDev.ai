# AutoDev

**Autonomous Development Team. DevTeam in a Box.**

AutoDev bundles a full engineering crew into one self-contained package. You point it at a project, run an onboarding conversation, and a team of specialized agents starts planning, building, reviewing, and shipping work through GitHub. No global installs, no separate services to wire up, no manual agent orchestration.

---

## What is AutoDev

AutoDev is an autonomous engineering team framework built around a Nautilus-themed crew of agents. Each agent has a fixed role with enforced capabilities and hard constraints, so the crew operates as a cohesive unit rather than a loose collection of chatbots. The captain triages, the architect plans, the implementer builds, the reviewer challenges, and the critic finds gaps before any code gets written.

Under the hood, AutoDev combines five components into one runtime: an agent runtime (OpenCode), an orchestration layer (OmO), a semantic memory system (Magic Context), a ratified-decisions store (Loreguard), and an embeddings backend (VoyageAI). Everything installs with a single setup command.

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
| Boatswain, Navigator, Quartermaster, Watch Officer | Operations | QA gates, deployment readiness, stage-gate label enforcement, self-healing and health monitoring. |

The last four share the Engineer slot. OmO routes work to the right operational agent based on the task type, so you never have to pick which one runs.

---

## Architecture

AutoDev runs as a single in-process runtime. Five components work together:

```
                    ┌─────────────────────────────────────┐
                    │          AutoDev Runtime             │
                    │                                      │
                    │   ┌────────────┐    ┌─────────────┐   │
                    │   │  OpenCode  │    │     OmO      │   │
  GitHub  ◄────────►│   │ (runtime)  │◄──►│ (orchestr.) │   │
  Issues / PRs     │   └─────┬──────┘    └──────┬──────┘   │
                    │         │                   │         │
                    │   ┌─────┴───────────────────┴─────┐  │
                    │   │  Magic Context   Loreguard     │  │
                    │   │  (memory)       (decisions)   │  │
                    │   └────────────┬──────────────────┘  │
                    │                │                      │
                    │         ┌──────┴──────┐                │
                    │         │  VoyageAI   │                │
                    │         │ (embeddings)│                │
                    │         └─────────────┘                │
                    └─────────────────────────────────────────┘
```

| Component | What it does |
|-----------|--------------|
| **OpenCode** | The agent runtime. Handles sessions, prompts, tool calls, and the TUI. Runs in-process via `createOpencodeServer()`, so there is no global binary to install. |
| **OmO** (oh-my-openagent) | The orchestration layer. Team mode brings all agents online together, routes work by task type, manages lifecycle hooks, and provides model fallback chains per agent. |
| **Magic Context** | Semantic memory. Auto-injects a project-memory block from past sessions and gives agents `ctx_search` across full conversation history. Plugs into OpenCode as a plugin. |
| **Loreguard** | Ratified decisions. Stores architecture decision records as immutable truth. Agents call `search_lore` before making any decision that affects production. Runs as an MCP server. |
| **VoyageAI** | The embeddings backend that powers Magic Context's semantic search. |

OpenCode is the foundation. OmO plugs in as a plugin and coordinates the crew. Magic Context plugs in as a plugin and provides memory. Loreguard runs as an MCP server. VoyageAI sits behind Magic Context as the embedding model.

---

## Quick Start

Three commands get you from clone to a running crew.

```bash
git clone https://github.com/JsonDaRula69/AutoDev.ai.git
cd AutoDev.ai
npm run setup
node dist/cli/autodev.js onboard
```

What each step does:

1. **Clone** the repo.
2. **`npm run setup`** installs dependencies, compiles the TypeScript, and installs the OpenCode plugins bundled in `.opencode/`. When it finishes, AutoDev is ready.
3. **`node dist/cli/autodev.js onboard`** launches the Harbor Master. The Harbor Master talks with you about your project, scans the codebase, and seeds the knowledge base. This takes 5 to 10 minutes.

When onboarding completes, the OpenCode TUI launches and the server keeps running in the background. The crew is now ready for work.

---

## How It Works

### The Two-Repo System

AutoDev uses a two-repo design that keeps the framework independent from the project it works on.

- **AutoDev** is your home. It holds the framework, knowledge base, config, skills, and evidence. You push infrastructure changes here directly.
- **The target project** receives only a `.autodev/` pointer directory. That pointer contains a relative path back to the AutoDev framework, plus memory, evidence, and reference subdirectories. All config and plugin resolution happens from AutoDev's working directory, so the project stays clean.

Because OpenCode runs in-process through `createOpencodeServer()`, there is no global install or separate daemon. AutoDev switches its working directory to its own root so it finds `.opencode/` with all configs and plugins, then points each session's `directory` parameter at the target project so the agents do their work there.

### Harbor Master Onboarding

The Harbor Master is not a checklist or a form. It is a conversation. The Harbor Master asks open-ended questions, listens, reflects back what it hears, and probes the fuzzy parts of your goal. While you talk, it quietly dispatches Explore agents to map the codebase and Librarian agents to gather documentation for anything you mention.

Everything gets recorded in a Harbor Log at `.autodev/memory/harbor-log.md`. It is a journal of the conversation, not a spec. When you are done, the crew has what it needs to start working.

### Team Mode

When team mode is on, all crew members come online together. OmO coordinates them: Nemo triages incoming work and routes it to the right agent. Complex work goes to Aronnax for planning, which then passes through Metis for pre-analysis and Momus for gap review. Well-defined implementation goes straight to Ned Land. Oracle reviews every PR before a human sees it. The Engineer runs CI and verifies evidence.

A typical task flows like this:

```
GitHub issue (autodev-request)
  -> Nemo triages and routes
  -> Aronnax plans (with Metis pre-analysis, Momus review)
  -> Ned Land implements in a worktree, writes evidence, opens PR
  -> Oracle reviews the PR
  -> CI runs
  -> Evidence + CI + Oracle all green? Auto-merge.
  -> Liaison deploys and verifies
  -> Ned Land posts completion
```

AutoDev merges when evidence, CI, and Oracle review all pass. No human approval step blocks the pipeline. Humans can still intervene — `@autodev hold` on a PR freezes it, and `@autodev proceed` releases it — but the default is autonomy. The crew ships when the verification gates are green, not when someone clicks approve.

The crew works one task at a time. If interrupted, it logs the new instruction as a GitHub issue and resumes the original task. No context switching.

---

## Configuration

AutoDev keeps all config in two places.

### `.opencode/` (framework config)

This directory lives in the AutoDev framework root and holds the runtime configuration.

| File | Purpose |
|------|---------|
| `opencode.jsonc` | OpenCode project config. Declares plugins, instructions, and agent definitions. |
| `oh-my-openagent.json` | OmO team mode config. Agent routing, model assignments, fallback chains, team mode settings. |
| `auth.json` | LLM provider credentials. **Gitignored.** |
| `magic-context.jsonc` | Magic Context config, including the VoyageAI API key. **Gitignored.** |

### `.autodev/` (project state)

This directory is deployed into each target project as a pointer. It holds the project-specific knowledge base.

| Path | Purpose |
|------|---------|
| `autodev-root` | Relative path back to the AutoDev framework. |
| `memory/` | Bootstrap context: project brief, tech context, active context, harbor log. |
| `reference/` | Immutable technical docs. Populated during onboarding. Never modified during normal operation. |
| `evidence/` | QA proof artifacts written before every commit. |
| `plans/` | Implementation plans from Aronnax. |
| `decisions/` | Architecture decision record source files. |

### Setting API Keys

Two files hold secrets. Both are gitignored, so they never get committed.

**`.opencode/auth.json`** holds your LLM provider credentials. The format follows the OpenCode auth spec for your provider. Create this file before onboarding so the crew can reach your model.

**`.opencode/magic-context.jsonc`** holds the Magic Context config, including the VoyageAI API key for embeddings. Create this file to enable semantic memory.

If either file is missing, AutoDev will warn you during onboarding.

---

## Prerequisites

- **Node.js 22 or later.** AutoDev relies on modern Node features and the in-process OpenCode SDK.
- **An LLM provider.** AutoDev ships configured for Ollama-Cloud models but if you're rich, good for you I guess. Just be aware that this thing burns tokens like a motherfucker. You need valid credentials in `.opencode/auth.json` for at least one model per agent. Default models and fallback chains are defined in `oh-my-openagent.jsonc`.
- **Git.** The crew works through GitHub issues, PRs, labels, and CI. A local git install and access to a GitHub repository are required.
- **VoyageAI API key.** Required for Magic Context embeddings. Place it in `.opencode/magic-context.jsonc`.

Run `node dist/cli/autodev.js doctor` after setup to validate your configuration, agent definitions, and guardrails in one pass.

---

## License

MIT. See the `package.json` for details.
