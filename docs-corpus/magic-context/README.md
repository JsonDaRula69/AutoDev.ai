# Magic Context — Substrate Documentation

**Package:** `@cortexkit/opencode-magic-context` v0.25.0
**Installed at:** `.opencode/node_modules/@cortexkit/opencode-magic-context/`

## Overview

Magic Context is the semantic-memory plugin that powers AutoDev's `ctx_search` and `project-memory` injection. It plugs into OpenCode as a plugin and provides:
- Auto-injection of a `<project-memory>` block from past sessions into every agent prompt.
- `ctx_search` tool for full conversation-history semantic search across memories, messages, and git commits.
- Persistent memory across sessions via embeddings.
- A background historian that compartmentalizes history (no compaction pauses).
- An optional dreamer agent that consolidates/verifies memories overnight.

The embedding backend is VoyageAI (see `EmbeddingLayer` in `engines/`), with a local `all-MiniLM-L6-v2` ONNX fallback.

## Files Collected Here

| File | Source |
|---|---|
| `PACKAGE-README.md` | `.opencode/node_modules/@cortexkit/opencode-magic-context/README.md` (official package README — full feature docs) |
| `package.json` | `.opencode/node_modules/@cortexkit/opencode-magic-context/package.json` |
| `config-schema.jsonc` | `.opencode/magic-context.jsonc` (AutoDev's config instance — gitignored, contains VoyageAI key) |
| `dist/index.d.ts` | `.opencode/node_modules/@cortexkit/opencode-magic-context/dist/index.d.ts` (public API types) |
| `dist/index.js` | `.opencode/node_modules/@cortexkit/opencode-magic-context/dist/index.js` (compiled bundle) |

## Agent Tools Provided

| Tool | What it does |
|---|---|
| `ctx_reduce` | Queue stale tagged content for removal (cache-aware) |
| `ctx_memory` | Write/delete durable cross-session memories (categories: PROJECT_RULES, ARCHITECTURE, CONSTRAINTS, CONFIG_VALUES, NAMING) |
| `ctx_search` | Search memories + conversation history + git commits (semantic embeddings + full-text fallback) |
| `ctx_expand` | Decompress a history range back to the transcript |
| `ctx_note` | Deferred intentions + dreamer-evaluated smart notes |

## Commands

`/ctx-status`, `/ctx-flush`, `/ctx-recomp`, `/ctx-session-upgrade`, `/ctx-aug`, `/ctx-dream`

## What T4 Needs to Know

1. Magic Context is an **npm dependency**, not vendored source. T4 keeps it in `package.json`, does not copy its source.
2. Config lives in `.opencode/magic-context.jsonc`. The copy here (`config-schema.jsonc`) is AutoDev's instance (redact secrets in T4).
3. The package ships `dist/` (compiled) + `src/` (TypeScript). The `.d.ts` in `dist/` is the public API contract.
4. AutoDev's `EmbeddingLayer` (in `engines/embedding-layer.ts`) is the VoyageAI integration that backs Magic Context's semantic search.
5. Magic Context disables OpenCode built-in compaction (`compaction.auto`/`compaction.prune`) — AutoDev's `opencode.jsonc` must keep those off.
6. Magic Context conflicts with three OmO hooks (already disabled in AutoDev's `.opencode/oh-my-openagent.json`): `preemptive-compaction`, `context-window-monitor`, `anthropic-context-window-limit-recovery`.
7. Storage: SQLite at `~/.local/share/cortexkit/magic-context/context.db` (XDG-equivalent on Windows). Memories keyed to stable project identity (survive across worktrees/clones/forks).