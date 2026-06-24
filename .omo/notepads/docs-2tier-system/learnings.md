
## 2026-06-23: Wave 1 — gitignore docs-corpus/

- Added `docs-corpus/` to `.gitignore` (after `.omo/run-continuation/` section).
- Ran `git rm -r --cached docs-corpus/` to untrack 119 files from git without deleting them from disk.
- **Verification results:**
  - `.gitignore` has `docs-corpus/` entry: PASS
  - `git ls-files docs-corpus/` returns 0: PASS
  - Files remain on disk (`docs-corpus/pi/sdk.md` exists): PASS
  - `npm pack --dry-run` contains 0 `docs-corpus` paths: PASS
- `tsconfig.json:24` exclusion left untouched.
- No `files` field added to `package.json`; no `.npmignore` created.

## T6: init-module.ts — docs-corpus directory creation

- Added `mkdirSync(join(projectRoot, "docs-corpus"), { recursive: true })` in `runStep1Dirs()` of `extensions/autodev/installer/init-module.ts`.
- The directory is created at project root (not under `.autodev/`), alongside the AUTODEV_SUBDIRS loop but not as part of it.
- Idempotent via `{ recursive: true }` — re-running init won't fail.
- All 12 existing tests pass with no regressions.
- No new tsc errors in init-module.ts (pre-existing errors in unrelated files).

## T2: install-module.ts — central docs vector store creation

- Added exported `createCentralDocsStructure(agentDir: string): { ok: boolean; detail: string }` in `extensions/autodev/installer/install-module.ts`.
- Uses `join(agentDir, "..", "docs-corpus")` for central home; creates directory with `mkdirSync(..., { recursive: true })`.
- Imports `openVectorStore` from `../docs/index.js` and initializes `vectors.db` in the central home; closes handle immediately.
- Does NOT populate chunks or copy docs files.
- Wired into `runConfigFilesPhase` after `validateAndCreateConfig` returns; result folded into the single `"config-files"` `InstallFixResult` detail string.
- `config-files` `ok` now reflects both config phase and central docs initialization.
- Re-exported conflict resolution: `extensions/autodev/docs/index.ts` re-exports `embed`, `EmbedFn`, `VOYAGE_BATCH_SIZE` (shared `embeddings.ts` extract) to keep `import { openVectorStore } from "../docs/index.js"` compatible and avoid local-declaration conflicts.
- Fixed pre-existing tsc error in `extensions/autodev/fts-utils.ts` (`params` spread type) while typechecking.
- **Verification results:**
  - `import { createCentralDocsStructure } from "./install-module.js"`: PASS
  - Function creates `join(agentDir, "..", "docs-corpus", "vectors.db")` with `chunks` table and `SELECT COUNT(*) FROM chunks` returns 0: PASS
  - `runConfigFilesPhase` detail includes `Central docs: initialized at <path>`: PASS
  - `bun test extensions/autodev/installer/__tests__/install-module.test.ts`: 5 pass, 0 fail
  - `npx tsc --noEmit`: PASS (no output)

## T14: Shared embedding utility

- Created `extensions/autodev/embeddings.ts` with `voyageEmbed()`, `onnxEmbed()`, `embed()`, `EmbedFn` type, and `VOYAGE_BATCH_SIZE` extracted from `docs/index.ts`.
- Edited `docs/index.ts` to import `{ embed, type EmbedFn, VOYAGE_BATCH_SIZE }` from `../embeddings.js` and removed the inline definitions.
- No behavioral changes — pure extraction.
- **Tests**: 31/31 pass (bun test test/docs.test.ts).
- **TypeScript**: 0 new errors from changed files. Pre-existing error in `fts-utils.ts` (untracked file, unrelated).

## T3: docs/index.ts core rework — dual-path functions, hybrid search, tier-aware rebuild

- Added value import of `getAgentDir` from `@earendil-works/pi-coding-agent`; imported `ftsMatchQuery` from `../fts-utils.js`.
- Added `centralDbPath()` → `join(getAgentDir(), "..", "docs-corpus", "vectors.db")` and `centralCorpusRoot()` → `join(getAgentDir(), "..", "docs-corpus")`; kept `defaultDbPath()` and `defaultCorpusRoot()` unchanged.
- Updated `SCHEMA_SQL` to add `source_name TEXT` column to `chunks` and created virtual table `chunks_fts USING fts5(content, source_name)`.
- Updated `RawChunk` type to include `source_name?: string`.
- Updated `insertChunk` to accept optional `source_name`, derive it from the first segment of `doc_path` when omitted, and write into both `chunks` and `chunks_fts` using `last_insert_rowid()`.
- Added `clearFts(db)` alongside `clearChunks(db)`.
- Implemented `hybridSearch(db, query, limit, embedFn)` with dense cosine search and BM25 via `ftsMatchQuery`, merging by Reciprocal Rank Fusion (0.7 dense / 0.3 BM25). Falls back to dense-only when BM25 returns nothing; returns empty when store has no chunks.
- Implemented `searchDocsBoth(query, limit, embedFn)` opening central + project DBs, running hybrid search on each, prefixing `doc_path` with `central:` or `project:`, and merging by RRF. Gracefully degrades when central DB is missing/empty.
- Implemented `docsStatusBoth(centralDbPath, projectDbPath, corpusRoot)` returning both tier stats, with central nullable when absent.
- Implemented `docsRebuildTier(tier, embedFn)` for `"central" | "project"`; clears both `chunks` and `chunks_fts` and runs `docsRebuild`-like ingestion against the tier's DB/corpus.
- Did NOT modify `register()` or `buildDocsTools`; did NOT remove single-tier functions.
- **Verification results:**
  - `bun test test/docs.test.ts`: 31 pass, 0 fail
  - `npx tsc --noEmit`: PASS (no output)
  - `git diff extensions/autodev/docs/index.ts | grep -E "register|buildDocsTools"`: no output (unchanged)

## T3 fix: `hybridSearch` RRF formula aligned to plan spec

- Removed the `reciprocalRank(rank) = 1 / (rank + 60)` helper and the `normalizeScores()` based score normalization.
- Replaced with pure Reciprocal Rank Fusion as specified:
  - Dense contribution per result: `0.7 / (dense_rank + 1)`.
  - BM25 contribution per result: `0.3 / (bm25_rank + 1)`.
  - Ranks are 0-indexed positions in their respective top-`limit*3` lists.
  - Scores for the same chunk (`doc_path::chunk_index`) are summed; results sorted by fused score descending; top-N returned.
- Also updated `searchDocsBoth` central/project fusion to use the same `0.7 / (rank + 1)` and `0.3 / (rank + 1)` weights instead of the removed helper.
- **Verification results after fix:**
  - `bun test test/docs.test.ts`: 31 pass, 0 fail
  - `npx tsc --noEmit`: PASS (no output)

