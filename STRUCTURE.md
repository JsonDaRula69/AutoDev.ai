# AutoDev: Project Structure

> **Source of truth.** Auto-injected into every session by Magic Context. This is the directory map and reference catalog for the pi-based AutoDev. If this file and some other doc disagree about where something lives, this file wins.

## 1. Project Layout

```
<AUTODEV_ROOT>/
  AGENTS.md              # Standing orders and conventions
  ARCHITECTURE.md        # System architecture overview (pi-based)
  STRUCTURE.md           # This file: reference catalog and directory map
  CONTEXT.md             # Operating protocol, crew roles, planning method
  README.md              # User-facing documentation
  ROADMAP.md             # Future waves and deferred features
  package.json           # Pi manifest (dependencies, extension config)
  extensions/
    autodev/
      index.ts           # Entry point: imports and registers all modules
      guardrails/
        index.ts         # Guardrail engine (tool_call interception)
      background/
        index.ts         # Background agent manager + model fallback
      delegation/
        index.ts         # Category system + task delegation
      loreguard/
        index.ts         # Loreguard ADR store + search_lore tool
      docs/
        index.ts         # Docs query system + search_docs tool
      tools/
        index.ts         # Custom tools (todowrite, look_at, session)
      team-mode/
        index.ts         # Team mode (adapted for AutoDev)
      lsp/
        index.ts         # LSP integration (6 tools)
      tmux/
        index.ts         # Tmux integration (interactive bash)
      comment-checker/
        index.ts         # AI-slop comment checker
      intent-gate/
        index.ts         # IntentGate (Harbor Master + Nemo)
  .pi/
    agents/              # 13 crew agent definitions (Markdown+YAML)
    skills/              # AutoDev skills (triage, implement, review, deploy)
    settings.json        # Pi project settings
    magic-context.jsonc  # Magic Context config (embedding, dreamer model)
    auth.json            # LLM provider credentials (GITIGNORED)
  .autodev/
    reference/           # Immutable knowledge base (4 files)
    evidence/            # Proof artifacts before committing
    skills/              # AutoDev skill definitions (source for .pi/skills/)
    decisions/           # ADR source files + loreguard.db
    work-items/          # Heartbeat state persistence
    debates/             # Debate transcripts
    embeddings/          # Vector store (vectors.db)
    research/            # Research notes
    memory/              # Bootstrap context (Tier 1)
    plans/               # Implementation plans
    config/              # Guardrail, dispatch, debate configs
    scripts/             # Setup and utility scripts
    templates/           # Issue and ADR templates
  docs-corpus/           # Documentation corpus (218 files + MANIFEST.md)
  .omo/
    plans/               # Prometheus work plans
    evidence/            # Task evidence artifacts
    drafts/              # Plan drafts
    notepads/            # Session notepads
    boulder.json         # Cross-session work tracking
    rules/               # Project-specific rules (injected into context)
```

## 2. Component Map

