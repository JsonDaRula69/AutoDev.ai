// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T20 Integration modules tests.
 *
 * Verifies:
 *  - LSP: 6 tools registered; graceful error when no server configured
 *  - Tmux: interactive_bash tool registered; error when tmux not installed
 *  - MCP: Context7 + Grep.app tools registered; no Exa; no hardcoded keys
 *  - Rules injection: loads .omo/rules/*.md; injects via before_agent_start; no-op if empty/missing
 *  - Watch Officer: tool_call event handler; flags deviations; non-blocking
 */
import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Mock pi ExtensionAPI
// ---------------------------------------------------------------------------

interface MockPi {
  registerTool: ReturnType<typeof mock>;
  on: ReturnType<typeof mock>;
  _handlers: Map<string, (event: any, ctx: any) => void | Promise<void>>;
}

function mockPi(): MockPi {
  const handlers = new Map<string, (event: any, ctx: any) => void | Promise<void>>();
  return {
    registerTool: mock(() => {}),
    on: mock((event: string, handler: (event: any, ctx: any) => void | Promise<void>) => {
      handlers.set(event, handler);
    }),
    _handlers: handlers,
  };
}

// ---------------------------------------------------------------------------
// LSP module tests
// ---------------------------------------------------------------------------

test("LSP: registers 6 tools", () => {
  const pi = mockPi();
  const { register } = require("../lsp/index.js");
  register(pi);

  expect(pi.registerTool).toHaveBeenCalledTimes(6);

  const toolNames = (pi.registerTool as ReturnType<typeof mock>).mock.calls.map(
    (c: any[]) => c[0].name,
  );
  expect(toolNames).toContain("lsp_diagnostics");
  expect(toolNames).toContain("lsp_goto_definition");
  expect(toolNames).toContain("lsp_find_references");
  expect(toolNames).toContain("lsp_prepare_rename");
  expect(toolNames).toContain("lsp_rename");
  expect(toolNames).toContain("lsp_symbols");
});

test("LSP: tools return graceful error when no .pi/lsp.json exists", async () => {
  const pi = mockPi();
  const { register } = require("../lsp/index.js");
  register(pi);

  // Get the registered tool definitions
  const tools = (pi.registerTool as ReturnType<typeof mock>).mock.calls.map(
    (c: any[]) => c[0],
  );

  for (const tool of tools) {
    const result = await tool.execute("call-1", {});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.error).toBeDefined();
    expect(parsed.error).toContain("No LSP");
  }
});

