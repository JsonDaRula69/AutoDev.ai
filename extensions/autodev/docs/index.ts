/**
 * Docs module — immutable reference corpus query.
 *
 * Exposes `docs-corpus/` as a semantically searchable tool so agents can
 * ground decisions in the architecture/API specs. Three pi tools are
 * registered at load time:
 *
 *   - search_docs(query, limit?)  — ranked document chunks via embeddings
 *   - docs_status()              — chunk count, doc count, component list
 *   - docs_rebuild()             — re-ingest docs-corpus/ into the vector DB
 *
 * Embedding provider: VoyageAI (remote, `VOYAGE_API_KEY`) with local ONNX
 * fallback (`Xenova/all-MiniLM-L6-v2`). The embedding function is injectable
 * so tests can substitute the deterministic mock fixture without touching the
 * network.
 *
 * Vector store: SQLite (`bun:sqlite`) with BLOB-stored Float32Array
 * embeddings and pure-JavaScript cosine similarity. No `sqlite-vec`.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { Type, type Static } from "typebox";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { embed, type EmbedFn, VOYAGE_BATCH_SIZE } from "../embeddings.js";
import { ftsMatchQuery } from "../fts-utils.js";
import { refreshStaleSources, type SeedSource } from "./seeding.js";

export type { EmbedFn };
export { embed, VOYAGE_BATCH_SIZE };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default DB path: `.autodev/embeddings/vectors.db` under cwd. */
export function defaultDbPath(cwd = process.cwd()): string {
  return resolve(cwd, ".autodev", "embeddings", "vectors.db");
}

/** Default corpus root: `docs-corpus/` under cwd. */
export function defaultCorpusRoot(cwd = process.cwd()): string {
  return resolve(cwd, "docs-corpus");
}

export function centralDbPath(agentDir = getAgentDir()): string {
  return join(agentDir, "..", "docs-corpus", "vectors.db");
}

export function centralCorpusRoot(agentDir = getAgentDir()): string {
  return join(agentDir, "..", "docs-corpus");
}

/** Maximum characters per chunk (trimmed on heading boundaries when possible). */
const MAX_CHUNK_CHARS = 1000;

/** Minimum file size to index (skip empty / title-only files). */
const MIN_FILE_CHARS = 50;

