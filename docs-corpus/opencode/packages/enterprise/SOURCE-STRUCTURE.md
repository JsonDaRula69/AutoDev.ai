# enterprise — Source Structure
**npm name:** `@opencode-ai/enterprise`
**private:** yes
**version:** 1.17.7
**type:** module
**license:** MIT
**engines.node:** >=22

The **OpenCode Enterprise web UI** — a SolidStart (`@solidjs/start`) full-stack web application for enterprise/team deployments. Provides team management, share links, and API routes built on Hono. Reuses the `@opencode-ai/ui` component library and `@opencode-ai/core`. Builds to Cloudflare (`OPENCODE_DEPLOYMENT_TARGET=cloudflare vite build`) or Node (`vite build`). SST-deployed (`sst shell --target Teams --stage production`).

## Key directories
- `src/`
  - `core/` — `share.ts`, `storage.ts` (shared enterprise domain logic + storage)
  - `routes/` — SolidStart file routes: `[…404].tsx`, `index.tsx`, `share.tsx`, `share/`, `api/` (Hono API routes)
  - `app.tsx`, `app.css` — Solid root app
  - `entry-client.tsx`, `entry-server.tsx` — SolidStart entry points
  - `global.d.ts`, `custom-elements.d.ts`
- `public/` — Static assets (15 entries)
- `script/` — Build helpers
- `test/` — Tests

## Key files
- `package.json`
- `vite.config.ts` (779 B) — Vite + SolidStart + Tailwind config
- `tsconfig.json`
- `test-debug.ts` (1.1 KB) — debug test harness
- `sst-env.d.ts`
- `README.md` — SolidStart boilerplate readme

## Scripts
- `dev` — `vite dev`
- `build` — `vite build`
- `build:cloudflare` — `OPENCODE_DEPLOYMENT_TARGET=cloudflare vite build`
- `start` — `vite start`
- `typecheck` — `tsgo --noEmit`
- `shell-prod` — `sst shell --target Teams --stage production`

## Dependencies (highlights)
- **SolidStart stack:** `@solidjs/start`, `@solidjs/router`, `@solidjs/meta`, `solid-js`
- **API:** `hono`, `@hono/standard-validator`, `hono-openapi`, `zod`
- **Workspace deps:** `@opencode-ai/core` `workspace:*`, `@opencode-ai/ui` `workspace:*`
- **Misc:** `aws4fetch`, `@pierre/diffs`, `js-base64`, `luxon`, `nitro`
- devDeps: `@cloudflare/workers-types`, `@tailwindcss/vite`, `tailwindcss`, `vite`, `typescript`, `@typescript/native-preview`, `@types/bun`, `@types/luxon`