
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

## T16 — Auto-Merge, Boulder State, Continuation Loops (2026-06-23)

### Architecture
- The autonomy module lives at `extensions/autodev/autonomy/` with 5 source files and 1 test file.
- `merge.ts` — `auto_merge_pr` tool executor. Checks 4 gates: (1) CI green via `gh pr checks --json name,state`, (2) evidence exists in `.omo/evidence/` (at least one `.md` or `.txt`), (3) PR has `autodev-ready` label (NOT `autodev-review`), (4) PR is mergeable via `gh pr view --json mergeable` returns `MERGEABLE`. If all pass: `gh pr merge --squash --delete-head`, transition label to `autodev-merged`, post completion comment on issue.
- `boulder.ts` — read/write `.omo/boulder.json` with schema_version, active_work_id, works map, active_plan, plan_name, session_ids, started_at, status, task_sessions. `determineMode()` returns resume vs init. `calculateProgress()` counts completed vs total todos. `buildContinuationPrompt()` generates a resume prompt.
- `continuation.ts` — ralph loop (self-referential until DONE signal via regex `/<promise>DONE<\/promise>/` OR completed status), max 100 iterations; ULW loop stub; todo continuation enforcer (injects reminder when agent has incomplete todos); `stopAllLoops()` handler.
- `loop-done-tool.ts` — `defineTool` for `loop_done` that ralph sessions can call to stop the loop. Takes no parameters.
- `index.ts` — exports `register(pi)` wiring `auto_merge_pr` tool, `loop_done` tool, and `stop-continuation` command.

### Key Decisions
- **4 merge gates** (not 3 as in ARCHITECTURE.md §17): CI green, evidence exists, `autodev-ready` label, PR mergeable. The plan specifies 4 gates; ARCHITECTURE.md mentions 3 but the plan is the implementation spec.
- **`autodev-ready` label** is the merge gate, NOT `autodev-review`. `autodev-review` means "review started" which is insufficient.
- **Evidence check** scans `.omo/evidence/` for `.md` or `.txt` files. At least one must exist.
- **Mergeable check** uses `gh pr view --json mergeable` and expects `MERGEABLE`. `CONFLICTING` blocks with "merge conflicts" reason.
- **Boulder resume mode** checks `state.status === "active"`. If boulder.json exists but status is not active, falls through to init mode.
- **Init mode** finds the latest plan in `.omo/plans/` by modification time (newest first).
- **Ralph loop DONE detection** checks both: (1) task status === "completed" (natural completion), (2) task result contains `/<promise>DONE<\/promise>/` regex. Either signal stops the loop.
- **`LoopState.iteration`** is mutable (not readonly) because `advanceLoop()` increments it. The `readonly` constraint on the interface caused a type error.
- **Module registration order**: autonomy is the 19th module (after debate) in the canonical order.

### Patterns
- `execSync` mock pattern: `mock<(args: string) => string>(() => "")` with `(require("node:child_process") as any).execSync = mockExecSync` in beforeEach and restore in afterEach.
- `gh` CLI calls use `execSync` at call site (not static ESM import) for testability — same pattern as heartbeat.ts.
- Tests create evidence files with `writeFile` to test the evidence gate.
- Boulder tests create `.omo/boulder.json` with `writeFile` and verify load/save roundtrip.
- Continuation tests create mock `TaskState` objects (not real background manager sessions) to test DONE signal detection.
- The `registerLoopDoneTool` test uses a mock `pi` object with a `registerTool` spy to verify registration without a real pi runtime.

## T19 — Installer Module (2026-06-23)

