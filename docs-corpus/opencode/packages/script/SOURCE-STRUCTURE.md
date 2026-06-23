# script — Source Structure
**npm name:** `@opencode-ai/script`
**private:** no (no `private` field; not marked private)
**version:** (no version field)
**license:** MIT

A small **build/release helper script** consumed by the repo root and other packages. The sole source file (`src/index.ts`) reads the root `package.json`'s `packageManager` field, validates the running Bun version against it via `semver`, then derives the OpenCode release `CHANNEL` and `VERSION` from environment variables (`OPENCODE_CHANNEL`, `OPENCODE_BUMP`, `OPENCODE_VERSION`, `OPENCODE_RELEASE`) or git branch. Used to compute version strings and channel (latest vs preview) for releases. Not runtime code — invoked during build/release flows.

## Key directories
- `src/`
  - `index.ts` — The helper. Uses `bun`'s `$` shell, `semver`, `path`, `Bun.file`. Reads `../../../package.json` (repo root) for `packageManager`. Validates `process.versions.bun` against `^<expected>`. Derives `CHANNEL` (from env or git branch) and `VERSION` (from env, or preview `0.0.0-<channel>-<timestamp>`, or latest registry lookup of `opencode-ai`).

## Key files
- `package.json` — `exports: { ".": "./src/index.ts" }`; only dep `semver` ^7.6.3 + devDep `@types/semver` + `@types/bun`
- `tsconfig.json`
- `sst-env.d.ts`

## Scripts
- (no scripts declared)

## Dependencies
- `semver` ^7.6.3 (runtime)
- `@types/semver` ^7.5.8, `@types/bun` (dev)

## Behavior
1. Read repo-root `package.json` → `packageManager` → extract expected Bun version.
2. `semver.satisfies(process.versions.bun, "^" + expected)` → throw if mismatch.
3. Resolve `CHANNEL`: env `OPENCODE_CHANNEL` → else `OPENCODE_BUMP` → "latest" → else `OPENCODE_VERSION` not starting `0.0.0-` → "latest" → else current git branch.
4. Resolve `VERSION`: env `OPENCODE_VERSION` → else if preview channel → `0.0.0-<channel>-<timestamp>` → else fetch latest from `registry.npmjs.org/opencode-ai/latest` (note: queries `opencode-ai`, suggesting legacy npm name handling).

## Notes
- Consumed by repo-root build/release scripts (e.g. the root `package.json` `scripts` that bump/release OpenCode).
- No tests, no README, no AGENTS.md.
- `sst-env.d.ts` present suggests SST-aware deployment context but the script itself is general build tooling.