test("LSP: tools return graceful error when .pi/lsp.json has no servers", async () => {
  // Create a temp .pi/lsp.json with empty servers
  const origCwd = process.cwd();
  const tmpDir = resolve(tmpdir(), "autodev-test-lsp-empty");
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(resolve(tmpDir, ".pi"), { recursive: true });
    writeFileSync(resolve(tmpDir, ".pi", "lsp.json"), JSON.stringify({ servers: {} }));

    process.chdir(tmpDir);

    const pi = mockPi();
    const { register } = require("../lsp/index.js");
    register(pi);

    const tools = (pi.registerTool as ReturnType<typeof mock>).mock.calls.map(
      (c: any[]) => c[0],
    );

    for (const tool of tools) {
      const result = await tool.execute("call-1", {});
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain("No LSP server configured");
    }
  } finally {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("LSP: tools return stub result when server is configured", async () => {
  const origCwd = process.cwd();
  const tmpDir = resolve(tmpdir(), "autodev-test-lsp-ok");
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(resolve(tmpDir, ".pi"), { recursive: true });
    writeFileSync(
      resolve(tmpDir, ".pi", "lsp.json"),
      JSON.stringify({
        servers: {
          typescript: {
            command: "basedpyright",
            languageIds: ["typescript"],
          },
        },
      }),
    );

    process.chdir(tmpDir);

    const pi = mockPi();
    const { register } = require("../lsp/index.js");
    register(pi);

    const tools = (pi.registerTool as ReturnType<typeof mock>).mock.calls.map(
      (c: any[]) => c[0],
    );

    // lsp_diagnostics
    const diagTool = tools.find((t: any) => t.name === "lsp_diagnostics");
    const diagResult = await diagTool.execute("call-1", { filePath: "test.ts" });
    const diagText = JSON.parse(diagResult.content[0].text);
    expect(diagText.result).toBe("lsp_diagnostics");
    expect(diagText.filePath).toBe("test.ts");

    // lsp_goto_definition
    const defTool = tools.find((t: any) => t.name === "lsp_goto_definition");
    const defResult = await defTool.execute("call-1", {
      symbol: "foo",
      file: "test.ts",
      line: 10,
      column: 5,
    });
    const defText = JSON.parse(defResult.content[0].text);
    expect(defText.result).toBe("lsp_goto_definition");
    expect(defText.symbol).toBe("foo");

    // lsp_find_references
    const refTool = tools.find((t: any) => t.name === "lsp_find_references");
    const refResult = await refTool.execute("call-1", {
      symbol: "foo",
      file: "test.ts",
    });
    const refText = JSON.parse(refResult.content[0].text);
    expect(refText.result).toBe("lsp_find_references");

    // lsp_prepare_rename
    const prepTool = tools.find((t: any) => t.name === "lsp_prepare_rename");
    const prepResult = await prepTool.execute("call-1", {
      symbol: "foo",
      file: "test.ts",
      line: 10,
      column: 5,
    });
    const prepText = JSON.parse(prepResult.content[0].text);
    expect(prepText.result).toBe("lsp_prepare_rename");

    // lsp_rename
    const renameTool = tools.find((t: any) => t.name === "lsp_rename");
    const renameResult = await renameTool.execute("call-1", {
      symbol: "foo",
      newName: "bar",
      file: "test.ts",
    });
    const renameText = JSON.parse(renameResult.content[0].text);
    expect(renameText.result).toBe("lsp_rename");
    expect(renameText.newName).toBe("bar");

    // lsp_symbols
    const symTool = tools.find((t: any) => t.name === "lsp_symbols");
    const symResult = await symTool.execute("call-1", { query: "foo" });
    const symText = JSON.parse(symResult.content[0].text);
    expect(symText.result).toBe("lsp_symbols");
  } finally {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tmux module tests
// ---------------------------------------------------------------------------

test("Tmux: registers interactive_bash tool", () => {
  const pi = mockPi();
  const { register } = require("../tmux/index.js");
  register(pi);

  expect(pi.registerTool).toHaveBeenCalledTimes(1);
  const tool = (pi.registerTool as ReturnType<typeof mock>).mock.calls[0][0];
  expect(tool.name).toBe("interactive_bash");
});

test("Tmux: returns error when tmux not installed", async () => {
  const pi = mockPi();
  const { register } = require("../tmux/index.js");
  register(pi);

  const tool = (pi.registerTool as ReturnType<typeof mock>).mock.calls[0][0];
  const result = await tool.execute("call-1", { tmux_command: "new-session -d -s test" });
  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  // On systems without tmux, should return error
  // On systems with tmux, should return result or error about the command
  if (parsed.error && parsed.error.includes("not installed")) {
    expect(parsed.error).toContain("tmux is not installed");
  } else if (parsed.error) {
    // tmux is installed but the command may have failed (expected on CI)
    expect(parsed.error).toBeDefined();
  } else {
    expect(parsed.result).toBe("ok");
  }
});

test("Tmux: returns error when tmux_command is missing", async () => {
  const pi = mockPi();
  const { register } = require("../tmux/index.js");
  register(pi);

  const tool = (pi.registerTool as ReturnType<typeof mock>).mock.calls[0][0];
  const result = await tool.execute("call-1", {});
  const text = result.content[0].text;
  const parsed = JSON.parse(text);
  expect(parsed.error).toBeDefined();
  expect(parsed.error).toContain("tmux_command is required");
});

// ---------------------------------------------------------------------------
// MCP integrations module tests
// ---------------------------------------------------------------------------

test("MCP: registers 3 tools (Context7 + Grep.app)", () => {
  const pi = mockPi();
  const { register } = require("../mcp-integrations/index.js");
  register(pi);

  expect(pi.registerTool).toHaveBeenCalledTimes(3);

  const toolNames = (pi.registerTool as ReturnType<typeof mock>).mock.calls.map(
    (c: any[]) => c[0].name,
  );
  expect(toolNames).toContain("context7_resolve_library_id");
  expect(toolNames).toContain("context7_query_docs");
  expect(toolNames).toContain("grep_app_search_github");
});

test("MCP: no Exa tool registered", () => {
  const pi = mockPi();
  const { register } = require("../mcp-integrations/index.js");
  register(pi);

  const toolNames = (pi.registerTool as ReturnType<typeof mock>).mock.calls.map(
    (c: any[]) => c[0].name,
  );
  expect(toolNames).not.toContain("exa_search");
  expect(toolNames).not.toContain("exa");
});

test("MCP: no hardcoded API keys in source", async () => {
  const source = await Bun.file(resolve(__dirname, "../mcp-integrations/index.ts")).text();
  // Check no API keys are hardcoded
  expect(source).not.toContain("api_key");
  expect(source).not.toContain("apiKey");
  expect(source).not.toContain("API_KEY");
  expect(source).not.toContain("sk-");
});

// ---------------------------------------------------------------------------
// Rules injection module tests
// ---------------------------------------------------------------------------

test("Rules injection: registers handler even when .omo/rules/ does not exist (no-op at runtime)", () => {
  const origCwd = process.cwd();
  const tmpDir = resolve(tmpdir(), "autodev-test-rules-missing");
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    process.chdir(tmpDir);

    const pi = mockPi();
    const { register } = require("../rules-injection/index.js");
    register(pi);

    // Should register a before_agent_start handler (no-op at runtime)
    expect(pi.on).toHaveBeenCalledTimes(1);
    expect((pi.on as ReturnType<typeof mock>).mock.calls[0][0]).toBe("before_agent_start");
  } finally {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Rules injection: handler returns undefined when .omo/rules/ is empty (no-op)", async () => {
  const origCwd = process.cwd();
  const tmpDir = resolve(tmpdir(), "autodev-test-rules-empty");
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(resolve(tmpDir, ".omo", "rules"), { recursive: true });
    process.chdir(tmpDir);

    const pi = mockPi();
    const { register } = require("../rules-injection/index.js");
    register(pi);

    // Should register a before_agent_start handler
    expect(pi.on).toHaveBeenCalledTimes(1);

    // Get the handler and invoke it
    const handler = (pi.on as ReturnType<typeof mock>).mock.calls[0][1];
    const event = { systemPrompt: "Original prompt" };
    const ctx = { cwd: tmpDir };
    const result = await handler(event, ctx);

    // Should return undefined (no-op)
    expect(result).toBeUndefined();
  } finally {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Rules injection: registers handler and injects rules when .omo/rules/ has .md files", async () => {
  const origCwd = process.cwd();
  const tmpDir = resolve(tmpdir(), "autodev-test-rules-ok");
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(resolve(tmpDir, ".omo", "rules"), { recursive: true });
    writeFileSync(
      resolve(tmpDir, ".omo", "rules", "coding-standards.md"),
      "# Coding Standards\n\nUse strict types.\n",
    );
    writeFileSync(
      resolve(tmpDir, ".omo", "rules", "naming.md"),
      "# Naming Conventions\n\nUse camelCase.\n",
    );
    process.chdir(tmpDir);

    const pi = mockPi();
    const { register } = require("../rules-injection/index.js");
    register(pi);

    // Should register a before_agent_start handler
    expect(pi.on).toHaveBeenCalledTimes(1);
    expect((pi.on as ReturnType<typeof mock>).mock.calls[0][0]).toBe("before_agent_start");

    // Get the handler and invoke it (handler is async)
    const handler = (pi.on as ReturnType<typeof mock>).mock.calls[0][1];
    const event = { systemPrompt: "Original prompt" };
    const ctx = { cwd: tmpDir };
    const result = await handler(event, ctx);

    expect(result).toBeDefined();
    expect(result!.systemPrompt).toContain("Original prompt");
    expect(result!.systemPrompt).toContain("Coding Standards");
    expect(result!.systemPrompt).toContain("Naming Conventions");
    expect(result!.systemPrompt).toContain("Project Rules (.omo/rules)");
  } finally {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Watch Officer monitor module tests
// ---------------------------------------------------------------------------

test("Watch Officer: registers tool_call event handler", () => {
  const pi = mockPi();
  const { register } = require("../watch-officer-monitor/index.js");
  register(pi);

  expect(pi.on).toHaveBeenCalledTimes(1);
  expect((pi.on as ReturnType<typeof mock>).mock.calls[0][0]).toBe("tool_call");
});

test("Watch Officer: does not block tool calls", async () => {
  const pi = mockPi();
  const { register } = require("../watch-officer-monitor/index.js");
  register(pi);

  const handler = (pi.on as ReturnType<typeof mock>).mock.calls[0][1];
  const ctx = { ui: { notify: mock(() => {}) } };

  const result = await handler(
    { toolName: "read", input: { filePath: "test.ts" } },
    ctx,
  );

  // Should always return undefined (non-blocking)
  expect(result).toBeUndefined();
});

test("Watch Officer: flags write targets outside plan scope", async () => {
  const origCwd = process.cwd();
  const tmpDir = resolve(tmpdir(), "autodev-test-watch");
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(resolve(tmpDir, ".omo"), { recursive: true });
    // Create a boulder.json with an active plan
    writeFileSync(
      resolve(tmpDir, ".omo", "boulder.json"),
      JSON.stringify({ active_plan: "test-plan" }),
    );
    // Create a plan that only mentions "src/foo/"
    mkdirSync(resolve(tmpDir, ".omo", "plans"), { recursive: true });
    writeFileSync(
      resolve(tmpDir, ".omo", "plans", "test-plan.md"),
      "# Test Plan\n\nScope: src/foo/ directory only.\n",
    );
    process.chdir(tmpDir);

    const pi = mockPi();
    const { register } = require("../watch-officer-monitor/index.js");
    register(pi);

    const handler = (pi.on as ReturnType<typeof mock>).mock.calls[0][1];
    const notifyMock = mock(() => {});
    const ctx = { ui: { notify: notifyMock } };

    // Write to a path NOT mentioned in the plan
    await handler(
      { toolName: "write", input: { filePath: "src/bar/outside.ts" } },
      ctx,
    );

    // Should have flagged it
    expect(notifyMock).toHaveBeenCalled();
    const notifyCall = notifyMock.mock.calls[0];
    expect(notifyCall[0]).toContain("[Watch Officer]");
    expect(notifyCall[0]).toContain("plan_deviation");
  } finally {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Watch Officer: does not flag writes within plan scope", async () => {
  const origCwd = process.cwd();
  const tmpDir = resolve(tmpdir(), "autodev-test-watch-ok");
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(resolve(tmpDir, ".omo"), { recursive: true });
    writeFileSync(
      resolve(tmpDir, ".omo", "boulder.json"),
      JSON.stringify({ active_plan: "test-plan" }),
    );
    mkdirSync(resolve(tmpDir, ".omo", "plans"), { recursive: true });
    writeFileSync(
      resolve(tmpDir, ".omo", "plans", "test-plan.md"),
      "# Test Plan\n\nsrc/foo/outside.ts\n",
    );
    process.chdir(tmpDir);

    const pi = mockPi();
    const { register } = require("../watch-officer-monitor/index.js");
    register(pi);

    const handler = (pi.on as ReturnType<typeof mock>).mock.calls[0][1];
    const notifyMock = mock(() => {});
    const ctx = { ui: { notify: notifyMock } };

    // Write to a path mentioned in the plan
    await handler(
      { toolName: "write", input: { filePath: "src/foo/outside.ts" } },
      ctx,
    );

    // Should NOT have flagged it
    expect(notifyMock).not.toHaveBeenCalled();
  } finally {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Watch Officer: flags destructive bash commands", async () => {
  const pi = mockPi();
  const { register } = require("../watch-officer-monitor/index.js");
  register(pi);

  const handler = (pi.on as ReturnType<typeof mock>).mock.calls[0][1];
  const notifyMock = mock(() => {});
  const ctx = { ui: { notify: notifyMock } };

  await handler(
    { toolName: "bash", input: { command: "rm -rf /tmp/test --force" } },
    ctx,
  );

  expect(notifyMock).toHaveBeenCalled();
  expect(notifyMock.mock.calls[0][0]).toContain("api_mismatch");
});
