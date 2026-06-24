# F4: Scope Fidelity Review — docs-2tier-system Plan

**Date:** 2026-06-23
**Branch under review:** `docs-2tier-system`
**Base:** `2f39bea` (merge-base with `main`)
**Review revision:** 2 (after docs-corpus untrack fix)

## Overall Verdict: **APPROVE**

All F4 criteria now pass. The docs-corpus directory has been removed from the git index (while remaining on disk), the T14/T15 extractions are pure behavioral extractions with backward-compatible re-exports, `register()`/`buildDocsTools` were modified only by T10, `.autodev/` remains untracked, and the working tree has no unintended source modifications.

---

## 1. T14 — Shared embedding utility (`extensions/autodev/embeddings.ts`)

**Status:** PASS — pure extraction, no behavioral change.

**Evidence:**

- `extensions/autodev/embeddings.ts` (current) exports the same symbols with the same implementations as the pre-extraction inline code in `extensions/autodev/docs/index.ts`:
  - `VOYAGE_BATCH_SIZE = 20` — identical value and comment.
  - `export type EmbedFn = (texts: string[], isQuery?: boolean) => Promise<Float32Array[]>` — identical signature.
  - `voyageEmbed(texts, isQuery = false)` — identical fetch URL (`https://api.voyageai.com/v1/embeddings`), headers, model `voyage-3`, batching loop, and error message format.
  - `onnxEmbed(texts)` — identical dynamic import of `@xenova/transformers`, model `Xenova/all-MiniLM-L6-v2`, pooling `mean`, normalize `true`.
  - `embed(texts, isQuery = false)` — identical `VOYAGE_API_KEY` branching.
- Diff from Wave 1 (`e6af730`) shows the original `docs/index.ts` embedding-provider block (84 lines) was replaced by imports from `../embeddings.js` plus re-exports. No logic edits occurred inside the moved functions.
- `docs/index.ts` re-exports `embed`, `EmbedFn`, and `VOYAGE_BATCH_SIZE` to preserve existing importers.

**Conclusion:** T14 was a pure move. No behavioral change.

---

## 2. T15 — Shared FTS5 utilities (`extensions/autodev/fts-utils.ts`)

**Status:** PASS — pure extraction, backward-compatible re-exports, correct generalization.

**Evidence:**

- `extensions/autodev/fts-utils.ts` contains:
  - `SQLITE_MIN_VERSION = "3.9.0"` — same value and intent as originally in `loreguard/schema.ts`.
  - `compareVersions(a, b)` — identical dotted-version comparator implementation.
  - `checkSqliteVersion(db)` — identical query and comparison logic; only the error message wording differs (`"FTS5 requires SQLite >= ..."` vs original `"Loreguard requires SQLite >= ..."`). This is an acceptable generalization because the function is now shared.
  - `ftsMatchQuery(db, tableName, query, limit?)` — generalizes the previously inline loreguard query. It parameterizes the table name and adds an optional `limit`. The generated SQL remains `SELECT rowid FROM <table> WHERE <table> MATCH ? ORDER BY rank [LIMIT ?]`, returning `readonly { rowid: number }[]`.
- `extensions/autodev/loreguard/schema.ts` now imports and re-exports `SQLITE_MIN_VERSION`, `compareVersions`, and `checkSqliteVersion`, preserving backward compatibility for any external consumers.
- `extensions/autodev/loreguard/operations.ts:10` imports `ftsMatchQuery` from `../fts-utils.js` and uses it at `operations.ts:207` with `ftsMatchQuery(db, "decisions_fts", query)`. This is a correct application of the generalized helper and uses `rowid` to resolve back to the source table.

**Conclusion:** T15 was a pure extraction plus a safe parameterization. Backward-compat re-exports are in place, and `loreguard/operations.ts` consumes the generalized helper correctly.

---

## 3. `register()` / `buildDocsTools` commit attribution

**Status:** PASS — only T10 modified these symbols.

**Evidence:**

