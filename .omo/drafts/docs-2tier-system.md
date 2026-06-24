# docs-2tier-system — Planning draft

## Status: awaiting-approval

## Request
2-tier docs system: central store at ~/.AutoDev/docs-corpus/ (downloaded from upstream sources, NOT shipped in repo or copied on install) + project store at <project>/docs-corpus/. Dual-DB merged search. Explicit rebuild sub-commands. Seeding at end of FirstRun flow.

## Components (topology lock)
1. **gitignore + repo cleanup** — Remove docs-corpus/ from git tracking, add to .gitignore
2. **Central DB structure** — install-module.ts creates ~/.AutoDev/docs-corpus/ dir + empty vectors.db (schema only)
3. **docs/index.ts rework** — dual-path awareness, merged search, tier-prefixed results, tier-aware rebuild
4. **Seeding step** — download from upstream sources, chunk, embed, populate central DB (end of FirstRun flow)
5. **CLI sub-commands** — `autodev docs rebuild central` / `autodev docs rebuild project` in both CLI entry points
6. **init-module.ts** — create <project>/docs-corpus/ (empty) as part of autodev init
7. **Extension registration** — docs module registers with dual DB paths instead of single project-local path

## Decisions (confirmed by user)
- Central corpus: ~/.AutoDev/docs-corpus/ — NOT symlinked, NOT copied from package. Seeded by downloading from upstream sources at end of install.
- Central DB: ~/.AutoDev/docs-corpus/vectors.db (co-located with corpus)
- Project docs: <project>/docs-corpus/
- Project DB: <project>/.autodev/embeddings/vectors.db (existing path, unchanged)
- Search: merge both DBs, rank together, top-N with tier-prefixed doc_path (central: vs project:)
- Rebuild: explicit sub-commands — `autodev docs rebuild central` and `autodev docs rebuild project`
- MC jsonc: keep ${VOYAGE_API_KEY} env var reference, MC internal fallback handles ONNX
- docs-corpus/ in AutoDev repo: added to .gitignore, removed from git tracking
- Seeding source list: separate config concern (preselected defaults, user can pick later)

## Key findings from exploration
- docs/index.ts is 563 lines, single-tier, all project-local
- CLI handlers (scripts/cli.ts:339-357, orchestrator/cli.ts:288-305) are STUBS — print messages, never call docs module
- docs-corpus/ has 119 tracked files in git, NOT in .gitignore
- config-defaults.ts does NOT handle docs-corpus (no symlink target for it)
- install-module.ts runConfigFilesPhase (line 195) is the insertion point for central DB creation
- Tests: test/docs.test.ts (486 lines, 20+ tests), test/mocks/embeddings.ts (deterministic mock)
- Extension entry point registers docs at index.ts:40, calls register() which resolves paths at module load
- tsconfig.json already excludes docs-corpus from compilation

## Approach
7 waves, 14 todos. Wave 1: repo cleanup + central DB structure. Wave 2: docs/index.ts core rework. Wave 3: CLI sub-commands + init-module. Wave 4: seeding framework. Wave 5: integration + tests. Wave 6: extension registration update. Wave 7: final verification.

## Gate
Pending action: write .omo/plans/docs-2tier-system.md with full todos.
User approval needed before writing.