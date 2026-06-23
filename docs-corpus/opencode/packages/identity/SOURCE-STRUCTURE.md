# identity — Source Structure
**npm name:** (no package.json)
**private:** yes (pure assets)

The OpenCode **brand identity assets** — a flat directory of brand mark images used across the web, docs, console, and desktop surfaces. **No source code, no package.json, no README, no build.** Just raster + vector mark variants in light/dark themes at multiple resolutions.

## Files
- `mark.svg` (612 B) — primary brand mark, vector (dark-context default)
- `mark-light.svg` (325 B) — light-theme variant of the brand mark
- `mark-96x96.png` (122 B) — raster mark, 96px
- `mark-192x192.png` (144 B) — raster mark, 192px
- `mark-512x512.png` (330 B) — raster mark, 512px (dark-context default)
- `mark-512x512-light.png` (330 B) — raster mark, 512px, light-theme variant

## Notes
- No `src/`, no `package.json`, no `tsconfig.json`, no scripts.
- These are pure static assets referenced by `web`, `docs`, `console/app` (via `asset/brand/`), and `desktop` (via `icons/`/`resources/`).
- T4: identity is asset-only. If the unified tree keeps any consumer of these marks (web/console/desktop), the marks should travel with that consumer or be placed in a shared `assets/` location; there is no code to compile or test here.