/**
 * loreguard DB handle management.
 *
 * Single shared mutable handle so tests can inject an in-memory DB via
 * {@link setDb} and production code can lazily open the default file DB via
 * {@link getDb}. Extracted from `index.ts` to avoid a circular import between
 * `index.ts` (registers tools, imports executors from `tools.ts`) and
 * `tools.ts` (executors call the public API, which needs `getDb`).
 */
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { Database, type Database as DatabaseType } from "bun:sqlite";
import { createSchema, checkSqliteVersion } from "./schema.js";

let dbHandle: DatabaseType | undefined;

/** Default DB path relative to `process.cwd()`. */
export const DEFAULT_DB_PATH = resolve(
  process.cwd(),
  ".autodev",
  "decisions",
  "loreguard.db",
);

/** Open (or reuse) the SQLite DB at `path`; creates the parent dir if needed. */
export function openDb(path: string = DEFAULT_DB_PATH): DatabaseType {
  const dir = resolve(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  checkSqliteVersion(db);
  createSchema(db);
  return db;
}

/** Get the active DB handle, opening the default file DB if none is set. */
export function getDb(): DatabaseType {
  if (dbHandle === undefined) {
    dbHandle = openDb(DEFAULT_DB_PATH);
  }
  return dbHandle;
}

/** Inject a DB handle for tests. The caller owns the handle's lifetime. */
export function setDb(db: DatabaseType): void {
  dbHandle = db;
}

/** Detach any injected DB handle so the default file DB is used again. */
export function resetDb(): void {
  dbHandle = undefined;
}