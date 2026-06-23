/**
 * loreguard operations — typed DB operations over the ADR store.
 *
 * Pure data-access layer. Each function takes an already-initialized
 * `bun:sqlite` Database and returns plain typed values; no tool/LLM concerns
 * live here. The 3-distinct-approver auto-ratification rule is encoded in
 * `approveDecision`, the single place that knows the threshold.
 */
import { Database } from "bun:sqlite";

/** Decision lifecycle status. */
export type DecisionStatus = "draft" | "under-review" | "ratified" | "archived" | "rejected";

/** Decision category — mirrors the DB CHECK constraint. */
export type DecisionCategory = "fact" | "onboarding" | "design";

/** Row shape returned from the `decisions` table. */
export interface Decision {
  readonly id: number;
  readonly title: string;
  readonly status: DecisionStatus;
  readonly category: DecisionCategory;
  readonly content: string;
  readonly created_at: string;
  readonly ratified_at: string | null;
}

/** Number of distinct approvers required to auto-ratify a decision. */
export const RATIFY_APPROVER_THRESHOLD = 3;

interface DecisionRow {
  id: number;
  title: string;
  status: string;
  category: string;
  content: string;
  created_at: string;
  ratified_at: string | null;
}

function toDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    title: row.title,
    status: row.status as DecisionStatus,
    category: row.category as DecisionCategory,
    content: row.content,
    created_at: row.created_at,
    ratified_at: row.ratified_at,
  };
}

/** Result of {@link suggestDecision}. */
export interface SuggestResult {
  readonly id: number;
  readonly status: "draft";
}

/** Result of {@link ratifyDecision}. */
export interface RatifyResult {
  readonly success: true;
}

/** Result of {@link approveDecision}. */
export interface ApproveResult {
  readonly success: true;
  readonly status: DecisionStatus;
  readonly approvals_count: number;
}

/** Result of {@link rejectDecision}. */
export interface RejectResult {
  readonly success: true;
  readonly status: DecisionStatus;
}

/** Result of {@link searchDecisions}. */
export interface SearchResult {
  readonly results: readonly Decision[];
}

/**
 * Create a draft ADR. The caller is responsible for ratifying it; a draft is
 * never truth. Returns the new row id and the fixed `"draft"` status.
 */
export function suggestDecision(
  db: Database,
  title: string,
  content: string,
  category: DecisionCategory = "fact",
): SuggestResult {
  const info = db
    .prepare(
      "INSERT INTO decisions (title, content, category) VALUES (?, ?, ?)",
    )
    .run(title, content, category) as { lastInsertRowid: number | bigint };
  const id = typeof info.lastInsertRowid === "bigint"
    ? Number(info.lastInsertRowid)
    : info.lastInsertRowid;
  return { id, status: "draft" };
}

/**
 * Transition a `draft` decision to `under-review`. Throws if the row is missing
 * or not in draft state — the only legal source state for ratify.
 */
export function ratifyDecision(db: Database, id: number): RatifyResult {
  const row = db
    .prepare("SELECT status FROM decisions WHERE id = ?")
    .get(id) as { status: string } | undefined;
  if (row === undefined || row === null) {
    throw new Error(`Decision ${id} not found`);
  }
  if (row.status !== "draft") {
    throw new Error(`Decision ${id} is ${row.status}, expected draft`);
  }
  db.prepare(
    "UPDATE decisions SET status = 'under-review' WHERE id = ?",
  ).run(id);
  return { success: true };
}

/**
 * Record an approval vote. If the count of distinct approver_names that have
 * approved this decision reaches {@link RATIFY_APPROVER_THRESHOLD}, the
 * decision is auto-transitioned to `ratified` and `ratified_at` is stamped.
 * Returns the post-vote status and distinct-approver count.
 */
export function approveDecision(
  db: Database,
  id: number,
  reasoning: string,
  approver_name: string,
): ApproveResult {
  const row = db
    .prepare("SELECT status FROM decisions WHERE id = ?")
    .get(id) as { status: string } | null;
  if (row === undefined || row === null) {
    throw new Error(`Decision ${id} not found`);
  }
  db.prepare(
    "INSERT INTO approvals (decision_id, approver_name, reasoning, approved) VALUES (?, ?, ?, 1)",
  ).run(id, approver_name, reasoning);
  const countRow = db
    .prepare(
      "SELECT COUNT(DISTINCT approver_name) AS c FROM approvals WHERE decision_id = ? AND approved = 1",
    )
    .get(id) as { c: number };
  const count = countRow.c;
  let status = row.status as DecisionStatus;
  if (count >= RATIFY_APPROVER_THRESHOLD && row.status !== "ratified") {
    db.prepare(
      "UPDATE decisions SET status = 'ratified', ratified_at = datetime('now') WHERE id = ?",
    ).run(id);
    status = "ratified";
  }
  return { success: true, status, approvals_count: count };
}

/**
 * Record a rejection vote. Status stays `under-review` (or whatever it was);
 * a rejection does not auto-archive. Returns the unchanged status.
 */
export function rejectDecision(
  db: Database,
  id: number,
  reasoning: string,
  approver_name: string,
): RejectResult {
  const row = db
    .prepare("SELECT status FROM decisions WHERE id = ?")
    .get(id) as { status: string } | null;
  if (row === undefined || row === null) {
    throw new Error(`Decision ${id} not found`);
  }
  db.prepare(
    "INSERT INTO approvals (decision_id, approver_name, reasoning, approved) VALUES (?, ?, ?, 0)",
  ).run(id, approver_name, reasoning);
  return { success: true, status: row.status as DecisionStatus };
}

/**
 * FTS5 search over decision title + content. By default returns only
 * `ratified` rows; set `includeDrafts: true` to return every status (used by
 * review workflows that need to see drafts and under-review rows).
 */
export function searchDecisions(
  db: Database,
  query: string,
  includeDrafts = false,
): SearchResult {
  const ftsRows = db
    .prepare(
      "SELECT rowid AS id FROM decisions_fts WHERE decisions_fts MATCH ? ORDER BY rank",
    )
    .all(query) as readonly { id: number }[];
  if (ftsRows.length === 0) return { results: [] };
  const ids = ftsRows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const statusClause = includeDrafts ? "" : " AND status = 'ratified'";
  const rows = db
    .prepare(
      `SELECT id, title, status, category, content, created_at, ratified_at
       FROM decisions WHERE id IN (${placeholders})${statusClause}
       ORDER BY id`,
    )
    .all(...ids) as DecisionRow[];
  return { results: rows.map(toDecision) };
}

/** Fetch a single decision by id, or `undefined` if it does not exist. */
export function getDecision(db: Database, id: number): Decision | undefined {
  const row = db
    .prepare(
      "SELECT id, title, status, category, content, created_at, ratified_at FROM decisions WHERE id = ?",
    )
    .get(id) as DecisionRow | undefined;
  return row === undefined || row === null ? undefined : toDecision(row);
}

/**
 * List every decision, optionally filtered by status. Used by review
 * workflows; not exposed as a tool in T10.
 */
export function listDecisions(
  db: Database,
  status?: DecisionStatus,
): readonly Decision[] {
  const rows = status === undefined
    ? (db
      .prepare(
        "SELECT id, title, status, category, content, created_at, ratified_at FROM decisions ORDER BY id",
      )
      .all() as DecisionRow[])
    : (db
      .prepare(
        "SELECT id, title, status, category, content, created_at, ratified_at FROM decisions WHERE status = ? ORDER BY id",
      )
      .all(status) as DecisionRow[]);
  return rows.map(toDecision);
}