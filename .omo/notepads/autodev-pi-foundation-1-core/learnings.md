# Learnings — autodev-pi-foundation-1-core

## Task 2: Verify narrative: field in all 13 src-agents/*.yaml files

- All 13 YAML files (nemo, aronnax, ned-land, conseil, oracle, momus, metis, harbor-master, quartermaster, boatswain, navigator, watch-officer, engineer) have a `narrative:` field.
- `grep -l "narrative:" src-agents/*.yaml | wc -l` returns 13 — all files present and accounted for.
- Every narrative field contains non-empty identity text, ranging from ~4 lines (metis, navigator) to ~49 lines (harbor-master).
- Harbor-master.yaml has the richest narrative at 49 lines, including dispatch protocol, ideation team assembly, and harbor log maintenance.
- The 4 operations agents (quartermaster, boatswain, navigator, watch-officer) all share `omo_mapping: sisyphus-junior` and have distinct narrative identities despite sharing the engineer base.
- No explore.yaml exists — confirmed per plan (Explore agent authored from scratch in T4).
- Evidence written to `.omo/evidence/task-2-autodev-pi-foundation.txt`.

## Task 3: Set up project dependencies and config files

- **Resolved versions:** `@earendil-works/pi-coding-agent@0.79.9`, `@cortexkit/pi-magic-context@0.26.0`, `typescript@6.0.3`, `@types/bun@1.3.14`. 179 packages total, 5.74s install time.
- **Peer-dep warnings are non-blocking:** pi-coding-agent and pi-tui both flagged "incorrect peer dependency" but install completes and all imports resolve. Safe to ignore for development; revisit if runtime issues surface.
- **bun postinstall blocking:** `bun install` blocked 1 postinstall script (standard security). Run `bun pm untrusted` to review. No effect on import resolution.
- **SDK exports verified callable:** `createAgentSession`, `SessionManager.inMemory()`, `SessionManager.create()`, `AuthStorage.create()`, `ModelRegistry.create()`, `DefaultResourceLoader` (class), `defineTool`, `CONFIG_DIR_NAME` (=== ".pi"), `getAgentDir`. All 11 import checks pass.
- **Magic Context Pi extension exports:** `default`, `persistPiMessageEndModelMeta`, `persistPiPressureFromMessageEnd`, `resolveDreamerFromConfig`, `resolveHistorianFromConfig`, `resolveSidekickFromConfig`. The `default` export is the pi extension factory — T5 will register it via `extensions` in settings.json.
- **JSON vs JSONC:** `.pi/auth.json` is a `.json` file (no comments allowed) — used `_comment_N` keys for documentation. `.pi/magic-context.jsonc` is JSONC (comments allowed) — `$schema` key added for editor validation.
- **Compaction disabled in settings.json:** Magic Context owns context management; pi's built-in compaction must be off (`compaction.enabled: false`) to avoid double-compression conflicts per Magic Context's compatibility docs.
- **Embedding provider choice:** VoyageAI via `openai-compatible` provider with `voyage-3-large` model. API key referenced as `${VOYAGE_API_KEY}` env var — installer (T19) prompts at deploy time. Magic Context supports `{env:VAR}` syntax but the `${VAR}` form also works per pi's models.json value resolution docs; kept `${VAR}` for consistency with pi conventions.
- **.gitignore scope:** node_modules/, dist/, .pi/auth.json, .DS_Store, *.log, .autodev/debug.log. Confirmed via `git check-ignore .pi/auth.json` → correctly ignored.
- **tsconfig strictness:** Added `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` beyond bare `strict: true` per the programming skill's TS reference. `moduleResolution: "bundler"` matches pi's jiti runtime.
- **Two config files register the extension:** `package.json` has `"pi": { "extensions": ["./extensions/autodev"] }` (pi-package form) AND `.pi/settings.json` has `"extensions": ["./extensions/autodev"]` (project-settings form). Both point at the same path — T5 creates `extensions/autodev/index.ts`.
- **Evidence written to:** `.omo/evidence/task-3-autodev-pi-foundation.txt`.

## Task 4: Port 12 crew agents to pi format + author Explore

- **Pi agent format confirmed:** Markdown file with YAML frontmatter delimited by `---` fences. Frontmatter fields: `name`, `description`, `tools` (comma-separated string), `model`. System prompt body is everything after the closing `---` fence.
- **Narrative preservation:** All 12 source YAML `narrative:` fields were copied verbatim into the agent .md body. Harbor Master's 49-line narrative (longest) and Metis/Navigator's 4-line narratives (shortest) all preserved without loss.
- **Operations agents share engineer.yaml body:** quartermaster, boatswain, navigator, watch-officer all have the engineer.yaml narrative + constraints + capabilities as their system prompt body, but each has its own frontmatter (name, description, tools, model) from its own YAML file. This matches the AGENTS.md spec: "The last four share the Engineer identity. They are distinct agents with specialized roles, but the same engine-room model and capability set powers each one."
- **Watch Officer model discrepancy:** src-agents/watch-officer.yaml has `model_preference: ollama-cloud/deepseek-v4-pro`, but the task spec explicitly lists Watch Officer under glm-5.2:cloud. Per AGENTS.md precedence ("instructions given directly in the prompt... outrank any AGENTS.md content"), the task spec routing was applied. Watch Officer uses glm-5.2:cloud.
- **Model routing summary:** 10 agents on glm-5.2:cloud (nemo, aronnax, metis, harbor-master, conseil, quartermaster, boatswain, navigator, watch-officer, explore), 3 agents on deepseek-v4-pro (ned-land, oracle, momus). All 13 model strings validated against `.autodev/config/models.json` allowlist — no substitutions needed.
- **Explore agent authored from scratch:** No src-agents/explore.yaml exists. Authored a Nautilus-themed identity: "the investigator sent into the dark — unmapped codebases, unknown dependencies." Includes exploration protocol (scope, execute, cross-reference, report), web search capabilities, and constraints (never-modify-files, cite-every-finding-with-a-file-path). Tools: read, bash, grep, glob, webfetch, websearch.
- **Bun test filename convention:** `bun test` requires `.test.`, `_test_`, `.spec`, or `_spec_` in the filename for auto-discovery. The task spec required `test/agent-load.ts` (no `.test.` infix), so it must be run with explicit path: `bun test ./test/agent-load.ts`. The test still runs and passes — it's just not auto-discovered by `bun test` alone.
- **Test coverage:** 95 tests across 1 file, 200 expect() calls. Per-agent: 7 tests (frontmatter fields, name-filename match, model allowlist, Nautilus identity markers, Constraints section, Capabilities section, body non-empty). Plus 4 aggregate tests (file count, slug presence, allowlist contents, aggregate model validation).
- **Frontmatter parsing:** Simple YAML key:value parsing (no nested structures or arrays in frontmatter). The test uses a regex to extract the `---`-delimited block and parses colon-separated key/value pairs line by line. Works because pi agent frontmatter is flat scalar fields only.
- **Evidence written to:** `.omo/evidence/task-4-autodev-pi-foundation.txt`
