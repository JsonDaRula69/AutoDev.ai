# Loreguard — Substrate Documentation

**Package:** `loreguard-mcp` v0.1.0 (NOT installed in node_modules — AutoDev uses an in-process wrapper)
**Wrapper source:** `src/plugin/engines/loreguard-store.ts` (AutoDev repo)

## Overview

Loreguard is AutoDev's ratified-decisions store. Architecture Decision Records (ADRs) are persisted in a SQLite database (`.loreguard/lore.db`) with FTS5 full-text search. Agents call `search_lore` before making any decision that affects production integrity. ADRs flow Proposed → Ratified (after debate/review).

Two integration paths exist:
1. **MCP server** (`loreguard-mcp`) — external process, configured in `.autodev/config/mcp.json`. AutoDev's config uses a `<LOREGUARD_MCP_PATH>` placeholder and `LOREGUARD_ALLOW_MCP_ABSENCE=1` so the system degrades gracefully when the MCP server isn't installed.
2. **In-process wrapper** (`src/plugin/engines/loreguard-store.ts`) — the `LoreguardStore` class provides the same CRUD + FTS5 search directly in-process, with adapters for both `bun:sqlite` (Bun) and `better-sqlite3` (Node.js).

## Files Collected Here

| File | Source |
|---|---|
| `README.md` | This file |
| `mcp-config.json` | `.autodev/config/mcp.json` |
| `loreguard-store.ts` | `src/plugin/engines/loreguard-store.ts` (full source) |

## API

See `docs-corpus/engines/loreguard-store-api.md` for the full `LoreguardStore` class API.

### Key Methods

- `insertADR(record)` — create a Proposed ADR.
- `ratifyADR(id)` — transition Proposed → Ratified.
- `searchADRs(query, limit)` — FTS5 full-text search, ranked by relevance.
- `getADR(id)` / `listADRs(status?)` / `deleteADR(id)` — CRUD.

## What T4 Needs to Know

1. The `loreguard-mcp` npm package is **not installed**. AutoDev relies on the in-process `LoreguardStore` wrapper.
2. The DB path is configurable via `LOREGUARD_DB_PATH` env var (default `.loreguard/lore.db`).
3. The `DatabaseAdapter` interface decouples the store from the SQLite binding — works under both Node.js (`better-sqlite3`) and Bun (`bun:sqlite`).
4. T4 should keep `src/plugin/engines/loreguard-store.ts` as-is; if `loreguard-mcp` is needed for MCP integration, it becomes an optional dependency.