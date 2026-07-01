import { test, expect } from "bun:test";
import { formatMessage, formatSessionHeader, wrapText } from "../cli-format.js";

test("formatMessage agent channel: produces header bar with agent name", () => {
  const out = formatMessage("agent", "Hello there!", { agent: "harbor-master" });
  expect(out).toContain("Harbor Master");
  expect(out).toContain("Hello there!");
  expect(out).toContain("\x1b[0m");
});

test("formatMessage user channel: green bold prompt", () => {
  const out = formatMessage("user", "I need a trading bot");
  expect(out).toContain("\x1b[1m");
  expect(out).toContain("\x1b[32m");
  expect(out).toContain("I need a trading bot");
});

test("formatMessage thinking channel: dim gray with icon", () => {
  const out = formatMessage("thinking", "Let me consider the options", { agent: "harbor-master" });
  expect(out).toContain("💭");
  expect(out).toContain("Harbor Master");
  expect(out).toContain("\x1b[2m");
});

test("formatMessage toolcall channel: yellow with icon", () => {
  const out = formatMessage("toolcall", "read(/path/to/file)", { agent: "explore" });
  expect(out).toContain("🔧");
  expect(out).toContain("Explore");
  expect(out).toContain("read(/path/to/file)");
});

test("formatMessage toolresult channel: gray with arrow", () => {
  const out = formatMessage("toolresult", "read → file contents here");
  expect(out).toContain("↳");
  expect(out).toContain("file contents here");
});

test("formatMessage subagent channel: magenta with icon", () => {
  const out = formatMessage("subagent", "Explore is investigating", { agent: "explore" });
  expect(out).toContain("⚡");
  expect(out).toContain("Explore");
});

test("formatMessage mailbox channel: blue with icon", () => {
  const out = formatMessage("mailbox", "[Codebase Map] Found Python project");
  expect(out).toContain("📮");
  expect(out).toContain("Codebase Map");
});

test("formatMessage system channel: cyan with icon", () => {
  const out = formatMessage("system", "Resuming session");
  expect(out).toContain("ℹ");
  expect(out).toContain("Resuming session");
});

test("formatMessage warning channel: yellow with icon", () => {
  const out = formatMessage("warning", "Missing config");
  expect(out).toContain("⚠");
  expect(out).toContain("Missing config");
});

test("formatMessage error channel: red bold with icon", () => {
  const out = formatMessage("error", "API failed");
  expect(out).toContain("✗");
  expect(out).toContain("API failed");
});

test("formatMessage agent with unknown agent name: uses raw name", () => {
  const out = formatMessage("agent", "Hello", { agent: "unknown-agent" });
  expect(out).toContain("unknown-agent");
});

test("formatSessionHeader fresh start: shows starting title", () => {
  const out = formatSessionHeader("/path/to/project", false);
  expect(out).toContain("Starting Onboarding Session");
  expect(out).toContain("/path/to/project");
  expect(out).toContain("═");
});

test("formatSessionHeader resume: shows resuming title", () => {
  const out = formatSessionHeader("/path/to/project", true);
  expect(out).toContain("Resuming Onboarding Session");
  expect(out).toContain("/path/to/project");
});

test("wrapText: wraps long text to specified width", () => {
  const result = wrapText("one two three four five six seven eight", 20);
  expect(result).toContain("one two three four");
  expect(result).toContain("\n");
});

test("wrapText: empty string returns empty", () => {
  const result = wrapText("", 70);
  expect(result).toBe("");
});

test("wrapText: single word longer than width stays on one line", () => {
  const result = wrapText("supercalifragilisticexpialidocious", 10);
  expect(result.trim()).toBe("supercalifragilisticexpialidocious");
});