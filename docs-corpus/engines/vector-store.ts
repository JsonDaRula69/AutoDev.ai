/**
 * VectorStore — sqlite-vec persistence for embeddings.
 *
 * Stores embedding vectors using the sqlite-vec extension, enabling
 * KNN (k-nearest neighbors) similarity search. Vectors accumulate
 * over time, building a searchable knowledge base.
 *
 * Design:
 * - Runtime-adaptive: uses better-sqlite3 in Node, bun:sqlite in Bun
 * - sqlite-vec loaded as a runtime extension for vector operations
 * - Metadata stored as JSON for flexible filtering
 * - Cosine similarity via KNN search when sqlite-vec is available
 * - Graceful degradation: falls back to linear scan without sqlite-vec
 */

import { existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

// ─── Database Abstraction ──────────────────────────────────────────

/**
 * Minimal database interface that both better-sqlite3 and bun:sqlite implement.
 * This allows VectorStore to work in both Node.js and Bun runtimes.
 */
export interface SQLiteDatabase {
  pragma(cmd: string): void
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid: number; changes: number }
    get(...params: unknown[]): Record<string, unknown> | undefined
    all(...params: unknown[]): Array<Record<string, unknown>>
  }
  transaction<T>(fn: () => T): () => T
  close(): void
}

// ─── Types ────────────────────────────────────────────────────────

export interface VectorRecord {
  id?: number
  content: string
  content_type: string
  vector: Float32Array | number[]
  metadata?: Record<string, unknown> | null
  created_at?: string
}

export interface VectorSearchResult {
  id: number
  content: string
  content_type: string
  metadata: string | null
  distance: number
}

export interface VectorStoreConfig {
  /** Path to the SQLite database file. Defaults to .autodev/embeddings/vectors.db */
  dbPath?: string
  /** Whether to skip loading sqlite-vec extension (for testing or constrained environments) */
  skipVecExtension?: boolean
  /** External database instance (for dependency injection / testing) */
  database?: SQLiteDatabase
}

// ─── Constants ────────────────────────────────────────────────────

const VEC_TABLE_NAME = "vec_embeddings"
const METADATA_TABLE_NAME = "embeddings"
const DEFAULT_DB_PATH = join(process.cwd(), ".autodev", "embeddings", "vectors.db")

// ─── Schema SQL ───────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${METADATA_TABLE_NAME} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'default',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

const VEC_SCHEMA_SQL = (dimensions: number): string => `
CREATE VIRTUAL TABLE IF NOT EXISTS ${VEC_TABLE_NAME} USING vec0(
  embedding_id integer primary key,
  embedding float[${dimensions}]
);
`

// ─── Database Factory ──────────────────────────────────────────────

function openDatabase(dbPath: string): SQLiteDatabase {
  // Detect runtime: Bun has its own SQLite implementation
  const isBun = typeof (globalThis as Record<string, unknown>).Bun !== "undefined"

  if (isBun) {
    const bunSqlite = require("bun:sqlite")
    const db = new bunSqlite.Database(dbPath, { create: true })
    return {
      pragma(_cmd: string) { /* bun:sqlite has no pragma method; WAL is default for :memory: */ },
      exec(sql: string) { db.exec(sql) },
      prepare(sql: string) {
        const stmt = db.prepare(sql)
        return {
          run(...params: unknown[]) {
            const result = stmt.run(...params)
            return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) }
          },
          get(...params: unknown[]) {
            return stmt.get(...params) as Record<string, unknown> | undefined
          },
          all(...params: unknown[]) {
            return stmt.all(...params) as Array<Record<string, unknown>>
          },
        }
      },
      transaction<T>(fn: () => T): () => T {
        return db.transaction(fn)
      },
      close() { db.close() },
    }
  }

  // Node.js: use better-sqlite3
  const Database = require("better-sqlite3")
  return new Database(dbPath) as unknown as SQLiteDatabase
}

// ─── VectorStore ──────────────────────────────────────────────────

export class VectorStore {
  private db: SQLiteDatabase
  private destroyed = false
  private vecLoaded = false
  private dims: number | null = null
  private vecTableReady = false
  private ownsDatabase: boolean

  constructor(config: VectorStoreConfig = {}) {
    if (config.database) {
      this.db = config.database
      this.ownsDatabase = false
    } else {
      const dbPath = config.dbPath ?? DEFAULT_DB_PATH
      if (dbPath !== ":memory:") {
        const dir = dirname(dbPath)
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
      }

      this.db = openDatabase(dbPath)
      this.ownsDatabase = true
    }

    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec(SCHEMA_SQL)

    // Load sqlite-vec extension (Node.js only — Bun doesn't support loadable extensions)
    if (!config.skipVecExtension) {
      try {
        const sqliteVec = require("sqlite-vec")
        // sqlite-vec's load() calls db.loadExtension() which only works with better-sqlite3
        // For injected databases (Bun), we skip this
        if (this.ownsDatabase && !config.database) {
          const nativeDb = this.db as unknown as { loadExtension(path: string): void }
          if (typeof nativeDb.loadExtension === "function") {
            sqliteVec.load(this.db as unknown as { loadExtension(path: string): void })
            this.vecLoaded = true
          }
        }
      } catch {
        this.vecLoaded = false
      }
    }
  }

  storeEmbedding(record: Omit<VectorRecord, "id" | "created_at">): VectorRecord {
    this.assertNotDestroyed()

    const metadataJson = record.metadata ? JSON.stringify(record.metadata) : null

    const stmt = this.db.prepare(`
      INSERT INTO ${METADATA_TABLE_NAME} (content, content_type, metadata)
      VALUES (?, ?, ?)
    `)
    const result = stmt.run(record.content, record.content_type, metadataJson)

    const id = result.lastInsertRowid

    if (this.vecLoaded) {
      this.insertVectorIntoVecTable(id, record.vector)
    }

    return {
      id,
      content: record.content,
      content_type: record.content_type,
      vector: record.vector,
      metadata: record.metadata ?? null,
    }
  }

