/**
 * T11 docs query system tests.
 *
 * Drives the pure functions (`chunkMarkdown`, `cosineSimilarity`,
 * `searchDocs`, `docsStatus`, `docsRebuild`) and the tool wrappers directly
 * with the deterministic mock embedding fixture — no network, no VoyageAI,
 * no ONNX model download.
 *
 * Each test plants a temp corpus + DB and tears it down afterwards.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import {
  buildDocsTools,
  chunkMarkdown,
  clearChunks,
  cosineSimilarity,
  countChunks,
  countDocs,
  defaultCorpusRoot,
  defaultDbPath,
  docsRebuild,
  docsStatus,
  insertChunk,
  loadAllChunks,
  openVectorStore,
  searchDocs,
  walkMarkdown,
  listComponents,
  type RawChunk,
} from "../extensions/autodev/docs/index.js";
import { mockEmbed, mockEmbedFn } from "./mocks/embeddings.js";

// ---------------------------------------------------------------------------
// Temp project root per test
// ---------------------------------------------------------------------------

let root: string;
let dbPath: string;
let corpusRoot: string;

function setupRoot(): string {
  root = mkdtempSync(join(tmpdir(), "autodev-docs-"));
  // Simulate `.autodev/embeddings/` under the temp root.
  dbPath = join(root, ".autodev", "embeddings", "vectors.db");
  corpusRoot = join(root, "docs-corpus");
  mkdirSync(corpusRoot, { recursive: true });
  return root;
}

function teardownRoot(): void {
  rmSync(root, { recursive: true, force: true });
}

beforeEach(setupRoot);
afterEach(teardownRoot);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a small markdown file into the temp corpus. */
function writeCorpusFile(rel: string, content: string): string {
  const full = join(corpusRoot, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
  return full;
}

// ---------------------------------------------------------------------------
// 1. Schema creation
// ---------------------------------------------------------------------------

test("openVectorStore creates the chunks table and the doc_path index", () => {
  const db = openVectorStore(dbPath);
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table';")
    .all() as Array<{ name: string }>;
  expect(tables.map((t) => t.name)).toContain("chunks");

  const indexes = db
    .query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='chunks';")
    .all() as Array<{ name: string }>;
  expect(indexes.map((i) => i.name)).toContain("idx_chunks_doc_path");
  db.close();
});

test("openVectorStore creates the parent directory if it does not exist", () => {
  // dbPath is under root/.autodev/embeddings which does not exist yet.
  expect(existsSync(join(root, ".autodev", "embeddings"))).toBe(false);
  const db = openVectorStore(dbPath);
  expect(existsSync(join(root, ".autodev", "embeddings"))).toBe(true);
  db.close();
});

// ---------------------------------------------------------------------------
// 2. docs_rebuild: ingestion
// ---------------------------------------------------------------------------

test("docsRebuild ingests a small corpus and returns the chunk count", async () => {
  writeCorpusFile(
    "pi/sdk.md",
    [
      "# Pi SDK",
      "",
      "## Overview",
      "",
      "The SDK exposes createAgentSession and SessionManager for embedding pi.",
      "",
      "## Events",
      "",
      "Sessions emit agent_start, turn_start, tool_execution_start events.",
    ].join("\n"),
  );
  writeCorpusFile(
    "omo/readme.md",
    [
      "# Omo",
      "",
      "## What is Omo",
      "",
      "Omo is an orchestration layer for coding agents built on pi.",
    ].join("\n"),
  );

  const db = openVectorStore(dbPath);
  const result = await docsRebuild(db, corpusRoot, mockEmbedFn);
  expect(result.errors).toEqual([]);
  expect(result.chunks).toBeGreaterThan(0);
  expect(countChunks(db)).toBe(result.chunks);
  db.close();
});

test("docsRebuild clears existing chunks before re-ingesting", async () => {
  const file = writeCorpusFile(
    "pi/a.md",
    "## Alpha\nThis is the alpha section with enough text to pass the minimum.",
  );
  void file;
  const db = openVectorStore(dbPath);

  // First rebuild.
  const r1 = await docsRebuild(db, corpusRoot, mockEmbedFn);
  // Add a second file, then rebuild — old chunks must be replaced, not appended.
  writeCorpusFile(
    "pi/b.md",
    "## Beta\nThis is the beta section with enough text to pass the minimum.",
  );
  const r2 = await docsRebuild(db, corpusRoot, mockEmbedFn);

  // The total chunk count after rebuild 2 should equal the chunks in the DB
  // (i.e. no leftover chunks from rebuild 1).
  expect(countChunks(db)).toBe(r2.chunks);
  expect(r2.chunks).toBeGreaterThan(r1.chunks);
  db.close();
});

test("docsRebuild skips MANIFEST.md at the corpus root", async () => {
  writeCorpusFile(
    "pi/sdk.md",
    "## SDK\nReal content with enough characters to be indexed properly here.",
  );
  writeFileSync(
    join(corpusRoot, "MANIFEST.md"),
    "# Manifest\nThis is metadata, not content, and should be skipped.",
    "utf8",
  );
  const db = openVectorStore(dbPath);
  const result = await docsRebuild(db, corpusRoot, mockEmbedFn);
  expect(result.errors).toEqual([]);
  const chunks = loadAllChunks(db);
  expect(chunks.every((c) => c.doc_path !== "MANIFEST.md")).toBe(true);
  db.close();
});

// ---------------------------------------------------------------------------
// 3. docs_status
// ---------------------------------------------------------------------------

test("docsStatus returns chunk count, doc count, and components", async () => {
  writeCorpusFile(
    "pi/a.md",
    "## A\nContent for A with enough characters to be indexed.",
  );
  writeCorpusFile(
    "omo/b.md",
    "## B\nContent for B with enough characters to be indexed.",
  );
  const db = openVectorStore(dbPath);
  await docsRebuild(db, corpusRoot, mockEmbedFn);
  const status = docsStatus(db, corpusRoot);
  expect(status.chunk_count).toBeGreaterThan(0);
  expect(status.doc_count).toBe(2);
  expect(status.components).toEqual(["omo", "pi"]);
  db.close();
});

test("docsStatus lists components even when DB is empty", () => {
  writeCorpusFile("pi/.keep", ""); // creates the dir
  mkdirSync(join(corpusRoot, "aikido"), { recursive: true });
  const db = openVectorStore(dbPath);
  const status = docsStatus(db, corpusRoot);
  expect(status.chunk_count).toBe(0);
  expect(status.doc_count).toBe(0);
  expect(status.components).toEqual(["aikido", "pi"]);
  db.close();
});

// ---------------------------------------------------------------------------
// 4. search_docs: ranked results
// ---------------------------------------------------------------------------

test("searchDocs returns ranked results with similarity scores", async () => {
  // Two files whose content differs enough to produce distinct mock vectors.
  writeCorpusFile(
    "pi/sdk.md",
    "## SDK\ncreateAgentSession SessionManager embedding pi runtime events.",
  );
  writeCorpusFile(
    "omo/orchestration.md",
    "## Orchestration\nsubagent task delegation parallel crew dispatch.",
  );
  const db = openVectorStore(dbPath);
  await docsRebuild(db, corpusRoot, mockEmbedFn);

  // A query that shares char codes with the SDK chunk should rank it first.
  const results = await searchDocs(db, "createAgentSession SDK", 5, mockEmbedFn);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]!.score).toBeGreaterThan(0);
  // Scores are sorted descending.
  for (let i = 1; i < results.length; i++) {
    expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
  }
  db.close();
});