| Directory | Purpose | ARCHITECTURE.md Section |
|-----------|---------|------------------------|
| `extensions/autodev/` | AutoDev pi extension (modular) | §5 Extension Architecture |
| `extensions/autodev/guardrails/` | Hard/soft stops via `tool_call` | §6 Guardrail Engine |
| `extensions/autodev/background/` | Background agent + model fallback | §7-8 Background + Fallback |
| `extensions/autodev/delegation/` | Category system + `task` tool | §9 Category System |
| `extensions/autodev/loreguard/` | ADR store + `search_lore` | §10 Loreguard |
| `extensions/autodev/docs/` | Embeddings + `search_docs` | §11 Docs Query |
| `extensions/autodev/tools/` | Custom tools (todowrite, etc.) | §12 Custom Tools |
| `extensions/autodev/team-mode/` | Multi-agent coordination | §20 Team Mode |
| `extensions/autodev/lsp/` | LSP diagnostics + navigation | §25 LSP Integration |
| `extensions/autodev/tmux/` | Interactive bash + visualization | §26 Tmux Integration |
| `extensions/autodev/comment-checker/` | AI-slop comment stripping | §21 Comment Checker |
| `extensions/autodev/intent-gate/` | Intent analysis | §23 IntentGate |
| `.pi/agents/` | 13 crew agent definitions | §4 Agent Sessions |
| `.pi/skills/` | AutoDev skill definitions | §13 Skills System |
| `.pi/settings.json` | Pi project settings | §2 Process Topology |
| `.pi/magic-context.jsonc` | Magic Context config | §29 Magic Context |
| `.pi/auth.json` | LLM credentials (gitignored) | §2 Process Topology |
| `.autodev/reference/` | Immutable truth (4 files) | §28 Context Injection |
| `.autodev/memory/` | Bootstrap context (Tier 1) | §28 Context Injection |
| `.autodev/config/` | Guardrail, dispatch, debate YAML | §6, §3, §16 |
| `.autodev/evidence/` | QA proof artifacts | §17 Auto-Merge |
| `.autodev/plans/` | Implementation plans | §3 Crew Dispatch |
| `.autodev/decisions/` | ADR source files + loreguard.db | §10 Loreguard |
| `.autodev/skills/` | Skill source definitions | §13 Skills System |
| `.autodev/scripts/` | Setup and utility scripts | (none) |
| `.autodev/templates/` | Issue and ADR templates | (none) |
| `.autodev/research/` | Research notes | (none) |
| `docs-corpus/` | 218 documentation files | §11 Docs Query |
| `.omo/plans/` | Prometheus work plans | §18 Boulder State |
| `.omo/evidence/` | Task evidence artifacts | §17 Auto-Merge |
| `.omo/rules/` | Project-specific rules | §27 Rules Injection |
| `.omo/boulder.json` | Cross-session work tracking | §18 Boulder State |

## 3. Reference Catalog: `.autodev/reference/`

This directory is **immutable truth**. Never modify these files. Always check reference before making any decision that touches production. If reference and code disagree, flag it. Do not silently fix either side.

Contents:

- **`onboarding-protocol.md`**: Harbor Master interview protocol. Six phases, proficiency axis, open-ended questions, Harbor Log format.
- **`workflow-specification.md`**: Dispatch state machine, debate protocol, guardrails (6 hard stops, soft stops), label lifecycle, agent identity system.
- **`discord-setup.md`**: Discord bridge configuration. Channel IDs, bot token, slash commands, reply polling.
- **`README.md`**: Reference directory overview. Index of the other three files.

Immutability rules:
1. Never modify reference files.
2. Always check reference before making decisions.
3. If reference contradicts code, flag it. Do not silently fix either side.

## 4. Config Files

| File | Location | Purpose | Gitignored? |
|------|----------|---------|-------------|
| `.pi/settings.json` | Project root | Pi project settings (extensions, model config) | No |
| `.pi/magic-context.jsonc` | Project root | Magic Context config (embedding, dreamer model, features) | No |
| `.pi/auth.json` | Project root | LLM provider credentials | **YES** |
| `.pi/lsp.json` | Project root | LSP server configuration | No |
| `.autodev/config/guardrails.yaml` | `.autodev/config/` | Hard/soft stop rules | No |
| `.autodev/config/dispatch-rules.yaml` | `.autodev/config/` | Autonomous dispatch triggers | No |
| `.autodev/config/debate-protocol.yaml` | `.autodev/config/` | Debate phase configuration | No |
| `package.json` | Project root | Pi manifest (dependencies, extension entry) | No |
| `.omo/boulder.json` | `.omo/` | Cross-session work tracking | No |

The only secret on disk is `.pi/auth.json`. The VoyageAI key lives in the `VOYAGE_API_KEY` env var, referenced from `.pi/magic-context.jsonc` as `${VOYAGE_API_KEY}`.

## 5. Agent Definitions: `.pi/agents/`

Thirteen crew agents. One Markdown file each, YAML frontmatter on top, system prompt body below.

```yaml
---
name: nemo
description: Captain. Triage, delegate, set course.
tools: read, bash, edit, write, grep, glob
model: ollama-cloud/glm-5.2:cloud
---
<System prompt body with Nautilus identity>
```

The 13 agents:

