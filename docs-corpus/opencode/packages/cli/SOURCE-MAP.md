# Package: @opencode-ai/cli

**Source:** `/tmp/opencode-unified/packages/cli/`

## package.json
```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@opencode-ai/cli",
  "version": "1.17.7",
  "type": "module",
  "license": "MIT",
  "bin": {
    "lildax": "./bin/lildax.cjs"
  },
  "files": [
    "bin"
  ],
  "scripts": {
    "build": "bun run script/build.ts",
    "dev": "bun run src/index.ts",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@effect/platform-node": "catalog:",
    "@opencode-ai/core": "workspace:*",
    "@opencode-ai/sdk": "workspace:*",
    "@opencode-ai/server": "workspace:*",
    "@opencode-ai/tui": "workspace:*",
    "@opentui/core": "catalog:",
    "@opentui/solid": "catalog:",
    "@parcel/watcher": "2.5.1",
    "effect": "catalog:",
    "solid-js": "catalog:"
  },
  "devDependencies": {
    "@opencode-ai/script": "workspace:*",
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## Directory Structure
```
.
./bin
./bin/lildax.cjs
./bunfig.toml
./package.json
./script
./script/build.ts
./script/generate.ts
./script/publish.ts
./src
./src/commands
./src/framework
./src/index.ts
./src/services
./src/tui.ts
./sst-env.d.ts
./tsconfig.json
```

## src/ Contents
```
./commands/commands.ts
./framework/runtime.ts
./framework/spec.ts
./index.ts
./services/daemon.ts
./tui.ts
```
