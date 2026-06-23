# T11 Docs Query System — Learnings

## What was built
- `extensions/autodev/docs/index.ts`: full implementation replacing the T5 stub.
  - 3 pi tools registered: `search_docs`, `docs_status`, `docs_rebuild`
  - Vector store: `bun:sqlite` with BLOB-stored Float32Array embeddings, pure-JS cosine similarity (no sqlite-vec)
  - Embedding layer: VoyageAI (voyage-3, primary) + ONNX fallback (`@xenova/transformers`, Xenova/all-MiniLM-L6-v2, 384-dim)
  - Chunking: split on `## ` heading boundaries, 1000-char cap, file-level 50-char minimum
  - DB path: `.autodev/embeddings/vectors.db` (resolved at call time, not load time)
  - MANIFEST.md skipped during corpus walk
- `test/mocks/embeddings.ts`: deterministic mock embedding fixture (384-dim, char-code derived, no network)
- `test/docs.test.ts`: 31 tests covering schema, rebuild, status, search, cosine props, chunking, tool wrappers, round-trip, walking, default paths
- `test/declarations.d.ts`: added ambient module for `@xenova/transformers` (optional dep, not in package.json)

## Key decisions
- **Injectable EmbedFn**: `searchDocs`/`docsRebuild`/`buildDocsTools` accept an `embedFn` param so tests use the deterministic mock without touching the network. The production `register()` uses the real `embed` (VoyageAI -> ONNX).
- **Tool execute signature**: pi's `ToolDefinition.execute` is `(toolCallId, params, signal, onUpdate, ctx)`. Tests pass `undefined` for signal/onUpdate/ctx -- works fine.
- **TypeBox import**: `import { Type, type Static } from "typebox"` (typebox is a transitive dep of pi-coding-agent, v1.1.38). `Type.Object`, `Type.String`, `Type.Optional`, `Type.Number` all available.
- **Chunking minimum is file-level, not chunk-level**: chunkMarkdown only drops empty chunks; the 50-char minimum is enforced in docsRebuild per-file. Keeps chunkMarkdown pure and predictable.
- **DB opened per tool call**: each tool's `execute` opens and closes the DB. Avoids holding a connection across the agent lifetime; the schema is idempotent.

## Pre-existing type errors (NOT this task's)
- `extensions/autodev/tools/handlers.ts`, `extensions/autodev/tools/index.ts`, `test/skills.test.ts` -- T12 work, pre-existing. No new errors introduced by T11.

## Verification
- `bun test test/docs.test.ts`: 31/31 pass
- `bun test` (full suite): 176/176 pass
- `bun run typecheck`: 0 errors in T11 files (12 pre-existing errors in tools/ + skills.test.ts)

## T12 — Custom Tools + Skills Port (complete)

**Files created/modified:**
- `extensions/autodev/tools/handlers.ts` (137 pure LOC) — todowrite + look_at execute handlers, shared `ToolResult`/`SessionDeps`/`TodoItem` types, `isValidTodoFormat` validator.
- `extensions/autodev/tools/session-handlers.ts` (135 pure LOC) — session_list/read/search handlers + `entryText` helper. Split out to keep both files under the 250 LOC ceiling.
- `extensions/autodev/tools/index.ts` (119 pure LOC) — `register(pi)` wires 5 tools via `pi.registerTool()`, using real `SessionManager` static methods for production deps.
- `test/mocks/session-manager.ts` — `createMockSessionDeps()` + `mockMessageEntry()` for session tool tests. Distinct from `pi-session.ts` (Plan 2 T8's createAgentSession mock).
- `test/tools.test.ts` — 20 tests covering all 5 tools (format validation, file reading, session list/read/search).
- `test/skills.test.ts` — 8 tests verifying frontmatter, body content, discoverability, no OmO refs.
- `.pi/skills/{autodev-triage,autodev-implement,autodev-review,autodev-deploy,autodev-onboard}/SKILL.md` — 5 ported skills.

**Key findings for future tasks:**
1. **`pi.registerTool()` requires `label`** (not just name/description) or tsc fails with TS2345.
2. **`AgentToolResult<T>.content` is a mutable `(TextContent|ImageContent)[]`** — readonly arrays fail assignment. `details: T` is required, not optional.
3. **`AgentMessage` is a union including `BashExecutionMessage`** which has no `content` field. Use `("content" in msg)` guard before accessing in session entry iteration.
4. **TypeBox `Static<T>` for `Type.String({enum:[...]})` yields `string`**, not the literal union — cast at the `registerTool` call site if the handler needs the narrowed type.
5. **`SessionManager.list(cwd)` is async** (returns `Promise<SessionInfo[]>`); `SessionManager.open(path)` is sync; `sm.getEntries()` is sync returning `SessionEntry[]`.
6. **`SessionInfo` fields:** `path`, `id`, `cwd`, `created`/`modified` (Date), `messageCount`, `firstMessage`, `allMessagesText`.
7. **Skills port:** remove `work-with-pr`, `ulw-loop`, `oh-my-openagent.jsonc`, `hyperplan`, `OpenCode` references. Replace `work-with-pr` with "worktree PR workflow", `ulw-loop` with "continuous work loop", `hyperplan` with "adversarial planning (Metis + Momus)".
8. **`.pi/skills/` did not exist** — created it. ARCHITECTURE.md §13 lists 4 skills but the task requires 5 (autodev-onboard included).
9. **`exactOptionalPropertyTypes: true`** means `{ name?: string }` won't accept `{ name: string | undefined }` — declare as `{ name: string | undefined }` explicitly.
10. **250 LOC ceiling:** handlers.ts hit 262 pure LOC with all 5 tools; split into handlers.ts (todowrite+look_at) + session-handlers.ts (3 session tools) to stay compliant.

**Verification:** `bun test` → 203 pass / 0 fail. `bun run typecheck` → clean. `extensions/autodev/index.ts` NOT modified.
