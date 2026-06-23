# http-recorder — Source Structure
**npm name:** `@opencode-ai/http-recorder`
**private:** no (published — `publishConfig.access: public`)
**version:** 1.17.7
**type:** module
**license:** MIT
**description:** "Record and replay Effect HTTP client traffic with deterministic cassettes"
**engines.node:** >=22
**repository:** anomalyco/opencode (packages/http-recorder)

A **test-only** library that records real Effect HTTP and WebSocket traffic once, then replays it from deterministic JSON cassettes. Designed for provider-integration tests where hand-written HTTP mocks hide too much of the real request shape. Records request/response sequences (including retries, polling, multi-step flows) and WebSocket frame transcripts. **Public beta** depending on Effect 4 beta. Not runtime code — consumed only inside test suites via `@effect/vitest`/vitest.

## Key directories
- `src/`
  - `index.ts` — Public API entry (`HttpRecorder.http(name, options?)`, `HttpRecorder.socket(name, options?)`)
  - `recorder.ts` — Core record/replay engine
  - `cassette.ts` — Cassette (JSON file) read/write
  - `redaction.ts`, `redactor.ts` — Header/URL/JSON-body redaction (defense in depth + credential scan)
  - `matching.ts` — Request matching/equivalence (default strict-order, customizable matcher)
  - `effect.ts`, `internal-effect.ts`, `internal.ts` — Effect layer wiring + internals
  - `schema.ts` — Schemas for cassette format
  - `socket.ts`, `websocket.ts` — WebSocket record/replay (text + binary/base64 frames, ordered transcript)
  - `types.ts` — Shared types (`RecorderOptions`, `RedactOptions`, `RequestMatcher`)
- `script/`
  - `build.ts` — Build script (`bun ./script/build.ts`)
  - `verify-package.ts` — Package verification (`bun ./script/verify-package.ts`)
- `test/` — Cassette fixtures + tests

## Key files
- `package.json` — exports `.` → `./src/index.ts`, `./internal` → `./src/internal.ts`; `files: ["dist","README.md","CHANGELOG.md","LICENSE"]`
- `README.md` (8.3 KB) — thorough docs: install, quick start, API, WebSockets, refresh, redaction (table of options), matching/ordering, configuration, cassettes, current limits
- `LICENSE`
- `tsconfig.json`
- `sst-env.d.ts`

## Scripts
- `test` — `bun test --timeout 30000 --only-failures`
- `typecheck` — `tsgo --noEmit`
- `build` — `bun ./script/build.ts`
- `verify:package` — `bun ./script/verify-package.ts`

## Dependencies
- `@effect/platform-node` 4.0.0-beta.74, `@effect/platform-node-shared` 4.0.0-beta.74
- peerDep: `effect` 4.0.0-beta.74
- devDeps: `@tsconfig/node22`, `@types/bun`, `@types/node`, `@typescript/native-preview`, `effect`, `typescript`

## API (from README)
```ts
HttpRecorder.http(name, options?)   // recorded fetch-backed HttpClient
HttpRecorder.socket(name, options?) // decorates a standard Effect Socket
```

## Redaction options
`headers`, `allowRequestHeaders`, `allowResponseHeaders`, `queryParameters`, `jsonFields`, `url`, `body` — extensible redaction; unsafe cassettes fail without replacing existing recordings.

## Cassette behavior
- Cassettes = readable JSON, committed with tests, stored in `<cwd>/test/fixtures/recordings` by default.
- First local run records; later runs replay. `CI=true` → missing cassettes fail instead of recording.
- HTTP: ordered request/response sequence; JSON keys canonicalized before matching; concurrent requests recorded in request-start order.
- WebSocket: ordered client/server frame transcript; text frames use HTTP redaction; binary frames stored losslessly as base64; replay follows chronology.

## Current limits (from README)
- Buffered responses (no streaming timing/cancellation/backpressure assertions).
- WebSocket V1: no terminal close codes/reasons/transport failures; failed runs not recorded; transcripts in memory until connection ends.
- Requires exact Effect beta listed.