/**
 * Loreguard module — ratified decision store with FTS5 full-text search.
 *
 * Direct in-process bun:sqlite library (no MCP, no external service). The
 * `register()` function opens the default DB at
 * `.autodev/decisions/loreguard.db` and registers five pi tools:
 *
 *   suggest_lore  — create a draft ADR
 *   ratify_lore   — submit a draft for review (draft → under-review)
 *   approve_lore  — record an approval; 3 distinct approvers → ratified
 *   reject_lore   — record a rejection (status unchanged)
 *   search_lore   — FTS5 search; ratified-only by default, include_drafts for all
 *
 * Tests inject an in-memory DB via {@link setDb} so they never touch disk and
 * never need a real pi session. Tool executors/schemas live in `tools.ts`;
 * DB operations live in `operations.ts`; DDL lives in `schema.ts`; DB handle
 * management lives in `db.ts`. This module is the public surface + pi wiring.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  suggestDecision,
  ratifyDecision,
  approveDecision,
  rejectDecision,
  searchDecisions,
  getDecision,
  type Decision,
  type DecisionCategory,
  type SuggestResult,
  type RatifyResult,
  type ApproveResult,
  type RejectResult,
  type SearchResult,
} from "./operations.js";
import { getDb } from "./db.js";
import {
  SuggestLoreSchema,
  RatifyLoreSchema,
  ApproveLoreSchema,
  RejectLoreSchema,
  SearchLoreSchema,
  suggestLoreExecute,
  ratifyLoreExecute,
  approveLoreExecute,
  rejectLoreExecute,
  searchLoreExecute,
} from "./tools.js";

// --- Re-exports (module root is the public surface) ------------------------

export type { Decision, DecisionStatus, DecisionCategory } from "./operations.js";
export {
  suggestDecision,
  ratifyDecision,
  approveDecision,
  rejectDecision,
  searchDecisions,
  getDecision,
  listDecisions,
  RATIFY_APPROVER_THRESHOLD,
} from "./operations.js";
export { createSchema, checkSqliteVersion, SQLITE_MIN_VERSION } from "./schema.js";
export { openDb, getDb, setDb, resetDb, DEFAULT_DB_PATH } from "./db.js";
export {
  SuggestLoreSchema,
  RatifyLoreSchema,
  ApproveLoreSchema,
  RejectLoreSchema,
  SearchLoreSchema,
} from "./tools.js";

// --- Public typed API (used by notepad and other extension modules) --------

/** Create a draft ADR on the active DB. */
export function suggestLore(
  title: string,
  content: string,
  category: DecisionCategory = "fact",
): SuggestResult {
  return suggestDecision(getDb(), title, content, category);
}

/** Submit a draft for ratification review. */
export function ratifyLore(id: number): RatifyResult {
  return ratifyDecision(getDb(), id);
}

/** Record an approval; auto-ratifies after 3 distinct approvers. */
export function approveLore(
  id: number,
  reasoning: string,
  approver_name: string,
): ApproveResult {
  return approveDecision(getDb(), id, reasoning, approver_name);
}

/** Record a rejection; status unchanged. */
export function rejectLore(
  id: number,
  reasoning: string,
  approver_name: string,
): RejectResult {
  return rejectDecision(getDb(), id, reasoning, approver_name);
}

/** FTS5 search; ratified-only by default, all statuses with includeDrafts. */
export function searchLore(query: string, includeDrafts = false): SearchResult {
  return searchDecisions(getDb(), query, includeDrafts);
}

/** Fetch a single decision by id on the active DB, or `undefined`. */
export function getLore(id: number): Decision | undefined {
  return getDecision(getDb(), id);
}

// --- pi registration --------------------------------------------------------

/**
 * Register the five Loreguard tools with pi. Opens the default file DB and
 * wires up the tools. Tests bypass `register()` by calling {@link setDb}.
 */
export function register(pi: ExtensionAPI): void {
  getDb();

  pi.registerTool({
    name: "suggest_lore",
    label: "Suggest Lore",
    description: "Create a draft ADR for ratification",
    parameters: SuggestLoreSchema,
    execute: suggestLoreExecute,
  });

  pi.registerTool({
    name: "ratify_lore",
    label: "Ratify Lore",
    description: "Submit a draft for ratification review",
    parameters: RatifyLoreSchema,
    execute: ratifyLoreExecute,
  });

  pi.registerTool({
    name: "approve_lore",
    label: "Approve Lore",
    description: "Approve a decision under review",
    parameters: ApproveLoreSchema,
    execute: approveLoreExecute,
  });

  pi.registerTool({
    name: "reject_lore",
    label: "Reject Lore",
    description: "Reject a decision under review",
    parameters: RejectLoreSchema,
    execute: rejectLoreExecute,
  });

  pi.registerTool({
    name: "search_lore",
    label: "Search Lore",
    description: "Search ratified decisions via FTS5",
    parameters: SearchLoreSchema,
    execute: searchLoreExecute,
  });
}