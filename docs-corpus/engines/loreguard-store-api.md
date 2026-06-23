# LoreguardStore API

**Source:** `src/plugin/engines/loreguard-store.ts` (AutoDev repo)
**Full source copy:** `docs-corpus/engines/loreguard-store.ts` and `docs-corpus/loreguard/loreguard-store.ts`

## Overview

LoreguardStore is a SQLite + FTS5 persistence layer for Architecture Decision Records (ADRs). It stores ADRs in a relational table and maintains a full-text-search index (FTS5 with external-content storage) kept in sync via triggers. This lets agents call `search_lore` to find ratified decisions by keyword.

Database location: `.loreguard/lore.db` (configurable).

Design:
- **DatabaseAdapter** interface decouples from the specific SQLite binding (`better-sqlite3` for Node.js, `bun:sqlite` for Bun).
- **WAL journal mode** for concurrent read performance.
- **FTS5 content-external** storage (`content='adrs', content_rowid='id'`) — the FTS index references the base table, no duplicate storage.
- **Triggers** (`adrs_ai`, `adrs_ad`, `adrs_au`) keep the FTS index in sync on insert/delete/update.

## Schema

```sql
CREATE TABLE adrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  decision TEXT NOT NULL,
  consequences TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Proposed',  -- 'Proposed' | 'Ratified'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ratified_at TEXT,
  debate_session_id TEXT,
  contradictions TEXT
);

CREATE VIRTUAL TABLE adrs_fts USING fts5(
  title, context, decision, consequences,
  content='adrs', content_rowid='id'
);
```

## Types

```typescript
interface ADRRecord {
  id?: number
  title: string
  context: string
  decision: string
  consequences: string
  status: "Proposed" | "Ratified"
  created_at?: string
  ratified_at?: string | null
  debate_session_id?: string | null
  contradictions?: string | null
}

interface ADRSearchResult {
  id: number
  title: string
  context: string
  decision: string
  consequences: string
  status: string
  rank: number
}

interface DatabaseAdapter {
  prepare(sql: string): StatementAdapter
  exec(sql: string): void
  pragma(pragma: string): void
  close(): void
}

interface StatementAdapter {
  run(params: Record<string, unknown>): { lastInsertRowid: number; changes: number }
  get(params: Record<string, unknown>): Record<string, unknown> | undefined
  all(params: Record<string, unknown>): Record<string, unknown>[]
}
```

## Class: LoreguardStore

### Constructor

```typescript
new LoreguardStore(db: DatabaseAdapter)
```

Sets WAL journal mode + creates schema (idempotent with `IF NOT EXISTS`).

### Public Methods

| Method | Signature | Description |
|---|---|---|
| `insertADR` | `(record: Omit<ADRRecord, "id"\|"created_at">) => ADRRecord` | Insert a new ADR (status defaults to "Proposed"). Returns the inserted record with `id` + `created_at`. |
| `ratifyADR` | `(id: number) => ADRRecord \| null` | Transition status from "Proposed" → "Ratified", set `ratified_at = now`. Returns null if the ADR wasn't in "Proposed" status. |
| `searchADRs` | `(query: string, limit?: number) => ADRSearchResult[]` | Full-text search via FTS5 `MATCH`. Results ranked by FTS5 `rank`. Default limit 10. |
| `getADR` | `(id: number) => ADRRecord \| null` | Fetch a single ADR by id. |
| `listADRs` | `(status?: "Proposed"\|"Ratified") => ADRRecord[]` | List ADRs, optionally filtered by status, ordered by `created_at DESC`. |
| `deleteADR` | `(id: number) => boolean` | Delete an ADR by id. Returns true if a row was deleted. |
| `close` | `() => void` | Close the database connection. Marks destroyed. |

## Factories

```typescript
createLoreguardStore(dbPath?: string): LoreguardStore
// Default path: join(process.cwd(), ".loreguard", "lore.db")
// Tries bun:sqlite adapter first, falls back to better-sqlite3.

createLoreguardStoreWithAdapter(db: DatabaseAdapter): LoreguardStore
// Use a pre-configured adapter (for testing or external DB).
```

## Adapters

Two adapters ship in this file:
- **`createBunSqliteAdapter(dbPath)`** — for Bun runtime.
- **`createBetterSqlite3Adapter(dbPath)`** — for Node.js.

Both implement `DatabaseAdapter`. The factory tries Bun first and falls back to better-sqlite3 (the `require("bun:sqlite")` throws under Node.js).

## MCP Integration

Loreguard runs as an MCP server. Config (from `.autodev/config/mcp.json`):

```json
{
  "mcpServers": {
    "loreguard": {
      "command": "node",
      "args": ["<LOREGUARD_MCP_PATH>"],
      "env": {
        "LOREGUARD_DB_PATH": "<AUTODEV_ROOT>/.loreguard/lore.db",
        "LOREGUARD_ALLOW_MCP_ABSENCE": "1"
      }
    }
  }
}
```

The `LOREGUARD_ALLOW_MCP_ABSENCE=1` env var allows the system to proceed when the MCP server is unavailable (graceful degradation). AutoDev's `mcp.json` uses `<LOREGUARD_MCP_PATH>` placeholder resolved at runtime — the `loreguard-mcp` npm package (v0.1.0) is NOT installed in this repo's `node_modules`; the wrapper class `LoreguardStore` provides the in-process equivalent.