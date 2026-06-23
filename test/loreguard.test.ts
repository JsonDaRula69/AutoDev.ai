/**
 * T10 Loreguard tests.
 *
 * Uses `Database(":memory:")` so tests never touch disk and never need a real
 * pi session. Each test sets up a fresh in-memory DB via `setDb` and tears it
 * down via `resetDb`. Tool executors are called directly with synthesized
 * params so the pi registration layer is not exercised here.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  setDb,
  resetDb,
  createSchema,
  checkSqliteVersion,
  suggestLore,
  ratifyLore,
  approveLore,
  rejectLore,
  searchLore,
  getLore,
  RATIFY_APPROVER_THRESHOLD,
  SQLITE_MIN_VERSION,
} from "../extensions/autodev/loreguard/index.js";
import {
  suggestLoreExecute,
  ratifyLoreExecute,
  approveLoreExecute,
  rejectLoreExecute,
  searchLoreExecute,
} from "../extensions/autodev/loreguard/tools.js";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  checkSqliteVersion(db);
  createSchema(db);
  setDb(db);
});

afterEach(() => {
  resetDb();
  db.close();
});

// 1. Schema creation --------------------------------------------------------

test("schema creates decisions, decisions_fts, approvals, and triggers", () => {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY name",
    )
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain("decisions");
  expect(names).toContain("decisions_fts");
  expect(names).toContain("approvals");
  expect(names).toContain("decisions_ai");
  expect(names).toContain("decisions_ad");
  expect(names).toContain("decisions_au");
});

test("decisions.status CHECK rejects unknown values", () => {
  expect(() =>
    db.exec("INSERT INTO decisions (title, content, status) VALUES ('x','y','bogus')"),
  ).toThrow();
});

test("decisions.category CHECK rejects unknown values", () => {
  expect(() =>
    db.exec("INSERT INTO decisions (title, content, category) VALUES ('x','y','bogus')"),
  ).toThrow();
});

// 2. suggest_lore creates a draft -------------------------------------------

test("suggest_lore creates a draft with default category 'fact'", () => {
  const res = suggestLore("Use SQLite FTS5", "Store ADRs with full-text search.");
  expect(res.status).toBe("draft");
  const d = getLore(res.id);
  expect(d).toBeDefined();
  expect(d!.title).toBe("Use SQLite FTS5");
  expect(d!.status).toBe("draft");
  expect(d!.category).toBe("fact");
  expect(d!.ratified_at).toBeNull();
});

test("suggest_lore honors explicit category", () => {
  const res = suggestLore("Onboarding flow", "Harbor Master interview.", "onboarding");
  const d = getLore(res.id);
  expect(d!.category).toBe("onboarding");
});

// 3. ratify_lore transitions draft → under-review ---------------------------

test("ratify_lore transitions draft to under-review", () => {
  const { id } = suggestLore("Decision A", "content");
  const res = ratifyLore(id);
  expect(res.success).toBe(true);
  expect(getLore(id)!.status).toBe("under-review");
});

test("ratify_lore throws on unknown id", () => {
  expect(() => ratifyLore(99999)).toThrow(/not found/);
});

test("ratify_lore throws when status is not draft", () => {
  const { id } = suggestLore("Decision B", "content");
  ratifyLore(id);
  expect(() => ratifyLore(id)).toThrow(/expected draft/);
});

// 4. approve_lore records approval; 3 distinct approvers → ratified ---------

test("approve_lore records approval and auto-ratifies after 3 distinct approvers", () => {
  const { id } = suggestLore("Decision C", "architecture content here");
  ratifyLore(id);

  const r1 = approveLore(id, "looks good", "oracle");
  expect(r1.success).toBe(true);
  expect(r1.status).toBe("under-review");
  expect(r1.approvals_count).toBe(1);

  const r2 = approveLore(id, "agree", "nemo");
  expect(r2.status).toBe("under-review");
  expect(r2.approvals_count).toBe(2);

  const r3 = approveLore(id, "ratify", "momus");
  expect(r3.status).toBe("ratified");
  expect(r3.approvals_count).toBe(3);
  expect(getLore(id)!.ratified_at).not.toBeNull();
});

test("approve_lore counts distinct approver_names only", () => {
  const { id } = suggestLore("Decision D", "content");
  ratifyLore(id);
  approveLore(id, "first", "oracle");
  approveLore(id, "duplicate", "oracle");
  approveLore(id, "third", "nemo");
  // 2 distinct names, not yet ratified
  expect(getLore(id)!.status).toBe("under-review");
  approveLore(id, "fourth", "momus");
  expect(getLore(id)!.status).toBe("ratified");
});

test("approve_lore threshold equals 3", () => {
  expect(RATIFY_APPROVER_THRESHOLD).toBe(3);
});

test("approve_lore throws on unknown id", () => {
  expect(() => approveLore(99999, "r", "x")).toThrow(/not found/);
});

// 5. reject_lore records rejection; status stays under-review ---------------

test("reject_lore records rejection and keeps status under-review", () => {
  const { id } = suggestLore("Decision E", "content");
  ratifyLore(id);
  const res = rejectLore(id, "disagree", "momus");
  expect(res.success).toBe(true);
  expect(res.status).toBe("under-review");
  expect(getLore(id)!.status).toBe("under-review");
});

test("reject_lore throws on unknown id", () => {
  expect(() => rejectLore(99999, "r", "x")).toThrow(/not found/);
});

// 6. search_lore with include_drafts=false returns only ratified -----------

test("search_lore returns only ratified decisions by default", () => {
  const a = suggestLore("Ratified one", "architecture decision");
  ratifyLore(a.id);
  approveLore(a.id, "ok", "oracle");
  approveLore(a.id, "ok", "nemo");
  approveLore(a.id, "ok", "momus");

  suggestLore("Draft only", "architecture draft");
  const b = suggestLore("Under review", "architecture under review");
  ratifyLore(b.id);

  const res = searchLore("architecture");
  expect(res.results.length).toBe(1);
  expect(res.results[0]!.title).toBe("Ratified one");
  expect(res.results[0]!.status).toBe("ratified");
});

// 7. search_lore with include_drafts=true returns all ----------------------

test("search_lore with include_drafts=true returns all matching statuses", () => {
  const a = suggestLore("Ratified one", "design decision");
  ratifyLore(a.id);
  approveLore(a.id, "ok", "oracle");
  approveLore(a.id, "ok", "nemo");
  approveLore(a.id, "ok", "momus");

  suggestLore("Draft only", "design draft");
  const b = suggestLore("Under review", "design under review");
  ratifyLore(b.id);

  const res = searchLore("design", true);
  const statuses = res.results.map((r) => r.status).sort();
  expect(statuses).toEqual(["draft", "ratified", "under-review"]);
});

// 8. FTS5 search matches words in content ----------------------------------

test("FTS5 search matches 'architecture' in content", () => {
  const a = suggestLore("DB choice", "We chose sqlite for the architecture store.");
  ratifyLore(a.id);
  approveLore(a.id, "ok", "oracle");
  approveLore(a.id, "ok", "nemo");
  approveLore(a.id, "ok", "momus");

  suggestLore("Unrelated", "We chose a logging library.");

  const res = searchLore("architecture");
  expect(res.results.length).toBe(1);
  expect(res.results[0]!.title).toBe("DB choice");
});

test("FTS5 search matches title", () => {
  const a = suggestLore("architecture record", "content body");
  ratifyLore(a.id);
  approveLore(a.id, "ok", "oracle");
  approveLore(a.id, "ok", "nemo");
  approveLore(a.id, "ok", "momus");

  const res = searchLore("architecture");
  expect(res.results.length).toBe(1);
  expect(res.results[0]!.id).toBe(a.id);
});

test("search_lore with no matches returns empty results", () => {
  const res = searchLore("zzznope");
  expect(res.results).toEqual([]);
});

// 9. SQLite version check ---------------------------------------------------

test("SQLite version check passes on the runtime's bundled SQLite", () => {
  const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
  expect(row.v).toBeDefined();
  // The check throws if below minimum; reaching here means it passed.
  checkSqliteVersion(db);
});

test("SQLITE_MIN_VERSION constant is stable", () => {
  expect(SQLITE_MIN_VERSION).toBe("3.9.0");
});

// 10. Tool execute functions called directly --------------------------------

test("suggest_lore tool executor returns a text result with the new id", async () => {
  const res = await suggestLoreExecute("call-1", {
    title: "Tool decision",
    content: "via executor",
    category: "fact",
  });
  expect(res.content[0]!.type).toBe("text");
  expect(res.content[0]!.text).toContain("Draft ADR #");
  expect(res.details.name).toBe("suggest_lore");
  expect((res.details.result as { id: number }).id).toBeGreaterThan(0);
});

test("ratify_lore tool executor returns success", async () => {
  const { id } = suggestLore("To ratify", "content");
  const res = await ratifyLoreExecute("call-2", { id });
  expect(res.details.name).toBe("ratify_lore");
  expect((res.details.result as { success: true }).success).toBe(true);
});

test("approve_lore tool executor returns status and approvals_count", async () => {
  const { id } = suggestLore("To approve", "content");
  ratifyLore(id);
  const res = await approveLoreExecute("call-3", {
    id,
    reasoning: "ok",
    approver_name: "oracle",
  });
  expect(res.details.name).toBe("approve_lore");
  const r = res.details.result as { status: string; approvals_count: number };
  expect(r.status).toBe("under-review");
  expect(r.approvals_count).toBe(1);
});

test("reject_lore tool executor returns unchanged status", async () => {
  const { id } = suggestLore("To reject", "content");
  ratifyLore(id);
  const res = await rejectLoreExecute("call-4", {
    id,
    reasoning: "no",
    approver_name: "momus",
  });
  expect(res.details.name).toBe("reject_lore");
  expect((res.details.result as { status: string }).status).toBe("under-review");
});

test("search_lore tool executor returns a summary string", async () => {
  const a = suggestLore("Searchable", "find me please");
  ratifyLore(a.id);
  approveLore(a.id, "ok", "oracle");
  approveLore(a.id, "ok", "nemo");
  approveLore(a.id, "ok", "momus");

  const res = await searchLoreExecute("call-5", { query: "searchable" });
  expect(res.content[0]!.text).toContain("Searchable");
  expect(res.details.name).toBe("search_lore");
});

test("search_lore tool executor honors include_drafts default false", async () => {
  suggestLore("Draft only searchable", "body");
  const res = await searchLoreExecute("call-6", { query: "searchable" });
  expect(res.content[0]!.text).toContain("No decisions matched");
});