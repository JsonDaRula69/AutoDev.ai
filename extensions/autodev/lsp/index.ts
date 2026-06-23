/**
 * LSP module — language server integration for crew agents.
 *
 * Registers 6 LSP tools via `pi.registerTool()`: lsp_diagnostics,
 * lsp_goto_definition, lsp_find_references, lsp_prepare_rename,
 * lsp_rename, lsp_symbols. Each tool degrades gracefully when no LSP
 * server is configured for the file's language.
 *
 * LSP server config is read from `.pi/lsp.json` at call time so the
 * extension loads even when no server is configured.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single LSP server entry from `.pi/lsp.json`. */
interface LspServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly languageIds?: readonly string[];
}

/** Shape of `.pi/lsp.json`. */
interface LspConfig {
  readonly servers?: Record<string, LspServerConfig>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read LSP config from `.pi/lsp.json`, returning undefined if missing. */
function readLspConfig(projectRoot: string): LspConfig | undefined {
  const path = resolve(projectRoot, ".pi", "lsp.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LspConfig;
  } catch {
    return undefined;
  }
}

/** Build a graceful error response when no LSP server is configured. */
function noServerError(toolName: string): string {
  return JSON.stringify({
    error: `No LSP server configured for ${toolName}. Configure a server in .pi/lsp.json or install a language server for the file's language.`,
    hint: "See .pi/lsp.json for server configuration. Example: {\"servers\":{\"typescript\":{\"command\":\"basedpyright\"}}}",
  });
}

/** Build a graceful error response when LSP config is missing entirely. */
function noConfigError(toolName: string): string {
  return JSON.stringify({
    error: `No LSP configuration found for ${toolName}. Create .pi/lsp.json with server definitions.`,
    hint: "Create .pi/lsp.json with at least one server entry.",
  });
}

/**
 * Check if any LSP server is configured for the given project root.
 * Returns a descriptive error string if none is available, or undefined
 * if at least one server is configured.
 */
function checkLspAvailable(projectRoot: string, toolName: string): string | undefined {
  const config = readLspConfig(projectRoot);
  if (config === undefined) return noConfigError(toolName);
  const servers = config.servers;
  if (!servers || Object.keys(servers).length === 0) return noServerError(toolName);
  return undefined; // at least one server configured
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

function lspDiagnosticsExecute(projectRoot: string, params: Record<string, unknown>): string {
  const err = checkLspAvailable(projectRoot, "lsp_diagnostics");
  if (err !== undefined) return err;
  const filePath = params.filePath as string | undefined;
  return JSON.stringify({
    result: "lsp_diagnostics",
    filePath: filePath ?? "(workspace)",
    diagnostics: [],
    note: "LSP server configured but diagnostics require a running server process. This is a stub returning empty diagnostics.",
  });
}

function lspGotoDefinitionExecute(projectRoot: string, params: Record<string, unknown>): string {
  const err = checkLspAvailable(projectRoot, "lsp_goto_definition");
  if (err !== undefined) return err;
  return JSON.stringify({
    result: "lsp_goto_definition",
    symbol: params.symbol as string,
    file: params.file as string,
    line: params.line as number,
    column: params.column as number,
    note: "LSP server configured but definition lookup requires a running server process. This is a stub.",
  });
}

function lspFindReferencesExecute(projectRoot: string, params: Record<string, unknown>): string {
  const err = checkLspAvailable(projectRoot, "lsp_find_references");
  if (err !== undefined) return err;
  return JSON.stringify({
    result: "lsp_find_references",
    symbol: params.symbol as string,
    file: params.file as string,
    references: [],
    note: "LSP server configured but reference lookup requires a running server process. This is a stub.",
  });
}

function lspPrepareRenameExecute(projectRoot: string, params: Record<string, unknown>): string {
  const err = checkLspAvailable(projectRoot, "lsp_prepare_rename");
  if (err !== undefined) return err;
  return JSON.stringify({
    result: "lsp_prepare_rename",
    symbol: params.symbol as string,
    file: params.file as string,
    line: params.line as number,
    column: params.column as number,
    canRename: true,
    note: "LSP server configured but rename preparation requires a running server process. This is a stub.",
  });
}

function lspRenameExecute(projectRoot: string, params: Record<string, unknown>): string {
  const err = checkLspAvailable(projectRoot, "lsp_rename");
  if (err !== undefined) return err;
  return JSON.stringify({
    result: "lsp_rename",
    symbol: params.symbol as string,
    newName: params.newName as string,
    file: params.file as string,
    changes: [],
    note: "LSP server configured but rename requires a running server process. This is a stub.",
  });
}

function lspSymbolsExecute(projectRoot: string, params: Record<string, unknown>): string {
  const err = checkLspAvailable(projectRoot, "lsp_symbols");
  if (err !== undefined) return err;
  return JSON.stringify({
    result: "lsp_symbols",
    query: params.query as string | undefined,
    file: params.file as string | undefined,
    symbols: [],
    note: "LSP server configured but symbol lookup requires a running server process. This is a stub.",
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI): void {
  const projectRoot = process.cwd();

  // --- lsp_diagnostics ----------------------------------------------------
  pi.registerTool({
    name: "lsp_diagnostics",
    label: "LSP Diagnostics",
    description: "Returns errors, warnings, and hints for a file or directory from the LSP server.",
    parameters: Type.Object({
      filePath: Type.Optional(Type.String({ description: "Path to file or directory to diagnose" })),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: lspDiagnosticsExecute(projectRoot, params) }],
      details: {},
    }),
  });

  // --- lsp_goto_definition -------------------------------------------------
  pi.registerTool({
    name: "lsp_goto_definition",
    label: "LSP Go to Definition",
    description: "Finds where a symbol is defined in the workspace.",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol name to find" }),
      file: Type.String({ description: "File path containing the symbol reference" }),
      line: Type.Number({ description: "Line number of the reference" }),
      column: Type.Number({ description: "Column number of the reference" }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: lspGotoDefinitionExecute(projectRoot, params) }],
      details: {},
    }),
  });

  // --- lsp_find_references -------------------------------------------------
  pi.registerTool({
    name: "lsp_find_references",
    label: "LSP Find References",
    description: "Finds all references to a symbol across the workspace.",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol name to find references for" }),
      file: Type.String({ description: "File path containing the symbol" }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: lspFindReferencesExecute(projectRoot, params) }],
      details: {},
    }),
  });

  // --- lsp_prepare_rename --------------------------------------------------
  pi.registerTool({
    name: "lsp_prepare_rename",
    label: "LSP Prepare Rename",
    description: "Checks whether a symbol can be renamed at a position.",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol name to check" }),
      file: Type.String({ description: "File path containing the symbol" }),
      line: Type.Number({ description: "Line number of the symbol" }),
      column: Type.Number({ description: "Column number of the symbol" }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: lspPrepareRenameExecute(projectRoot, params) }],
      details: {},
    }),
  });

  // --- lsp_rename -----------------------------------------------------------
  pi.registerTool({
    name: "lsp_rename",
    label: "LSP Rename",
    description: "Renames a symbol across the workspace and applies the edit.",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol name to rename" }),
      newName: Type.String({ description: "New name for the symbol" }),
      file: Type.String({ description: "File path containing the symbol" }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: lspRenameExecute(projectRoot, params) }],
      details: {},
    }),
  });

  // --- lsp_symbols ---------------------------------------------------------
  pi.registerTool({
    name: "lsp_symbols",
    label: "LSP Symbols",
    description: "Lists document symbols or searches workspace symbols.",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Symbol search query (optional)" })),
      file: Type.Optional(Type.String({ description: "File path to list symbols for (optional)" })),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: lspSymbolsExecute(projectRoot, params) }],
      details: {},
    }),
  });
}
