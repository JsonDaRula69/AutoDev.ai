
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

## T4: docs dual-tier tests (`test/docs.test.ts`)

- Updated imports to include dual-tier functions: `hybridSearch`, `searchDocsBoth`, `docsStatusBoth`, `docsRebuildTier`, `centralDbPath`, `centralCorpusRoot`.
- Added 14 new dual-tier tests (sections 12–16) while preserving all 31 existing single-tier tests.
- Isolated central tier by setting `PI_CODING_AGENT_DIR` to a temp dir and creating an `agent/` subdir so `getAgentDir()/..` resolves to the temp central root.
- Isolated project tier for `docsRebuildTier("project")` by stubbing `process.cwd()` to the temp root so `defaultDbPath()`/`defaultCorpusRoot()` do not touch the real project tree.
- Used `mockEmbedFn` from `test/mocks/embeddings.ts` for all dual-tier tests.
- New test coverage:
  - `hybridSearch` semantic match inclusion
  - `hybridSearch` exact match boosting via BM25
  - `hybridSearch` RRF fusion ranking
  - `hybridSearch` dense-only fallback when BM25 returns nothing
  - `hybridSearch` BM25-only fallback when dense returns nothing
  - `searchDocsBoth` merging + ranking across central/project tiers
  - `searchDocsBoth` `central:` / `project:` prefix correctness
  - `searchDocsBoth` single-tier fallback when central DB is missing
  - `docsStatusBoth` reporting both tiers
  - `docsStatusBoth` handling missing central DB
  - `docsRebuildTier("central")` populating FTS5
  - `docsRebuildTier("project")` populating FTS5
  - `centralDbPath` resolution under mocked agent dir
  - `centralCorpusRoot` resolution under mocked agent dir
- **Verification results:**
  - `bun test test/docs.test.ts`: 45 pass, 0 fail (31 single-tier + 14 dual-tier)
  - `npx tsc --noEmit`: PASS (no output)

## T7: Seeding framework — pluggable source list, download, chunk, embed

- Created `extensions/autodev/docs/seeding.ts` with `SeedSource` type and `seedCentralDocs(sources, embedFn)`.
- Supported source types: `git-sparse`, `llms-txt`, `llms-full` (including `file://`).
- `git-sparse` uses `mkdtempSync(join(tmpdir(), "autodev-seed-"))`, shallow sparse-checkout, copies `.md` files filtered by `minimatch(path, pattern, { matchBase: true })`, and cleans up the temp dir in a `finally` block.
- `llms-txt` fetches the index, parses `[text](url)` links ending in `.md`, resolves relative URLs with `new URL(link, baseUrl)`, fetches each, writes to `targetSubdir`, and applies `excludePatterns`.
- `llms-full` supports `file://` via `readFileSync(url.slice(7))` and `http(s)://` via `fetch()`, writing to `targetSubdir/full-docs.md`.
- After all sources finish, calls `docsRebuildTier("central", embedFn)` and merges any rebuild errors into the returned `errors[]`.
- Partial-failure resilience: per-source errors are logged and seeding continues; successful sources still contribute to the rebuild.
- Added `js-yaml` and `minimatch` to `package.json` dependencies (`@types/js-yaml` NOT added — not required by plan).
- Created config template at `~/.AutoDev/config/docs-sources.yaml` with 18 active + 6 deferred sources, all commented out. Default source list is EMPTY. pi, magic-context, omo are marked `active: true` in comments; the rest are `active: false`. Deferred sources use `type: http` and include a note: "deferred until format converter is built". URLs and sparsePaths match the plan exactly.
- Seeding is NOT run automatically on install; no format converters were created for deferred sources; no `http` type was added to the `SeedSource` union.
- **Verification results:**
  - `bun test test/docs.test.ts`: 45 pass, 0 fail
  - `npx tsc --noEmit`: PASS (no output)
  - Direct smoke test with a temp git-sparse source: central DB populated with 2 chunks, 0 errors

## T7 fix: docs-sources template and package.json dependencies aligned to plan

- Overwrote `config/docs-sources.yaml` with the exact plan-specified template. 18 active sources + 6 deferred sources are all commented out; default `sources: []` is empty.
- Verified pi, magic-context, omo have `active: true`; all other active sources have `active: false`.
- Verified 6 deferred sources use `type: http` and carry the comment "DEFERRED: ... needs ...->MD converter" or the note "`http` type not in SeedSource union — commented out only".
- Removed `@types/js-yaml` from the dependency list description (was not actually added to `package.json`, but the learning note was corrected).
- `package.json` now lists only `js-yaml` and `minimatch` as new dependencies (alphabetical order preserved).
- **Verification results after fix:**
  - `bun test test/docs.test.ts`: 45 pass, 0 fail
  - `npx tsc --noEmit`: PASS (no output)

