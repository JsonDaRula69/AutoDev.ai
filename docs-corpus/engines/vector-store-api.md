# VectorStore API

**Source:** `src/plugin/engines/vector-store.ts` (AutoDev repo)
**Full source copy:** `docs-corpus/engines/vector-store.ts`

## Overview

VectorStore is a SQLite-based persistence layer for embedding vectors, using the `sqlite-vec` extension for KNN similarity search. It is runtime-adaptive: uses `better-sqlite3` under Node.js and `bun:sqlite` under Bun. When `sqlite-vec` is available, vectors are stored in a virtual `vec0` table enabling cosine-similarity KNN search. When unavailable, it gracefully degrades to a linear scan ordered by recency.

Schema:
- `embeddings` table — metadata: `id`, `content`, `content_type`, `metadata` (JSON), `created_at`.
- `vec_embeddings` virtual table (FTS-style) — `embedding_id`, `embedding float[N]`. Created lazily on first insert when `sqlite-vec` loaded.

## Types

```typescript
interface SQLiteDatabase {
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

interface VectorRecord {
  id?: number
  content: string
  content_type: string
  vector: Float32Array | number[]
  metadata?: Record<string, unknown> | null
  created_at?: string
}

interface VectorSearchResult {
  id: number
  content: string
  content_type: string
  metadata: string | null
  distance: number            // -1 when using fallback (no real similarity)
}

interface VectorStoreConfig {
  dbPath?: string              // Default: .autodev/embeddings/vectors.db
  skipVecExtension?: boolean   // Skip loading sqlite-vec (testing/constrained)
  database?: SQLiteDatabase     // Inject external DB instance
}
```

## Class: VectorStore

### Constructor

```typescript
new VectorStore(config: VectorStoreConfig = {})
```

- If `config.database` provided, uses it and does NOT own/close it.
- Otherwise opens `dbPath` (creates parent dir if missing).
- Sets `PRAGMA journal_mode = WAL`.
- Creates `embeddings` metadata table.
- Attempts to load `sqlite-vec` extension (Node.js only — Bun doesn't support loadable extensions).

### Public Methods

| Method | Signature | Description |
|---|---|---|
| `storeEmbedding` | `(record: Omit<VectorRecord, "id"\|"created_at">) => VectorRecord` | Insert one embedding + metadata. If vec loaded, also inserts into vec table (lazily creating it with the vector's dimensionality on first call). |
| `storeEmbeddingBatch` | `(records: Array<Omit<VectorRecord, "id"\|"created_at">>) => VectorRecord[]` | Batch insert within a transaction. |
| `searchSimilar` | `(vector: number[]\|Float32Array, limit?: number, contentType?: string) => VectorSearchResult[]` | KNN search if vec available; linear-scan fallback otherwise. Optional `contentType` filter. |
| `deleteEmbedding` | `(id: number) => boolean` | Delete from both metadata + vec tables. Returns true if metadata row was deleted. |
| `getEmbedding` | `(id: number) => (Omit<VectorRecord, "vector"> & { vector: Float32Array \| null }) \| null` | Fetch metadata + vector (if vec loaded). |
| `count` | `() => number` | Total embedding count. |
| `isVecAvailable` | `() => boolean` | Whether sqlite-vec extension is loaded. |
| `close` | `() => void` | Closes DB only if owned. Marks destroyed. |
| `isDestroyed` | `() => boolean` | Whether `close()` was called. |

## Factories

```typescript
createVectorStore(config?: VectorStoreConfig): VectorStore
createInMemoryVectorStore(skipVecExtension = true): VectorStore  // :memory: DB, vec disabled by default
```

## Default DB Path

`join(process.cwd(), ".autodev", "embeddings", "vectors.db")`