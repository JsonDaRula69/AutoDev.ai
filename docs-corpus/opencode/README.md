# OpenCode — Substrate Documentation

**Source:** OpenCode fork at `/tmp/opencode-unified/` (repo: `JsonDaRula69/opencode`, upstream `anomalyco/opencode`).

This directory collects the documentation that T4 (unified source tree) needs to decide what OpenCode code goes where. The AutoDev runtime embeds OpenCode **in-process** via `createOpencodeServer()` and launches the TUI — it does NOT use the web app, desktop app, Slack bot, or analytics site.

## Files Collected Here

| File | Source |
|---|---|
| `AGENTS.md` | `/tmp/opencode-unified/AGENTS.md` |
| `CONTEXT.md` | `/tmp/opencode-unified/CONTEXT.md` |
| `CONTRIBUTING.md` | `/tmp/opencode-unified/CONTRIBUTING.md` |
| `README-fork.md` | `/tmp/opencode-unified/README.md` (renamed to avoid clash with this file) |
| `SECURITY.md` | `/tmp/opencode-unified/SECURITY.md` |
| `STATS.md` | `/tmp/opencode-unified/STATS.md` |
| `packages/` | Per-package docs (package.json, README, AGENTS.md, SOURCE-STRUCTURE.md) — **all 24 packages documented** |
| `api-types/` | `.d.ts` from `node_modules/@opencode-ai/sdk/dist/` + `openapi.json` from fork |

## Package Relevance Analysis (24 packages)

Each package in the fork's `packages/` was inspected directly: `package.json` (name/description/private/version/exports/deps), README if present, AGENTS.md if present, and the full `src/` directory tree. Every row below is backed by the per-package `SOURCE-STRUCTURE.md` (or `SOURCE-MAP.md` for the original 9) in `packages/<name>/`. Classification is for the AutoDev unified source tree (T4).

### Legend
- **KEEP** — AutoDev runtime needs this (or the user has directed it be kept). Include in unified source tree.
- **EXCLUDE** — Not used by AutoDev. Omit from unified tree.
- **KEEP (transitive)** — Only needed because a KEEP package depends on it.

### Decision Table

