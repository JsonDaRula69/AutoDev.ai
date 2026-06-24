/**
 * T12 lazy refresh tests.
 *
 * Verifies the central-DB schema, per-source seed/rebuild, stale detection,
 * and conditional refresh using local file:// sources only — no network.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";

import {
  centralCorpusRoot,
  createCentralDbSchema,
  rebuildSource,
  refreshStaleSources,
  seedOneSource,
  checkStaleSources,
  type SeedSource,
} from "../seeding.js";
import { openVectorStore } from "../index.js";
import { mockEmbedFn } from "../../../../test/mocks/embeddings.js";

let root: string;
let agentDir: string;
let savedAgentDir: string | undefined;

function setAgentDir(dir: string): void {
  savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
}

function restoreAgentDir(): void {
  if (savedAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = savedAgentDir;
  }
  savedAgentDir = undefined;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "autodev-refresh-"));
  agentDir = join(root, "agent");
  mkdirSync(agentDir, { recursive: true });
  setAgentDir(agentDir);
});

afterEach(() => {
  restoreAgentDir();
  rmSync(root, { recursive: true, force: true });
});

function fileUrl(p: string): string {
  return `file://${p}`;
}

function fileHash(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function source(name: string, url: string): SeedSource {
  return { name, type: "llms-full", url, targetSubdir: name, active: true };
}

test("createCentralDbSchema enables WAL and creates seed_metadata + source_name", () => {
  const dbPath = join(root, "test.db");
  const db = openVectorStore(dbPath);
  try {
    createCentralDbSchema(db);

    const journal = db.query("PRAGMA journal_mode;").get() as { journal_mode: string };
    expect(journal.journal_mode).toBe("wal");

    const seedInfo = db.query("PRAGMA table_info(seed_metadata);").all() as Array<{ name: string }>;
    expect(seedInfo.map((c) => c.name)).toContain("source_name");
    expect(seedInfo.map((c) => c.name)).toContain("last_seeded_at");
    expect(seedInfo.map((c) => c.name)).toContain("commit_hash");
    expect(seedInfo.map((c) => c.name)).toContain("etag");
    expect(seedInfo.map((c) => c.name)).toContain("active");

    const chunkInfo = db.query("PRAGMA table_info(chunks);").all() as Array<{ name: string }>;
    expect(chunkInfo.map((c) => c.name)).toContain("source_name");
  } finally {
    db.close();
  }
});

test("seedOneSource writes a file:// llms-full source into the central corpus", async () => {
  const fullPath = join(root, "upstream.md");
  writeFileSync(fullPath, "# API\n\n## Overview\n\nSome documentation content for the API overview section.\n", "utf8");

  const src = source("api-docs", fileUrl(fullPath));
  const result = await seedOneSource(src, mockEmbedFn);
  expect(result.ok).toBe(true);

  const written = join(centralCorpusRoot(), "api-docs", "full-docs.md");
  expect(existsSync(written)).toBe(true);
});

test("rebuildSource indexes one source and removes old chunks for that source", async () => {
  const dbPath = join(root, "vectors.db");
  const db = openVectorStore(dbPath);
  createCentralDbSchema(db);

  const fullPath = join(root, "upstream.md");
  writeFileSync(
    fullPath,
    "# API\n\n## Overview\n\nFirst version of the documentation content.\n",
    "utf8",
  );
  await seedOneSource(source("api-docs", fileUrl(fullPath)), mockEmbedFn);

  const first = await rebuildSource(db, "api-docs", centralCorpusRoot(), mockEmbedFn);
  expect(first).toBeGreaterThan(0);
  const afterFirst = db.query("SELECT COUNT(*) AS n FROM chunks WHERE source_name = ?;").get("api-docs") as {
    n: number;
  };
  expect(afterFirst.n).toBe(first);

  // Rewrite the source and rebuild again; old chunks should be gone.
  writeFileSync(
    join(centralCorpusRoot(), "api-docs", "full-docs.md"),
    "# API\n\n## New Section\n\nCompletely revised documentation.\n",
    "utf8",
  );
  const second = await rebuildSource(db, "api-docs", centralCorpusRoot(), mockEmbedFn);
  expect(second).toBeGreaterThan(0);
  const content = db
    .query("SELECT content FROM chunks WHERE source_name = ? AND content LIKE ?;")
    .get("api-docs", "%Completely revised%") as { content: string } | null;
  expect(content).not.toBeNull();
  expect(content!.content).toContain("Completely revised");

  const totalForSource = db.query("SELECT COUNT(*) AS n FROM chunks WHERE source_name = ?;").get("api-docs") as {
    n: number;
  };
  expect(totalForSource.n).toBe(second);

  db.close();
});

test("checkStaleSources flags missing rows and respects active intervals", async () => {
  const dbPath = join(root, "vectors.db");
  const db = openVectorStore(dbPath);
  createCentralDbSchema(db);

  const now = new Date().toISOString();
  const oldActive = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const oldInactive = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const recentInactive = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

  db.query(
    "INSERT INTO seed_metadata (source_name, last_seeded_at, active) VALUES (?, ?, ?);",
  ).run("recent-active", now, 1);
  db.query(
    "INSERT INTO seed_metadata (source_name, last_seeded_at, active) VALUES (?, ?, ?);",
  ).run("old-active", oldActive, 1);
  db.query(
    "INSERT INTO seed_metadata (source_name, last_seeded_at, active) VALUES (?, ?, ?);",
  ).run("old-inactive", oldInactive, 0);
  db.query(
    "INSERT INTO seed_metadata (source_name, last_seeded_at, active) VALUES (?, ?, ?);",
  ).run("recent-inactive", recentInactive, 0);
  db.close();

  const sources: SeedSource[] = [
    { name: "missing", type: "llms-full", url: "file:///dev/null", targetSubdir: "missing", active: true },
    { name: "recent-active", type: "llms-full", url: "file:///dev/null", targetSubdir: "recent-active", active: true },
    { name: "old-active", type: "llms-full", url: "file:///dev/null", targetSubdir: "old-active", active: true },
    { name: "old-inactive", type: "llms-full", url: "file:///dev/null", targetSubdir: "old-inactive", active: false },
    { name: "recent-inactive", type: "llms-full", url: "file:///dev/null", targetSubdir: "recent-inactive", active: false },
  ];

  const stale = await checkStaleSources(dbPath, sources);
  expect(stale).toContain("missing");
  expect(stale).toContain("old-active");
  expect(stale).toContain("old-inactive");
  expect(stale).not.toContain("recent-active");
  expect(stale).not.toContain("recent-inactive");
});

test("refreshStaleSources skips unchanged file:// sources and updates last_seeded_at", async () => {
  const dbPath = join(root, "vectors.db");
  const fullPath = join(root, "upstream.md");
  writeFileSync(fullPath, "# API\n\n## Overview\n\nContent.\n", "utf8");
  const hash = fileHash(fullPath);

  // Seed an existing metadata row with the real hash and an old date.
  {
    const db = openVectorStore(dbPath);
    createCentralDbSchema(db);
    db.query(
      "INSERT INTO seed_metadata (source_name, last_seeded_at, etag, active) VALUES (?, ?, ?, ?);",
    ).run("api-docs", new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), hash, 1);
    db.close();
  }

  const src = source("api-docs", fileUrl(fullPath));
  const result = await refreshStaleSources(dbPath, [src], mockEmbedFn);
  expect(result.seeded).toEqual([]);
  expect(result.skipped).toEqual(["api-docs"]);
  expect(result.errors).toEqual([]);

  const db = new Database(dbPath);
  const row = db.query("SELECT last_seeded_at FROM seed_metadata WHERE source_name = ?;").get("api-docs") as {
    last_seeded_at: string;
  };
  expect(new Date(row.last_seeded_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  db.close();
});

test("refreshStaleSources re-seeds and rebuilds when file:// content changes", async () => {
  const dbPath = join(root, "vectors.db");
  const fullPath = join(root, "upstream.md");
  writeFileSync(fullPath, "# API\n\n## Overview\n\nOriginal documentation content for the API.\n", "utf8");

  // Seed initial content and metadata with a stale date + wrong hash.
  {
    const db = openVectorStore(dbPath);
    createCentralDbSchema(db);
    await seedOneSource(source("api-docs", fileUrl(fullPath)), mockEmbedFn);
    await rebuildSource(db, "api-docs", centralCorpusRoot(), mockEmbedFn);
    db.query(
      "INSERT OR REPLACE INTO seed_metadata (source_name, last_seeded_at, etag, active) VALUES (?, ?, ?, ?);",
    ).run("api-docs", new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), "stale-hash", 1);
    db.close();
  }

  // Change the upstream file so the fingerprint differs.
  writeFileSync(fullPath, "# API\n\n## Changed\n\nUpdated documentation content for the API after changes.\n", "utf8");

  const result = await refreshStaleSources(dbPath, [source("api-docs", fileUrl(fullPath))], mockEmbedFn);
  expect(result.seeded).toEqual(["api-docs"]);
  expect(result.skipped).toEqual([]);
  expect(result.errors).toEqual([]);

  const db = new Database(dbPath);
  const count = db.query("SELECT COUNT(*) AS n FROM chunks WHERE source_name = ?;").get("api-docs") as { n: number };
  expect(count.n).toBeGreaterThan(0);
  const content = db
    .query("SELECT content FROM chunks WHERE source_name = ? AND content LIKE ?;")
    .get("api-docs", "%Updated documentation%") as { content: string } | null;
  expect(content).not.toBeNull();
  expect(content!.content).toContain("Updated documentation");
  db.close();
});
