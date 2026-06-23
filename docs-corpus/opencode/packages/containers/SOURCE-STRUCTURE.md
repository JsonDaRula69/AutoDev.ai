# containers — Source Structure
**npm name:** (no package.json)
**private:** yes (build infrastructure)

Prebuilt **CI container images** used to speed up GitHub Actions jobs by baking in large, slow-to-install dependencies (Bun, Node, Rust, Tauri Linux deps, Docker/AUR tooling). These are **dev-infrastructure Dockerfiles**, not runtime code. Designed for Linux CI jobs that use `job.container` in workflows. Built and published via `script/build.ts` (multi-arch amd64+arm64 via Buildx). Registry: `ghcr.io/anomalyco/build`.

## Key directories
- `base/` — `Dockerfile` — Ubuntu 24.04 with common build tools and utilities (the foundation layer)
- `bun-node/` — `Dockerfile` — `base` plus Bun and Node.js 24
- `rust/` — `Dockerfile` — `bun-node` plus Rust (stable, minimal profile)
- `tauri-linux/` — `Dockerfile` — `rust` plus Tauri Linux build dependencies
- `publish/` — `Dockerfile` — `bun-node` plus Docker CLI and AUR tooling
- `script/` — `build.ts` — Build orchestrator. Usage: `REGISTRY=ghcr.io/anomalyco TAG=24.04 bun ./packages/containers/script/build.ts [--push]`

## Key files
- `README.md` — documents the image chain, build command, and GitHub Actions `job.container` usage
- `tsconfig.json` — TypeScript config for `script/build.ts`
- (no `package.json`)

## Image dependency chain
```
base → bun-node → rust → tauri-linux
                 ↘ publish
```

## Notes (from README)
- These images only help **Linux** jobs. macOS and Windows jobs cannot run inside Linux containers.
- `--push` publishes multi-arch (amd64 + arm64) images using Buildx.
- If a job uses Docker Buildx, the container needs access to the host Docker daemon (or docker-in-docker with privileged mode).