test("searchDocs respects the limit parameter", async () => {
  writeCorpusFile(
    "pi/a.md",
    "## A\ncreateAgentSession createAgentSession createAgentSession content.",
  );
  writeCorpusFile(
    "pi/b.md",
    "## B\ncreateAgentSession createAgentSession createAgentSession content.",
  );
  writeCorpusFile(
    "pi/c.md",
    "## C\ncreateAgentSession createAgentSession createAgentSession content.",
  );
  const db = openVectorStore(dbPath);
  await docsRebuild(db, corpusRoot, mockEmbedFn);
  const results = await searchDocs(db, "createAgentSession", 2, mockEmbedFn);
  expect(results.length).toBe(2);
  db.close();
});

// ---------------------------------------------------------------------------
// 5. search_docs on empty DB
// ---------------------------------------------------------------------------

test("searchDocs on empty DB returns a hint result", async () => {
  const db = openVectorStore(dbPath);
  const results = await searchDocs(db, "anything", 5, mockEmbedFn);
  expect(results.length).toBe(1);
  expect(results[0]!.doc_path).toBe("__hint__");
  expect(results[0]!.content).toContain("No documents indexed");
  db.close();
});

// ---------------------------------------------------------------------------
// 6. Cosine similarity properties
// ---------------------------------------------------------------------------

