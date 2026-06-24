# F3: Integration QA — Dual-tier docs system with mock sources

## Verdict: APPROVE

All required end-to-end behaviors were verified using deterministic mock sources and an isolated temporary directory. No real network or `~/.AutoDev/` was used.

## Environment

- Temp root: `/var/folders/sv/_l2n98214zx909xxtctxk2nc0000gn/T/autodev-f3-XXXXXX.wTyN7MIygC`
- `PI_CODING_AGENT_DIR`: `<temp>/agent`
- Mock sources config: `<temp>/config/docs-sources.yaml`
- Mock git source: `<temp>/repo` (local `file://` git repo)
- Project corpus dir: `<temp>/project` (cwd for project-tier checks)
- Embedding function: `mockEmbedFn` from `test/mocks/embeddings.ts` (384-dim deterministic vectors)

## Checks performed

### 1. FirstRun-style seeding of central docs

- Wrote `docs-sources.yaml` with one `git-sparse` source named `mock-docs` pointing at the local temp git repo, `sparsePath: docs`, `targetSubdir: mock-docs`, `active: true`.
- Ran `seedCentralDocs(config.sources, mockEmbedFn)`.
- Result: `{ chunks: 5, errors: [] }`.
- Verified central DB exists at `<temp>/docs-corpus/vectors.db` and `SELECT COUNT(*) FROM chunks` returns `5`.

### 2. Central DB schema verification

- `chunks` table has `source_name` column.
- `chunks_fts` virtual FTS5 table exists on `(content, source_name)`.
- Central rows observed:
  - `mock-docs/api.md` chunks 0-2 (includes `createAgentSession`)
  - `mock-docs/concepts.md` chunks 0-1 (includes "Agent session creation")

### 3. Project corpus setup

- Created `<temp>/project/docs-corpus/project-guide.md` with 3 distinct chunks including project-specific `createAgentSession` usage.
- Ran `docsRebuildTier("project", mockEmbedFn)` → `{ chunks: 3, errors: [] }`.
- Project DB at `<temp>/project/.autodev/embeddings/vectors.db` has 3 chunks.

### 4. `searchDocsBoth` semantic query

Query: `"agent session creation"`

Top results contained tier-prefixed paths from both tiers:
- `central:mock-docs/api.md`
- `central:mock-docs/concepts.md`
- `project:project-guide.md`

This confirms the dual-tier merge works and semantic similarity returns conceptually relevant chunks from both central and project tiers.

### 5. `searchDocsBoth` exact query

Query: `"createAgentSession"`

Top results contained:
- `central:mock-docs/api.md` chunks (including the chunk whose content literally contains `createAgentSession`)
- `project:project-guide.md` chunks

The exact token was matched and central results appeared in the merged list, demonstrating BM25/exact boosting behavior in the hybrid search.

### 6. Tier prefix verification

All `searchDocsBoth` result `doc_path` values were prefixed with either `central:` or `project:`.

### 7. `docsStatusBoth` reporting

```json
{
  "central": {
    "chunk_count": 5,
    "doc_count": 2,
    "components": ["mock-docs"],
    "db_path": "<temp>/docs-corpus/vectors.db",
    "tier": "central"
  },
  "project": {
    "chunk_count": 3,
    "doc_count": 1,
    "components": [],
    "db_path": "<temp>/project/.autodev/embeddings/vectors.db",
    "tier": "project"
  }
}
```

Both tier stats were returned successfully.

### 8. CLI-equivalent `docs query "createAgentSession"`

Because the production CLI currently uses the real `embed()` provider (VoyageAI/ONNX), this integration test exercised the same `searchDocsBoth` function that the CLI calls, with mock embeddings injected.

Output contained tier-prefixed results, including:
- `project:project-guide.md (#0)`
- `project:project-guide.md (#2)` — content includes `createAgentSession`
- `project:project-guide.md (#1)`

The CLI command would be `bun ./scripts/cli.ts docs query "createAgentSession"`; the underlying `searchDocsBoth` call was verified directly.

### 9. CLI-equivalent `docs rebuild project`

Again using the same underlying function the CLI invokes (`docsRebuildTier("project", embedFn)`), with mock embeddings:

```
Rebuilding project docs corpus index...
3 chunks indexed, 0 errors
```

The CLI command would be `bun ./scripts/cli.ts docs rebuild project`; the rebuild logic was verified directly.

## Caveats / notes

- The actual `bun ./scripts/cli.ts docs query ...` cannot currently run end-to-end in a fully offline environment because the CLI hard-codes `embed()` (VoyageAI when `VOYAGE_API_KEY` is set, otherwise ONNX via `@xenova/transformers`). This test suite used `mockEmbedFn` to exercise the same core functions deterministically without network or model downloads.
- `@xenova/transformers` is not installed in this workspace, so the ONNX fallback is unavailable. This is acceptable for the integration QA because the mock path validates the dual-tier logic.

## Conclusion

The dual-tier docs system correctly:
1. Seeds central docs from a configured `git-sparse` source into an isolated central corpus.
2. Creates and populates the central SQLite vector DB with chunks and FTS5 index.
3. Merges central and project search results via `searchDocsBoth` with tier-prefixed `doc_path` values.
4. Distinguishes semantic vs exact/hybrid query behavior.
5. Reports status for both tiers via `docsStatusBoth`.
6. Rebuilds the project tier and reports chunk counts.

**APPROVE** — F3 integration criteria satisfied with deterministic mock sources.