/** Files at the corpus root that are metadata, not content. */
const SKIP_FILES = new Set<string>(["MANIFEST.md"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single ranked search result returned by `search_docs`. */
export interface DocResult {
  readonly doc_path: string;
  readonly chunk_index: number;
  readonly content: string;
  readonly score: number;
}

/** Status payload returned by `docs_status`. */
export interface DocsStatus {
  readonly chunk_count: number;
  readonly doc_count: number;
  readonly components: readonly string[];
}

/** Rebuild result returned by `docs_rebuild`. */
export interface RebuildResult {
  readonly chunks: number;
  readonly errors: readonly string[];
}

/** A raw chunk extracted from a markdown file (pre-embedding). */
export interface RawChunk {
  readonly doc_path: string;
  readonly chunk_index: number;
  readonly content: string;
  readonly source_name?: string;
}

// ---------------------------------------------------------------------------
// Vector store
// ---------------------------------------------------------------------------

/**
 * Open (or create) the SQLite vector store at `dbPath` and ensure the schema
 * exists. The caller owns the returned `Database` handle and must `close()` it.
 */
export function openVectorStore(dbPath: string): Database {
  mkdirSync(resolve(dbPath, ".."), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec(SCHEMA_SQL);
  return db;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  source_name TEXT,
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_path ON chunks(doc_path);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, source_name);
`;

/** Serialize a Float32Array to a Buffer for BLOB storage. */
function encodeVector(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Deserialize a BLOB back into a Float32Array. */
function decodeVector(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

/** Drop all chunks (used by `docs_rebuild` before re-ingesting). */
export function clearChunks(db: Database): void {
  db.exec("DELETE FROM chunks;");
}

/** Drop the FTS5 index (used by `docs_rebuild_tier` before re-ingesting). */
export function clearFts(db: Database): void {
  db.exec("DELETE FROM chunks_fts;");
}

/** Count the number of chunks currently stored. */
export function countChunks(db: Database): number {
  const row = db.query("SELECT COUNT(*) AS n FROM chunks;").get() as { n: number } | null;
  return row?.n ?? 0;
}

/** Count distinct doc paths currently stored. */
export function countDocs(db: Database): number {
  const row = db.query("SELECT COUNT(DISTINCT doc_path) AS n FROM chunks;").get() as { n: number } | null;
  return row?.n ?? 0;
}

function deriveSourceName(docPath: string): string {
  return docPath.split("/")[0] ?? "";
}

/** Insert a single embedded chunk into the store. */
export function insertChunk(
  db: Database,
  chunk: RawChunk,
  embedding: Float32Array,
): void {
  const sourceName = chunk.source_name ?? deriveSourceName(chunk.doc_path);
  const insert = db.query(
    "INSERT INTO chunks (doc_path, chunk_index, content, source_name, embedding) VALUES (?, ?, ?, ?, ?);",
  );
  insert.run(chunk.doc_path, chunk.chunk_index, chunk.content, sourceName, encodeVector(embedding));
  const rowid = db.query("SELECT last_insert_rowid() AS id;").get() as { id: number } | null;
  if (rowid === null) return;
  db.query("INSERT INTO chunks_fts (rowid, content, source_name) VALUES (?, ?, ?);").run(
    rowid.id,
    chunk.content,
    sourceName,
  );
}

/** Load all stored chunks with their embeddings for brute-force search. */
export function loadAllChunks(
  db: Database,
): ReadonlyArray<{ doc_path: string; chunk_index: number; content: string; embedding: Float32Array }> {
  const rows = db.query(
    "SELECT doc_path, chunk_index, content, embedding FROM chunks;",
  ).all() as Array<{ doc_path: string; chunk_index: number; content: string; embedding: Buffer }>;
  return rows.map((r) => ({
    doc_path: r.doc_path,
    chunk_index: r.chunk_index,
    content: r.content,
    embedding: decodeVector(r.embedding),
  }));
}

// ---------------------------------------------------------------------------
// Cosine similarity (pure JS, no sqlite-vec)
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two vectors: dot(a,b) / (||a|| * ||b||).
 * Returns 0 when either vector is zero-length.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split a markdown document into chunks on `## ` heading boundaries.
 *
 * - The content under each `## ` heading (including the heading line) forms
 *   one chunk.
 * - Any preamble before the first `## ` heading (often a title `# Foo` plus
 *   intro) forms its own chunk.
 * - Chunks longer than {@link MAX_CHUNK_CHARS} are trimmed to that length
 *   (prefer not to split mid-sentence, but the cap is hard).
 * - Empty (whitespace-only) chunks are dropped as noise; the file-level
 *   minimum ({@link MIN_FILE_CHARS}) is enforced in `docsRebuild`, not here.
 *
 * `doc_path` is stored relative to the corpus root (e.g. "pi/sdk.md").
 */
export function chunkMarkdown(content: string, docPath: string): readonly RawChunk[] {
  const out: RawChunk[] = [];
  const lines = content.split("\n");
  let current: string[] = [];

  const flush = (buf: string[]): void => {
    const text = buf.join("\n").trim();
    if (text.length === 0) return;
    const trimmed = text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) : text;
    out.push({
      doc_path: docPath,
      chunk_index: out.length,
      content: trimmed,
    });
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  flush(current);
  return out;
}

// ---------------------------------------------------------------------------
// Corpus walking
// ---------------------------------------------------------------------------

/** Recursively collect all `.md` files under `root`, skipping MANIFEST.md. */
export function walkMarkdown(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const visit = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const rel = relative(root, full).split(sep).join("/");
        if (!SKIP_FILES.has(rel)) out.push(full);
      }
    }
  };
  visit(root);
  return out;
}

