# F4: Scope Fidelity Review — docs-2tier-system Plan

**Date:** 2026-06-23
**Branch under review:** `docs-2tier-system`
**Base:** `2f39bea` (merge-base with `main`)

## Overall Verdict: **REJECT**

The extraction modules (T14 embeddings, T15 FTS5 utils) are pure extractions with no behavioral changes, `register()`/`buildDocsTools` attribution is correct, and `.autodev/` remains untracked. However, the requirement that `docs-corpus/` be gitignored and excluded from the npm pack is **not satisfied**: the git index/HEAD still tracks 119 `docs-corpus/` files, and `git status` reports no staged deletion to untrack them. Because this is an explicit MUST-DO in F4, the overall review fails.

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

**Status:** **FAIL** — `docs-corpus/` is listed in `.gitignore` but remains tracked in the git index and HEAD.

**Evidence:**

- `.gitignore:27` contains `docs-corpus/`.
- `git ls-files docs-corpus/ | wc -l` returns **119** tracked files.
- `git ls-tree -r HEAD | grep docs-corpus | wc -l` also returns **119**, confirming the files are in the current HEAD tree.
- `git status --short docs-corpus/` returns **nothing**, so there is no staged deletion to untrack them. The notepad entry from Wave 1 claims `git rm -r --cached docs-corpus/` was run, but the current branch state does not reflect that.
- `npm pack --dry-run | grep -c docs-corpus` returned **0** in this run, but because the files are still tracked in git, pack behavior is fragile and depends on whether npm is honoring `.gitignore` over git tracked files in this environment. The safer and required state is that `docs-corpus/` is untracked in git.

**Root cause hypothesis:** The `docs-corpus/` files were restored by commits on another branch (`4ef78a7`, `2783f23`, `33cf733`) and are present in the tree because they were never removed from HEAD on `docs-2tier-system`. The Wave 1 notepad entry may have recorded an intended or attempted `git rm --cached` that did not persist into HEAD.

**Conclusion:** Requirement not satisfied. This is a blocking issue for F4.

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
| `docs-corpus/` gitignored and excluded from pack | **FAIL** | `.gitignore` lists it, but 119 files remain tracked in index/HEAD |
| `.autodev/` remains untracked | PASS | `git ls-files .autodev/` = 0; status shows `?? .autodev/` |
| No modified uncommitted source files | PASS | `git status` has no `^ M` entries |

---

## Blocking Issue

1. **`docs-corpus/` must be untracked in git.** The `.gitignore` entry is present, but `git ls-files docs-corpus/` and `git ls-tree -r HEAD` both report 119 tracked files. Run `git rm -r --cached docs-corpus/` and commit the deletion so that `git ls-files docs-corpus/` returns 0 and `npm pack --dry-run | grep -c docs-corpus` reliably returns 0.

---

## Action

Because the above blocking issue violates an explicit F4 MUST-DO, the overall verdict is **REJECT**. Re-run F4 after fixing the `docs-corpus/` tracking state.
