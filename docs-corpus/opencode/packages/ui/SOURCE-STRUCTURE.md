# ui — Source Structure
**npm name:** `@opencode-ai/ui`
**private:** no
**version:** 1.17.7
**type:** module
**license:** MIT

The **OpenCode UI component library** — a large Solid.js component kit shared by `tui`, `app`, `enterprise`, `web`, `desktop`, and `storybook`. Built with Solid.js + Kobalte (accessible primitives) + Tailwind. This is the single source of truth for all reusable OpenCode UI widgets. Published with a broad `exports` map exposing individual components, the `pierre/` code-commenting engine, `v2/` next-gen components, `theme/` color schemes, `hooks/`, `context/`, `i18n/` translations, and `styles/`. Depends on `@opencode-ai/core` and `@opencode-ai/sdk` (workspace).

## Key directories
- `src/` — Library source
  - `components/` — **197 entries**. The main widget library: `button`, `card`, `dialog`, `dropdown-menu`, `context-menu`, `hover-card`, `checkbox`, `accordion`, `collapsible`, `list`, `avatar`, `icon`, `icon-button`, `file`, `file-icon`, `file-media`, `file-search`, `file-ssr`, `inline-input`, `keybind`, `logo`, `image-preview`, `markdown-stream`, `markdown-shiki.worker`, `markdown-code-state`, `markdown-worker-protocol`, `diff-changes`, `dock-surface`, `dock-prompt`, `line-comment`, `line-comment-annotations`, `animated-number`, `app-icon`, `favicon`, `font`, `basic-tool`
    - subdirs: `app-icons/`, `file-icons/`, `provider-icons/` (icon spritesheet types)
    - Each component ships as `<name>.tsx` + `<name>.css` + `<name>.stories.tsx` (co-located stories)
  - `v2/` — Next-generation component variants (~30 components, each `-v2`): accordion, avatar, badge, basic-tool, button, checkbox, dialog, diff-changes, field, icon-button, icon, inline-input, keybind, line-comment, menu, project-avatar, radio, segmented-control, select, switch, tabs, text-input, text-shimmer, textarea, toast, tool-error-card, tooltip, wordmark. Plus `components/` and `styles/`.
  - `theme/` — Theme system: `color.ts`, `context.tsx`, `default-themes.ts`, `resolve.ts`, `loader.ts`, `types.ts`, `index.ts`, `desktop-theme.schema.json`, `v2/`, and `themes/` (**37 JSON color schemes**: amoled, aura, ayu, carbonfox, catppuccin, catppuccin-frappe, catppuccin-macchiato, cobalt2, cursor, dracula, everforest, flexoki, github, gruvbox, kanagawa, lucent-orng, material, matrix, mercury, monokai, nightowl, nord, oc-2, one-dark, onedarkpro, opencode, orng, osaka-jade, palenight, rosepine, shadesofpurple, solarized, synthwave84, tokyonight, vercel, vesper, zenburn)
  - `pierre/` — Code-commenting / diff-selection engine: `comment-hover.ts`, `commented-lines.ts`, `diff-selection.ts`, `file-find.ts`, `file-runtime.ts`, `file-selection.ts`, `selection-bridge.ts`, `virtualizer.ts`, `media.ts`, `worker.ts`, `index.ts`
  - `hooks/` — `create-auto-scroll.tsx`, `use-filtered-list.tsx`, `index.ts`
  - `i18n/` — 18 locale translation modules: `ar`, `br`, `bs`, `da`, `de`, `en`, `es`, `fr`, `ja`, `ko`, `no`, `pl`, `ru`, `th`, `tr`, `uk`, `zh`, `zht`
  - `context/` — Shared React-style context providers: `data.tsx`, `dialog.tsx`, `file.tsx`, `helper.tsx`, `i18n.tsx`, `marked.tsx`, `worker-pool.tsx`, `index.ts`
  - `storybook/` — `fixtures.ts`, `scaffold.tsx` (story harness helpers reused by the storybook package)
  - `styles/` — `base.css`, `colors.css`, `theme.css`, `utilities.css`, `animations.css`, `index.css`, `tailwind/`
  - `assets/` — `audio/`, `favicon/`, `icons/`, `images/` (and `fonts/` via exports)
  - `custom-elements.d.ts`
- `script/` — Build helpers: `build-oc2-v2-overrides.ts`, `tailwind.ts`, `colors.txt`
- `vite.config.ts` — Vite config for dev preview / build

## Key files
- `package.json` — rich `exports` map (27 export paths): `./<component>` → `src/components/*.tsx`, `./session-diff`, `./i18n/*`, `./pierre`, `./pierre/*`, `./hooks`, `./context`, `./context/*`, `./styles`, `./styles/tailwind`, `./theme`, `./theme/*`, `./theme/context`, `./icons/provider|file-type|app`, `./fonts/*`, `./audio/*`, `./v2/*.css`, `./v2/*`, `./v2/styles/*`
- `vite.config.ts`
- `tsconfig.json`
- `sst-env.d.ts`

## Scripts
- `typecheck` — `tsgo --noEmit`
- `test` — `bun test src --only-failures`
- `dev` — `vite`
- `generate:tailwind` — `bun run script/tailwind.ts`
- `generate:v2-oc2` — `bun run script/build-oc2-v2-overrides.ts`

## Dependencies (highlights)
- **Solid.js ecosystem:** `solid-js`, `@kobalte/core`, `@solidjs/meta`, `@solidjs/router`, `solid-list`, `@solid-primitives/{bounds,event-listener,media,resize-observer}`
- **Markdown / code:** `marked`, `marked-katex-extension`, `marked-shiki`, `shiki`, `@shikijs/transformers`, `@shikijs/stream`, `katex`, `diff`, `dompurify`, `remend`, `morphdom`
- **Workspace deps:** `@opencode-ai/core` `workspace:*`, `@opencode-ai/sdk` `workspace:*`
- **Pierre diffs:** `@pierre/diffs`
- **Misc:** `motion`, `fuzzysort`, `luxon`, `remeda`, `strip-ansi`
- devDeps: `tailwindcss`, `@tailwindcss/vite`, `vite`, `vite-plugin-solid`, `vite-plugin-icons-spritesheet`, `typescript`, `@typescript/native-preview`

## Exports shape (consumers)
Other OpenCode packages import `@opencode-ai/ui/<component>`, `@opencode-ai/ui/theme/<scheme>`, `@opencode-ai/ui/pierre`, `@opencode-ai/ui/hooks`, `@opencode-ai/ui/context`, `@opencode-ai/ui/v2/<component>`, `@opencode-ai/ui/i18n/<locale>`, `@opencode-ai/ui/styles`, `@opencode-ai/ui/icons/{provider,file-type,app}`, `@opencode-ai/ui/fonts/<file>`, `@opencode-ai/ui/audio/<file>`.