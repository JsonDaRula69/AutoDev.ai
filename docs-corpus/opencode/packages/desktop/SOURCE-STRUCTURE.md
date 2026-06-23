# desktop — Source Structure
**npm name:** `@opencode-ai/desktop`
**private:** yes
**version:** 1.17.7
**type:** module
**license:** MIT
**homepage:** https://opencode.ai

The **OpenCode Desktop application**, a native Electron app that wraps the OpenCode web app (`@opencode-ai/app`, `@opencode-ai/ui`) into a cross-platform desktop binary with auto-update, window-state persistence, IPC, shell-env detection, sidecar process management, attachment picker, and WSL support. Built with `electron-vite` (dev/build/preview) and packaged with `electron-builder` (mac/win/linux targets). The renderer reuses the `app` + `ui` Solid.js frontend; the main process spawns/manages the OpenCode server sidecar.

## Key directories
- `src/`
  - `main/` — Electron main process: `index.ts`, `initialization.ts`, `server.ts` (sidecar mgmt), `sidecar.ts`, `shell-env.ts`, `windows.ts`, `menu.ts`, `desktop-menu-actions.ts`, `ipc.ts` (IPC handlers per AGENTS.md), `store.ts`, `store-keys.ts`, `migrate.ts`, `logging.ts`, `markdown.ts`, `unresponsive.ts`, `attachment-picker.ts`, `updater.ts` + `updater-controller.ts` + `updater-subscriptions.ts`, `apps.ts`, `constants.ts`, `env.d.ts`, `wsl/` (Windows Subsystem for Linux support); plus `.test.ts` files
  - `preload/` — Preload bridge: `index.ts`, `types.ts` (renderer calls `window.api` from here, per AGENTS.md)
  - `renderer/` — Electron renderer process (reuses app/ui): `index.tsx`, `index.html`, `initialization.ts`, `cli.ts`, `styles.css`, `webview-zoom.ts`, `i18n/`, `wsl/`, `env.d.ts`
- `icons/` — App icons for packaging
- `resources/` — Bundled static resources
- `scripts/` — Build/dev helper scripts (`predev.ts`, `prebuild.ts`, etc.)
- `native/` — (referenced by `native:build` script; native modules)

## Key files
- `package.json` — `main: "./out/main/index.js"`; electron-builder config in separate file
- `electron-builder.config.ts` (4.4 KB) — packaging config (mac/win/linux targets, signing, update channels)
- `electron-builder.config.test.ts` — test variant
- `electron.vite.config.ts` (2.6 KB) — electron-vite dev/build/preview config
- `tsconfig.json`
- `AGENTS.md` — notes: renderer only calls `window.api` from preload; main registers IPC in `src/main/ipc.ts`
- `README.md` — short dev/build instructions
- `sst-env.d.ts`

## Scripts
- `predev` / `dev` — `electron-vite dev` (with predev prep)
- `prebuild` / `build` — `electron-vite build`
- `preview` — `electron-vite preview`
- `package` / `package:mac` / `package:win` / `package:linux` — `electron-builder --config electron-builder.config.ts`
- `typecheck` — `tsgo -b`
- `native:build` — `bun install --cwd native`

## Dependencies (highlights)
- runtime: `electron-log`, `electron-store`, `electron-updater`, `electron-window-state`, `electron-context-menu`, `@zip.js/zip.js`, `marked`, `effect`
- dev: `electron` 42.3.3, `electron-builder` 26.15.2, `electron-vite`, `@opencode-ai/app` `workspace:*`, `@opencode-ai/ui` `workspace:*`, `@sentry/solid`, `@sentry/vite-plugin`, `@solidjs/router`, `@solid-primitives/{i18n,storage}`, `solid-js`, `@lydell/node-pty` (+ per-platform optional deps for darwin/linux/win arm64+x64), `@parcel/watcher` (+ per-platform optional), `sury`, `zod-openapi`, `@valibot/to-json-schema`, `vite`, `typescript`

## Platform binaries (optionalDependencies)
Per-arch prebuilt binaries for `@lydell/node-pty` (darwin/linux/win × arm64/x64) and `@parcel/watcher` (same matrix) — for native PTY and file-watching across platforms.