# web — Source Structure
**npm name:** `@opencode-ai/web`
**private:** no
**version:** 1.17.7
**type:** module
**license:** MIT

The OpenCode public website and documentation site, built with **Astro + Starlight** (Astro 5.7, `@astrojs/starlight` 0.34). Hosts the product marketing landing pages (`src/components/Lander.astro`, `Hero.astro`, `Header.astro`, `Footer.astro`) and the Starlight-powered documentation under `src/content/docs/`. Deployed via `@astrojs/cloudflare` (Cloudflare adapter). Solid.js is integrated (`@astrojs/solid-js`) for interactive islands like `Share.tsx`. This is NOT a web-client UI for the OpenCode runtime — it is the marketing + docs site at opencode.ai.

## Key directories
- `src/` — Astro source root
  - `assets/` — Static assets (logos dark/light/ornate, `lander/` and `web/` image sets)
  - `components/` — Astro components: `Footer.astro`, `Head.astro`, `Header.astro`, `Hero.astro`, `Lander.astro`, `LanguageSelect.astro`, `SiteTitle.astro`, plus `Share.tsx` (Solid island), `share/`, `icons/`
  - `content/` — Starlight content collections (`content.config.ts`)
    - `docs/` — The actual documentation: `index.mdx`, `quickstart.mdx`, `cli.mdx`, `config.mdx`, `commands.mdx`, `agents.mdx`, `custom-tools.mdx`, `ecosystem.mdx`, `enterprise.mdx`, `formatters.mdx`, `github.mdx`, `gitlab.mdx`, `go.mdx`, `ide.mdx`, `acp.mdx`, plus locale subdirs (`ar`, `bs`, `da`, `de`, `es`, `fr`, ...)` for i18n
  - `i18n/` — `locales.ts` (locale routing config)
  - `pages/` — `[…slug].md.ts` (Starlight dynamic route); `s/` (likely share redirect)
  - `styles/` — `custom.css`
  - `types/` — `lang-map.d.ts`, `starlight-virtual.d.ts`
- `public/` — Static files served as-is (17 entries)
- `script/` — (none observed at top level)

## Key files
- `astro.config.mjs` (8.3 KB) — Astro/Starlight config, plugins, site URL, i18n, Cloudflare adapter
- `config.mjs` — Shared site config
- `package.json` — dependencies include `astro`, `@astrojs/starlight`, `@astrojs/cloudflare`, `@astrojs/solid-js`, `solid-js`, `marked`, `shiki`, `toolbeam-docs-theme`
- `tsconfig.json`, `sst-env.d.ts`, `.gitignore`
- `README.md` — Starlight starter kit readme (boilerplate)

## Scripts
- `dev` — `astro dev` (local dev at localhost:4321)
- `dev:remote` — `VITE_API_URL=https://api.opencode.ai astro dev`
- `build` — `astro build`
- `preview` — `astro preview`

## Dependencies (highlights)
- `@astrojs/starlight` 0.34.3 — docs framework
- `@astrojs/cloudflare` 12.6.3 — deploy adapter
- `@astrojs/solid-js` 5.1.0 — Solid island components
- `astro` 5.7.13
- `solid-js`, `marked`, `marked-shiki`, `shiki`, `@shikijs/transformers`, `diff`, `luxon`, `remeda`, `lang-map`, `js-base64`, `toolbeam-docs-theme`, `vscode-languageserver-types`, `ai`
- devDep: `opencode` `workspace:*` (the runtime, used for build-time type access)