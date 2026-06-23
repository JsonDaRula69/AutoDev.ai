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
