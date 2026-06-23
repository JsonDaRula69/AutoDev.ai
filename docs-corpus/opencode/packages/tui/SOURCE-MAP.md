# Package: @opencode-ai/tui

**Source:** `/tmp/opencode-unified/packages/tui/`

## package.json
```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@opencode-ai/tui",
  "version": "1.17.7",
  "private": true,
  "type": "module",
  "license": "MIT",
  "scripts": {
    "test": "bun test --timeout 30000 --only-failures",
    "typecheck": "tsgo --noEmit"
  },
  "exports": {
    ".": "./src/index.tsx",
    "./builtins": "./src/feature-plugins/builtins.ts",
    "./config": "./src/config/index.tsx",
    "./context/args": "./src/context/args.tsx",
    "./context/epilogue": "./src/context/epilogue.tsx",
    "./context/exit": "./src/context/exit.tsx",
    "./context/kv": "./src/context/kv.tsx",
    "./context/project": "./src/context/project.tsx",
    "./context/runtime": "./src/context/runtime.tsx",
    "./context/sdk": "./src/context/sdk.tsx",
    "./context/sync": "./src/context/sync.tsx",
    "./context/theme": "./src/context/theme.tsx",
    "./context/editor": "./src/context/editor.ts",
    "./context/clipboard": "./src/context/clipboard.tsx",
    "./attention": "./src/attention.ts",
    "./editor": "./src/editor.ts",
    "./editor-zed": "./src/editor-zed.ts",
    "./runtime": "./src/runtime.tsx",
    "./terminal-win32": "./src/terminal-win32.ts",
    "./config/keybind": "./src/config/keybind.ts",
    "./keymap": "./src/keymap.tsx",
    "./prompt/display": "./src/prompt/display.ts",
    "./plugin/runtime": "./src/plugin/runtime.tsx",
    "./plugin/slots": "./src/plugin/slots.tsx",
    "./plugin/command-shim": "./src/plugin/command-shim.ts",
    "./parsers-config": "./src/parsers-config.ts",
    "./util/error": "./src/util/error.ts",
    "./util/locale": "./src/util/locale.ts",
    "./util/persistence": "./src/util/persistence.ts",
    "./util/record": "./src/util/record.ts",
    "./logo": "./src/logo.ts",
    "./ui/dialog": "./src/ui/dialog.tsx",
    "./ui/spinner": "./src/ui/spinner.ts",
    "./ui/toast": "./src/ui/toast.tsx",
    "./component/spinner": "./src/component/spinner.tsx"
  },
  "dependencies": {
    "@opencode-ai/core": "workspace:*",
    "@opencode-ai/plugin": "workspace:*",
    "@opencode-ai/sdk": "workspace:*",
    "@opencode-ai/ui": "workspace:*",
    "@opentui/core": "catalog:",
    "@opentui/keymap": "catalog:",
    "@opentui/solid": "catalog:",
    "clipboardy": "4.0.0",
    "diff": "catalog:",
    "effect": "catalog:",
    "fuzzysort": "catalog:",
    "open": "10.1.2",
    "opentui-spinner": "catalog:",
    "remeda": "catalog:",
    "strip-ansi": "7.1.2",
    "solid-js": "catalog:"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## Directory Structure
```
.
./bunfig.toml
./package.json
./src
./src/app.tsx
./src/attention.ts
./src/audio.d.ts
./src/audio.ts
./src/clipboard.ts
./src/component
./src/config
./src/context
./src/editor-zed.ts
./src/editor.ts
./src/feature-plugins
./src/index.tsx
./src/keymap.tsx
./src/logo.ts
./src/parsers-config.ts
./src/plugin
./src/prompt
./src/routes
./src/runtime.tsx
./src/terminal-win32.ts
./src/theme
./src/ui
./src/util
./sst-env.d.ts
./test
./test/app-lifecycle.test.tsx
./test/cli
./test/clipboard.test.ts
./test/config.test.tsx
./test/context
./test/editor.test.ts
./test/feature-plugins
./test/fixture
./test/index.test.tsx
./test/keymap.test.tsx
./test/plugin
./test/prompt
./test/runtime.test.tsx
./test/theme.test.ts
./test/util
./tsconfig.json
```

## src/ Contents
```
./app.tsx
./attention.ts
./audio.d.ts
./audio.ts
./clipboard.ts
./component/bg-pulse-render.ts
./component/bg-pulse.tsx
./component/command-palette.tsx
./component/dialog-agent.tsx
./component/dialog-console-org.tsx
./component/dialog-mcp.tsx
./component/dialog-model.tsx
./component/dialog-move-session.tsx
./component/dialog-provider.tsx
./component/dialog-retry-action.tsx
./component/dialog-session-delete-failed.tsx
./component/dialog-session-list.tsx
./component/dialog-session-rename.tsx
./component/dialog-skill.tsx
./component/dialog-stash.tsx
./component/dialog-status.tsx
./component/dialog-tag.tsx
./component/dialog-theme-list.tsx
./component/dialog-variant.tsx
./component/dialog-workspace-create.tsx
./component/dialog-workspace-file-changes.tsx
./component/dialog-workspace-list.tsx
./component/dialog-workspace-unavailable.tsx
./component/error-component.tsx
./component/logo.tsx
./component/plugin-route-missing.tsx
./component/spinner.tsx
./component/startup-loading.tsx
./component/todo-item.tsx
./component/use-connected.tsx
./component/workspace-label.tsx
./config/index.tsx
./config/keybind.ts
./context/args.tsx
./context/clipboard.tsx
./context/data.tsx
./context/directory.ts
./context/editor.ts
./context/epilogue.tsx
./context/event.ts
./context/exit.tsx
./context/helper.tsx
./context/kv.tsx
./context/local.tsx
./context/path-format.tsx
./context/project.tsx
./context/prompt.tsx
./context/route.tsx
./context/runtime.tsx
./context/sdk.tsx
./context/sync.tsx
./context/theme.tsx
./context/thinking.ts
./editor-zed.ts
./editor.ts
```
