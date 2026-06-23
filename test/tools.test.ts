/**
 * T12 custom tools tests.
 *
 * Drives each tool's execute handler directly with mock dependencies — no real
 * pi session is spawned. Covers todowrite format validation, look_at file
 * reading, and the three session_* tools against the mock SessionManager.
 */
import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TextContent } from "@earendil-works/pi-ai";

function textOf(block: { type: string; text?: string } | undefined): string {
  return block?.text ?? "";
}

import {
  executeLookAt,
  executeTodowrite,
  getTodoStore,
  isValidTodoFormat,
} from "../extensions/autodev/tools/handlers.js";
import {
  executeSessionList,
  executeSessionRead,
  executeSessionSearch,
} from "../extensions/autodev/tools/session-handlers.js";
import {
  createMockSessionDeps,
  mockMessageEntry,
  type MockSessionData,
} from "./mocks/session-manager.js";

// --- todowrite -------------------------------------------------------------

beforeEach(() => {
  // Reset the in-memory todo store between tests by writing an empty list.
  void executeTodowrite({ todos: [] }).catch(() => undefined);
});

test("todowrite accepts a valid 4-element todo", async () => {
  const result = await executeTodowrite({
    todos: [
      {
        content: "src/foo.ts: Add validate() to check input - expect boolean result",
        status: "in_progress",
        priority: "high",
      },
    ],
  });
  expect(result.isError).toBeFalsy();
  expect(result.details?.count).toBe(1);
  expect(getTodoStore().length).toBe(1);
});

test("todowrite rejects a malformed todo missing ' to '", async () => {
  const result = await executeTodowrite({
    todos: [
      {
        content: "just some text no separators",
        status: "pending",
        priority: "low",
      },
    ],
  });
  expect(result.isError).toBe(true);
  expect(textOf(result.content[0])).toContain("Invalid todo format");
});

test("todowrite rejects a malformed todo missing ' - expect '", async () => {
  const result = await executeTodowrite({
    todos: [
      {
        content: "src/foo.ts: Add validate() to check input",
        status: "pending",
        priority: "low",
      },
    ],
  });
  expect(result.isError).toBe(true);
});

test("isValidTodoFormat validates the 4-element pattern", () => {
  expect(isValidTodoFormat("A: do B to ensure C - expect D")).toBe(true);
  expect(isValidTodoFormat("no separators here")).toBe(false);
  expect(isValidTodoFormat("A to B")).toBe(false); // missing - expect
  expect(isValidTodoFormat("A - expect B")).toBe(false); // missing " to "
});

test("todowrite accepts an empty todo array as a no-op", async () => {
  const result = await executeTodowrite({ todos: [] });
  expect(result.isError).toBeFalsy();
  expect(result.details?.count).toBe(0);
});

// --- look_at --------------------------------------------------------------

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "autodev-tools-"));
});

test("look_at reads an existing file and returns a summary", async () => {
  const file = join(root, "img.png");
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const result = await executeLookAt({ file_path: file, goal: "describe the image" });
  expect(result.isError).toBeFalsy();
  expect(textOf(result.content[0])).toContain("Analyzing");
  expect(result.details?.goal).toBe("describe the image");
});

test("look_at returns base64 image content blocks for visual media", async () => {
  const file = join(root, "img.png");
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  writeFileSync(file, bytes);
  const result = await executeLookAt({ file_path: file, goal: "describe the image" });
  expect(result.isError).toBeFalsy();
  expect(result.content).toHaveLength(2);
  const imageBlock = result.content[1];
  expect(imageBlock?.type).toBe("image");
  expect((imageBlock as { data: string }).data).toBe(bytes.toString("base64"));
  expect((imageBlock as { mimeType: string }).mimeType).toBe("image/png");
});

test("look_at errors on a missing file", async () => {
  const result = await executeLookAt({
    file_path: join(root, "nope.png"),
    goal: "describe",
  });
  expect(result.isError).toBe(true);
  expect(textOf(result.content[0])).toContain("Cannot read file");
});