test("cosineSimilarity: identical vectors -> 1.0", () => {
  const v = mockEmbed("hello world");
  expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
});

test("cosineSimilarity: zero vectors -> 0.0", () => {
  const a = new Float32Array(8);
  const b = new Float32Array(8);
  expect(cosineSimilarity(a, b)).toBe(0);
});

test("cosineSimilarity is symmetric", () => {
  const a = mockEmbed("alpha");
  const b = mockEmbed("beta");
  expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 5);
});

test("cosineSimilarity: a vector and its negative -> -1.0", () => {
  const a = mockEmbed("abc");
  const b = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) b[i] = -a[i]!;
  expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
});

// ---------------------------------------------------------------------------
// 7. Chunking strategy
// ---------------------------------------------------------------------------

test("chunkMarkdown splits on ## headings", () => {
  const content = [
    "# Title",
    "",
    "Intro paragraph before any heading.",
    "",
    "## First Section",
    "",
    "Content of the first section.",
    "",
    "## Second Section",
    "",
    "Content of the second section.",
  ].join("\n");
  const chunks = chunkMarkdown(content, "test/doc.md");
  // Preamble + 2 sections.
  expect(chunks.length).toBe(3);
  expect(chunks[1]!.content).toContain("## First Section");
  expect(chunks[2]!.content).toContain("## Second Section");
});

test("chunkMarkdown assigns sequential chunk_index starting at 0", () => {
  const content = "## A\none\n## B\ntwo\n## C\nthree";
  const chunks = chunkMarkdown(content, "doc.md");
  expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1, 2]);
});

test("chunkMarkdown trims chunks longer than MAX_CHUNK_CHARS", () => {
  const long = "x".repeat(2000);
  const content = `## Big\n${long}`;
  const chunks = chunkMarkdown(content, "doc.md");
  expect(chunks.length).toBe(1);
  expect(chunks[0]!.content.length).toBeLessThanOrEqual(1000);
});

test("chunkMarkdown produces a chunk even for short content (min is file-level)", () => {
  const content = "## tiny\nhi"; // < 50 chars, but chunking does not enforce the file min
  const chunks = chunkMarkdown(content, "doc.md");
  expect(chunks.length).toBe(1);
});

test("chunkMarkdown stores doc_path relative to corpus root", () => {
  const chunks = chunkMarkdown("## H\nenough content to pass the minimum threshold.", "pi/sdk.md");
  expect(chunks[0]!.doc_path).toBe("pi/sdk.md");
});

// ---------------------------------------------------------------------------
// 8. Tool execute functions (direct invocation, no pi session)
// ---------------------------------------------------------------------------

test("buildDocsTools returns three tools with the correct names", () => {
  const tools = buildDocsTools({ dbPath, corpusRoot, embedFn: mockEmbedFn });
  expect(tools.search_docs.name).toBe("search_docs");
  expect(tools.docs_status.name).toBe("docs_status");
  expect(tools.docs_rebuild.name).toBe("docs_rebuild");
});

test("docs_status tool execute returns the status payload", async () => {
  writeCorpusFile(
    "pi/sdk.md",
    "## SDK\nReal content with enough characters to be indexed properly here.",
  );
  const tools = buildDocsTools({ dbPath, corpusRoot, embedFn: mockEmbedFn });
  const res = await tools.docs_status.execute("tc1", {} as never, undefined, undefined, undefined as never);
  const details = res.details as { chunk_count: number; doc_count: number; components: string[] };
  expect(details.chunk_count).toBe(0); // not rebuilt yet
  expect(details.components).toEqual(["pi"]);
});

test("docs_rebuild tool execute ingests and returns chunk count", async () => {
  writeCorpusFile(
    "pi/sdk.md",
    "## SDK\nReal content with enough characters to be indexed properly here.",
  );
  const tools = buildDocsTools({ dbPath, corpusRoot, embedFn: mockEmbedFn });
  const res = await tools.docs_rebuild.execute("tc1", {} as never, undefined, undefined, undefined as never);
  const details = res.details as { chunks: number; errors: string[] };
  expect(details.chunks).toBeGreaterThan(0);
  expect(details.errors).toEqual([]);
});

