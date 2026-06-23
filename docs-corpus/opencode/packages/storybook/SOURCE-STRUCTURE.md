# storybook — Source Structure
**npm name:** `@opencode-ai/storybook`
**private:** yes
**version:** (no version field)
**type:** module

A **Storybook component showcase** that renders the `@opencode-ai/ui` component library in isolation for development and visual QA. It has **no `src/` directory of its own** — all component stories live co-located inside `packages/ui/src/components/*.stories.tsx` and `packages/ui/src/v2/components/*.stories.tsx`. This package only provides the Storybook **harness**: the `.storybook/` config that mounts the ui library and wires addons (a11y, docs, links, onboarding, vitest). Built with `storybook` 10 + `storybook-solidjs-vite` for Solid.js components.

## Key directories
- `.storybook/` — Storybook configuration (the only meaningful tree in this package)
  - `main.ts` (3.1 KB) — Storybook config: story globs (pointed at `../packages/ui/src/**/*.stories.tsx`), addons (`@storybook/addon-a11y`, `addon-docs`, `addon-links`, `addon-onboarding`, `addon-vitest`), framework `storybook-solidjs-vite`
  - `preview.tsx` (4.8 KB) — Global preview setup (decorators, theme provider, i18n, global types)
  - `manager.ts` (337 B) — Storybook manager UI customization
  - `theme-tool.ts` (588 B) — Theme switcher toolbar tool
  - `playground-css-plugin.ts` (4.8 KB) — Custom Vite plugin for playground CSS injection
  - `mocks/` — Mock data/fixtures for stories
- (no `src/`)

## Key files
- `package.json` — declares `storybook` and `build` scripts; depends on `@opencode-ai/ui` `workspace:*`
- `tsconfig.json`
- `sst-env.d.ts`
- `debug-storybook.log` — (29 KB dev artifact; not source)
- `.gitignore`

## Scripts
- `storybook` — `storybook dev -p 6006` (local Storybook at :6006)
- `build` — `storybook build`

## Dependencies
- devDeps (all dev, no runtime deps):
  - `storybook` ^10.2.13, `storybook-solidjs-vite` ^10.0.9
  - `@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/addon-links`, `@storybook/addon-onboarding`, `@storybook/addon-vitest` (all ^10.2.13)
  - `@opencode-ai/ui` `workspace:*` — the library being showcased
  - `solid-js`, `@solidjs/meta`
  - `@tailwindcss/vite`, `tailwindcss`
  - `vite`, `typescript`, `@tsconfig/node22`, `@types/node`, `@types/react`, `react`

## Relationship to `ui`
This package is **the showcase layer over `ui`**. It adds no components of its own. Every `.stories.tsx` file consumed by Storybook lives inside `packages/ui/src/`. T4: storybook is dev tooling only — it is not imported by any runtime package. It exists so contributors can visually develop and regression-test ui components in isolation.