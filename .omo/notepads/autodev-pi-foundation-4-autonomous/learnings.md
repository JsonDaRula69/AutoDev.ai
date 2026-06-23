
## T13 — Heartbeat, Crew Dispatch, CLI Commands (2026-06-23)

### Architecture
- The orchestrator module lives at `extensions/autodev/orchestrator/` with 5 source files and 1 test file.
- `projects.ts` — project registry for `.autodev/projects.json` with load/save/add/remove/setActive operations. Defaults to current cwd if no file exists.
- `heartbeat.ts` — `setInterval` timer (default 5 min) that polls GitHub via `gh issue list --label autodev-request --state open --json`. Implements exponential backoff on `gh` errors (base 30s, max 5 min, max 10 retries). Also checks stalled PRs (autodev-ci-running > 30 min) and blocked issues.
- `dispatch.ts` — creates Nemo triage sessions via `backgroundManager.spawn()` (NOT raw `createAgentSession`). Builds a structured Nemo prompt with Cynefin classification instructions. Transitions labels from `autodev-request` to `autodev-planned`.
- `cli.ts` — registers `autodev` command with 8 subcommands: doctor, onboard, status, stop, docs query, docs rebuild, debate start, debate status.
- `index.ts` — exports `register(pi)` which calls `registerCommands(pi)` and `startHeartbeat()`.

### Key Decisions
- The existing simple `autodev` command in `extensions/autodev/index.ts` was replaced by the orchestrator's richer subcommand-based version.
- The orchestrator module is registered as the 16th module in `index.ts` (after watch-officer-monitor).
- Work-item dedup uses `.autodev/work-items/<issue-number>.json` files with `{issue_number, dispatched_at, state, project}`.
- Issue text is truncated to 50,000 chars before passing to Nemo sessions.
- `pi.registerCommand("autodev", ...)` uses a single handler that parses subcommands from the args string, since pi's `registerCommand` doesn't support nested subcommand registration natively.

### Patterns
- All modules follow the same `export function register(pi: ExtensionAPI): void` pattern.
- Tests use mocks for `gh` CLI output and `backgroundManager.spawn` — no real GitHub API calls.
- The `execSync` mock pattern: `mock<(args: string) => string>(() => "")` with proper typing.

## T14 — Discord Bridge (2026-06-23)

### Architecture
- The discord module lives at `extensions/autodev/discord/` with 4 source files and 1 test file.
- `client.ts` — Discord REST client using `fetch()` directly (no `@openclaw/discord`). Implements rate limiting (max 5 req/s via queue with 200ms min interval), reconnection (max 3 attempts with exponential backoff: 1s, 2s, 4s), and HTTP 429 handling.
- `bridge.ts` — Bidirectional message relay. Accepts optional `InboundHandler` callback for session dispatch (delegated to caller). Registers `pi.on("agent_end")` to post responses to Discord. Reply polling via `setInterval` (10s) checks for replies to agent messages.
- `slash.ts` — Parses and handles `/autodev status`, `/autodev task`, `/autodev hold` commands.
- `index.ts` — Module registration. Reads `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID` env vars. Disables with warning if token or channel ID missing.

### Key Decisions
- **No pi session creation in bridge**: `ExtensionAPI` does not expose `createAgentSession()`. The bridge accepts an `InboundHandler` callback instead, delegating session management to the caller.
- **agent_end event shape**: The event carries `event.messages` (array of message objects), not `event.response`. The bridge extracts the last message's `content` field.
- **fetch() mock typing**: Bun's `global.fetch` type requires `preconnect` property. Tests use `as any` cast.
- **Module registration order**: Added after `intent-gate` and before `mcp-integrations` in the 16-module list.

### Patterns
- All public API methods on `DiscordClient` catch errors and return null/empty rather than throwing.
- Slash commands are parsed from message content (no Discord API command registration needed for bot-level parsing).
- Tests mock `global.fetch` for all Discord API calls — no real Discord interaction.

## T15 — Debate Protocol (2026-06-23)

### Architecture
- The debate module lives at `extensions/autodev/debate/` with 4 source files and 1 test file.
- `protocol.ts` — Cynefin classification (Simple/Complicated/Complex/Chaotic), debate state types, phase orchestration helpers (resolveMajorityVerdict, shouldRetryJudgeSession, buildParticipantPrompt).
- `sessions.ts` — Phase executors (Phase 1-5) that spawn sessions via `BackgroundManager.spawn()`. Phase 1 spawns 5 parallel sessions. Phase 2 collects structured arguments. Phase 3 spawns cross-examination (Complex only). Phase 4 spawns 3 judges sequentially (for retry handling). Phase 5 verifies implementation.
- `transcript.ts` — Builds and writes 6 transcript files to `.autodev/debates/<slug>/`: metadata.yaml, proposer-arguments.md, opposer-arguments.md, cross-examination.md, verdict.md, implementation-verification.md.
- `index.ts` — Module registration. Registers `autodev debate start "topic"` and `autodev debate status` commands.

### Key Decisions
- **BackgroundManager.spawn()** used for all 6 sessions (not raw createAgentSession), providing circuit breaker protection and concurrency control.
- **Judge sessions spawn sequentially** in Phase 4 because each judge must complete before the next spawns (for retry-once logic). This means tests need to complete sessions as they appear.
- **Cynefin classification** uses regex pattern matching: Chaotic (crisis indicators) → Simple (known knowns) → Complex (unknown unknowns) → default Complicated.
- **Judge error handling**: retry once on first error, block on second error (marks debate as `autodev-blocked`).
- **Simple topics** skip debate entirely. **Chaotic topics** route to Watch Officer. **Complicated** uses 5 sessions (skip Phase 3). **Complex** uses full 5-phase with 6 sessions.
- The `args` parameter in `pi.registerCommand` handler is a `string`, not `string[]`.

### Patterns
- YAML output needs careful formatting — `yamlValue` with indent=0 for top-level values avoids double-space issues.
- Async tests with BackgroundManager need microtask flushing (`await new Promise(r => setTimeout(r, 0))`) before sessions are available in the registry.
- Tests for sequential session spawning (Phase 4) use `setInterval` polling to complete sessions as they appear.
