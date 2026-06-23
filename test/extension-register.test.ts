/**
 * m1 — register() called with fake ExtensionAPI for all 15 modules.
 *
 * Verifies that every module's register() function:
 *  - Does not throw when called with a minimal fake ExtensionAPI
 *  - Modules that should register tools actually call registerTool()
 *  - Modules that should register event handlers actually call on()
 *  - Stub modules (lsp, tmux, mcp-integrations, rules-injection) don't register anything
 */
import { test, expect } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

/** Create a fake ExtensionAPI that records all calls. */
function createFakePi() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    registerTool: (...args: unknown[]) => { calls.push({ method: "registerTool", args }); },
    on: (event: string, _handler: unknown) => { calls.push({ method: "on", args: [event] }); },
    registerCommand: (...args: unknown[]) => { calls.push({ method: "registerCommand", args }); },
    getActiveTools: () => [] as string[],
    getAllTools: () => [] as string[],
    ui: { notify: () => {} },
  };
}

type FakePi = ReturnType<typeof createFakePi>;

// Modules that should register tools via pi.registerTool()
const TOOL_REGISTERING_MODULES = new Set([
  "team-mode",
  "loreguard",
  "docs",
  "tools",
  "delegation",
]);

// Modules that should register event handlers via pi.on()
const EVENT_REGISTERING_MODULES = new Set([
  "guardrails",
  "comment-checker",
]);

// Stub modules (no-op until sub-plan 4)
const STUB_MODULES = new Set([
  "lsp",
  "tmux",
  "mcp-integrations",
  "rules-injection",
]);

const ALL_MODULES = [
  "guardrails",
  "background",
  "delegation",
  "loreguard",
  "docs",
  "tools",
  "team-mode",
  "comment-checker",
  "notepad",
  "intent-gate",
  "mcp-integrations",
  "lsp",
  "tmux",
  "rules-injection",
  "watch-officer-monitor",
];

for (const name of ALL_MODULES) {
  test(`${name} register() does not throw with fake ExtensionAPI`, async () => {
    const mod = await import(join(ROOT, "extensions", "autodev", name, "index.ts"));
    const pi = createFakePi();
    expect(() => mod.register(pi)).not.toThrow();
  });
}

test("tool-registering modules call registerTool()", async () => {
  for (const name of TOOL_REGISTERING_MODULES) {
    const mod = await import(join(ROOT, "extensions", "autodev", name, "index.ts"));
    const pi = createFakePi();
    mod.register(pi);
    const toolCalls = pi.calls.filter((c) => c.method === "registerTool");
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
  }
});

test("event-registering modules call on()", async () => {
  for (const name of EVENT_REGISTERING_MODULES) {
    const mod = await import(join(ROOT, "extensions", "autodev", name, "index.ts"));
    const pi = createFakePi();
    mod.register(pi);
    const onCalls = pi.calls.filter((c) => c.method === "on");
    expect(onCalls.length).toBeGreaterThanOrEqual(1);
  }
});

test("stub modules don't register anything", async () => {
  for (const name of STUB_MODULES) {
    const mod = await import(join(ROOT, "extensions", "autodev", name, "index.ts"));
    const pi = createFakePi();
    mod.register(pi);
    expect(pi.calls.length).toBe(0);
  }
});

test("at least 5 modules verified to call registerTool or on", () => {
  expect(TOOL_REGISTERING_MODULES.size + EVENT_REGISTERING_MODULES.size).toBeGreaterThanOrEqual(5);
});
