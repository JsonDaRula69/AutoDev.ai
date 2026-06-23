/**
 * T5 intent-gate tests.
 *
 * Verifies the pure analyzeOnboardingIntent() and analyzeIssueIntent()
 * functions classify text correctly and return structured results.
 */
import { test, expect } from "bun:test";
import {
  analyzeOnboardingIntent,
  analyzeIssueIntent,
} from "../extensions/autodev/intent-gate/index.js";

// --- analyzeIssueIntent -----------------------------------------------------

test("classifies a crash report as bug", () => {
  const r = analyzeIssueIntent("The app crashes with a nil pointer exception on startup");
  expect(r.intent).toBe("bug");
  expect(r.confidence).toBeGreaterThan(0);
  expect(r.suggestedCynefin).toBe("simple");
});

test("classifies a feature request as feature", () => {
  const r = analyzeIssueIntent("Add support for exporting to PDF");
  expect(r.intent).toBe("feature");
});

test("classifies a refactor request as refactor", () => {
  const r = analyzeIssueIntent("Refactor the auth module to simplify the session logic");
  expect(r.intent).toBe("refactor");
});

test("classifies a how-do-I as question", () => {
  const r = analyzeIssueIntent("How do I configure the retry policy?");
  expect(r.intent).toBe("question");
});

test("classifies a dependency bump as chore", () => {
  const r = analyzeIssueIntent("Bump the bun dependency to latest");
  expect(r.intent).toBe("chore");
});

test("returns ambiguous for text with no signals", () => {
  const r = analyzeIssueIntent("Something about the project");
  expect(r.intent).toBe("ambiguous");
  expect(r.confidence).toBe(0);
});

test("flags production-down as chaotic", () => {
  const r = analyzeIssueIntent("Production is down — this is a full outage");
  expect(r.suggestedCynefin).toBe("chaotic");
});

test("flags architecture exploration as complex", () => {
  const r = analyzeIssueIntent("Explore the architecture for a design spike");
  expect(r.suggestedCynefin).toBe("complex");
});

test("probing questions are non-empty for every intent", () => {
  const intents = ["bug", "feature", "refactor", "question", "chore", "ambiguous"] as const;
  for (const intent of intents) {
    const text = intent === "bug" ? "crash" : intent === "feature" ? "add" : intent === "refactor" ? "refactor" : intent === "question" ? "how do i" : intent === "chore" ? "bump" : "something";
    const r = analyzeIssueIntent(text);
    expect(r.probingQuestions.length).toBeGreaterThan(0);
  }
});

test("signals include the matched token", () => {
  const r = analyzeIssueIntent("The app crashes on startup");
  expect(r.signals.some((s) => s.token === "crash")).toBe(true);
});

// --- analyzeOnboardingIntent ------------------------------------------------

test("surfaces scale hidden intention", () => {
  const r = analyzeOnboardingIntent("We are building a platform that needs to scale to millions of users");
  expect(r.hiddenIntentions.some((h) => h.theme === "scale")).toBe(true);
});

test("surfaces time-pressure hidden intention", () => {
  const r = analyzeOnboardingIntent("We need this fast, asap, before the deadline");
  expect(r.hiddenIntentions.some((h) => h.theme === "time-pressure")).toBe(true);
});

test("surfaces hidden-complexity when 'just' is used", () => {
  const r = analyzeOnboardingIntent("It's just a simple CRUD app");
  expect(r.hiddenIntentions.some((h) => h.theme === "hidden-complexity")).toBe(true);
});

test("detects critical stake from medical/compliance tokens", () => {
  const r = analyzeOnboardingIntent("This is a medical compliance system");
  expect(r.stake).toBe("critical");
});

test("detects technical depth from API/database/transaction tokens", () => {
  const r = analyzeOnboardingIntent("We need an API with a database schema and transactional integrity");
  expect(r.technicalDepth).toBe("technical");
});

test("detects non-technical depth from plain-language text", () => {
  const r = analyzeOnboardingIntent("We want to help people manage their tasks better");
  expect(r.technicalDepth).toBe("non-technical");
});

test("probing questions are non-empty", () => {
  const r = analyzeOnboardingIntent("A new product for small businesses");
  expect(r.probingQuestions.length).toBeGreaterThan(0);
});

test("returns a readable analysis object structure", () => {
  const r = analyzeOnboardingIntent("test");
  expect(typeof r.text).toBe("string");
  expect(Array.isArray(r.hiddenIntentions)).toBe(true);
  expect(Array.isArray(r.probingQuestions)).toBe(true);
  expect(["low", "medium", "high", "critical", "unknown"]).toContain(r.stake);
  expect(["non-technical", "mixed", "technical"]).toContain(r.technicalDepth);
});