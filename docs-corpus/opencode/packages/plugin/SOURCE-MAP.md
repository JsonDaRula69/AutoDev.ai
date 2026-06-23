# Package: @opencode-ai/plugin

**Source:** `/tmp/opencode-unified/packages/plugin/`

## package.json
```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@opencode-ai/plugin",
  "version": "1.17.7",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "build": "tsc"
  },
  "exports": {
    ".": "./src/index.ts",
    "./tool": "./src/tool.ts",
    "./tui": "./src/tui.ts"
  },
  "files": [
    "dist"
  ],
  "dependencies": {
    "@opencode-ai/sdk": "workspace:*",
    "effect": "catalog:",
    "zod": "catalog:"
  },
  "peerDependencies": {
    "@opentui/core": ">=0.3.4",
    "@opentui/keymap": ">=0.3.4",
    "@opentui/solid": ">=0.3.4"
  },
  "peerDependenciesMeta": {
    "@opentui/core": {
      "optional": true
    },
    "@opentui/keymap": {
      "optional": true
    },
    "@opentui/solid": {
      "optional": true
    }
  },
  "devDependencies": {
    "@opentui/core": "catalog:",
    "@opentui/keymap": "catalog:",
    "@opentui/solid": "catalog:",
    "@tsconfig/node22": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## Directory Structure
```
.
./.gitignore
./package.json
./script
./script/publish.ts
./src
./src/example-workspace.ts
./src/example.ts
./src/index.ts
./src/shell.ts
./src/tool.ts
./src/tui.ts
./sst-env.d.ts
./tsconfig.json
```

## src/ Contents
```
./example-workspace.ts
./example.ts
./index.ts
./shell.ts
./tool.ts
./tui.ts
```
