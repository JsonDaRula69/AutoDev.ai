# docs-corpus Manifest

**Updated:** 2026-06-22
**Purpose:** Documentation corpus for the docs query system (T11). Agents use `search_docs` to semantically search these files. The corpus contains ONLY current, relevant documentation for the pi-based AutoDev design.

## Structure

```
docs-corpus/
├── MANIFEST.md              (this file)
├── pi/                      Pi agent runtime documentation (29 files)
│   ├── sdk.md               SDK API: createAgentSession, SessionManager, events
│   ├── extensions.md        Extension API: tools, events, commands
│   ├── rpc.md               RPC protocol between TUI and server
│   ├── tui.md               Terminal UI reference
│   ├── providers.md         LLM provider configuration
│   ├── models.md            Custom model configuration
│   ├── custom-provider.md   Building custom LLM providers
│   ├── skills.md            Skill system
│   ├── sessions.md          Session management
│   ├── session-format.md    Session JSONL format
│   ├── settings.md          Settings files
│   ├── compaction.md        Context compaction
│   ├── containerization.md  Running pi in containers
│   ├── development.md       Contributing to pi
│   ├── packages.md          Pi package layout
│   ├── prompt-templates.md  Prompt template system
│   ├── quickstart.md        Getting started guide
│   ├── index.md             Docs index
│   ├── docs.json            Docs config (non-markdown)
│   ├── json.md              JSON config format
│   ├── keybindings.md       TUI keybindings
│   ├── security.md          Security model
│   ├── shell-aliases.md     Shell aliases
│   ├── terminal-setup.md    Terminal prerequisites
│   ├── termux.md            Termux (Android) setup
│   ├── themes.md            TUI themes
│   ├── tmux.md              Tmux integration
│   ├── usage.md             CLI usage reference
│   └── windows.md           Windows setup
├── magic-context/           Magic Context documentation (7 files)
│   ├── README.md            Overview, quick start, features
│   ├── ARCHITECTURE.md      Internal architecture
│   ├── CONFIGURATION.md     Full configuration reference
│   ├── STRUCTURE.md         Codebase structure
│   ├── CHANGELOG.md         Version history
│   ├── AUDITOR.md           Audit guide
│   └── AUDIT-KNOWN-ISSUES.md Known audit issues
└── loreguard/               Loreguard design reference (1 file)
    └── README.md            Design overview (store.ts and mcp-config.json removed)
```

## File Counts

| Section | Files |
|---|---|
| pi/ | 29 |
| magic-context/ | 7 |
| loreguard/ | 1 |
| MANIFEST.md | 1 |
| **TOTAL** | **38** |

## Sources

| Directory | Source | Ref |
|---|---|---|
| `pi/` | `earendil-works/pi` — `packages/coding-agent/docs/` | branch `main` |
| `magic-context/` | `cortexkit/magic-context` — root + `docs/` | branch `master` |
| `loreguard/README.md` | SYNTHESIZED — AutoDev design reference (OpenCode-era; T10 rebuilds from scratch) | n/a |

## Removed Content

The following directories were removed because they contained OpenCode-era artifacts superseded by the pi-based design. They are listed here for traceability only and must not be recreated in the corpus.

- `opencode/` — OpenCode fork substrate (66 files). Replaced by `pi/`.
- `omo/` — OmO vendored substrate (70 files). OmO is not used in the pi-based design.
- `autodev/` — Old AutoDev architecture docs (21 files). Superseded by root-level `ARCHITECTURE.md`, `STRUCTURE.md`, `AGENTS.md`, `CONTEXT.md`, and `.autodev/reference/`.
- `agents/` — Old agent definitions (26 files: 13 `.md` + 13 `.yaml`). T4 ports fresh agents to `.pi/agents/`.
- `engines/` — Old engine source files and API docs (9 files). Rebuilt from scratch in T10–T12.
- `skills/` — Old skill definitions (5 files). T12 ports fresh skills to `.pi/skills/`.
- `aikido/` — Aikido Security product documentation (11 files). Aikido is not referenced in `ARCHITECTURE.md`, `STRUCTURE.md`, `README.md`, `ROADMAP.md`, or the pi-foundation plan; it was an OpenCode-era integration and is not part of the pi-based design.
- `loreguard/loreguard-store.ts` — Old in-process wrapper implementation. T10 rebuilds Loreguard from scratch with `bun:sqlite`.
- `loreguard/mcp-config.json` — Old MCP config. Replaced by the pi extension's MCP registry.
- `magic-context/{PACKAGE-README.md,package.json,config-schema.jsonc,dist/}` — Build artifacts. Replaced with fresh root-level docs from `master`.

## Notes for T11 (docs query system)

- The corpus is intentionally lean: 38 files covering the two runtime substrates (pi, Magic Context) plus the Loreguard design reference.
- Root-level design docs (`ARCHITECTURE.md`, `STRUCTURE.md`, `README.md`, `ROADMAP.md`) and `.autodev/reference/` are **not** copied into the corpus — they are already on disk and indexed directly. The corpus exists for external substrate docs that are not part of the project tree.
- When `search_docs` returns hits from `pi/` or `magic-context/`, the hit path is relative to `docs-corpus/`. Agents should treat these as authoritative for the substrate they cover.