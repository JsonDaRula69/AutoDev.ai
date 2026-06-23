/**
 * loreguard schema — SQLite DDL and FTS5 support verification.
 *
 * The `decisions` table holds ADR rows; `decisions_fts` is an external-content
 * FTS5 index over title+content kept in sync via triggers. `approvals` records
 * per-approver votes that drive the 3-distinct-approver auto-ratification rule.
 */
import { Database } from "bun:sqlite";

/** Minimum SQLite version required for FTS5 + external-content tables. */
export const SQLITE_MIN_VERSION = "3.9.0";

/**
 * DDL executed once per DB connection to create all tables, triggers, and the
 * FTS5 virtual table. All statements use `IF NOT EXISTS` so re-running on an
 * already-initialized DB is a no-op.
 */
export const SCHEMA_SQL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS decisions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'draft'
       CHECK(status IN ('draft','under-review','ratified','archived','rejected')),
     category TEXT NOT NULL DEFAULT 'fact'
       CHECK(category IN ('fact','onboarding','design')),
     content TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     ratified_at TEXT
   )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
     title, content, content='decisions', content_rowid='id'
   )`,
  `CREATE TRIGGER IF NOT EXISTS decisions_ai AFTER INSERT ON decisions BEGIN
     INSERT INTO decisions_fts(rowid, title, content)
       VALUES (new.id, new.title, new.content);
   END`,
  `CREATE TRIGGER IF NOT EXISTS decisions_ad AFTER DELETE ON decisions BEGIN
     INSERT INTO decisions_fts(decisions_fts, rowid, title, content)
       VALUES ('delete', old.id, old.title, old.content);
   END`,
  `CREATE TRIGGER IF NOT EXISTS decisions_au AFTER UPDATE ON decisions BEGIN
     INSERT INTO decisions_fts(decisions_fts, rowid, title, content)
       VALUES ('delete', old.id, old.title, old.content);
     INSERT INTO decisions_fts(rowid, title, content)
       VALUES (new.id, new.title, new.content);
   END`,
  `CREATE TABLE IF NOT EXISTS approvals (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     decision_id INTEGER NOT NULL REFERENCES decisions(id),
     approver_name TEXT NOT NULL,
     reasoning TEXT NOT NULL DEFAULT '',
     approved INTEGER NOT NULL CHECK(approved IN (0,1)),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
];

/**
 * Compare two dotted version strings. Returns negative/zero/positive like a
 * normal comparator. Used to verify FTS5 availability before opening the DB.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number.parseInt(pa[i] ?? "0", 10);
    const nb = Number.parseInt(pb[i] ?? "0", 10);
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Verify the underlying SQLite library supports FTS5. Throws a clear error
 * (not a silent failure) when the version is below the minimum.
 */
export function checkSqliteVersion(db: Database): void {
  const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
  const version: string = row.v;
  if (compareVersions(version, SQLITE_MIN_VERSION) < 0) {
    throw new Error(
      `Loreguard requires SQLite >= ${SQLITE_MIN_VERSION} for FTS5 support, got ${version}`,
    );
  }
}

/**
 * Create all tables, triggers, and the FTS5 index on the given DB connection.
 * Safe to call on a fresh `:memory:` DB or an already-initialized file DB.
 */
export function createSchema(db: Database): void {
  for (const stmt of SCHEMA_SQL) {
    db.exec(stmt);
  }
}