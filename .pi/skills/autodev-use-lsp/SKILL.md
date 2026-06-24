---
name: autodev-use-lsp
description: "Use the LSP tool for IDE-precision code navigation, diagnostics, and refactoring. Prefer LSP over grep when you need symbol definitions, references, rename safety, type info, or typed diagnostics. Triggers: 'find definition', 'find references', 'where is X defined', 'who calls Y', 'rename symbol', 'diagnostics', 'type check', 'hover', 'LSP', 'go to definition', 'find all references', 'call hierarchy'."
---

# AutoDev Use LSP

## Objective

The `lsp` tool gives IDE-grade precision that grep cannot match: semantic symbol resolution (handles aliased imports, re-exports, overloads), typed diagnostics (compile errors, not just text matches), safe rename (workspace-aware edit computation), and type hover (signatures of dependencies without reading their source). Use it when you need *semantic* answers about code, not *textual* ones.

## When to Use LSP vs Grep

| Task | Use LSP | Use Grep |
|------|---------|----------|
| Find where a symbol is defined | ✅ `goToDefinition` — resolves aliases, re-exports | ❌ Misses aliased imports |
| Find all call sites of a function | ✅ `findReferences` — semantic, includes aliased imports | ❌ Text match only, misses aliases |
| Check a file for type errors before claiming done | ✅ `diagnostics` — typed, severity-tagged | ❌ Can't detect type errors |
| Get a type signature of a dependency | ✅ `hover` — returns type info + docs | ❌ Must read the source file |
| Rename a symbol across the workspace | ✅ `codeActions` or manual via `findReferences` + `edit` | ❌ Fragile, misses aliased references |
| Understand file structure | ✅ `documentSymbol` — outline | ✅ `grep "^function\|^class\|^const"` works too |
| Search for symbols by name across workspace | ✅ `workspaceSymbol` — semantic | ✅ `grep` works for simple names |
| Find callers/callees of a function | ✅ `incomingCalls`/`outgoingCalls` | ❌ Can't trace call chains with grep |
| Find a string in comments, logs, or prose | ❌ LSP doesn't search text | ✅ `grep` — text search |
| Find files by name pattern | ❌ LSP doesn't do filename search | ✅ `glob` |
| Analyze log output or search binary content | ❌ LSP is for source code | ✅ `grep` |

## Workflow

### Step 1: Check diagnostics before claiming done

```
lsp(operation: "diagnostics", filePath: "src/module.ts")
```

Returns severity-tagged diagnostics (errors, warnings, hints). Always run this on changed files before declaring a task complete. A file with type errors is not done, even if the tests pass.

### Step 2: Go to definition instead of grepping

```
lsp(operation: "goToDefinition", filePath: "src/module.ts", line: 42, character: 10)
```

Jumps to where the symbol at that position is defined. Handles aliased imports (`import { foo as bar }`), re-exports, and overloads. Line and character are 1-indexed (matching the `read` tool output).

### Step 3: Find references to assess blast radius

```
lsp(operation: "findReferences", filePath: "src/module.ts", line: 42, character: 10)
```

Returns every call site across the workspace. Use this before refactoring to know the blast radius. Includes aliased imports — grep would miss these.

### Step 4: Get type info without reading source

```
lsp(operation: "hover", filePath: "src/module.ts", line: 42, character: 10)
```

Returns the type signature and documentation of the symbol at that position. Use this to understand a dependency's API without reading its source files.

### Step 5: Search workspace symbols

```
lsp(operation: "workspaceSymbol", query: "ServerManager")
```

Returns matching symbols across the entire workspace. Use this to find where a type, function, or class lives without grepping for its name.

### Step 6: List symbols in a file (outline)

```
lsp(operation: "documentSymbol", filePath: "src/module.ts")
```

Returns the file's symbol outline (functions, classes, variables, their ranges). Use this to understand a file's structure quickly.

### Step 7: Code actions for quick fixes and refactoring

```
lsp(operation: "codeActions", filePath: "src/module.ts", line: 42, character: 10)
```

Returns available quick fixes and refactoring suggestions at that position. Use this to find auto-fixable issues or available refactors.

## Pre-conditions

- `.pi/lsp.json` must exist and declare a server for the file's language
- The LSP server command must be on PATH (e.g., `typescript-language-server`)
- The file must exist on disk (LSP reads file contents, not unsaved buffer state)

If no server is configured for the file's language, fall back to `grep` and flag the gap.

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Use grep to find a symbol's definition | Misses aliased imports, re-exports, overloads — grep finds the text, not the symbol |
| Call `lsp` without checking `.pi/lsp.json` first | Returns "No server configured" error — check config or fall back to grep |
| Assume `diagnostics` passing means the code is correct | Diagnostics catch type errors and lint issues, not logic bugs — tests are still needed |
| Read a dependency's source to understand its API | `hover` returns the type signature and docs without reading the file |
| Use `findReferences` results as a rename plan without verifying | References include call sites, not just definitions — verify each before editing |
| Call `lsp` with 0-indexed line numbers | The tool expects 1-indexed line/character (matching `read` tool output) — 0-indexed will point to the wrong position |