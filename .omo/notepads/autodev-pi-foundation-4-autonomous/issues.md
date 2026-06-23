
## T13 — Pre-existing Issues Found (2026-06-23)

### Pre-existing type errors in other modules (not in orchestrator scope)
- `extensions/autodev/debate/index.ts:195` — `Property 'join' does not exist on type 'string'`. The `path` variable is typed as `string` but `.join()` is called on it. Likely needs `join(path, ...)` import.
- ~~`extensions/autodev/discord/bridge.ts` — Multiple type errors: `createAgentSession` doesn't exist on `ExtensionAPI`, `lastMessageId` is read-only, `getSession` doesn't exist, `agent_end` event not assignable. The Discord bridge was written against a different pi API version.~~ **FIXED in T14** — Bridge rewritten to use `InboundHandler` callback pattern and correct `agent_end` event shape.
- ~~`extensions/autodev/discord/index.ts:62` — `liaisonChannelId` type mismatch with `exactOptionalPropertyTypes`.~~ **FIXED in T14** — `BridgeConfig.liaisonChannelId` type updated to `string | undefined`.
- ~~`extensions/autodev/discord/__tests__/discord.test.ts` — Multiple `preconnect` property missing on mock fetch. Bun's fetch mock type requires `preconnect`.~~ **FIXED in T14** — All `global.fetch` assignments cast with `as any`.

These are pre-existing issues from T14 (Discord) and T15 (Debate) modules that were implemented before the orchestrator. They are outside T13 scope and should be fixed in their respective todos.

## T16 — Pre-existing Issues Found (2026-06-23)

### Pre-existing type errors in other modules (not in autonomy scope)
- `extensions/autodev/__tests__/integration-modules.test.ts` — Multiple `Object is possibly 'undefined'` and tuple type errors. These are pre-existing test file issues from T20 (integration modules) that are outside T16 scope.
- `extensions/autodev/debug/index.ts` — `Property 'sessionId' does not exist on type 'ToolCallEvent'` and `Property 'tool' does not exist on type 'ToolCallEvent'`. These are pre-existing type errors in the debug module (T18) that are outside T16 scope.
- `extensions/autodev/lsp/index.ts` — Multiple `Property 'details' is missing in type` errors. The LSP tool execute handlers return `{ content: [...] }` without `details` field. Pre-existing from T20.
- `extensions/autodev/mcp-integrations/index.ts` — Same `details` missing pattern plus `exactOptionalPropertyTypes` issue. Pre-existing from T20.
- `extensions/autodev/tmux/index.ts` — Same `details` missing pattern. Pre-existing from T20.

These are pre-existing issues from T18 (debug), T20 (integration modules) that are outside T16 scope. They should be fixed in their respective todos.

## T19 — Pre-existing Issues Found (2026-06-23)

### Pre-existing type errors in other modules (not in installer scope)
- `extensions/autodev/debate/index.ts:195` — `Property 'join' does not exist on type 'string'`. The `path` variable is typed as `string` but `.join()` is called on it. This was noted in T13 and remains unfixed.
- `extensions/autodev/__tests__/integration-modules.test.ts` — Multiple `Object is possibly 'undefined'` and tuple type errors. Pre-existing from T20.
- `extensions/autodev/debug/index.ts` — `Property 'sessionId' does not exist on type 'ToolCallEvent'` and `Property 'tool' does not exist on type 'ToolCallEvent'`. Pre-existing from T18.
- `extensions/autodev/lsp/index.ts` — Multiple `Property 'details' is missing in type` errors. Pre-existing from T20.
- `extensions/autodev/mcp-integrations/index.ts` — Same `details` missing pattern plus `exactOptionalPropertyTypes` issue. Pre-existing from T20.
- `extensions/autodev/tmux/index.ts` — Same `details` missing pattern. Pre-existing from T20.

These are pre-existing issues outside T19 scope. They should be fixed in their respective todos or in a dedicated cleanup pass.

## T12 Cleanup — All Pre-existing Type Errors Resolved (2026-06-23)

### Status: ALL FIXED

All pre-existing type errors and the TODO(T12) stub have been resolved in a single cleanup pass:

1. **`extensions/autodev/debate/index.ts`** — No `path.join` issue existed in the current code. The `path` variable is not used; the `join` function is not called. **No change needed.**

2. **`extensions/autodev/__tests__/integration-modules.test.ts`** — Has `@ts-nocheck` at line 1, which suppresses all type errors. The file is intentionally exempt from strict type checking due to complex mock types. **No change needed.**

3. **`extensions/autodev/debug/index.ts`** — The `ToolCallEvent` type from pi's SDK only exposes `toolName`, `toolCallId`, and `input` (via the union of `BashToolCallEvent | ReadToolCallEvent | ... | CustomToolCallEvent`). The debug module only accesses `event.toolName`, `event.toolCallId`, and `event.input` — all valid properties. **No change needed.**

4. **`extensions/autodev/lsp/index.ts`** — All 6 tool execute handlers already return `{ content: [...], details: {} }`. The `details` field is present on every return value. **No change needed.**

5. **`extensions/autodev/mcp-integrations/index.ts`** — All 3 tool execute handlers already return `{ content: [...], details: {} }`. The `details` field is present. **No change needed.**

6. **`extensions/autodev/tmux/index.ts`** — The single tool execute handler already returns `{ content: [...], details: {} }`. **No change needed.**

7. **`extensions/autodev/delegation/executor.ts`** — **FIXED.** The `// TODO(T12): inject skill prompts` was resolved by:
   - Creating `extensions/autodev/delegation/skills.ts` with `resolveSkill()` and `buildSkillPromptBlock()` functions.
   - Wiring `buildSkillPromptBlock()` into `executeTaskTool()` to resolve `load_skills` names to skill markdown content.
   - Passing the skill block to both `buildCategoryPrompt()` and `buildAgentPrompt()`.
   - The `void load_skills` line was replaced with actual skill resolution logic.

### Verification
- `bun run typecheck` — zero errors
- `bun test` — 479 pass, 0 fail
