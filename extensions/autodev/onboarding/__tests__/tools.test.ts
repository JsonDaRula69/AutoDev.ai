// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * TDD tests for onboarding tools (Step 1 of hm-wiring-v3).
 *
 * Tests (Given/When/Then):
 *  - onboarding_progress returns last 8 assistant messages (truncated 500 chars) + coverage floor check
 *  - onboarding_dispatch_hint returns topics (noun/technology extraction, not keyword lists) + self-assessment prompt
 *  - onboarding_finalize checks identity + constraints discussed, returns readiness
 *  - setConversationLog allows injecting log from onboard.ts
 */
import { test, expect, describe, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  role: string,
  content: string,
  overrides: Partial<{ timestamp: string }> = {},
) {
  return {
    role,
    content,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
  };
}

function makeAssistantEntry(content: string) {
  return makeEntry("assistant", content);
}

function makeUserEntry(content: string) {
  return makeEntry("user", content);
}

// ---------------------------------------------------------------------------
// onboarding_progress
// ---------------------------------------------------------------------------

describe("onboarding_progress", () => {
  beforeEach(async () => {
    // Reset conversation log before each test
    const { setConversationLog } = await import("../index.js");
    setConversationLog([]);
  });

  test("returns last 8 assistant messages truncated to 500 chars each", async () => {
    const { executeOnboardingProgress, setConversationLog } = await import("../index.js");

    // Create 12 entries: 6 user + 6 assistant
    const entries = [
      makeUserEntry("Hello"),
      makeAssistantEntry("A".repeat(600)), // will be truncated
      makeUserEntry("Tell me about your project"),
      makeAssistantEntry("B".repeat(100)),
      makeUserEntry("What tech stack?"),
      makeAssistantEntry("C".repeat(100)),
      makeUserEntry("Any constraints?"),
      makeAssistantEntry("D".repeat(100)),
      makeUserEntry("Who is the audience?"),
      makeAssistantEntry("E".repeat(100)),
      makeUserEntry("Deployment?"),
      makeAssistantEntry("F".repeat(100)),
    ];
    setConversationLog(entries);

    const result = await executeOnboardingProgress({});
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);

    // Should have 6 assistant messages (only 6 in the log)
    expect(parsed.recentMessages).toHaveLength(6);

    // First assistant message should be truncated to 500 chars
    expect(parsed.recentMessages[0].content.length).toBe(500);
    expect(parsed.recentMessages[0].truncated).toBe(true);

    // Second assistant message (100 chars) should NOT be truncated
    expect(parsed.recentMessages[1].content.length).toBe(100);
    expect(parsed.recentMessages[1].truncated).toBe(false);
  });

  test("returns at most 8 assistant messages even when more exist", async () => {
    const { executeOnboardingProgress, setConversationLog } = await import("../index.js");

    const entries = [];
    for (let i = 0; i < 20; i++) {
      entries.push(makeUserEntry(`User message ${i}`));
      entries.push(makeAssistantEntry(`Assistant message ${i}`));
    }
    setConversationLog(entries);

    const result = await executeOnboardingProgress({});
    const parsed = JSON.parse(result.content[0].text);

    // Should have at most 8 assistant messages
    expect(parsed.recentMessages.length).toBeLessThanOrEqual(8);
  });

  test("includes coverage heuristic as floor check", async () => {
    const { executeOnboardingProgress, setConversationLog } = await import("../index.js");

    // Include identity keywords (e.g., "system", "purpose") and constraint keywords
    const entries = [
      makeUserEntry("What does your system do?"),
      makeAssistantEntry("This system is a prediction market platform. Its purpose is to aggregate forecasts."),
      makeUserEntry("Any constraints?"),
      makeAssistantEntry("We must not deploy without review. Security is critical."),
    ];
    setConversationLog(entries);

    const result = await executeOnboardingProgress({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.coverage).toBeDefined();
    expect(parsed.coverage.covered).toBeDefined();
    expect(Array.isArray(parsed.coverage.covered)).toBe(true);
    expect(parsed.coverage.gaps).toBeDefined();
    expect(Array.isArray(parsed.coverage.gaps)).toBe(true);
  });

  test("returns empty recent messages when log is empty", async () => {
    const { executeOnboardingProgress } = await import("../index.js");

    const result = await executeOnboardingProgress({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.recentMessages).toEqual([]);
    expect(parsed.coverage.covered).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// onboarding_dispatch_hint
// ---------------------------------------------------------------------------

describe("onboarding_dispatch_hint", () => {
  beforeEach(async () => {
    const { setConversationLog } = await import("../index.js");
    setConversationLog([]);
  });

  test("returns topics extracted from recent messages (not keyword lists)", async () => {
    const { executeOnboardingDispatchHint, setConversationLog } = await import("../index.js");

    const entries = [
      makeUserEntry("We are building a React frontend with a PostgreSQL database deployed on AWS ECS."),
      makeAssistantEntry("Great, so you are using React for the UI, PostgreSQL for persistence, and AWS ECS for container orchestration. Let me explore the codebase to understand the current setup."),
      makeUserEntry("We also use Redis for caching and Stripe for payments."),
      makeAssistantEntry("Redis for caching and Stripe for payments — noted. I will dispatch Conseil to examine the Redis and Stripe integration patterns."),
    ];
    setConversationLog(entries);

    const result = await executeOnboardingDispatchHint({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.topics).toBeDefined();
    expect(Array.isArray(parsed.topics)).toBe(true);
    // Topics should be extracted terms, not keyword lists
    expect(parsed.topics.length).toBeGreaterThan(0);

    // Should contain technology-like terms extracted from conversation
    const topicText = parsed.topics.join(" ").toLowerCase();
    expect(topicText).toContain("react");
    expect(topicText).toContain("postgresql");
    expect(topicText).toContain("redis");
    expect(topicText).toContain("stripe");
  });

  test("includes self-assessment prompt for HM", async () => {
    const { executeOnboardingDispatchHint, setConversationLog } = await import("../index.js");

    setConversationLog([
      makeUserEntry("We use Python and FastAPI for the backend."),
      makeAssistantEntry("Python with FastAPI — I will look into the API structure."),
    ]);

    const result = await executeOnboardingDispatchHint({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.prompt).toBeDefined();
    expect(typeof parsed.prompt).toBe("string");
    // The prompt should ask HM to self-assess what research is implied
    expect(parsed.prompt.length).toBeGreaterThan(20);
  });

  test("returns empty topics when log is empty", async () => {
    const { executeOnboardingDispatchHint } = await import("../index.js");

    const result = await executeOnboardingDispatchHint({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.topics).toEqual([]);
    expect(parsed.prompt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// onboarding_finalize
// ---------------------------------------------------------------------------

describe("onboarding_finalize", () => {
  beforeEach(async () => {
    const { setConversationLog } = await import("../index.js");
    setConversationLog([]);
  });

  test("returns not ready when identity not discussed", async () => {
    const { executeOnboardingFinalize, setConversationLog } = await import("../index.js");

    // Only architecture and knowledge, no identity or constraints
    setConversationLog([
      makeUserEntry("We use PostgreSQL and React."),
      makeAssistantEntry("PostgreSQL and React — noted. Let me check the codebase."),
      makeUserEntry("The docs are in the README."),
      makeAssistantEntry("I will review the documentation."),
    ]);

    const result = await executeOnboardingFinalize({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.ready).toBe(false);
    expect(parsed.missing).toBeDefined();
    expect(parsed.missing).toContain("identity");
  });

  test("returns not ready when constraints not discussed", async () => {
    const { executeOnboardingFinalize, setConversationLog } = await import("../index.js");

    // Identity discussed but not constraints
    setConversationLog([
      makeUserEntry("This system is a prediction market platform. Its purpose is to collect forecasts."),
      makeAssistantEntry("A prediction market platform — understood. Let me explore the codebase."),
    ]);

    const result = await executeOnboardingFinalize({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.ready).toBe(false);
    expect(parsed.missing).toContain("constraints");
  });

  test("returns ready when identity and constraints discussed", async () => {
    const { executeOnboardingFinalize, setConversationLog } = await import("../index.js");

    setConversationLog([
      makeUserEntry("This system is a prediction market platform. Its purpose is to aggregate forecasts."),
      makeAssistantEntry("A prediction market platform — understood."),
      makeUserEntry("We must not deploy without review. Security is critical."),
      makeAssistantEntry("Security-critical and review-gated deployment — noted."),
    ]);

    const result = await executeOnboardingFinalize({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.ready).toBe(true);
    expect(parsed.missing).toEqual([]);
  });

  test("returns ready with all phases covered", async () => {
    const { executeOnboardingFinalize, setConversationLog } = await import("../index.js");

    // Cover all 6 phases
    setConversationLog([
      makeUserEntry("I am a senior engineer deploying to production."),
      makeAssistantEntry("Senior engineer, production deployment — noted."),
      makeUserEntry("This system is a prediction market platform."),
      makeAssistantEntry("Prediction market platform — understood."),
      makeUserEntry("We use PostgreSQL, React, and Docker."),
      makeAssistantEntry("PostgreSQL, React, Docker — I will explore the codebase."),
      makeUserEntry("We must not deploy without review."),
      makeAssistantEntry("Review-gated deployment — noted."),
      makeUserEntry("The docs are in the README and ADRs."),
      makeAssistantEntry("I will review the documentation."),
      makeUserEntry("That covers everything. I confirm the summary is correct."),
      makeAssistantEntry("Great, let me finalize the onboarding."),
    ]);

    const result = await executeOnboardingFinalize({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.ready).toBe(true);
    expect(parsed.missing).toEqual([]);
    expect(parsed.coverage).toBeDefined();
    expect(parsed.coverage.covered.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// setConversationLog
// ---------------------------------------------------------------------------

describe("setConversationLog", () => {
  test("allows injecting conversation log from onboard.ts", async () => {
    const { setConversationLog, executeOnboardingProgress } = await import("../index.js");

    const entries = [
      makeUserEntry("Test"),
      makeAssistantEntry("Response"),
    ];
    setConversationLog(entries);

    const result = await executeOnboardingProgress({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.recentMessages).toHaveLength(1);
    expect(parsed.recentMessages[0].content).toBe("Response");
  });

  test("replaces previous log when called again", async () => {
    const { setConversationLog, executeOnboardingProgress } = await import("../index.js");

    setConversationLog([
      makeUserEntry("Old"),
      makeAssistantEntry("Old response"),
    ]);

    setConversationLog([
      makeUserEntry("New"),
      makeAssistantEntry("New response"),
    ]);

    const result = await executeOnboardingProgress({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.recentMessages).toHaveLength(1);
    expect(parsed.recentMessages[0].content).toBe("New response");
  });
});
