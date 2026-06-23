# stats — Source Structure
**npm name:** (no top-level package.json)
**private:** yes (multi-package workspace)

The **OpenCode Stats** analytics site — a separate multi-package workspace from the console. Provides product usage analytics, ingestion, and a stats-sync pipeline. Per the README: "Runtime, database, and domain services live in `core`; the SolidStart website lives in `app`; deployable Lambda entrypoints live in `function`." (Note: the README mentions `function` but the observed subdirs are `app`, `core`, `server` — `server` holds the ingest/router.) Started locally with `bun dev:stats` from the repo root (per AGENTS.md).

## Key directories (sub-packages)
- `app/` — SolidStart frontend/site for the analytics dashboard: `package.json`, `app.config.ts`, `vite.config.ts`, `tsconfig.json`, `sst-env.d.ts`, `public/`, `src/` (`app.tsx`, `app.css`, `entry-client.tsx`, `entry-server.tsx`, `global.d.ts`, `resource.d.ts`, `asset/`, `routes/`)
- `core/` — Domain + data layer: `package.json`, `drizzle.config.ts`, `migrations/`, `src/` (`athena.ts` (AWS Athena queries), `config.ts`, `database.ts`, `database/`, `domain/`, `honeycomb-backfill.ts`, `index.ts`, `migrate.ts`, `resource.d.ts`, `runtime.ts`, `stat-sync.ts`), `sst-env.d.ts`, `tsconfig.json`
- `server/` — Deployable server (Lambda/Docker): `package.json`, `Dockerfile`, `sst-env.d.ts`, `tsconfig.json`, `src/` (`ingest.ts` (event ingestion endpoint), `router.ts`, `server.ts`, `shutdown.ts`, `stat-sync.ts`, `resource.d.ts`)

## Key files (top-level)
- `README.md` — describes the three-part split (app/core/function) and commands
- `AGENTS.md` — single line: "To start the stats site locally, run `bun dev:stats` from the repo root."
- (no top-level `package.json`)

## Commands (from README)
- `bun run dev:stats` (repo root) — starts the SolidStart app
- `bun run --cwd packages/stats/app typecheck` — typecheck the site
- `bun run --cwd packages/stats/core typecheck` — typecheck the Effect/database package
- `bun run --cwd packages/stats/function typecheck` — typecheck Lambda entrypoints (per README; observed subdir is `server/`)

## Notes
- `core/` uses Drizzle ORM + migrations and integrates AWS Athena (`athena.ts`) and Honeycomb (`honeycomb-backfill.ts`) for analytics queries/backfill.
- `server/` ships a `Dockerfile` for containerized deployment and exposes `ingest.ts` (event ingestion) + `router.ts` + `stat-sync.ts`.
- `app/` is a standard SolidStart app (`app.config.ts`, vite, solid entry points).
- Distinct from the `console` package (which is operator-facing control plane); `stats` is product-usage analytics.