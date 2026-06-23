# function — Source Structure
**npm name:** `@opencode-ai/function`
**private:** yes
**version:** 1.17.7
**type:** module
**license:** MIT

Cloudflare Workers **serverless functions** for the OpenCode platform — notably a `SyncServer` DurableObject that brokers real-time session sync over WebSocket, plus GitHub-app-backed auth via `@octokit/auth-app` + `@octokit/rest` and JWT verification via `jose`. Built with **Hono** on the Cloudflare Workers runtime (DurableObjects, R2 buckets, WebSocket pairs). This is the serverless backend for cross-client session synchronization and GitHub App integration — not part of the in-process runtime.

## Key directories
- `src/`
  - `api.ts` — The sole source file. Exports `SyncServer` (a `DurableObject`) and a Hono API. Implements:
    - `SyncServer.fetch()` — accepts a WebSocket upgrade, lists existing `session/*` storage keys, sends them to the client on connect, persists incoming `webSocketMessage`
    - WebSocket pair setup via `new WebSocketPair()`, `this.ctx.acceptWebSocket(server)`
    - Reads `Env`: `SYNC_SERVER` (DurableObject namespace), `Bucket` (R2 bucket), `WEB_DOMAIN`
    - GitHub App auth via `createAppAuth` + `Octokit`
    - JWT verification via `createRemoteJWKSet` + `jwtVerify` from `jose`
    - `randomUUID` from `node:crypto`

## Key files
- `package.json`
- `tsconfig.json`
- `sst-env.d.ts`
- (no README.md, no AGENTS.md, no tests)

## Scripts
- (only `typecheck` implied via `@cloudflare/workers-types`; package.json has no `scripts`)

## Dependencies
- `@octokit/auth-app` 8.0.1, `@octokit/rest` (catalog), `hono` (catalog), `jose` 6.0.11
- devDeps: `@cloudflare/workers-types`, `@tsconfig/node22` 22.0.2, `@types/node`, `typescript`

## Notes
- Targets **Cloudflare Workers** (DurableObjects + R2 + WebSocket pairs), not Node.
- The `SyncServer` DurableObject is the real-time session-sync primitive used by the web/enterprise/console frontends to keep sessions in sync across browser tabs and clients.
- `@octokit/auth-app` indicates GitHub App integration (likely the GitHub provider backing the OpenCode platform's repo access).