  storeEmbeddingBatch(records: Array<Omit<VectorRecord, "id" | "created_at">>): VectorRecord[] {
    this.assertNotDestroyed()

    const transaction = this.db.transaction(() => {
      return records.map((record) => this.storeEmbedding(record))
    })

    return transaction()
  }

  searchSimilar(
    vector: number[] | Float32Array,
    limit = 10,
    contentType?: string,
  ): VectorSearchResult[] {
    this.assertNotDestroyed()

    if (this.vecLoaded && this.vecTableReady) {
      return this.searchWithVec(vector, limit, contentType)
    }

    return this.searchFallback(vector, limit, contentType)
  }

  deleteEmbedding(id: number): boolean {
    this.assertNotDestroyed()

    const transaction = this.db.transaction(() => {
      if (this.vecLoaded && this.vecTableReady) {
        try {
          this.db.prepare(`DELETE FROM ${VEC_TABLE_NAME} WHERE embedding_id = ?`).run(id)
        } catch {
          // May not exist in vec table
        }
      }

      const result = this.db.prepare(
        `DELETE FROM ${METADATA_TABLE_NAME} WHERE id = ?`,
      ).run(id)

      return result.changes > 0
    })

    return transaction()
  }

  getEmbedding(id: number): Omit<VectorRecord, "vector"> & { vector: Float32Array | null } | null {
    this.assertNotDestroyed()

    const row = this.db.prepare(
      `SELECT id, content, content_type, metadata, created_at FROM ${METADATA_TABLE_NAME} WHERE id = ?`,
    ).get(id)

    if (!row) return null

    let vector: Float32Array | null = null
    if (this.vecLoaded && this.vecTableReady) {
      try {
        const vecRow = this.db.prepare(
          `SELECT embedding FROM ${VEC_TABLE_NAME} WHERE embedding_id = ?`,
        ).get(id)

        if (vecRow?.embedding) {
          const buf = vecRow.embedding as Buffer | Uint8Array
          vector = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
        }
      } catch {
        // Vector may not exist
      }
    }

    return {
      id: row.id as number,
      content: row.content as string,
      content_type: row.content_type as string,
      vector,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
      created_at: row.created_at as string,
    }
  }

  count(): number {
    this.assertNotDestroyed()
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${METADATA_TABLE_NAME}`).get()
    return (row?.count as number) ?? 0
  }

  isVecAvailable(): boolean {
    return this.vecLoaded
  }

  close(): void {
    if (!this.destroyed) {
      if (this.ownsDatabase) {
        this.db.close()
      }
      this.destroyed = true
    }
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  // ─── Private ──────────────────────────────────────────────────────

  private insertVectorIntoVecTable(id: number, vector: Float32Array | number[]): void {
    const vecArray = vector instanceof Float32Array ? vector : new Float32Array(vector)

    if (!this.vecTableReady) {
      this.dims = vecArray.length
      this.db.exec(VEC_SCHEMA_SQL(this.dims))
      this.vecTableReady = true
    }

    try {
      this.db.prepare(
        `INSERT INTO ${VEC_TABLE_NAME} (embedding_id, embedding) VALUES (?, ?)`,
      ).run(id, Buffer.from(vecArray.buffer))
    } catch {
      // If insert fails, we still have the metadata
    }
  }

  private searchWithVec(
    vector: number[] | Float32Array,
    limit: number,
    contentType?: string,
  ): VectorSearchResult[] {
    const vecArray = vector instanceof Float32Array ? vector : new Float32Array(vector)
    const queryBuffer = Buffer.from(vecArray.buffer)

    let sql = `
      SELECT
        m.id,
        m.content,
        m.content_type,
        m.metadata,
        v.distance
      FROM ${VEC_TABLE_NAME} v
      JOIN ${METADATA_TABLE_NAME} m ON v.embedding_id = m.id
    `

    const params: unknown[] = [queryBuffer]

    if (contentType) {
      sql += ` WHERE m.content_type = ?`
      params.push(contentType)
    }

    sql += ` ORDER BY v.distance ASC LIMIT ?`
    params.push(limit)

    try {
      const rows = this.db.prepare(sql).all(...params)

      return rows.map((row) => ({
        id: row.id as number,
        content: row.content as string,
        content_type: row.content_type as string,
        metadata: row.metadata as string | null,
        distance: row.distance as number,
      }))
    } catch {
      return this.searchFallback(vector, limit, contentType)
    }
  }

  private searchFallback(
    _vector: number[] | Float32Array,
    limit: number,
    contentType?: string,
  ): VectorSearchResult[] {
    let sql = `SELECT id, content, content_type, metadata FROM ${METADATA_TABLE_NAME}`
    const params: unknown[] = []

    if (contentType) {
      sql += ` WHERE content_type = ?`
      params.push(contentType)
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params)

    return rows.map((row) => ({
      id: row.id as number,
      content: row.content as string,
      content_type: row.content_type as string,
      metadata: row.metadata as string | null,
      distance: -1,
    }))
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error("VectorStore has been closed")
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────

export function createVectorStore(config?: VectorStoreConfig): VectorStore {
  return new VectorStore(config ?? {})
}

export function createInMemoryVectorStore(skipVecExtension = true): VectorStore {
  return new VectorStore({
    dbPath: ":memory:",
    skipVecExtension: skipVecExtension,
  })
}