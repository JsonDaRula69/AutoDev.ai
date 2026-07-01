import { test, expect, mock } from "bun:test";
import { DiscordGateway } from "../gateway.js";

test("DiscordGateway: onMessage registers a handler", () => {
  const gw = new DiscordGateway("test-token");
  let called = false;
  gw.onMessage(() => { called = true; });
  expect(called).toBe(false);
});

test("DiscordGateway: disconnect cleans up without throwing", () => {
  const gw = new DiscordGateway("test-token");
  expect(() => gw.disconnect()).not.toThrow();
});

test("parsePrUrl: valid URL extracts repo and number", async () => {
  const { parseSlashCommand } = await import("../slash.js");
  const msg = {
    id: "1",
    channel_id: "ch-1",
    content: "/autodev hold https://github.com/owner/repo/pull/42",
    author: { id: "u1", username: "user", bot: false },
    timestamp: new Date().toISOString(),
  } as any;
  const result = parseSlashCommand(msg);
  expect(result.matched).toBe(true);
  expect(result.command).toBe("/autodev hold");
  expect(result.args).toBe("https://github.com/owner/repo/pull/42");
});

test("parseSlashCommand: /autodev proceed matches", async () => {
  const { parseSlashCommand } = await import("../slash.js");
  const msg = {
    id: "1",
    channel_id: "ch-1",
    content: "/autodev proceed https://github.com/owner/repo/pull/42",
    author: { id: "u1", username: "user", bot: false },
    timestamp: new Date().toISOString(),
  } as any;
  const result = parseSlashCommand(msg);
  expect(result.matched).toBe(true);
  expect(result.command).toBe("/autodev proceed");
});

test("handleSlashCommand: /autodev hold with invalid URL returns error", async () => {
  const { handleSlashCommand, parseSlashCommand } = await import("../slash.js");
  const msg = {
    id: "1",
    channel_id: "ch-1",
    content: "/autodev hold not-a-url",
    author: { id: "u1", username: "user", bot: false },
    timestamp: new Date().toISOString(),
  } as any;
  const parsed = parseSlashCommand(msg);
  const result = await handleSlashCommand(parsed);
  expect(result).toContain("Error");
  expect(result).toContain("Invalid PR URL");
});

test("handleSlashCommand: /autodev hold with no args shows usage", async () => {
  const { handleSlashCommand, parseSlashCommand } = await import("../slash.js");
  const msg = {
    id: "1",
    channel_id: "ch-1",
    content: "/autodev hold",
    author: { id: "u1", username: "user", bot: false },
    timestamp: new Date().toISOString(),
  } as any;
  const parsed = parseSlashCommand(msg);
  const result = await handleSlashCommand(parsed);
  expect(result).toContain("Usage");
  expect(result).toContain("/autodev hold <pr-url>");
});

test("handleSlashCommand: /autodev task with no args shows usage", async () => {
  const { handleSlashCommand, parseSlashCommand } = await import("../slash.js");
  const msg = {
    id: "1",
    channel_id: "ch-1",
    content: "/autodev task",
    author: { id: "u1", username: "user", bot: false },
    timestamp: new Date().toISOString(),
  } as any;
  const parsed = parseSlashCommand(msg);
  const result = await handleSlashCommand(parsed);
  expect(result).toContain("Usage");
  expect(result).toContain("/autodev task <title>");
});

test("handleSlashCommand: /autodev proceed with no args shows usage", async () => {
  const { handleSlashCommand, parseSlashCommand } = await import("../slash.js");
  const msg = {
    id: "1",
    channel_id: "ch-1",
    content: "/autodev proceed",
    author: { id: "u1", username: "user", bot: false },
    timestamp: new Date().toISOString(),
  } as any;
  const parsed = parseSlashCommand(msg);
  const result = await handleSlashCommand(parsed);
  expect(result).toContain("Usage");
  expect(result).toContain("/autodev proceed <pr-url>");
});

test("handleSlashCommand: /autodev status returns status info", async () => {
  const { handleSlashCommand, parseSlashCommand } = await import("../slash.js");
  const msg = {
    id: "1",
    channel_id: "ch-1",
    content: "/autodev status",
    author: { id: "u1", username: "user", bot: false },
    timestamp: new Date().toISOString(),
  } as any;
  const parsed = parseSlashCommand(msg);
  const result = await handleSlashCommand(parsed);
  expect(result).toContain("AutoDev Status");
});