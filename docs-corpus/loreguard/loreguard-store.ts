/**
 * LoreguardStore — SQLite FTS5 persistence for Architecture Decision Records.
 *
 * Provides CRUD operations + full-text search for ADRs stored in .loreguard/lore.db.
 * Uses a DatabaseAdapter interface to support both better-sqlite3 (Node.js) and bun:sqlite.
 *
 * Lifecycle:
 * 1. Create store → initializes database with FTS5 schema
 * 2. Insert ADR → persists to adrs table + FTS5 index
 * 3. Search ADRs → full-text query via FTS5 MATCH
 * 4. Ratify ADR → updates status from Proposed to Ratified
 * 5. Close store → closes database connection
 *
 * Design:
 * - DatabaseAdapter interface decouples from specific SQLite binding
 * - WAL journal mode for concurrent read performance (when supported)
 * - FTS5 content-external storage (content=adrs, content_rowid=id)
 * - Triggers keep FTS5 index in sync with adrs table
 */

import { existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

// ─── Types ────────────────────────────────────────────────────────

export interface ADRRecord {
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

export interface ADRSearchResult {
  id: number
  title: string
  context: string
  decision: string
  consequences: string
  status: string
  rank: number
}

export interface DatabaseAdapter {
  prepare(sql: string): StatementAdapter
  exec(sql: string): void
  pragma(pragma: string): void
  close(): void
}

export interface StatementAdapter {
  run(params: Record<string, unknown>): { lastInsertRowid: number; changes: number }
  get(params: Record<string, unknown>): Record<string, unknown> | undefined
  all(params: Record<string, unknown>): Record<string, unknown>[]
}

// ─── Schema ────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS adrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  decision TEXT NOT NULL,
  consequences TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Proposed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ratified_at TEXT,
  debate_session_id TEXT,
  contradictions TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS adrs_fts USING fts5(
  title, context, decision, consequences,
  content='adrs', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS adrs_ai AFTER INSERT ON adrs BEGIN
  INSERT INTO adrs_fts(rowid, title, context, decision, consequences)
  VALUES (new.id, new.title, new.context, new.decision, new.consequences);
END;

CREATE TRIGGER IF NOT EXISTS adrs_ad AFTER DELETE ON adrs BEGIN
  INSERT INTO adrs_fts(adrs_fts, rowid, title, context, decision, consequences)
  VALUES ('delete', old.id, old.title, old.context, old.decision, old.consequences);
END;

CREATE TRIGGER IF NOT EXISTS adrs_au AFTER UPDATE ON adrs BEGIN
  INSERT INTO adrs_fts(adrs_fts, rowid, title, context, decision, consequences)
  VALUES ('delete', old.id, old.title, old.context, old.decision, old.consequences);
  INSERT INTO adrs_fts(rowid, title, context, decision, consequences)
  VALUES (new.id, new.title, new.context, new.decision, new.consequences);
END;
`

// ─── Store ─────────────────────────────────────────────────────────

export class LoreguardStore {
  private db: DatabaseAdapter
  private destroyed = false

  constructor(db: DatabaseAdapter) {
    this.db = db
    this.db.pragma("journal_mode = WAL")
    this.db.exec(SCHEMA_SQL)
  }

  insertADR(record: Omit<ADRRecord, "id" | "created_at">): ADRRecord {
    this.assertNotDestroyed()
    const stmt = this.db.prepare(`
      INSERT INTO adrs (title, context, decision, consequences, status, contradictions, debate_session_id)
      VALUES ($title, $context, $decision, $consequences, $status, $contradictions, $debate_session_id)
    `)
    const result = stmt.run({
      $title: record.title,
      $context: record.context,
      $decision: record.decision,
      $consequences: record.consequences,
      $status: record.status,
      $contradictions: record.contradictions ?? null,
      $debate_session_id: record.debate_session_id ?? null,
    })
    return this.getADR(result.lastInsertRowid)!
  }

  ratifyADR(id: number): ADRRecord | null {
    this.assertNotDestroyed()
    const stmt = this.db.prepare(`
      UPDATE adrs SET status = 'Ratified', ratified_at = datetime('now')
      WHERE id = $id AND status = 'Proposed'
    `)
    const result = stmt.run({ $id: id })
    if (result.changes === 0) return null
    return this.getADR(id)
  }

  searchADRs(query: string, limit = 10): ADRSearchResult[] {
    this.assertNotDestroyed()
    const stmt = this.db.prepare(`
      SELECT a.id, a.title, a.context, a.decision, a.consequences, a.status, rank
      FROM adrs_fts f
      JOIN adrs a ON a.id = f.rowid
      WHERE adrs_fts MATCH $query
      ORDER BY rank
      LIMIT $limit
    `)
    return stmt.all({ $query: query, $limit: limit }) as unknown as ADRSearchResult[]
  }

  getADR(id: number): ADRRecord | null {
    this.assertNotDestroyed()
    const stmt = this.db.prepare("SELECT * FROM adrs WHERE id = $id")
    const row = stmt.get({ $id: id })
    return (row as unknown as ADRRecord) ?? null
  }

  listADRs(status?: "Proposed" | "Ratified"): ADRRecord[] {
    this.assertNotDestroyed()
    if (status) {
      const stmt = this.db.prepare("SELECT * FROM adrs WHERE status = $status ORDER BY created_at DESC")
      return stmt.all({ $status: status }) as unknown as ADRRecord[]
    }
    const stmt = this.db.prepare("SELECT * FROM adrs ORDER BY created_at DESC")
    return stmt.all({}) as unknown as ADRRecord[]
  }

  deleteADR(id: number): boolean {
    this.assertNotDestroyed()
    const stmt = this.db.prepare("DELETE FROM adrs WHERE id = $id")
    const result = stmt.run({ $id: id })
    return result.changes > 0
  }

  close(): void {
    if (!this.destroyed) {
      this.db.close()
      this.destroyed = true
    }
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error("LoreguardStore has been closed")
    }
  }
}

// ─── Bun:sqlite Adapter ─────────────────────────────────────────────

function createBunSqliteAdapter(dbPath: string): DatabaseAdapter {
  // @ts-expect-error bun:sqlite is only available under Bun runtime
  const { Database } = require("bun:sqlite")
  const db = new Database(dbPath)
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        run(params: Record<string, unknown>) {
          const result = stmt.run(params)
          return { lastInsertRowid: result.lastInsertRowid as number, changes: result.changes }
        },
        get(params: Record<string, unknown>) {
          return stmt.get(params) as Record<string, unknown> | undefined
        },
        all(params: Record<string, unknown>) {
          return stmt.all(params) as Record<string, unknown>[]
        },
      }
    },
    exec(sql: string) {
      db.exec(sql)
    },
    pragma(pragma: string) {
      const parts = pragma.split(" = ")
      db.exec(`PRAGMA ${parts[0]}${parts[1] ? ` = ${parts[1]}` : ""}`)
    },
    close() {
      db.close()
    },
  }
}

// ─── Better-sqlite3 Adapter ─────────────────────────────────────────

function createBetterSqlite3Adapter(dbPath: string): DatabaseAdapter {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath)
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        run(params: Record<string, unknown>) {
          const result = stmt.run(params)
          return { lastInsertRowid: result.lastInsertRowid as number, changes: result.changes }
        },
        get(params: Record<string, unknown>) {
          return stmt.get(params) as Record<string, unknown> | undefined
        },
        all(params: Record<string, unknown>) {
          return stmt.all(params) as Record<string, unknown>[]
        },
      }
    },
    exec(sql: string) {
      db.exec(sql)
    },
    pragma(pragma: string) {
      db.pragma(pragma)
    },
    close() {
      db.close()
    },
  }
}

// ─── Factory ────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = join(process.cwd(), ".loreguard", "lore.db")

export function createLoreguardStore(dbPath?: string): LoreguardStore {
  const path = dbPath ?? DEFAULT_DB_PATH
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  let adapter: DatabaseAdapter
  try {
    adapter = createBunSqliteAdapter(path)
  } catch {
    adapter = createBetterSqlite3Adapter(path)
  }

  return new LoreguardStore(adapter)
}

export function createLoreguardStoreWithAdapter(db: DatabaseAdapter): LoreguardStore {
  return new LoreguardStore(db)
}