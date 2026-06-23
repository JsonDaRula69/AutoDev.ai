# AutoDev — Project Structure

> Auto-injected into every session by Magic Context. This is the directory map and reference catalog.

## Framework Layout

```
<AUTODEV_ROOT>/
  AGENTS.md              # Standing orders and conventions (you are here)
  ARCHITECTURE.md        # System architecture overview
  STRUCTURE.md           # This file — reference catalog and directory map
  CONTEXT.md             # Operating protocol, crew roles, planning method
  magic-context.jsonc    # Magic Context project-level config
  .autodev/
    reference/           # Immutable knowledge base (populated during onboarding)
    evidence/            # Proof artifacts before committing
    skills/               # OmO skill definitions
    decisions/           # ADR source files
    research/             # Research notes
    memory/              # Bootstrap context (Tier 1)
    plans/               # Implementation plans
    config/              # Team and agent configuration templates
    scripts/             # Setup and utility scripts
    daemon/              # Systemd service files
    templates/           # Issue and ADR templates
  .opencode/
    oh-my-openagent.json    # OmO team mode, agent routing, Discord config
    opencode.json           # OpenCode project config
  .mcp.json                # MCP server registrations (Loreguard)
  .loreguard/              # ADR source files (synced to Loreguard DB)
```

## Reference Catalog: `.autodev/reference/`

This directory is **immutable truth**. It is populated during the onboarding phase by the orientation agent and should never be modified by agents during normal operation.

Typical contents after onboarding:
- Project design documents and architecture specs
- Dependency documentation and API references
- Decision records and roadmap documents

### Search Strategy

For any implementation question, follow this search order:

1. **Reference docs** — Read the relevant design doc first
2. **Loreguard** — `loreguard_search_lore "<topic>"` for ratified decisions
3. **`rg -i <term> .autodev/reference/<dep>/`** — Search within a specific dependency
4. **`rg -i <term> .autodev/reference/`** — Cross-department search (slower)
5. **ctx_search** — `ctx_search "<topic>"` for past session knowledge