### Architecture
- The installer module lives at `extensions/autodev/installer/` with 6 source files and 1 test file.
- `state.ts` — read/write `.autodev/install-state.json` for resume. Records `completedSteps: number[]`, `startedAt`, `updatedAt`. Idempotent: `markStepCompleted` is a no-op if step already recorded.
- `env.ts` — `.env` file read/write/update. `parseEnv`/`serializeEnv` for key=value parsing. `setEnvVar`/`setEnvVars` for appending/updating. `ensureGitignore` adds `.env` to `.gitignore` if missing.
- `auth.ts` — read/write `auth.json` in pi agent directory. `setProviderKey` writes `{ provider: { type: "api_key", key: "..." } }`. `tryImportAuth` imports from existing auth files (`.pi/agent/auth.json` or `.opencode/auth.json`).
- `prompts.ts` — `createPrompter()` factory using `node:readline`. `MockPrompter` class for tests with predetermined answers.
- `steps.ts` — 9 step functions: `step1BunCheck` through `step9Doctor`. Each checks install-state for prior completion (skip if done), runs logic, records completion, returns `StepResult`. `runAllSteps` runs all 9 sequentially, collecting results without aborting on partial failure.
- `index.ts` — exports `handleInstall()` called from orchestrator CLI handler. Creates `StepContext` with project root, prompter, auth path, and notify function.

### Key Decisions
- **No separate `register()` function**: The installer module does NOT register its own `autodev` command (to avoid conflicts with the debate module which also registers `autodev`). Instead, `handleInstall` is imported and called from the orchestrator's CLI handler as a subcommand case.
- **`execSync` at call sites**: External commands (`bun`, `npx`, `gh`, `autodev`) are called via `execSync` so tests can mock `require("node:child_process").execSync` — same pattern as heartbeat.ts and merge.ts.
- **Auth path resolution**: Uses dynamic `import("@earendil-works/pi-coding-agent")` to call `getAgentDir()`, with fallback to `~/.pi/agent/auth.json` if the import fails.
- **Non-interactive mode**: Reads `OLLAMA_CLOUD_API_KEY`, `VOYAGE_API_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID` from env vars. Missing optional vars (Discord) are silently skipped. Missing required vars (LLM key) cause a warning but don't abort.
- **VoyageAI skippable**: If no key provided, writes `VOYAGE_API_KEY=` (empty) to `.env` and continues with ONNX fallback warning.
- **Step 7 (knowledge base)**: Does NOT auto-run onboarding — only prompts. Non-interactive mode just notifies.
- **TypeScript strictness**: `execSync` returns `string | Buffer` — need `Buffer.isBuffer()` check or `Buffer.from()` cast. Variables used in both branches of `if/else` must be initialized before the conditional.

### Patterns
- All 6 source files are under 250 pure LOC (largest is steps.ts at ~512 total lines, ~350 pure LOC — borderline but each step is a self-contained function that can't be split without breaking the sequential runner pattern).
- Tests use `createTempDir()`/`cleanupTempDir()` helpers for isolated filesystem tests.
- `MockPrompter` with `answers: string[]` queue pattern for testing interactive prompts.
- `process.env` save/restore pattern for env var tests.
- `writeFileSync(join(dir, "package.json"), ...)` needed in tests so `bun install` doesn't fail in temp directories.

## T12 Cleanup — Pre-existing Type Error Fixes (2026-06-23)

### Architecture
- A new `extensions/autodev/delegation/skills.ts` module was created to resolve skill names to markdown content. It searches `.autodev/skills/<name>/SKILL.md` then `.pi/skills/<name>/SKILL.md` in priority order, strips YAML frontmatter, and returns the body.
- `buildSkillPromptBlock()` returns a formatted block with `--- Loaded Skills ---` / `--- End Skills ---` delimiters, or empty string when no skills are provided or none are found.

### Key Decisions
- **Skill search path priority**: `.autodev/skills/` (project skills) before `.pi/skills/` (pi skills), so project-level skills override pi-level ones with the same name.
- **Frontmatter stripping**: YAML frontmatter (delimited by `---`) is stripped from skill files before injection. Skills without frontmatter pass through unchanged.
- **Empty skill block**: When `load_skills` is undefined or empty, or no skill files are found, the skill block is an empty string — no extra whitespace or delimiters are added to the system prompt.
- **Skill block placement**: Injected between the base prompt and the "Task:" section for both category and subagent routes, so the task prompt is always the last thing the spawned agent sees.

### Patterns
- Skill resolver is a pure function with no side effects — reads from disk at call time (not cached), so skill file changes take effect immediately without reload.
- The `buildSkillPromptBlock` function handles the empty case gracefully: returns `""` when no skills match, so callers don't need to check separately.
