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

/** Maximum characters per chunk (trimmed on heading boundaries when possible). */
const MAX_CHUNK_CHARS = 1000;

/** Minimum file size to index (skip empty / title-only files). */
const MIN_FILE_CHARS = 50;

/** Files at the corpus root that are metadata, not content. */
const SKIP_FILES = new Set<string>(["MANIFEST.md"]);

/** VoyageAI batch size (requests are batched to reduce round trips). */
const VOYAGE_BATCH_SIZE = 20;

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
}

/** Injectable embedding function. Tests pass a deterministic mock. */
export type EmbedFn = (texts: string[], isQuery?: boolean) => Promise<Float32Array[]>;

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
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_path ON chunks(doc_path);
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

/** Insert a single embedded chunk into the store. */
export function insertChunk(
  db: Database,
  chunk: RawChunk,
  embedding: Float32Array,
): void {
  db.query(
    "INSERT INTO chunks (doc_path, chunk_index, content, embedding) VALUES (?, ?, ?, ?);",
  ).run(chunk.doc_path, chunk.chunk_index, chunk.content, encodeVector(embedding));
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
// Embedding providers
// ---------------------------------------------------------------------------

/**
 * VoyageAI embedding provider. Requires `VOYAGE_API_KEY`. Uses `voyage-3`
 * (best for code/technical docs). Batches requests to stay under API limits.
 * Input type "document" is used for corpus ingestion; "query" for searches.
 */
export async function voyageEmbed(
  texts: string[],
  isQuery = false,
): Promise<Float32Array[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH_SIZE) {
    const batch = texts.slice(i, i + VOYAGE_BATCH_SIZE);
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "voyage-3",
        input: batch,
        input_type: isQuery ? "query" : "document",
      }),
    });
    if (!res.ok) {
      throw new Error(`VoyageAI embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    for (const item of json.data) {
      out.push(new Float32Array(item.embedding));
    }
  }
  return out;
}

/**
 * Local ONNX embedding provider using `@xenova/transformers` with the
 * `Xenova/all-MiniLM-L6-v2` model (384-dimensional). The model downloads on
 * first use (~90MB). Used as a fallback when `VOYAGE_API_KEY` is unset.
 *
 * The transformers import is dynamic so the (heavy) dependency is only loaded
 * when actually needed — tests never hit this path.
 */
export async function onnxEmbed(texts: string[]): Promise<Float32Array[]> {
  // Lazy import — keeps the module load cheap and lets tests inject a mock
  // without pulling the transformers runtime into the test process.
  const mod = (await import("@xenova/transformers")) as {
    pipeline: (task: string, model: string) => Promise<{
      featureExtraction: (
        texts: string[],
        opts: { pooling: string; normalize: boolean },
      ) => Promise<{ tolist: () => number[][] }>;
    }>;
  };
  const extractor = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const output = await extractor.featureExtraction(texts, { pooling: "mean", normalize: true });
  return output.tolist().map((v) => new Float32Array(v));
}

/**
 * Unified embedding entrypoint: VoyageAI when the key is present, ONNX
 * otherwise. The `isQuery` flag is forwarded to VoyageAI (it is ignored by
 * the ONNX fallback, which uses a single encoder).
 */
export async function embed(texts: string[], isQuery = false): Promise<Float32Array[]> {
  if (process.env.VOYAGE_API_KEY) {
    return voyageEmbed(texts, isQuery);
  }
  return onnxEmbed(texts);
}

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

const DocsRebuildParams = Type.Object({});

/**
 * Build the three docs tools. `deps` carries the DB path, corpus root, and
 * (optionally) an injected embedding function. Returns the tool definitions
 * so they can be registered with `pi.registerTool()` or exercised directly in
 * tests.
 */
export function buildDocsTools(deps: {
  dbPath: string;
  corpusRoot: string;
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
      const db = openVectorStore(deps.dbPath);
      try {
        const limit = params.limit ?? 5;
        const results = await searchDocs(db, params.query, limit, embedFn);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          details: { count: results.length, results },
        };
      } finally {
        db.close();
      }
    },
  };

  const docs_status: ToolDefinition<typeof DocsStatusParams, unknown> = {
    name: "docs_status",
    label: "Docs Status",
    description: "Show docs corpus indexing status",
    parameters: DocsStatusParams,
    execute: async () => {
      const db = openVectorStore(deps.dbPath);
      try {
        const status = docsStatus(db, deps.corpusRoot);
        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
          details: status,
        };
      } finally {
        db.close();
      }
    },
  };

  const docs_rebuild: ToolDefinition<typeof DocsRebuildParams, unknown> = {
    name: "docs_rebuild",
    label: "Rebuild Docs Index",
    description: "Rebuild the docs corpus index from docs-corpus/",
    parameters: DocsRebuildParams,
    execute: async () => {
      const db = openVectorStore(deps.dbPath);
      try {
        const result = await docsRebuild(db, deps.corpusRoot, embedFn);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      } finally {
        db.close();
      }
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
  const dbPath = defaultDbPath();
  const corpusRoot = defaultCorpusRoot();
  const { search_docs, docs_status, docs_rebuild } = buildDocsTools({ dbPath, corpusRoot });
  pi.registerTool(search_docs);
  pi.registerTool(docs_status);
  pi.registerTool(docs_rebuild);
}

// Re-exported for tests that need to wipe the DB file between runs.
export { rmSync };