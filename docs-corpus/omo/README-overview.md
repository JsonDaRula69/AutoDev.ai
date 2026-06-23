# OmO (oh-my-openagent) — Substrate Documentation

**Package:** `oh-my-openagent` v4.10.0 (vendored)
**Vendored at:** `vendor/oh-my-openagent/` (unmodified npm install)
**Upstream:** `code-yeongyu/oh-my-openagent`, default branch `dev`, HEAD `f6b9ace` (v4.11.0 release state)
**AutoDev customizations:** `.opencode/oh-my-openagent.json` (OUTSIDE vendored tree — see T3 manifest)

## Overview

OmO is the orchestration layer that brings AutoDev's crew online together. It plugs into OpenCode as a plugin and provides:
- **Team mode** — all crew members online simultaneously, routed by task type.
- **Model routing** — per-agent model assignments + fallback chains.
- **Lifecycle hooks** — context-window monitoring, preemptive compaction, stuck-agent detection (AutoDev disables 3 that conflict with Magic Context).
- **Skills system** — 21 skill bundles (ast-grep, debugging, frontend, git-master, programming, refactor, review-work, etc.).
- **MCP integration** — git-bash-mcp, lsp-tools-mcp, lsp-daemon.
- **Dual-harness** — supports both OpenCode (`omo-opencode`) and Codex (`omo-codex`) runtimes.

## Files Collected Here

| File | Source |
|---|---|
| `AGENTS.md` | `vendor/oh-my-openagent/AGENTS.md` (root — the big 42KB orchestration spec) |
| `README.md` | `vendor/oh-my-openagent/README.md` |
| `CHANGELOG.md` | `vendor/oh-my-openagent/CHANGELOG.md` |
| `ROADMAP.md` | `vendor/oh-my-openagent/ROADMAP.md` |
| `CONTRIBUTING.md` | `vendor/oh-my-openagent/CONTRIBUTING.md` |
| `THIRD-PARTY-NOTICES.md` | `vendor/oh-my-openagent/THIRD-PARTY-NOTICES.md` |
| `docs-AGENTS.md` | `vendor/oh-my-openagent/docs/AGENTS.md` |
| `docs/` | Full docs tree (guide, reference, legal, troubleshooting, manifesto, model-capabilities) |
| `packages/AGENTS.md` | `vendor/oh-my-openagent/packages/AGENTS.md` (package map) |
| `packages/*-AGENTS.md` | Per-package AGENTS.md (15 packages: claude-code-compat-core, lsp-core, lsp-daemon, lsp-tools-mcp, mcp-client-core, model-core, omo-codex, openclaw-core, rules-engine, skills-loader-core, team-core, tmux-core, utils, web) |
| `packages/omo-opencode-package.json` | `vendor/oh-my-openagent/packages/omo-opencode/package.json` (OpenCode harness adapter) |
| `plugin/` | omo-codex plugin docs: README, MARKETPLACE, 21 SKILL.md files |

## Key Packages (OmO's 37 packages)

AutoDev-relevant OmO packages (the ones AutoDev's orchestration actually uses):
- `omo-opencode` — OpenCode harness adapter (the one AutoDev uses).
- `omo-codex` — Codex harness adapter (AutoDev does NOT use this, but skills ship through it).
- `team-core` — team mode orchestration.
- `model-core` — model routing + fallback chains.
- `rules-engine` — rule injection.
- `skills-loader-core` — skill loading.
- `openclaw-core` — outbound hooks (AutoDev uses for Discord).
- `mcp-client-core` — MCP client.
- `lsp-core` / `lsp-daemon` / `lsp-tools-mcp` — LSP integration.
- `tmux-core` — tmux integration.
- `utils` — shared utilities.
- `shared-skills` — shared skill definitions.
- `claude-code-compat-core` — Claude Code compatibility.
- `agents-md-core` — AGENTS.md parsing.
- `boulder-state` — state management.
- `comment-checker-core` — comment checking.
- `delegate-core` — delegation.
- `hashline-core` — hashline.
- `prompts-core` — prompts.

Platform binaries (not source — npm optionalDependencies):
- `oh-my-opencode-{darwin,linux,windows}-{arm64,x64}{,-baseline,-musl}` — 13 platform-specific binaries.

## What T4 Needs to Know

1. OmO is **vendored unmodified** at `vendor/oh-my-openagent/`. T3 verified zero modifications. T4 does NOT need to patch it.
2. AutoDev customizations live in `.opencode/oh-my-openagent.json` (outside vendored tree). These persist across OmO upgrades.
3. Upgrading OmO = replace vendored dir with `npm install oh-my-openagent@<version>` payload (ships `dist/` + `plugin/skills/*`).
4. The vendored copy is v4.10.0; upstream HEAD is v4.11.0. The vendored copy is one release behind.
5. Three OmO hooks are DISABLED in AutoDev (conflict with Magic Context): `preemptive-compaction`, `context-window-monitor`, `anthropic-context-window-limit-recovery`.
6. AutoDev uses the `omo-opencode` harness adapter, NOT `omo-codex`. But skills ship through `omo-codex/plugin/skills/` (build-copied bundles from `shared-skills/`).
7. Model routing: 16 occurrences of `ollama-cloud/glm-5.2:cloud` (agents sisyphus/hephaestus/prometheus/metis + categories deep/writing). Review agents (oracle/momus/atlas) use `deepseek-v4-pro`. Lightweight agents use `deepseek-v4-flash`.