| Agent | Role | Identity Block |
|-------|------|----------------|
| `nemo` | Captain: triage, delegate, set course | Nemo |
| `aronnax` | Professor/Architect: study, plan, design | Aronnax |
| `ned-land` | Harpooner/Implementer: build, test, deliver | Ned Land |
| `conseil` | Steward/Knowledge Keeper: classify, retrieve, guard | Conseil |
| `oracle` | Seer/Reviewer: challenge assumptions, find weaknesses | Oracle |
| `momus` | Satyr/Critic: push back, find edge cases | Momus |
| `metis` | Strategist: surface hidden intentions, detect slop | Metis |
| `harbor-master` | Onboarding: dockside conversationalist | Harbor Master |
| `quartermaster` | Operations: stage-gate label enforcement | Engineer (shared) |
| `boatswain` | Operations: QA gates, evidence validation | Engineer (shared) |
| `navigator` | Operations: deployment readiness, health verification | Engineer (shared) |
| `watch-officer` | Operations: self-healing, health monitoring | Engineer (shared) |
| `explore` | Investigator: map codebase, report findings | Explore |

The Engineer identity block is shared by `quartermaster`, `boatswain`, `navigator`, and `watch-officer`. The Explore identity block is used by the `explore` agent.

Model routing per role: triage, plan, deploy, and operations use `ollama-cloud/glm-5.2:cloud`. Execution (Ned Land) and review (Oracle, Momus) use `ollama-cloud/deepseek-v4-pro`. Every model string is validated against the provider API before it ships.

## 6. Skills

Two directories hold skill definitions. `.autodev/skills/` is the source. `.pi/skills/` is where pi loads them from at runtime.

Skill format: `SKILL.md` with YAML frontmatter, loaded via pi's skill discovery.

AutoDev ships four custom skills:

| Skill | Trigger | What it does |
|-------|---------|-------------|
| `autodev-triage` | New `autodev-request` issue | Nemo classifies, assesses scope, routes to Aronnax or Ned Land |
| `autodev-implement` | Plan ready | Ned Land executes the plan with evidence-bound QA |
| `autodev-review` | PR opened | Oracle reviews the PR before any human sees it |
| `autodev-deploy` | PR merged | Alert liaison, coordinate deployment verification |

Onboarding is not a skill. The Harbor Master session is launched by the `autodev onboard` CLI command (T13), which uses the interview protocol from `.autodev/reference/onboarding-protocol.md` directly. No separate skill file is needed.

## 7. Coexistence Model: `.pi/` and `.opencode/`

AutoDev on pi can sit in the same project as an existing OpenCode setup. They don't fight because they don't share config.

- `.pi/` holds pi-specific config: agents, skills, settings, auth, magic-context.
- `.opencode/` holds OpenCode-specific config, if the user also runs OpenCode. AutoDev on pi does not read or depend on it.
- The Magic Context SQLite DB at `~/.local/share/cortexkit/magic-context/context.db` is shared across harnesses. Memories, compartments, and tags written from OpenCode sessions are visible from pi sessions, and vice versa.
- The user's global OpenCode config at `~/.config/opencode/` is untouched. AutoDev on pi never reads or writes it.
- No conflicts. Pi and OpenCode use different config directories and different runtimes.
- AutoDev on pi does not depend on or interfere with any OpenCode installation.

## 8. Search Strategy

For any implementation question, work down this list. Stop when you find a verified answer.

1. **Reference docs**: Read the relevant design doc in `.autodev/reference/` first.
2. **Loreguard**: `search_lore "<topic>"` for ratified decisions. SQLite FTS5, returns truth.
3. **Magic Context**: `ctx_search "<topic>"` for past session knowledge. Semantic search, returns clues. Verify against lore before acting.
4. **Grep in `.autodev/reference/`**: `grep -i <term>` inside a specific dependency doc.
5. **Grep in `docs-corpus/`**: Cross-documentation search across all 218 files.
6. **`search_docs`**: Semantic search over the docs corpus via the embeddings layer.
7. **Context7**: `context7_query-docs` for official library documentation.
8. **Grep.app**: `grep_app_searchGitHub` for real-world code examples from public repos.

If after all eight steps you still lack a verified answer: stop. Label the issue `autodev-blocked`. Surface and ask.