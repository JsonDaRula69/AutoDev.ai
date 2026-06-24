// @ts-nocheck — bun:test mock types are complex for strict mode
import { test, expect } from "bun:test";
import { validateLlmKey, validateVoyageKey, validateGithubToken } from "../key-validator.js";

function mockFetch(status: number): (url: string, init?: RequestInit) => Promise<Response> {
  return async () => ({ status } as Response);
}

function mockFetchThrowing(error: string): (url: string, init?: RequestInit) => Promise<Response> {
  return async () => { throw new Error(error); };
}

test("validateLlmKey: ollama-cloud returns valid on 200", async () => {
  const result = await validateLlmKey("ollama-cloud", "test-key", { fetchOverride: mockFetch(200) });
  expect(result.valid).toBe(true);
});

test("validateLlmKey: ollama-cloud returns invalid on 401", async () => {
  const result = await validateLlmKey("ollama-cloud", "bad-key", { fetchOverride: mockFetch(401) });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("401");
});

test("validateLlmKey: openai returns valid on 200", async () => {
  const result = await validateLlmKey("openai", "sk-test", { fetchOverride: mockFetch(200) });
  expect(result.valid).toBe(true);
});

test("validateLlmKey: openai returns invalid on 401", async () => {
  const result = await validateLlmKey("openai", "sk-bad", { fetchOverride: mockFetch(401) });
  expect(result.valid).toBe(false);
});

test("validateLlmKey: anthropic returns valid on 200", async () => {
  const result = await validateLlmKey("anthropic", "sk-ant-test", { fetchOverride: mockFetch(200) });
  expect(result.valid).toBe(true);
});

test("validateLlmKey: anthropic returns invalid on 404", async () => {
  const result = await validateLlmKey("anthropic", "sk-ant-bad", { fetchOverride: mockFetch(404) });
  expect(result.valid).toBe(false);
});

test("validateLlmKey: google returns valid on 200", async () => {
  const result = await validateLlmKey("google", "test-key", { fetchOverride: mockFetch(200) });
  expect(result.valid).toBe(true);
});

test("validateLlmKey: google returns invalid on 403", async () => {
  const result = await validateLlmKey("google", "bad-key", { fetchOverride: mockFetch(403) });
  expect(result.valid).toBe(false);
});

test("validateLlmKey: unknown provider returns invalid", async () => {
  const result = await validateLlmKey("unknown-provider", "test-key", { fetchOverride: mockFetch(200) });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("Unknown provider");
});

test("validateLlmKey: network error returns invalid with error message", async () => {
  const result = await validateLlmKey("openai", "sk-test", { fetchOverride: mockFetchThrowing("ECONNREFUSED") });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("ECONNREFUSED");
});

test("validateLlmKey: unexpected status code returns invalid", async () => {
  const result = await validateLlmKey("openai", "sk-test", { fetchOverride: mockFetch(500) });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("500");
});

test("validateVoyageKey: returns valid on 200", async () => {
  const result = await validateVoyageKey("voy-test", { fetchOverride: mockFetch(200) });
  expect(result.valid).toBe(true);
});

test("validateVoyageKey: returns invalid on 401", async () => {
  const result = await validateVoyageKey("voy-bad", { fetchOverride: mockFetch(401) });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("401");
});

test("validateVoyageKey: network error returns invalid", async () => {
  const result = await validateVoyageKey("voy-test", { fetchOverride: mockFetchThrowing("timeout") });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("timeout");
});

test("validateGithubToken: valid token returns valid", () => {
  const result = validateGithubToken("ghp_test", {
    execSyncOverride: () => "Logged in to github.com",
  });
  expect(result.valid).toBe(true);
});

test("validateGithubToken: invalid token returns invalid", () => {
  const result = validateGithubToken("ghp_bad", {
    execSyncOverride: () => { throw Object.assign(new Error("failed"), { stderr: "HTTP 401 - token is invalid" }); },
  });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("401");
});

test("validateGithubToken: network error returns invalid with message", () => {
  const result = validateGithubToken("ghp_test", {
    execSyncOverride: () => { throw new Error("connection refused"); },
  });
  expect(result.valid).toBe(false);
  expect(result.error).toContain("connection refused");
});