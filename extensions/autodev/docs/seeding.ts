/**
 * Seeding framework for the central docs corpus.
 *
 * Pluggable source list → download → chunk → embed.
 *
 * Supported source types:
 *   - `git-sparse`: shallow sparse checkout of a git repo
 *   - `llms-txt`: parse an `llms.txt` index and fetch linked `.md` files
 *   - `llms-full`: fetch a single aggregated `llms-full.txt` / `llms.md`
 *
 * All downloaded/copied markdown is written under the central corpus root
 * (`<agentDir>/../docs-corpus/<targetSubdir>`). After sources finish, the
 * central vector DB is rebuilt with `docsRebuildTier("central", embedFn)`.
 */

import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, copyFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { minimatch } from "minimatch";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { embed, type EmbedFn, VOYAGE_BATCH_SIZE } from "../embeddings.js";
import { chunkMarkdown, docsRebuildTier, insertChunk, walkMarkdown } from "./index.js";

export type { EmbedFn };
export { embed };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single pluggable documentation source. */
export interface SeedSource {
  /** Human-readable source name (used for logging and source_name tagging). */
  name: string;

  /** Source delivery mechanism. */
  type: "git-sparse" | "llms-txt" | "llms-full";

  /** Repository URL (`git-sparse`) or document URL (`llms-*`). */
  url: string;

  /** For `git-sparse`: directory/path inside the repo to sparse-checkout. */
  sparsePath?: string;

  /** Subdirectory under the central corpus root where files are written. */
  targetSubdir: string;

  /** Minimatch patterns applied to file paths; matches are excluded. */
  excludePatterns?: string[];

  /** When false, the source is skipped without error. */
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Central corpus root: `<agentDir>/../docs-corpus`. */
export function centralCorpusRoot(agentDir = getAgentDir()): string {
  return join(agentDir, "..", "docs-corpus");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a relative path to POSIX-style for matching and storage. */
function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/** Check whether `relPath` matches any of the supplied exclude patterns. */
function isExcluded(relPath: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  for (const pattern of patterns) {
    if (minimatch(relPath, pattern, { matchBase: true })) return true;
  }
  return false;
}

/** Recursively copy `.md` files from `srcDir` to `destDir`, applying excludes. */
function copyMdFiles(srcDir: string, destDir: string, excludePatterns?: string[], prefix = ""): string[] {
  const copied: string[] = [];
  const visit = (dir: string, relPrefix: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(full, rel);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const posixRel = toPosix(rel);
        if (isExcluded(posixRel, excludePatterns)) continue;
        const target = join(destDir, rel);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(full, target);
        copied.push(toPosix(join(prefix, posixRel)));
      }
    }
  };
  visit(srcDir, "");
  return copied;
}

/** HTTP fetch with a short timeout; returns text on success or throws. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

/** Minimum file size to index (skip empty / title-only files). */
const MIN_FILE_CHARS = 50;