- `git log --oneline -- extensions/autodev/docs/index.ts` shows only T3 (`0d7d299`) and T10 (`629f17e`) touched the file on this branch after the base.
- `git diff 0d7d299^..0d7d299 -- extensions/autodev/docs/index.ts | grep -nE "register|buildDocsTools"` returned **no output** — T3 did not modify `register()` or `buildDocsTools`.
- `git diff 629f17e^..629f17e -- extensions/autodev/docs/index.ts | grep -nE "register|buildDocsTools"` shows T10 changed:
  - `buildDocsTools` signature from `{ dbPath, corpusRoot, embedFn }` to `{ centralDbPath, centralCorpusRoot, projectDbPath, projectCorpusRoot, embedFn }`.
  - `register()` body to resolve all four paths and pass them into `buildDocsTools`.
- The T10 commit message explicitly says "dual-tier tool registration".

**Conclusion:** Attribution is correct. `register()`/`buildDocsTools` were only touched by T10, not T3.

---

## 4. `.gitignore` and npm pack exclusion for `docs-corpus/`

**Status:** PASS — `docs-corpus/` is untracked in git and excluded from the npm pack while remaining available on disk.

**Evidence:**

- `.gitignore:27` contains `docs-corpus/`.
- `git ls-files docs-corpus/ | wc -l` returns **0** after the fix.
- `git ls-tree -r HEAD | grep docs-corpus | wc -l` returns **0**, confirming the files are no longer in the HEAD tree.
- `npm pack --dry-run 2>/dev/null | grep -c docs-corpus` returns **0**.
- `docs-corpus/pi/sdk.md` still exists on disk (`test -f docs-corpus/pi/sdk.md` → `EXISTS`).
- The fix was applied via `git rm -r --cached docs-corpus/` and committed; files remain in the working tree for runtime use.

**Conclusion:** Requirement satisfied.

---

## 5. `.autodev/` files remain untracked

**Status:** PASS — no `.autodev/` files are tracked; they exist only as untracked working-tree files.

**Evidence:**

- `git ls-files .autodev/ | wc -l` returns **0**.
- `git status --short .autodev/` shows `?? .autodev/` (untracked directory).
- Commit `eea542a` removed 54 `.autodev/` paths from the index; those deletions are reflected in the current HEAD tree.
- No unexpected `.autodev/` files have been re-added to the index.

**Conclusion:** `.autodev/` is correctly excluded from git tracking while remaining on disk for local use.

---

## 6. No modified uncommitted source files

**Status:** PASS — the working tree contains no tracked-source modifications.

**Evidence:**

- `git status --short` shows only untracked `.autodev/` and `.omo/` artifacts.
- `git status --short | grep "^ M"` returned no output.
- No tracked source files under `extensions/autodev/` or elsewhere show uncommitted changes.

**Conclusion:** The working tree is clean of unintended source modifications.

---

## Summary Table

| Requirement | Result | Evidence |
|---|---|---|
| T14 pure extraction (embeddings) | PASS | `embeddings.ts` matches original inline code in pre-Wave-1 `docs/index.ts`; no logic edits |
| T15 pure extraction (FTS5 utils) | PASS | `fts-utils.ts` matches original `loreguard/schema.ts` logic; re-exports in place; `operations.ts` uses `ftsMatchQuery` |
| `loreguard/schema.ts` backward compat | PASS | Re-exports `SQLITE_MIN_VERSION`, `compareVersions`, `checkSqliteVersion` |
| `register()` only touched by T10 | PASS | T3 diff has no `register`/`buildDocsTools` changes; T10 diff contains them |
| `docs-corpus/` gitignored and excluded from pack | PASS | `git ls-files docs-corpus/` = 0; `git ls-tree` = 0; `npm pack` count = 0; files remain on disk |
| `.autodev/` remains untracked | PASS | `git ls-files .autodev/` = 0; status shows `?? .autodev/` |
| No modified uncommitted source files | PASS | `git status` has no `^ M` entries |

---

## Previous Blocking Issue (resolved)

1. **`docs-corpus/` was tracked in git.** The initial F4 pass found 119 `docs-corpus/` files still tracked in the index/HEAD despite the `.gitignore` entry. This was fixed by removing the directory from the git index (`git rm -r --cached docs-corpus/`) and committing, leaving the files on disk as untracked working-tree content. Re-verification confirms `git ls-files docs-corpus/` = 0, `git ls-tree` = 0, and `npm pack --dry-run | grep -c docs-corpus` = 0.

---

## Action

All F4 criteria now pass. Verdict updated to **APPROVE**.