| # | Package | npm name | private? | version | Decision | Rationale (evidence-based) |
|---|---|---|---|---|---|---|
| 1 | `opencode` | `opencode` | yes | 1.17.7 | **KEEP** | Core OpenCode runtime. `createOpencodeServer()` lives here. AutoDev embeds this in-process. Foundation. |
| 2 | `core` | `@opencode-ai/core` | yes | 1.17.7 | **KEEP** | Shared core utilities: account, agent, config, database, effect, event, filesystem, credential. The runtime depends on this. |
| 3 | `server` | `@opencode-ai/server` | yes | 1.17.7 | **KEEP** | HTTP/WebSocket server (`api.ts`, `routes.ts`, `handlers/`). `createOpencodeServer()` wraps this. AutoDev runs it in-process. |
| 4 | `plugin` | `@opencode-ai/plugin` | no | 1.17.7 | **KEEP** | Plugin system (`tool.ts`, `tui.ts`, `shell.ts`, `example.ts`). OmO and Magic Context plug in here. Critical for extensibility. |
| 5 | `cli` | `@opencode-ai/cli` | no | 1.17.7 | **KEEP** | CLI entry point (`src/commands/`, `src/framework/`, `src/services/`, `src/tui.ts`). AutoDev wraps this with its own `autodev` CLI. |
| 6 | `tui` | `@opencode-ai/tui` | yes | 1.17.7 | **KEEP** | Terminal UI (`app.tsx`, `component/`, `routes/`, `plugin/`). AutoDev launches this for interactive use. |
| 7 | `llm` | `@opencode-ai/llm` | yes | 1.17.7 | **KEEP** | Schema-first LLM core. Provider adapters. AutoDev's model routing depends on this. |
| 8 | `sdk` | (no package.json — ships via `@opencode-ai/sdk` npm) | — | — | **KEEP** | SDK package: `js/` + `openapi.json`. The `.d.ts` type definitions AutoDev imports come from the published `@opencode-ai/sdk`. |
| 9 | `web` | `@opencode-ai/web` | no | 1.17.7 | **KEEP** | **Astro + Starlight marketing & documentation site** (opencode.ai). `astro.config.mjs` wires `@astrojs/starlight` 0.34 + `@astrojs/cloudflare` + `@astrojs/solid-js`. `src/content/docs/` holds the Starlight docs (index, quickstart, cli, config, commands, agents, custom-tools, ecosystem, enterprise, formatters, github, gitlab, go, ide, acp + i18n locale dirs). `src/components/` has `Lander.astro`, `Hero.astro`, `Header.astro`, `Footer.astro`, `SiteTitle.astro`, `LanguageSelect.astro`, `Share.tsx` (Solid island). **Not a web-client for the runtime** — it is the public marketing + docs site. **KEPT per user direction** as a useful surface alongside the TUI. devDep `opencode` `workspace:*` for build-time type access only. |
| 10 | `ui` | `@opencode-ai/ui` | no | 1.17.7 | **KEEP** | **Shared Solid.js UI component library** — the single source of truth for all reusable OpenCode browser widgets. `src/components/` has **197 entries** (button, card, dialog, dropdown-menu, context-menu, hover-card, checkbox, accordion, collapsible, list, avatar, icon, file, file-icon, file-media, markdown-stream, diff-changes, dock-surface, dock-prompt, line-comment, animated-number, app-icon, favicon, font, basic-tool + `app-icons/`, `file-icons/`, `provider-icons/`). `src/v2/components/` has ~30 next-gen `-v2` variants. `src/theme/themes/` ships **37 JSON color schemes** (catppuccin, dracula, gruvbox, nord, tokyonight, vercel, ...). `src/pierre/` is the code-commenting/diff-selection engine. `src/i18n/` has 18 locales. `src/hooks/`, `src/context/`, `src/storybook/`, `src/styles/`. 27-path `exports` map. Deps: `@opencode-ai/core` + `@opencode-ai/sdk` (workspace), `@kobalte/core`, `solid-js`, `marked`, `shiki`, `motion`, `katex`, `morphdom`, `@pierre/diffs`. Consumed by `app`, `enterprise`, `web`, `desktop`, `storybook`. **KEPT per user direction.** |
| 11 | `app` | `@opencode-ai/app` | no | 1.17.7 | **EXCLUDE** | SolidStart web template (`@solidjs/start` + `@solidjs/router`, `vite.config.ts`, `src/app.tsx` + `entry-client/server.tsx`). The browser frontend for OpenCode — consumed by `desktop` as its renderer. AutoDev uses the TUI + in-process runtime, not a web app. (Docs in `packages/app/`.) |
| 12 | `console` | (no package.json — 6 sub-packages) | yes | — | **EXCLUDE** | Multi-package web admin/management workspace with 6 sub-packages each having their own `package.json`: `app/` (SolidStart operator UI with auth/bench/black/brand/changelog/data routes + 18-locale i18n + salesforce/github integrations), `core/` (Drizzle domain layer: account, billing, subscription, referral, provider, workspace), `function/` (serverless: auth, log-processor, stat), `mail/` (Solid email templates), `resource/` (SST infra for Cloudflare+Node), `support/` (SolidStart support/feedback app). Operator control plane — not used by AutoDev's CLI/TUI model. |
| 13 | `containers` | (no package.json) | yes | — | **EXCLUDE** | Prebuilt **CI Docker images** for GitHub Actions Linux jobs. Image chain: `base` (Ubuntu 24.04) → `bun-node` (+Bun+Node 24) → `rust` (+Rust) → `tauri-linux` (+Tauri deps); `publish` (+Docker CLI/AUR). `script/build.ts` builds multi-arch (amd64+arm64) via Buildx to `ghcr.io/anomalyco/build`. Dev infra, not runtime. |
| 14 | `desktop` | `@opencode-ai/desktop` | yes | 1.17.7 | **EXCLUDE** | **Electron desktop app** wrapping `@opencode-ai/app` + `@opencode-ai/ui`. `src/main/` (index, server sidecar mgmt, shell-env, windows, menu, ipc, updater, attachment-picker, wsl), `src/preload/` (`window.api` bridge), `src/renderer/` (reuses app+ui). `electron-vite` dev/build, `electron-builder` packaging (mac/win/linux). Deps: `electron` 42.3.3, `electron-updater`, `electron-store`, `@lydell/node-pty` (+ per-platform optional binaries), `@parcel/watcher`. AutoDev runs in-process via Node, no Electron. |
| 15 | `docs` | (no package.json — Mintlify `docs.json` name `@opencode-ai/docs`) | yes | — | **EXCLUDE** | **Mintlify documentation site** (SDK/API reference). `docs.json` config (theme mint, brand colors, navigation: SDK → Getting started → index/quickstart/development + openapi). Content: `ai-tools/` (claude-code, cursor, windsurf), `essentials/` (code, images, markdown, navigation, settings), `index.mdx`, `quickstart.mdx`, `development.mdx`. `openapi.json` symlinked from `../sdk/openapi.json`. Distinct from `web` (Astro/Starlight marketing+docs) — this is Mintlify SDK reference. Not runtime code. |
| 16 | `enterprise` | `@opencode-ai/enterprise` | yes | 1.17.7 | **EXCLUDE** | **SolidStart enterprise web UI** (`@solidjs/start` + `@solidjs/router` + `hono` API). `src/routes/` (404, index, share, api), `src/core/` (share.ts, storage.ts). Builds to Cloudflare (`build:cloudflare`) or Node. SST-deployed (`sst shell --target Teams --stage production`). Deps: `@opencode-ai/core`+`@opencode-ai/ui` (workspace), `aws4fetch`, `nitro`, `zod`, `hono-openapi`. Not used by AutoDev. |
| 17 | `function` | `@opencode-ai/function` | yes | 1.17.7 | **EXCLUDE** | **Cloudflare Workers serverless functions** — `src/api.ts` exports `SyncServer` (a `DurableObject` brokering real-time session sync over WebSocket pairs + R2 bucket) and Hono API with GitHub App auth (`@octokit/auth-app`+`@octokit/rest`) + JWT verification (`jose`). Targets Cloudflare Workers (DurableObjects/R2/WebSocket), NOT Lambda and NOT the stats site. *(Original assumption "Lambda handlers for the stats site" was WRONG — corrected by source inspection.)* Serverless backend for web/enterprise/console session sync, not in-process. |
| 18 | `http-recorder` | `@opencode-ai/http-recorder` | no (published — `publishConfig.access: public`) | 1.17.7 | **EXCLUDE** | **Test-only library**: record/replay Effect HTTP + WebSocket traffic from deterministic JSON cassettes. `description`: "Record and replay Effect HTTP client traffic with deterministic cassettes". `src/`: `recorder.ts`, `cassette.ts`, `redaction.ts`/`redactor.ts`, `matching.ts`, `socket.ts`/`websocket.ts`, `schema.ts`, `effect.ts`. Public API: `HttpRecorder.http(name, opts)` + `HttpRecorder.socket(name, opts)`. Redaction (headers/query/json/url/body), strict-order matching, WebSocket frame transcripts. peerDep `effect` 4.0.0-beta.74. **Published to npm** (public beta) — useful for provider-integration testing but not runtime. |
| 19 | `identity` | (no package.json) | yes | — | **EXCLUDE** | **Brand mark images only**: `mark.svg`, `mark-light.svg`, `mark-96x96.png`, `mark-192x192.png`, `mark-512x512.png`, `mark-512x512-light.png`. No `src/`, no code, no build. Pure static assets referenced by web/docs/console/desktop. |
| 20 | `slack` | `@opencode-ai/slack` | no | 1.17.7 | **EXCLUDE** | **Slack bot** bridging Slack threads → OpenCode sessions. `src/index.ts` uses `@slack/bolt` (Socket Mode) + `createOpencode({port:0})` (in-process OpenCode server via `@opencode-ai/sdk`). Maintains `Map<sessionKey, {client,server,sessionId,channel,thread}>`, subscribes to `message.part.updated` events, posts tool updates back to the originating thread. OAuth scopes: chat:write, app_mentions:read, channels:history, groups:history. AutoDev uses Discord (via OpenClaw), not Slack. |
| 21 | `stats` | (no package.json — 3 sub-packages) | yes | — | **EXCLUDE** | **OpenCode Stats analytics site** — 3 sub-packages each with own `package.json`: `app/` (SolidStart dashboard: app.tsx, entry-client/server, routes), `core/` (Drizzle domain + `athena.ts` (AWS Athena) + `honeycomb-backfill.ts` + `stat-sync.ts` + migrations), `server/` (Dockerfile + `ingest.ts` + `router.ts` + `stat-sync.ts`). Started via `bun dev:stats` (per AGENTS.md). Product-usage analytics — AutoDev has its own metrics in `.autodev/metrics/`. |
| 22 | `storybook` | `@opencode-ai/storybook` | yes | (no version) | **EXCLUDE** | **Storybook component showcase** for the `ui` library — has **no `src/` of its own**. `.storybook/` config only: `main.ts` (story globs → `../packages/ui/src/**/*.stories.tsx`, addons a11y/docs/links/onboarding/vitest, framework `storybook-solidjs-vite`), `preview.tsx`, `manager.ts`, `theme-tool.ts`, `playground-css-plugin.ts`, `mocks/`. All `.stories.tsx` files live co-located inside `packages/ui/src/`. devDep `@opencode-ai/ui` `workspace:*`. Storybook 10 + `storybook-solidjs-vite`. Dev tooling, not runtime. |
| 23 | `effect-drizzle-sqlite` | `@opencode-ai/effect-drizzle-sqlite` | yes | 1.17.7 | **KEEP (transitive)** | Drizzle ORM + Effect SQLite adapter. Likely a transitive dependency of `core`'s database layer. Include only if a KEEP package imports it. |
| 24 | `effect-sqlite-node` | `@opencode-ai/effect-sqlite-node` | yes | 1.17.7 | **KEEP (transitive)** | Effect SQLite Node.js binding. Transitive dep of `core`'s database layer. Include only if a KEEP package imports it. |
| 25 | `script` | `@opencode-ai/script` | no | (no version) | **EXCLUDE** | **Build/release helper script**. `src/index.ts` reads repo-root `package.json` `packageManager`, validates Bun version via `semver`, derives release `CHANNEL` (env `OPENCODE_CHANNEL`/`OPENCODE_BUMP`/`OPENCODE_VERSION`/`OPENCODE_RELEASE` or git branch) and `VERSION` (env, or preview `0.0.0-<channel>-<timestamp>`, or latest registry lookup). Sole dep `semver` ^7.6.3. No tests/README. Build tooling, not runtime. |

