# autodev-pi-foundation-3-knowledge — Knowledge + Tools

> **BRANCH:** All work in this plan is conducted on the `pi-foundation` branch. Do NOT push to `main`. The `pi-foundation` branch was created from `main` as a fresh start — all commits land here. `main` is frozen and will not receive any pushes during this work. Upon completion of all sub-plans, `main` will be deprecated and `pi-foundation` will become the new `main` branch (via branch rename or fast-forward merge at the user's discretion).

> **PREREQUISITE:** This plan depends on `.omo/plans/autodev-pi-foundation-1-core.md` being complete. The base extension (T5) must be in place before this plan can execute. This plan can parallelize with Plan 2 (Crew Engine) after Plan 1 completes.

> **SPLIT FROM:** This is sub-plan 3 of 4 from the master plan `.omo/plans/autodev-pi-foundation.md`. Execute after Plan 1 completes. Can run in parallel with Plan 2.

## TL;DR (For humans)

**What you'll get:** Knowledge systems: Loreguard ADR store with FTS5 search, docs query system with VoyageAI/ONNX embeddings, custom tools (todowrite, look_at, session management), and 4 AutoDev skills ported to pi format.

**Effort:** M — 3 todos across 1 wave.
**Risk:** Low-Medium — each todo is self-contained and can be built independently. Mitigated by: clear design specs, bun:sqlite for all storage, and pi's defineTool() API.

## Design Specification

This plan implements the design described in the following documents. If this plan and the docs disagree, the docs win.

| Document | What it specifies | Key sections |
|----------|-------------------|--------------|
| `README.md` | User-facing design: crew roles, quick start, workflow, configuration, coexistence | §Configuration (.pi/ + .autodev/) |
| `ARCHITECTURE.md` | Developer-facing system design: 34 sections covering every component | §10 Loreguard, §11 Docs Query, §12 Custom Tools, §13 Skills System |
| `STRUCTURE.md` | Directory map and reference catalog: where every file lives | §1 Project Layout (directory tree), §6 Skills (4 skills) |
| `ROADMAP.md` | Future waves: features NOT in this plan | §Near-term (hashline, notifications, CLI commands, think mode, inter-agent communication), §Medium-term (MCP OAuth, CodeGraph, babysitter), §Long-term (single binary) |

## Scope

### Must have

- **Loreguard: ADR store + search_lore tool.** SQLite FTS5-backed ADR store (bun:sqlite works on pi). CRUD operations, full-text search, ratification workflow. Expose as `search_lore` pi tool.
- **Docs query: embeddings + search_docs tool.** Embedding layer (VoyageAI or local ONNX), vector store (SQLite BLOB cosine similarity), search_docs tool. Rebuild docs corpus from docs-corpus/ (218 files).
- **Custom tools via defineTool().** Register: todowrite, search_lore, search_docs, look_at (if multimodal needed), session management tools. Each tool: name, description, parameters (TypeBox schema), execute function returning content + details.
- **Skills system.** Port .autodev/skills/ to pi's skill format (SKILL.md with YAML frontmatter). Skills: autodev-triage, autodev-implement, autodev-review, autodev-deploy. Load via pi's skill discovery (`.pi/skills/` or `.agents/skills/`).

### Must NOT have (guardrails, anti-slop, scope boundaries)

- **Must NOT install or depend on OmO (oh-my-openagent).** Build directly on pi primitives.
- **Must NOT depend on OpenCode packages.** Zero OpenCode dependencies.
- **Must NOT reimplement semantic memory.** Magic Context Pi extension provides ctx_search, ctx_memory, ctx_note, ctx_expand, ctx_reduce, historian, dreamer. Install it, don't rebuild it.
- **Must NOT build a single binary.** Future wave. Out of scope.
- **Must NOT use better-sqlite3** — use bun:sqlite only.
- **Must NOT make Loreguard an MCP server** — direct library, in-process.
- **Must NOT use sqlite-vec extension** — pure JS cosine similarity.
- **Must NOT require VoyageAI** — local ONNX fallback must work.
- **Must NOT register tools that duplicate Magic Context's tools** (ctx_search, ctx_memory, etc.).
- **Must NOT port third-party skills** — only AutoDev's 4 custom skills.
- **Must NOT push to `main`.** All work is on the `pi-foundation` branch. `main` is frozen. No commits, no pushes to `main` during this work. Upon completion, `main` will be deprecated and `pi-foundation` becomes the new `main`.

## Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T10 (Loreguard) | T5 | — | T6, T7, T8, T9, T11, T12 |
| T11 (Docs query) | T5 | — | T6, T7, T8, T9, T10, T12 |
| T12 (Custom tools + skills) | T5 | — | T6, T7, T8, T9, T10, T11 |

Critical Path: T5 (from Plan 1) → T10/T11/T12 (all parallel)

## Todos
> Implementation + Test = ONE todo. Never separate.

### Wave 3 — Knowledge + Tools (Parallel after T5)

- [ ] 10. Build Loreguard ADR store and search_lore tool
  What to do: Build a SQLite FTS5-backed ADR (Architecture Decision Record) store. Use `bun:sqlite` (works on pi since pi runs on Bun). Schema: decisions table (id, title, status, content, created_at, ratified_at) + FTS5 virtual table on title+content. Operations: create, read, search (FTS5), ratify (status: draft→ratified), archive. Expose as a `search_lore` pi tool via `defineTool()`: `search_lore(query: string) -> Decision[]`. Also expose `suggest_lore(title, content) -> id` for proposing new decisions. DB path: `.autodev/decisions/loreguard.db` or configurable.
  Must NOT do: Do NOT use better-sqlite3 — use bun:sqlite only. Do NOT make Loreguard an MCP server — direct library, in-process. Do NOT allow unratified decisions to be returned as truth (search returns ratified only by default; include_drafts param for all).
  Parallelization: Wave 3 | Blocked by: T5 | Blocks: nothing | Can parallelize with: T6, T7, T8, T9, T11, T12
  References: bun:sqlite: `import { Database } from "bun:sqlite"`. FTS5: `CREATE VIRTUAL TABLE decisions_fts USING fts5(title, content, content='decisions', content_rowid='id')`. Pi defineTool(): same as T9. ADR source files at .autodev/decisions/. AGENTS.md says "Search lore — search_lore for ratified decisions. Loreguard records are truth."
  Design refs: ARCHITECTURE.md §10 Loreguard
  Acceptance criteria: A test that creates a decision, ratifies it, and searches for it by keyword → returns the decision. A test that searches for an unratified decision with include_drafts=false → returns nothing. A test that calls `search_lore` from a pi session and gets results. DB file exists at configured path. FTS5 search works (search "architecture" returns decisions containing that word).
  QA scenarios: happy — CRUD works, FTS5 search works, tool available in session. Failure — bun:sqlite not available (wrong runtime); or FTS5 not supported (SQLite version too old); or search_lore tool not registered. Evidence: `.omo/evidence/task-10-autodev-pi-foundation.txt` (test outputs + DB file).
  Commit: Y | feat(loreguard): SQLite FTS5 ADR store + search_lore tool

- [ ] 11. Build docs query system and search_docs tool
  What to do: Build a docs corpus query system. Embedding layer: support VoyageAI (remote) and local ONNX (Xenova/all-MiniLM-L6-v2, ~90MB). Vector store: SQLite BLOB storage with Float32Array cosine similarity (no sqlite-vec extension needed). search_docs tool: `search_docs(query: string, limit?: number) -> DocResult[]`. docs status: `docs_status() -> {chunk_count, doc_count, components}`. docs rebuild: `docs_rebuild() -> {chunks, errors}`. Rebuild the docs corpus from docs-corpus/ (218 files). DB path: `.autodev/embeddings/vectors.db` or configurable. Register as pi tools via defineTool().
  Must NOT do: Do NOT use better-sqlite3 — use bun:sqlite. Do NOT use sqlite-vec extension — pure JS cosine similarity. Do NOT require VoyageAI — local ONNX fallback must work. Do NOT delete docs-corpus/ — it's the source for rebuild.
  Parallelization: Wave 3 | Blocked by: T5 | Blocks: nothing | Can parallelize with: T6, T7, T8, T9, T10, T12
  References: bun:sqlite for vector storage. VoyageAI API key in env var VOYAGE_API_KEY. Local ONNX model: Xenova/all-MiniLM-L6-v2. Cosine similarity: dot(a,b) / (norm(a) * norm(b)). Pi defineTool(): same as T9. docs-corpus/ has 218 files + MANIFEST.md.
  Design refs: ARCHITECTURE.md §11 Docs Query System
  Acceptance criteria: `docs_status()` returns non-zero chunk_count after rebuild. `docs_rebuild()` ingests docs-corpus/ files and returns {chunks: >0, errors: 0}. `search_docs("what is magic context")` returns relevant DocResult[] with similarity scores. Local ONNX fallback works when VOYAGE_API_KEY is unset. `search_docs` tool available in pi session.
  QA scenarios: happy — rebuild ingests corpus, search returns results, local fallback works. Failure — VoyageAI API key missing and local model not downloaded; or cosine similarity returns NaN (zero vector); or docs-corpus/ empty. Evidence: `.omo/evidence/task-11-autodev-pi-foundation.txt` (rebuild output + search results + status).
  Commit: Y | feat(docs): embedding layer + vector store + search_docs tool

- [ ] 12. Build custom tools and port skills
  What to do: Register AutoDev's custom tools as pi tools via `defineTool()` in the base extension: (a) `todowrite` — write/update/cancel todos with the 4-element format (WHERE, WHY, HOW, EXPECTED RESULT); (b) `look_at` — analyze media files (images, PDFs) using pi's multimodal capabilities; (c) `session_list`, `session_read`, `session_search` — session management using pi's SessionManager API. Port .autodev/skills/ to pi's skill format (SKILL.md with YAML frontmatter). Skills to port: autodev-triage (triggered on new autodev-request issue), autodev-implement (executes plans with evidence), autodev-review (Oracle PR review), autodev-deploy (liaison coordination). Place in `.pi/skills/` or `.agents/skills/`. Each skill: SKILL.md with name, description, and step-by-step instructions. Verify skills are discoverable by pi's skill loader.
  Must NOT do: Do NOT register tools that duplicate Magic Context's tools (ctx_search, ctx_memory, etc.). Do NOT port third-party skills — only AutoDev's 4 custom skills. Do NOT make todowrite a simple text writer — enforce the 4-element format.
  Parallelization: Wave 3 | Blocked by: T5 | Blocks: nothing | Can parallelize with: T6, T7, T8, T9, T10, T11
  References: Pi defineTool(): same as T9. Pi skills: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md (SKILL.md format, .pi/skills/ or .agents/skills/). .autodev/skills/ has custom skill definitions (autodev-triage, autodev-implement, autodev-review, autodev-deploy). Pi SessionManager: `SessionManager.list(cwd)`, `SessionManager.open(path)`, `sm.getEntries()`. Todowrite format: content (WHERE HOW to WHY - expect RESULT), status (pending/in_progress/completed/cancelled), priority (high/medium/low).
  Design refs: ARCHITECTURE.md §12 Custom Tools, ARCHITECTURE.md §13 Skills System
  Acceptance criteria: `todowrite` tool available in pi session; calling it with valid todos persists them. `look_at` tool available (if multimodal model configured). `session_list` returns sessions. 4 skill files exist at `.pi/skills/autodev-triage/SKILL.md` etc. Skills discoverable: `pi` shows skills in startup header. A test that loads the autodev-triage skill and confirms it contains triage instructions.
  QA scenarios: happy — all tools registered, skills discoverable, todowrite enforces format. Failure — a tool not registered (defineTool error); or skills not found (wrong path); or todowrite accepts malformed todos. Evidence: `.omo/evidence/task-12-autodev-pi-foundation.txt` (tool list + skill list + todowrite test).
  Commit: Y | feat(tools): custom tools (todowrite, look_at, session) + port AutoDev skills

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Verify scope — Loreguard, docs query, 5 custom tools, 4 skills
- [ ] F2. Code quality — SQLite schema, embedding layer, tool schemas, skill format
- [ ] F3. Manual QA — Loreguard CRUD test, docs rebuild + search test, todowrite format test, skill discovery test

## Commit strategy

- One commit per code-changing todo (T10, T11, T12).
- Commit types: `feat(loreguard)` (T10), `feat(docs)` (T11), `feat(tools)` (T12).
- Evidence committed alongside code in `.omo/evidence/`.
- Atomic commits — each todo is independently revertable.
- All commits land on the `pi-foundation` branch.

## Success criteria

1. Loreguard stores and retrieves ADRs via SQLite FTS5 + search_lore tool.
2. Docs corpus (218 files) is searchable via search_docs tool with VoyageAI or local ONNX embeddings.
3. Custom tools (todowrite, look_at, session management) registered and working.
4. 4 AutoDev skills (triage, implement, review, deploy) ported and discoverable.
5. `grep -r "@opencode-ai" extensions/ .pi/ src/` returns zero (zero OpenCode package imports).
6. `grep -r "oh-my-openagent\|oh-my-opencode" package.json` returns zero (zero OmO dependencies).
