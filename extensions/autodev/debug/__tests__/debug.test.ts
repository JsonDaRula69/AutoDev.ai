/**
 * T18 Debug mode tests.
 *
 * Verifies:
 *  - Debug logging is OFF by default
 *  - Debug logging is ON when AUTODEV_DEBUG=true env var is set
 *  - Secret redaction works (API keys, tokens redacted in log output)
 *  - Log rotation works (50MB max, keep last 3 rotated files)
 *  - Structured JSON-lines format
 *  - Async logging does not block
 *  - enable/disable/toggle work
 *  - register() wires pi events
 */

import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { unlinkSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLogger, resetLogger, type DebugLogger } from "../logger.js";
import { register, enableDebug, disableDebug, toggleDebug, getDebugState, dispose, resetRegistration } from "../index.js";

// ---- Helpers ----

/** Create a temporary directory for log files. */
function tmpDir(): string {
  const dir = join("/tmp", `debug-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a mock pi ExtensionAPI. */
function mockPi() {
  const handlers = new Map<string, (event: any, ctx: any) => void>();
  return {
    on: mock((event: string, handler: any) => {
      handlers.set(event, handler);
    }),
    registerTool: mock(() => {}),
    registerCommand: mock(() => {}),
    getActiveTools: mock(() => []),
    _handlers: handlers,
  };
}

// ---- Setup / Teardown ----

beforeEach(() => {
  // Reset the logger singleton before each test
  resetLogger();
  resetRegistration();
  // Clear env vars that might affect tests
  delete process.env.AUTODEV_DEBUG;
  delete process.env.AUTODEV_DEBUG_LOG;
});

afterEach(async () => {
  await dispose();
  delete process.env.AUTODEV_DEBUG;
  delete process.env.AUTODEV_DEBUG_LOG;
});

// ---- Tests ----

test("debug logging is OFF by default", () => {
  const logger = getLogger();
  expect(logger.enabled).toBe(false);
});

test("debug logging is ON when AUTODEV_DEBUG=true env var is set", () => {
  process.env.AUTODEV_DEBUG = "true";
  const logger = getLogger();
  expect(logger.enabled).toBe(true);
});

test("debug logging is ON when AUTODEV_DEBUG=1 env var is set", () => {
  process.env.AUTODEV_DEBUG = "1";
  const logger = getLogger();
  expect(logger.enabled).toBe(true);
});

test("enable() turns on debug logging", () => {
  const logger = getLogger();
  expect(logger.enabled).toBe(false);
  logger.enable();
  expect(logger.enabled).toBe(true);
});

test("disable() turns off debug logging", () => {
  const logger = getLogger();
  logger.enable();
  expect(logger.enabled).toBe(true);
  logger.disable();
  expect(logger.enabled).toBe(false);
});

test("toggleDebug() toggles debug state", () => {
  expect(getDebugState().enabled).toBe(false);
  const result1 = toggleDebug();
  expect(result1).toBe(true);
  expect(getDebugState().enabled).toBe(true);
  const result2 = toggleDebug();
  expect(result2).toBe(false);
  expect(getDebugState().enabled).toBe(false);
});

test("enableDebug() and disableDebug() work via index API", () => {
  expect(getDebugState().enabled).toBe(false);
  enableDebug();
  expect(getDebugState().enabled).toBe(true);
  disableDebug();
  expect(getDebugState().enabled).toBe(false);
});

test("AUTODEV_DEBUG_LOG=stdout writes to stdout", () => {
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = "stdout";
  const logger = getLogger();
  expect(logger.enabled).toBe(true);
  expect(logger.target).toBe("stdout");
});

test("AUTODEV_DEBUG_LOG sets custom log path", () => {
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = "/tmp/custom-debug.log";
  const logger = getLogger();
  expect(logger.enabled).toBe(true);
  expect(logger.target).toBe("/tmp/custom-debug.log");
});

test("log writes structured JSON lines to file", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug.log");
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = logPath;

  const logger = getLogger();
  logger.log({
    timestamp: "2025-01-01T00:00:00.000Z",
    level: "info",
    event: "test_event",
    data: { key: "value" },
  });

  // Wait for async write
  await new Promise((r) => setTimeout(r, 100));

  const content = await readFile(logPath, "utf-8");
  const lines = content.trim().split("\n");
  expect(lines.length).toBe(1);

  const parsed = JSON.parse(lines[0] as string);
  expect(parsed.timestamp).toBe("2025-01-01T00:00:00.000Z");
  expect(parsed.level).toBe("info");
  expect(parsed.event).toBe("test_event");
  expect(parsed.data.key).toBe("value");

  // Cleanup
  rmSync(dir, { recursive: true, force: true });
});

test("log writes multiple entries as separate JSON lines", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug.log");
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = logPath;

  const logger = getLogger();
  logger.log({ timestamp: "t1", level: "info", event: "e1" });
  logger.log({ timestamp: "t2", level: "debug", event: "e2" });
  logger.log({ timestamp: "t3", level: "error", event: "e3" });

  await new Promise((r) => setTimeout(r, 100));

  const content = await readFile(logPath, "utf-8");
  const lines = content.trim().split("\n");
  expect(lines.length).toBe(3);

  expect(JSON.parse(lines[0] as string).event).toBe("e1");
  expect(JSON.parse(lines[1] as string).event).toBe("e2");
  expect(JSON.parse(lines[2] as string).event).toBe("e3");

  rmSync(dir, { recursive: true, force: true });
});

test("no log file created when debug is OFF", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug-off.log");

  const logger = getLogger();
  expect(logger.enabled).toBe(false);

  logger.log({ timestamp: "t1", level: "info", event: "should_not_appear" });

  await new Promise((r) => setTimeout(r, 100));

  expect(existsSync(logPath)).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});

test("secrets are redacted in log output", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug.log");
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = logPath;

  const logger = getLogger();
  logger.log({
    timestamp: "t1",
    level: "info",
    event: "test",
    data: {
      apiKey: "sk-ant-abcdefghijklmnopqrstuvwxyz123456",
      safe: "hello",
    },
  });

  await new Promise((r) => setTimeout(r, 100));

  const content = await readFile(logPath, "utf-8");
  const parsed = JSON.parse(content.trim());

  // The API key should be redacted
  expect(parsed.data.apiKey).toBe("[REDACTED]");
  // Safe values should remain unchanged
  expect(parsed.data.safe).toBe("hello");
  // The raw secret should NOT appear anywhere in the log
  expect(content).not.toContain("sk-ant-abcdefghijklmnopqrstuvwxyz123456");

  rmSync(dir, { recursive: true, force: true });
});

test("multiple secret patterns are redacted", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug.log");
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = logPath;

  const logger = getLogger();
  logger.log({
    timestamp: "t1",
    level: "info",
    event: "test",
    data: {
      anthropic: "sk-ant-abcdefghijklmnopqrstuvwxyz123456",
      openrouter: "sk-or-abcdefghijklmnopqrstuvwxyz123456",
      google: "AIzaSyDfi9nT6m1234567890ABCDEFGHIJKLMNOPQ",
      github: "ghp_abcdefghijklmnopqrstuvwxyz12345678901234",
      slack: "xoxb-abcdefghijklmnopqrstuvwxyz1234",
      jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNqPnd9dGQm4kFy8QkZ5xGc",
    },
  });

  await new Promise((r) => setTimeout(r, 100));

  const content = await readFile(logPath, "utf-8");
  const parsed = JSON.parse(content.trim());

  expect(parsed.data.anthropic).toBe("[REDACTED]");
  expect(parsed.data.openrouter).toBe("[REDACTED]");
  expect(parsed.data.google).toBe("[REDACTED]");
  expect(parsed.data.github).toBe("[REDACTED]");
  expect(parsed.data.slack).toBe("[REDACTED]");
  expect(parsed.data.jwt).toBe("[REDACTED]");

  rmSync(dir, { recursive: true, force: true });
});

test("secrets in error field are redacted", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug.log");
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = logPath;

  const logger = getLogger();
  logger.log({
    timestamp: "t1",
    level: "error",
    event: "api_error",
    error: "Failed with key sk-ant-abcdefghijklmnopqrstuvwxyz123456",
  });

  await new Promise((r) => setTimeout(r, 100));

  const content = await readFile(logPath, "utf-8");
  const parsed = JSON.parse(content.trim());

  expect(parsed.error).toBe("Failed with key [REDACTED]");
  expect(content).not.toContain("sk-ant-abcdefghijklmnopqrstuvwxyz123456");

  rmSync(dir, { recursive: true, force: true });
});

test("log rotation works when file exceeds 50MB", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug.log");
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = logPath;

  const logger = getLogger();

  // Write enough data to trigger rotation (50MB threshold)
  // We'll write a large entry that pushes past the limit
  const bigData = "x".repeat(1024 * 1024); // 1MB
  for (let i = 0; i < 55; i++) {
    logger.log({
      timestamp: `t${i}`,
      level: "info",
      event: "big_data",
      data: { chunk: i, data: bigData },
    });
  }

  // Wait for all async writes
  await logger.flush();
  await new Promise((r) => setTimeout(r, 500));

  // Check that rotation happened
  // The original file should exist
  expect(existsSync(logPath)).toBe(true);

  // At least one rotated file should exist
  const rotatedExists = existsSync(`${logPath}.1`);
  expect(rotatedExists).toBe(true);

  // Check that the rotated file contains valid JSON lines
  if (rotatedExists) {
    const rotatedContent = await readFile(`${logPath}.1`, "utf-8");
    const lines = rotatedContent.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    // Each line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  }

  rmSync(dir, { recursive: true, force: true });
});

test("register() wires pi event handlers", () => {
  const pi = mockPi() as any;
  register(pi);

  // Should have registered tool_call and agent_end handlers
  expect(pi.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
  expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
});

test("register() is idempotent", () => {
  const pi = mockPi() as any;
  register(pi);
  register(pi);

  // Each handler should only be registered once
  const toolCallCalls = pi.on.mock.calls.filter(
    (call: any) => call[0] === "tool_call",
  );
  expect(toolCallCalls.length).toBe(1);
});

test("getDebugState() returns current state", () => {
  expect(getDebugState()).toEqual({ enabled: false, target: ".autodev/debug.log" });

  enableDebug("/tmp/test.log");
  expect(getDebugState()).toEqual({ enabled: true, target: "/tmp/test.log" });

  disableDebug();
  expect(getDebugState()).toEqual({ enabled: false, target: "/tmp/test.log" });
});

test("log does not block when write fails (async resilience)", async () => {
  // Use a path that will fail (directory doesn't exist and can't be created)
  const logger = getLogger();
  logger.enable("/nonexistent/path/debug.log");

  // This should not throw
  expect(() => {
    logger.log({ timestamp: "t1", level: "info", event: "test" });
  }).not.toThrow();

  await new Promise((r) => setTimeout(r, 50));
});

test("flush() waits for pending writes", async () => {
  const dir = tmpDir();
  const logPath = join(dir, "debug.log");
  process.env.AUTODEV_DEBUG = "true";
  process.env.AUTODEV_DEBUG_LOG = logPath;

  const logger = getLogger();
  logger.log({ timestamp: "t1", level: "info", event: "test" });

  // Flush should complete when the write is done
  await logger.flush();

  const content = await readFile(logPath, "utf-8");
  expect(content.trim()).toBeTruthy();

  rmSync(dir, { recursive: true, force: true });
});
