# docs — Source Structure
**npm name:** (no package.json — the `docs.json` `name` field is `@opencode-ai/docs`)
**private:** yes (documentation site)

The **OpenCode public documentation site**, built with **Mintlify** (not Astro — that is the `web` package). Mintlify renders `.mdx` content pages driven by `docs.json` (the Mintlify config). This is the SDK/reference documentation surface (quickstart, development, AI-tool integrations, essentials), separate from the `web` package's marketing + Starlight docs. `openapi.json` is symlinked from `../sdk/openapi.json` so Mintlify can render the API reference.

## Key directories
- `ai-tools/` — AI tool integration guides: `claude-code.mdx`, `cursor.mdx`, `windsurf.mdx`
- `essentials/` — Core usage docs: `code.mdx`, `images.mdx`, `markdown.mdx`, `navigation.mdx`, `reusable-snippets.mdx`, `settings.mdx`
- `images/` — Screenshots: `checks-passed.png`, `hero-dark.png`, `hero-light.png`
- `logo/` — `dark.svg`, `light.svg`
- `snippets/` — `snippet-intro.mdx`

## Key files
- `docs.json` (1.1 KB) — Mintlify config: theme `mint`, name `@opencode-ai/docs`, brand colors (#16A34A primary), favicon `/favicon-v3.svg`, navigation tabs (SDK → Getting started: index, quickstart, development; openapi `https://opencode.ai/openapi.json`), logo, navbar
- `index.mdx` (1.8 KB) — landing page
- `quickstart.mdx` (3.0 KB) — quickstart guide
- `development.mdx` (2.8 KB) — development guide
- `openapi.json` — symlink → `../sdk/openapi.json` (the OpenAPI spec for API reference rendering)
- `favicon.svg`, `favicon-v3.svg`
- `LICENSE`
- `README.md` — Mintlify starter kit readme (boilerplate: `npm i -g mint` then `mint dev` at :3000)

## Notes
- This is the **Mintlify docs site**, distinct from the `web` package (Astro/Starlight marketing + docs). Both are external-facing documentation surfaces; `docs` is SDK/API reference flavored, `web` is marketing + full docs.
- Publishing is automatic via the Mintlify GitHub app on push to default branch.