/** Serialize a Float32Array to a Buffer for BLOB storage. */
function encodeVector(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

// ---------------------------------------------------------------------------
// Source handlers
// ---------------------------------------------------------------------------

/**
 * Sparse-checkout a git repo and copy the requested markdown files into the
 * central corpus. The temporary clone directory is always removed.
 */
async function handleGitSparse(source: SeedSource): Promise<string[]> {
  const url = source.url;
  const sparsePath = source.sparsePath ?? "";
  const tmpDir = mkdtempSync(join(tmpdir(), "autodev-seed-"));

  try {
    // Shallow clone with no checkout, then enable sparse checkout.
    const clone = spawnSync("git", ["clone", "--depth=1", "--no-checkout", url, tmpDir], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (clone.status !== 0) {
      throw new Error(`git clone failed: ${clone.stderr || clone.stdout || "unknown error"}`);
    }

    const sparseInit = spawnSync("git", ["-C", tmpDir, "sparse-checkout", "init", "--cone"], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (sparseInit.status !== 0) {
      throw new Error(`git sparse-checkout init failed: ${sparseInit.stderr || sparseInit.stdout}`);
    }

    const sparseSet = spawnSync("git", ["-C", tmpDir, "sparse-checkout", "set", sparsePath], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (sparseSet.status !== 0) {
      throw new Error(`git sparse-checkout set failed: ${sparseSet.stderr || sparseSet.stdout}`);
    }

    const checkout = spawnSync("git", ["-C", tmpDir, "checkout"], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (checkout.status !== 0) {
      throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
    }

    const srcDir = sparsePath ? join(tmpDir, sparsePath) : tmpDir;
    if (!existsSync(srcDir)) {
      throw new Error(`sparse path not found in checkout: ${sparsePath}`);
    }

    const destDir = join(centralCorpusRoot(), source.targetSubdir);
    mkdirSync(destDir, { recursive: true });
    return copyMdFiles(srcDir, destDir, source.excludePatterns, source.targetSubdir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Parse an `llms.txt` file, fetch each linked `.md` file, and write it under
 * the target subdirectory. Relative links are resolved against the base URL.
 */
async function handleLlmsTxt(source: SeedSource): Promise<string[]> {
  const baseUrl = source.url;
  const indexText = await fetchText(baseUrl);

  // Markdown link pattern: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const mdUrls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(indexText)) !== null) {
    const href = match[2];
    if (href !== undefined && href.endsWith(".md")) {
      mdUrls.push(new URL(href, baseUrl).toString());
    }
  }

  const destDir = join(centralCorpusRoot(), source.targetSubdir);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];

  for (const mdUrl of mdUrls) {
    try {
      const text = await fetchText(mdUrl);
      const parsed = new URL(mdUrl);
      const fileName = basename(parsed.pathname) || "doc.md";
      const rel = toPosix(join(source.targetSubdir, fileName));
      if (isExcluded(rel, source.excludePatterns)) continue;
      const target = join(destDir, fileName);
      writeFileSync(target, text, "utf8");
      written.push(rel);
    } catch (err) {
      // Per-source failures are collected outside; rethrow so the caller
      // can record this URL as an error and continue with the next source.
      throw new Error(`llms-txt fetch ${mdUrl}: ${(err as Error).message}`);
    }
  }

  return written;
}

/**
 * Fetch or read a single aggregated docs file (`llms-full.txt` / `llms.md`)
 * and write it as `full-docs.md` under the target subdirectory.
 */
async function handleLlmsFull(source: SeedSource): Promise<string[]> {
  let text: string;
  const url = source.url;

  if (url.startsWith("file://")) {
    text = readFileSync(url.slice(7), "utf8");
  } else if (url.startsWith("http://") || url.startsWith("https://")) {
    text = await fetchText(url);
  } else {
    throw new Error(`llms-full url must be http(s):// or file://: ${url}`);
  }

  const destDir = join(centralCorpusRoot(), source.targetSubdir);
  mkdirSync(destDir, { recursive: true });
  const target = join(destDir, "full-docs.md");
  writeFileSync(target, text, "utf8");
  return [toPosix(join(source.targetSubdir, "full-docs.md"))];
}

// ---------------------------------------------------------------------------
// Fingerprint helpers for refresh
// ---------------------------------------------------------------------------

async function getCurrentFingerprint(
  source: SeedSource,
): Promise<{ ok: true; fingerprint: string } | { ok: false; error: string }> {
  switch (source.type) {
    case "git-sparse": {
      const res = spawnSync("git", ["ls-remote", source.url, "HEAD"], {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
      if (res.status !== 0) {
        return { ok: false, error: `git ls-remote failed: ${res.stderr || res.stdout || "unknown error"}` };
      }
      const line = res.stdout.trim().split("\n")[0];
      if (!line) return { ok: false, error: "git ls-remote returned empty output" };
      const hash = line.split("\t")[0];
      if (!hash) return { ok: false, error: "git ls-remote output missing hash" };
      return { ok: true, fingerprint: hash };
    }
    case "llms-txt":
    case "llms-full": {
      if (source.url.startsWith("file://")) {
        try {
          const data = readFileSync(source.url.slice(7));
          const hash = createHash("sha256").update(data).digest("hex");
          return { ok: true, fingerprint: hash };
        } catch (e) {
          return { ok: false, error: `file hash failed: ${(e as Error).message}` };
        }
      }
      try {
        const res = await fetch(source.url, { method: "HEAD", signal: AbortSignal.timeout(60000) });
        const etag = res.headers.get("etag") ?? res.headers.get("Last-Modified");
        if (!etag) return { ok: false, error: "no ETag or Last-Modified header" };
        return { ok: true, fingerprint: etag };
      } catch (e) {
        return { ok: false, error: `HEAD failed: ${(e as Error).message}` };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply the central-DB schema on top of the base vector-store schema.
 *
 * - Enables WAL mode and a busy timeout for safe concurrent readers/writers.
 * - Creates the `seed_metadata` table used by the lazy refresh pipeline.
 * - Ensures the `chunks` table has a `source_name` column (added safely if
 *   missing on older DBs).
 */
export function createCentralDbSchema(db: Database): void {
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS seed_metadata (
      source_name TEXT PRIMARY KEY,
      last_seeded_at TEXT NOT NULL,
      commit_hash TEXT,
      etag TEXT,
      active INTEGER NOT NULL DEFAULT 0
    );
  `);

  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks';").all() as Array<{ name: string }>;
  if (tables.length === 0) return;

  const info = db.query("PRAGMA table_info(chunks);").all() as Array<{ name: string; notnull: number }>;
  if (!info.some((col) => col.name === "source_name")) {
    db.exec("ALTER TABLE chunks ADD COLUMN source_name TEXT NOT NULL DEFAULT '';");
  }
  db.exec("UPDATE chunks SET source_name = '' WHERE source_name IS NULL;");
}

/**
 * Download or copy the files for a single configured source into the central
 * corpus. Does not rebuild the vector DB — callers that want a full refresh
 * should follow this with `rebuildSource()`.
 */
export async function seedOneSource(
  source: SeedSource,
  _embedFn: EmbedFn,
): Promise<{ ok: boolean; error?: string }> {
  if (source.active === false) return { ok: true };

  try {
    switch (source.type) {
      case "git-sparse": {
        await handleGitSparse(source);
        break;
      }
      case "llms-txt": {
        await handleLlmsTxt(source);
        break;
      }
      case "llms-full": {
        await handleLlmsFull(source);
        break;
      }
      default: {
        // Exhaustiveness guard — TypeScript narrows this away at compile time.
        const _exhaustive: never = source.type;
        return { ok: false, error: `${source.name}: unsupported source type ${_exhaustive}` };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `${source.name}: ${(err as Error).message}` };
  }
}

/**
 * Rebuild the vector index for a single source in-place.
 *
 * Deletes all chunks (and their FTS5 rows) tagged with `source_name`, then
 * re-chunks every `.md` file under `join(corpusRoot, sourceName)` and inserts
 * them into both `chunks` and `chunks_fts`. Returns the number of chunks
 * inserted.
 */
export async function rebuildSource(
  db: Database,
  sourceName: string,
  corpusRoot: string,
  embedFn: EmbedFn,
): Promise<number> {
  const rows = db.query("SELECT id FROM chunks WHERE source_name = ?;").all(sourceName) as Array<{ id: number }>;
  const ids = rows.map((r) => r.id);

  db.query("DELETE FROM chunks WHERE source_name = ?;").run(sourceName);
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    db.query(`DELETE FROM chunks_fts WHERE rowid IN (${placeholders});`).run(...ids);
  }

  const sourceDir = join(corpusRoot, sourceName);
  if (!existsSync(sourceDir)) return 0;

  const files = walkMarkdown(sourceDir);
  const allChunks: { doc_path: string; chunk_index: number; content: string; source_name: string }[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (content.trim().length < MIN_FILE_CHARS) continue;
    const rel = relative(corpusRoot, file).split(sep).join("/");
    const chunks = chunkMarkdown(content, rel);
    for (const c of chunks) {
      allChunks.push({ doc_path: c.doc_path, chunk_index: c.chunk_index, content: c.content, source_name: sourceName });
    }
  }

  let total = 0;
  for (let i = 0; i < allChunks.length; i += VOYAGE_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + VOYAGE_BATCH_SIZE);
    const texts = batch.map((c) => c.content);
    const vectors = await embedFn(texts, false);
    for (let j = 0; j < batch.length; j++) {
      const vec = vectors[j];
      if (!vec) continue;
      insertChunk(db, batch[j]!, vec);
      total++;
    }
  }

  return total;
}

/**
 * Return the names of sources that are stale according to the central
 * `seed_metadata` table and the configured `active` flag.
 *
 * - Active sources are stale after 7 days.
 * - Inactive sources are stale after 30 days.
 * - A missing metadata row is always stale.
 * - Config `active` is the source of truth, not the DB column.
 */
export async function checkStaleSources(centralDbPath: string, sources: SeedSource[]): Promise<string[]> {
  if (sources.length === 0) return [];
  mkdirSync(dirname(centralDbPath), { recursive: true });
  const db = new Database(centralDbPath, { create: true });
  try {
    createCentralDbSchema(db);
    const stale: string[] = [];
    for (const source of sources) {
      const row = db
        .query("SELECT last_seeded_at FROM seed_metadata WHERE source_name = ?;")
        .get(source.name) as { last_seeded_at: string } | null;
      if (!row) {
        stale.push(source.name);
        continue;
      }
      const last = new Date(row.last_seeded_at);
      if (Number.isNaN(last.getTime())) {
        stale.push(source.name);
        continue;
      }
      const days = source.active !== false ? 7 : 30;
      const intervalMs = days * 24 * 60 * 60 * 1000;
      if (Date.now() - last.getTime() > intervalMs) {
        stale.push(source.name);
      }
    }
    return stale;
  } finally {
    db.close();
  }
}

/**
 * Refresh stale central sources in a single pass.
 *
 * For each stale source, the current upstream fingerprint is computed
 * (git HEAD for `git-sparse`, HTTP ETag/Last-Modified for network `llms-*`,
 * SHA-256 for `file://`). If the fingerprint matches the stored value, only
 * `last_seeded_at` is updated. Otherwise the source files are re-fetched and
 * the source's chunks/FTS index are rebuilt in place.
 */
export async function refreshStaleSources(
  centralDbPath: string,
  sources: SeedSource[],
  embedFn: EmbedFn,
): Promise<{ seeded: string[]; skipped: string[]; errors: string[] }> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const stale = await checkStaleSources(centralDbPath, sources);
  if (stale.length === 0) return { seeded, skipped, errors };

  const db = new Database(centralDbPath, { create: true });
  try {
    const baseTables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks';").all() as Array<{ name: string }>;
    if (baseTables.length === 0) {
      const { openVectorStore } = await import("./index.js");
      const vs = openVectorStore(centralDbPath);
      try {
        createCentralDbSchema(vs);
      } finally {
        vs.close();
      }
    } else {
      createCentralDbSchema(db);
    }
    const upsert = db.query(
      "INSERT OR REPLACE INTO seed_metadata (source_name, last_seeded_at, commit_hash, etag, active) VALUES (?, ?, ?, ?, ?);",
    );

    for (const source of sources) {
      if (!stale.includes(source.name)) continue;

      const current = await getCurrentFingerprint(source);
      if (!current.ok) {
        errors.push(`${source.name}: ${current.error}`);
        continue;
      }

      const stored = db
        .query("SELECT commit_hash, etag FROM seed_metadata WHERE source_name = ?;")
        .get(source.name) as { commit_hash: string | null; etag: string | null } | null;
      const storedHash = stored?.commit_hash ?? stored?.etag ?? undefined;
      const now = new Date().toISOString();

      if (storedHash !== undefined && storedHash === current.fingerprint) {
        upsert.run(source.name, now, stored?.commit_hash ?? null, stored?.etag ?? null, source.active !== false ? 1 : 0);
        skipped.push(source.name);
        continue;
      }

      const seedResult = await seedOneSource(source, embedFn);
      if (!seedResult.ok) {
        errors.push(seedResult.error ?? `${source.name}: seed failed`);
        continue;
      }

      const corpusRoot = centralCorpusRoot();
      await rebuildSource(db, source.name, corpusRoot, embedFn);

      const commitHash = source.type === "git-sparse" ? current.fingerprint : null;
      const etag = source.type !== "git-sparse" ? current.fingerprint : null;
      upsert.run(source.name, now, commitHash, etag, source.active !== false ? 1 : 0);
      seeded.push(source.name);
    }
  } finally {
    db.close();
  }

  return { seeded, skipped, errors };
}

/**
 * Seed the central docs corpus from the configured sources and rebuild the
 * central vector DB.
 *
 * Partial failures are collected in `errors` but do not abort seeding; any
 * sources that succeeded still contribute to the final rebuild.
 */
export async function seedCentralDocs(
  sources: SeedSource[],
  embedFn: EmbedFn = embed,
): Promise<{ chunks: number; errors: string[] }> {
  const errors: string[] = [];

  for (const source of sources) {
    if (source.active === false) continue;

    try {
      switch (source.type) {
        case "git-sparse": {
          await handleGitSparse(source);
          break;
        }
        case "llms-txt": {
          await handleLlmsTxt(source);
          break;
        }
        case "llms-full": {
          await handleLlmsFull(source);
          break;
        }
        default: {
          // Exhaustiveness guard — TypeScript narrows this away at compile time.
          const _exhaustive: never = source.type;
          errors.push(`${source.name}: unsupported source type ${_exhaustive}`);
        }
      }
    } catch (err) {
      errors.push(`${source.name}: ${(err as Error).message}`);
    }
  }

  const rebuild = await docsRebuildTier("central", embedFn);
  return { chunks: rebuild.chunks, errors: [...errors, ...rebuild.errors] };
}