/** List subdirectory names of `root` (the "components" of the corpus). */
export function listComponents(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// ---------------------------------------------------------------------------
// Embedding providers (re-exported from shared module)
// ---------------------------------------------------------------------------

// embed, EmbedFn, voyageEmbed, onnxEmbed, VOYAGE_BATCH_SIZE are imported
// from ../embeddings.js at the top of this file.

// ---------------------------------------------------------------------------
// Tool implementations (callable directly, no pi session required)
// ---------------------------------------------------------------------------

/**
 * `search_docs` core: embed the query, scan all stored chunks, return the
 * top-`limit` by cosine similarity.
 *
 * Empty-state: if the store has no chunks, returns `[]` with a hint on the
 * first result's `doc_path` so the caller can surface it to the model.
 */
export async function searchDocs(
  db: Database,
  query: string,
  limit = 5,
  embedFn: EmbedFn = embed,
): Promise<DocResult[]> {
  const chunks = loadAllChunks(db);
  if (chunks.length === 0) {
    return [
      {
        doc_path: "__hint__",
        chunk_index: -1,
        content: "No documents indexed. Run autodev docs rebuild to index the docs corpus.",
        score: 0,
      },
    ];
  }
  const [queryVec] = await embedFn([query], true);
  if (!queryVec) return [];
  const scored = chunks.map((c) => ({
    doc_path: c.doc_path,
    chunk_index: c.chunk_index,
    content: c.content,
    score: cosineSimilarity(queryVec, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function chunkKey(docPath: string, chunkIndex: number): string {
  return `${docPath}::${chunkIndex}`;
}

export async function hybridSearch(
  db: Database,
  query: string,
  limit: number,
  embedFn: EmbedFn = embed,
): Promise<DocResult[]> {
  const chunks = loadAllChunks(db);
  if (chunks.length === 0) return [];
  const [queryVec] = await embedFn([query], true);
  if (!queryVec) return [];

  const denseResults = chunks
    .map((c) => ({
      doc_path: c.doc_path,
      chunk_index: c.chunk_index,
      content: c.content,
      score: cosineSimilarity(queryVec, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 3);

  const bm25Rows = ftsMatchQuery(db, "chunks_fts", query, limit * 3);
  const bm25Results: DocResult[] = [];
  if (bm25Rows.length > 0) {
    const rowIds = bm25Rows.map((r) => r.rowid);
    const placeholders = rowIds.map(() => "?").join(",");
    const rows = db
      .query(`SELECT id, doc_path, chunk_index, content FROM chunks WHERE id IN (${placeholders});`)
      .all(...rowIds) as Array<{ id: number; doc_path: string; chunk_index: number; content: string }>;
    const chunkMap = new Map<number, (typeof rows)[number]>();
    for (const r of rows) chunkMap.set(r.id, r);
    for (let i = 0; i < bm25Rows.length; i++) {
      const chunk = chunkMap.get(bm25Rows[i]!.rowid);
      if (!chunk) continue;
      bm25Results.push({
        doc_path: chunk.doc_path,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        score: 0,
      });
    }
  }

  const fusionMap = new Map<string, { result: DocResult; score: number }>();
  for (let i = 0; i < denseResults.length; i++) {
    const r = denseResults[i]!;
    const key = chunkKey(r.doc_path, r.chunk_index);
    fusionMap.set(key, { result: r, score: 0.7 / (i + 1) });
  }

  for (let i = 0; i < bm25Results.length; i++) {
    const r = bm25Results[i]!;
    const key = chunkKey(r.doc_path, r.chunk_index);
    const existing = fusionMap.get(key);
    const rankScore = 0.3 / (i + 1);
    if (existing) {
      existing.score += rankScore;
    } else {
      fusionMap.set(key, { result: r, score: rankScore });
    }
  }

  const fused = Array.from(fusionMap.values()).sort((a, b) => b.score - a.score);
  return fused.slice(0, limit).map((f) => f.result);
}

/**
 * `docs_status` core: chunk count, distinct doc count, and the list of
 * subdirectories under the corpus root.
 */
export function docsStatus(db: Database, corpusRoot: string): DocsStatus {
  return {
    chunk_count: countChunks(db),
    doc_count: countDocs(db),
    components: listComponents(corpusRoot),
  };
}

export interface TieredDocsStatus extends DocsStatus {
  readonly db_path: string;
  readonly tier: "central" | "project";
}

export function docsStatusBoth(
  centralDbPath: string,
  projectDbPath: string,
  corpusRoot: string,
): { central: TieredDocsStatus | null; project: TieredDocsStatus } {
  let central: TieredDocsStatus | null = null;
  if (existsSync(centralDbPath)) {
    const db = openVectorStore(centralDbPath);
    try {
      central = {
        ...docsStatus(db, centralCorpusRoot()),
        db_path: centralDbPath,
        tier: "central",
      };
    } finally {
      db.close();
    }
  }
  const projectDb = openVectorStore(projectDbPath);
  let project: TieredDocsStatus;
  try {
    project = {
      ...docsStatus(projectDb, corpusRoot),
      db_path: projectDbPath,
      tier: "project",
    };
  } finally {
    projectDb.close();
  }
  return { central, project };
}

/**
 * `docs_rebuild` core: clear the store, walk `docs-corpus/`, chunk each file,
 * embed in batches, and persist. Returns the total chunk count and any
 * per-file errors (a failed file does not abort the whole rebuild).
 */
export async function docsRebuild(
  db: Database,
  corpusRoot: string,
  embedFn: EmbedFn = embed,
): Promise<RebuildResult> {
  clearChunks(db);
  const files = walkMarkdown(corpusRoot);
  const errors: string[] = [];
  let totalChunks = 0;

  // Collect all chunks first so we can batch the embedding call.
  const allChunks: RawChunk[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf8");
      if (content.trim().length < MIN_FILE_CHARS) continue;
      const rel = relative(corpusRoot, file).split(sep).join("/");
      const chunks = chunkMarkdown(content, rel);
      allChunks.push(...chunks);
    } catch (err) {
      errors.push(`${relative(corpusRoot, file)}: ${(err as Error).message}`);
    }
  }

  // Embed in batches of VOYAGE_BATCH_SIZE to respect API limits. The ONNX
  // fallback also benefits from batching (fewer model calls).
  for (let i = 0; i < allChunks.length; i += VOYAGE_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + VOYAGE_BATCH_SIZE);
    const texts = batch.map((c) => c.content);
    let vectors: Float32Array[];
    try {
      vectors = await embedFn(texts, false);
    } catch (err) {
      errors.push(`embedding batch ${i}: ${(err as Error).message}`);
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      const vec = vectors[j];
      if (!vec) continue;
      insertChunk(db, batch[j]!, vec);
      totalChunks++;
    }
  }

  return { chunks: totalChunks, errors };
}

export interface DocsTierPaths {
  dbPath: string;
  corpusRoot: string;
}

export async function docsRebuildTier(
  tier: "central" | "project",
  embedFn: EmbedFn = embed,
  overrides?: Partial<DocsTierPaths>,
): Promise<RebuildResult> {
  const dbPath = overrides?.dbPath ?? (tier === "central" ? centralDbPath() : defaultDbPath());
  const corpusRoot = overrides?.corpusRoot ?? (tier === "central" ? centralCorpusRoot() : defaultCorpusRoot());
  const db = openVectorStore(dbPath);
  if (tier === "central") {
    const { createCentralDbSchema } = await import("./seeding.js");
    createCentralDbSchema(db);
  }
  let result: RebuildResult;
  try {
    clearChunks(db);
    clearFts(db);
    result = await docsRebuild(db, corpusRoot, embedFn);
  } finally {
    db.close();
  }
  return result;
}

export async function searchDocsBoth(
  query: string,
  limit = 5,
  embedFn: EmbedFn = embed,
  sources: SeedSource[] = [],
  overrides?: Partial<DocsTierPaths>,
): Promise<DocResult[]> {
  const centralDbPathVal = overrides?.dbPath ?? centralDbPath();
  const projectDbPathVal = overrides?.dbPath ?? defaultDbPath();
  const projectCorpusRootVal = overrides?.corpusRoot ?? defaultCorpusRoot();
  const centralDb = existsSync(centralDbPathVal) ? openVectorStore(centralDbPathVal) : null;
  const projectDb = openVectorStore(projectDbPathVal);
  let centralResults: DocResult[] = [];
  let projectResults: DocResult[] = [];

  try {
    if (centralDb) {
      centralResults = await hybridSearch(centralDb, query, limit, embedFn);
    }
    projectResults = await hybridSearch(projectDb, query, limit, embedFn);
  } finally {
    if (centralDb) centralDb.close();
    projectDb.close();
  }

  const fusion = new Map<string, { result: DocResult; score: number }>();
  for (let i = 0; i < centralResults.length; i++) {
    const r = centralResults[i]!;
    const key = `central:${r.doc_path}::${r.chunk_index}`;
    fusion.set(key, {
      result: { ...r, doc_path: `central:${r.doc_path}` },
      score: 0.7 / (i + 1),
    });
  }
  for (let i = 0; i < projectResults.length; i++) {
    const r = projectResults[i]!;
    const key = `project:${r.doc_path}::${r.chunk_index}`;
    const existing = fusion.get(key);
    const rankScore = 0.3 / (i + 1);
    if (existing) {
      existing.score += rankScore;
    } else {
      fusion.set(key, {
        result: { ...r, doc_path: `project:${r.doc_path}` },
        score: rankScore,
      });
    }
  }

  refreshStaleSources(centralDbPath(), sources, embedFn).catch((err) => {
    console.error("[docs] background refresh failed:", err);
  });

  return Array.from(fusion.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((f) => f.result);
}

// ---------------------------------------------------------------------------
// Tool definitions (TypeBox schemas + execute wrappers)
// ---------------------------------------------------------------------------

const SearchDocsParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  limit: Type.Optional(
    Type.Number({ description: "Max results", default: 5 }),
  ),
});
type SearchDocsParams = Static<typeof SearchDocsParams>;

const DocsStatusParams = Type.Object({});

const DocsRebuildParams = Type.Object({
  tier: Type.Union([Type.Literal("central"), Type.Literal("project")], {
    description: "Which tier to rebuild",
  }),
});

/**
 * Build the three docs tools. `deps` carries the DB path, corpus root, and
 * (optionally) an injected embedding function. Returns the tool definitions
 * so they can be registered with `pi.registerTool()` or exercised directly in
 * tests.
 */
export function buildDocsTools(deps: {
  centralDbPath: string;
  centralCorpusRoot: string;
  projectDbPath: string;
  projectCorpusRoot: string;
  embedFn?: EmbedFn;
}): {
  search_docs: ToolDefinition<typeof SearchDocsParams, unknown>;
  docs_status: ToolDefinition<typeof DocsStatusParams, unknown>;
  docs_rebuild: ToolDefinition<typeof DocsRebuildParams, unknown>;
} {
  const embedFn = deps.embedFn ?? embed;

  const search_docs: ToolDefinition<typeof SearchDocsParams, unknown> = {
    name: "search_docs",
    label: "Search Docs",
    description: "Search the docs corpus via semantic embeddings",
    parameters: SearchDocsParams,
    execute: async (_toolCallId, params) => {
      const limit = params.limit ?? 5;
      const results = await searchDocsBoth(params.query, limit, embedFn, [], {
        dbPath: deps.projectDbPath,
        corpusRoot: deps.projectCorpusRoot,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        details: { count: results.length, results },
      };
    },
  };

  const docs_status: ToolDefinition<typeof DocsStatusParams, unknown> = {
    name: "docs_status",
    label: "Docs Status",
    description: "Show docs corpus indexing status",
    parameters: DocsStatusParams,
    execute: async () => {
      const status = docsStatusBoth(deps.centralDbPath, deps.projectDbPath, deps.projectCorpusRoot);
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        details: status,
      };
    },
  };

  const docs_rebuild: ToolDefinition<typeof DocsRebuildParams, unknown> = {
    name: "docs_rebuild",
    label: "Rebuild Docs Index",
    description: "Rebuild the docs corpus index from docs-corpus/",
    parameters: DocsRebuildParams,
    execute: async (_toolCallId, params) => {
      const tier = params.tier;
      if (tier !== "central" && tier !== "project") {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Invalid tier: ${tier}` }) }],
          details: { error: `Invalid tier: ${tier}` },
        };
      }
      const result = await docsRebuildTier(tier, embedFn, {
        dbPath: tier === "project" ? deps.projectDbPath : deps.centralDbPath,
        corpusRoot: tier === "project" ? deps.projectCorpusRoot : deps.centralCorpusRoot,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };

  return { search_docs, docs_status, docs_rebuild };
}

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

/**
 * Register the three docs tools with the pi runtime. The `register` signature
 * stays `(pi: ExtensionAPI) => void` — tools are built lazily on first call
 * so the DB path resolves against the current cwd at call time, not at module
 * load.
 */
export function register(pi: ExtensionAPI): void {
  const cdb = centralDbPath();
  const ccr = centralCorpusRoot();
  const projectDbPath = defaultDbPath();
  const projectCorpusRoot = defaultCorpusRoot();
  const { search_docs, docs_status, docs_rebuild } = buildDocsTools({
    centralDbPath: cdb,
    centralCorpusRoot: ccr,
    projectDbPath,
    projectCorpusRoot,
  });
  pi.registerTool(search_docs);
  pi.registerTool(docs_status);
  pi.registerTool(docs_rebuild);
}

// Re-exported for tests that need to wipe the DB file between runs.
export { rmSync };