### Summary

- **KEEP (10 core):** opencode, core, server, plugin, cli, tui, llm, sdk, web, ui
- **KEEP (2 transitive):** effect-drizzle-sqlite, effect-sqlite-node — verify `core` imports before including
- **EXCLUDE (13):** app, console, containers, desktop, docs, enterprise, function, http-recorder, identity, slack, stats, storybook, script

### Corrections from original assumptions (now evidence-based)

1. **`function` is NOT "Lambda handlers for the stats site."** Source inspection shows it is Cloudflare Workers with a `SyncServer` DurableObject (WebSocket session sync) + GitHub App auth + Hono API. The stats site has its own `server/` subdir for its ingest/router. The original EXCLUDE decision holds, but the rationale was wrong.
2. **`web` is the Astro/Starlight marketing + docs site**, not a "web interface / extra access point for the runtime." It is the public opencode.ai site. KEPT per explicit user direction; it is not consumed by the runtime at all (only a build-time `workspace:*` devDep for types).
3. **`ui` is a 197-component Solid.js library with 37 theme schemes + the pierre code-commenting engine**, shared by app/enterprise/web/desktop/storybook — not a thin "shared component library." KEPT per explicit user direction.
4. **`storybook` has no `src/`** — it is pure harness (`.storybook/` config + addons); all stories live inside `packages/ui/src/**.stories.tsx`. It is the showcase layer over `ui`, adding no components of its own.
5. **`http-recorder` is published to npm** (`publishConfig.access: public`, public beta), not internal-only. Still test-only, not runtime.
6. **`console` is a 6-sub-package workspace** (app/core/function/mail/resource/support), not a single package — each subdir has its own `package.json`.
7. **`stats` is a 3-sub-package workspace** (app/core/server), not a single package — README mentions `function` but observed subdirs are app/core/server.
8. **`identity`, `containers`, `docs` have no `package.json`** — confirmed: identity is asset-only, containers is Dockerfiles + a build script, docs is Mintlify `.mdx` content + `docs.json`.