test("look_at errors when no path is provided", async () => {
  const result = await executeLookAt({ goal: "describe" });
  expect(result.isError).toBe(true);
});

test("look_at accepts multiple file_paths", async () => {
  const a = join(root, "a.png");
  const b = join(root, "b.jpg");
  writeFileSync(a, "x");
  writeFileSync(b, "y");
  const result = await executeLookAt({ file_paths: [a, b], goal: "compare" });
  expect(result.isError).toBeFalsy();
  expect(result.details?.files).toHaveLength(2);
  expect(result.content).toHaveLength(3);
  expect(result.content.slice(1).every((c) => c.type === "image")).toBe(true);
});

// --- session_list ----------------------------------------------------------

function makeSessions(): readonly MockSessionData[] {
  return [
    {
      id: "ses_1",
      path: "/p/ses_1.jsonl",
      created: new Date("2026-01-01T00:00:00Z"),
      modified: new Date("2026-01-02T00:00:00Z"),
      firstMessage: "Hello world",
      entries: [
        mockMessageEntry("e1", null, "user", "Hello world"),
        mockMessageEntry("e2", "e1", "assistant", "Hi there"),
      ],
    },
    {
      id: "ses_2",
      path: "/p/ses_2.jsonl",
      created: new Date("2026-01-03T00:00:00Z"),
      modified: new Date("2026-01-04T00:00:00Z"),
      firstMessage: "Second session",
      entries: [
        mockMessageEntry("e1", null, "user", "Second session about cookies"),
      ],
    },
  ];
}

test("session_list returns sessions from the mock", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionList({}, deps, "/cwd");
  expect(result.isError).toBeFalsy();
  expect(result.details?.count).toBe(2);
  expect(textOf(result.content[0])).toContain("ses_1");
  expect(textOf(result.content[0])).toContain("ses_2");
});

test("session_list honors the limit param", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionList({ limit: 1 }, deps, "/cwd");
  expect(result.details?.count).toBe(1);
});

test("session_list reports empty when no sessions", async () => {
  const deps = createMockSessionDeps([]);
  const result = await executeSessionList({}, deps, "/cwd");
  expect(textOf(result.content[0])).toContain("No sessions found");
});

// --- session_read ---------------------------------------------------------

test("session_read returns messages from a session", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionRead({ session_id: "ses_1" }, deps, "/cwd");
  expect(result.isError).toBeFalsy();
  expect(result.details?.count).toBe(2);
  expect(textOf(result.content[0])).toContain("user");
  expect(textOf(result.content[0])).toContain("assistant");
});

test("session_read opens by path too", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionRead({ session_id: "/p/ses_2.jsonl" }, deps, "/cwd");
  expect(result.details?.count).toBe(1);
});

test("session_read honors the limit param", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionRead({ session_id: "ses_1", limit: 1 }, deps, "/cwd");
  expect(result.details?.count).toBe(1);
});

test("session_read on a missing session fails gracefully", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionRead({ session_id: "ses_missing" }, deps, "/cwd");
  expect(textOf(result.content[0])).toContain("Session not found");
});

// --- session_search --------------------------------------------------------

test("session_search finds matching content across sessions", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionSearch({ query: "cookies" }, deps, "/cwd");
  expect(result.isError).toBeFalsy();
  expect(result.details?.count).toBe(1);
  expect(textOf(result.content[0])).toContain("ses_2");
});

test("session_search finds matches case-insensitively", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionSearch({ query: "HELLO" }, deps, "/cwd");
  expect(result.details?.count).toBe(1);
});

test("session_search limits to a specific session_id", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionSearch({ query: "Hello", session_id: "ses_2" }, deps, "/cwd");
  expect(result.details?.count).toBe(0);
});

test("session_search reports no matches cleanly", async () => {
  const deps = createMockSessionDeps(makeSessions());
  const result = await executeSessionSearch({ query: "zzzznotfound" }, deps, "/cwd");
  expect(textOf(result.content[0])).toContain("No matches");
});