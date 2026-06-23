
## T13 — Pre-existing Issues Found (2026-06-23)

### Pre-existing type errors in other modules (not in orchestrator scope)
- `extensions/autodev/debate/index.ts:195` — `Property 'join' does not exist on type 'string'`. The `path` variable is typed as `string` but `.join()` is called on it. Likely needs `join(path, ...)` import.
- ~~`extensions/autodev/discord/bridge.ts` — Multiple type errors: `createAgentSession` doesn't exist on `ExtensionAPI`, `lastMessageId` is read-only, `getSession` doesn't exist, `agent_end` event not assignable. The Discord bridge was written against a different pi API version.~~ **FIXED in T14** — Bridge rewritten to use `InboundHandler` callback pattern and correct `agent_end` event shape.
- ~~`extensions/autodev/discord/index.ts:62` — `liaisonChannelId` type mismatch with `exactOptionalPropertyTypes`.~~ **FIXED in T14** — `BridgeConfig.liaisonChannelId` type updated to `string | undefined`.
- ~~`extensions/autodev/discord/__tests__/discord.test.ts` — Multiple `preconnect` property missing on mock fetch. Bun's fetch mock type requires `preconnect`.~~ **FIXED in T14** — All `global.fetch` assignments cast with `as any`.

These are pre-existing issues from T14 (Discord) and T15 (Debate) modules that were implemented before the orchestrator. They are outside T13 scope and should be fixed in their respective todos.