### T4 Guidance

1. **Include the 10 KEEP packages** in the unified source tree.
2. **For the 2 transitive packages**, run `grep -r "effect-drizzle-sqlite\|effect-sqlite-node" packages/core packages/opencode packages/server` — if `core` (or `opencode`/`server`) imports them, include them; otherwise drop.
3. **Drop all 13 EXCLUDE packages.** AutoDev's architecture (in-process runtime + TUI + Discord) does not touch desktop/analytics/Slack/storybook/web-app/enterprise-console/serverless-functions.
4. The `sdk` package has no `package.json` in the fork (it ships via npm as `@opencode-ai/sdk`); the `.d.ts` types are already in `api-types/` and the OpenAPI spec is in `api-types/openapi.json`. T4 should keep the SDK types but may not need the fork's `packages/sdk/js/` source if AutoDev only consumes the published package.
5. **`web` and `ui` are KEPT per user direction** even though they are not consumed by the AutoDev runtime. `ui` is the component library shared across all OpenCode browser surfaces; `web` is the marketing + Starlight docs site. T4 should include them as reference / optional surfaces.

### AutoDev's Relationship to OpenCode

AutoDev does NOT fork OpenCode's runtime code. It:
- Depends on `@opencode-ai/sdk` (published npm) for types.
- Embeds the runtime in-process via `createOpencodeServer()`.
- Reads `.opencode/opencode.jsonc` for plugin/instruction/agent config.
- The fork at `/tmp/opencode-unified/` is a reference mirror for understanding the runtime's architecture and package boundaries — T4 uses these docs as a map, not as source to copy wholesale.