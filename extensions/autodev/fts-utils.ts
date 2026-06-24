/**
 * fts-utils — shared FTS5 utilities for SQLite version checking and MATCH queries.
 *
 * Extracted from loreguard/schema.ts so other modules (docs, loreguard) can share
 * the version check and query builder without duplicating code.
 */
import { Database } from "bun:sqlite";

/** Minimum SQLite version required for FTS5 + external-content tables. */
export const SQLITE_MIN_VERSION = "3.9.0";

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
      `FTS5 requires SQLite >= ${SQLITE_MIN_VERSION} for FTS5 support, got ${version}`,
    );
  }
}

/**
 * Execute an FTS5 MATCH query against a virtual table and return matching
 * rowids ordered by relevance (rank). Optionally limit the number of results.
 */
export function ftsMatchQuery(
  db: Database,
  tableName: string,
  query: string,
  limit?: number,
): readonly { rowid: number }[] {
  const sql = limit !== undefined
    ? `SELECT rowid FROM ${tableName} WHERE ${tableName} MATCH ? ORDER BY rank LIMIT ?`
    : `SELECT rowid FROM ${tableName} WHERE ${tableName} MATCH ? ORDER BY rank`;
  const params: (string | number)[] = limit !== undefined ? [query, limit] : [query];
  return db.prepare(sql).all(...(params as [string] | [string, number])) as readonly { rowid: number }[];
}