test("search_docs tool execute returns ranked results after rebuild", async () => {
  writeCorpusFile(
    "pi/sdk.md",
    "## SDK\ncreateAgentSession SessionManager embedding pi runtime.",
  );
  const tools = buildDocsTools({ dbPath, corpusRoot, embedFn: mockEmbedFn });
  await tools.docs_rebuild.execute("tc1", {} as never, undefined, undefined, undefined as never);
  const res = await tools.search_docs.execute(
    "tc1",
    { query: "createAgentSession", limit: 5 } as never,
    undefined,
    undefined,
    undefined as never,
  );
  const details = res.details as { count: number; results: RawChunk[] };
  expect(details.count).toBeGreaterThan(0);
});

test("search_docs tool execute on empty DB returns the hint", async () => {
  const tools = buildDocsTools({ dbPath, corpusRoot, embedFn: mockEmbedFn });
  const res = await tools.search_docs.execute(
    "tc1",
    { query: "anything" } as never,
    undefined,
    undefined,
    undefined as never,
  );
  const details = res.details as { count: number; results: Array<{ doc_path: string }> };
  expect(details.results[0]!.doc_path).toBe("__hint__");
});

// ---------------------------------------------------------------------------
// 9. Vector round-trip (encode/decode)
// ---------------------------------------------------------------------------

test("insertChunk + loadAllChunks round-trips the embedding", async () => {
  const db = openVectorStore(dbPath);
  const chunk: RawChunk = {
    doc_path: "pi/x.md",
    chunk_index: 0,
    content: "test content",
  };
  const vec = mockEmbed("test content");
  insertChunk(db, chunk, vec);
  const loaded = loadAllChunks(db);
  expect(loaded.length).toBe(1);
  expect(loaded[0]!.doc_path).toBe("pi/x.md");
  expect(loaded[0]!.embedding.length).toBe(vec.length);
  for (let i = 0; i < vec.length; i++) {
    expect(loaded[0]!.embedding[i]).toBeCloseTo(vec[i]!, 5);
  }
  db.close();
});

test("clearChunks empties the table", () => {
  const db = openVectorStore(dbPath);
  insertChunk(db, { doc_path: "a.md", chunk_index: 0, content: "x" }, mockEmbed("x"));
  expect(countChunks(db)).toBe(1);
  clearChunks(db);
  expect(countChunks(db)).toBe(0);
  db.close();
});

// ---------------------------------------------------------------------------
// 10. Corpus walking
// ---------------------------------------------------------------------------

test("walkMarkdown recursively collects .md files and skips MANIFEST.md", () => {
  writeCorpusFile("pi/a.md", "# A");
  writeCorpusFile("omo/sub/b.md", "# B");
  writeFileSync(join(corpusRoot, "MANIFEST.md"), "# Manifest", "utf8");
  const files = walkMarkdown(corpusRoot).map((f) => f.replace(corpusRoot + "/", ""));
  expect(files).toContain("pi/a.md");
  expect(files).toContain("omo/sub/b.md");
  expect(files).not.toContain("MANIFEST.md");
});

test("walkMarkdown returns empty for a missing root", () => {
  expect(walkMarkdown(join(root, "nope"))).toEqual([]);
});

test("listComponents returns sorted subdirectory names", () => {
  mkdirSync(join(corpusRoot, "zeta"), { recursive: true });
  mkdirSync(join(corpusRoot, "alpha"), { recursive: true });
  expect(listComponents(corpusRoot)).toEqual(["alpha", "zeta"]);
});

// ---------------------------------------------------------------------------
// 11. Default paths
// ---------------------------------------------------------------------------

test("defaultDbPath resolves to .autodev/embeddings/vectors.db", () => {
  const p = defaultDbPath("/tmp/fake-cwd");
  expect(p).toBe(join("/tmp/fake-cwd", ".autodev", "embeddings", "vectors.db"));
});

test("defaultCorpusRoot resolves to docs-corpus under cwd", () => {
  const p = defaultCorpusRoot("/tmp/fake-cwd");
  expect(p).toBe(join("/tmp/fake-cwd", "docs-corpus"));
});