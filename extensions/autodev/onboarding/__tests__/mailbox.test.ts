import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  startOnboardingTeam,
  endOnboardingTeam,
  getActiveOnboardingTeamId,
  postObservation,
  executeOnboardingCheckMailbox,
  _resetOnboardingMailbox,
} from "../mailbox.js";
import * as store from "../../team-mode/store.js";

beforeEach(() => {
  store._resetStore();
  _resetOnboardingMailbox();
});

afterEach(() => {
  endOnboardingTeam();
  store._resetStore();
  _resetOnboardingMailbox();
});

test("startOnboardingTeam creates a team with conseil, metis, momus", () => {
  const runId = startOnboardingTeam();
  expect(runId).toBeDefined();
  const team = store.getTeam(runId);
  expect(team).toBeDefined();
  expect(team!.members.has("conseil")).toBe(true);
  expect(team!.members.has("metis")).toBe(true);
  expect(team!.members.has("momus")).toBe(true);
  expect(team!.trigger).toBe("onboarding");
});

test("startOnboardingTeam is idempotent — returns same runId on second call", () => {
  const id1 = startOnboardingTeam();
  const id2 = startOnboardingTeam();
  expect(id1).toBe(id2);
});

test("getActiveOnboardingTeamId returns null before start, runId after", () => {
  expect(getActiveOnboardingTeamId()).toBeNull();
  const runId = startOnboardingTeam();
  expect(getActiveOnboardingTeamId()).toBe(runId);
});

test("endOnboardingTeam clears the active team", () => {
  startOnboardingTeam();
  endOnboardingTeam();
  expect(getActiveOnboardingTeamId()).toBeNull();
});

test("postObservation delivers a message to the mailbox", () => {
  startOnboardingTeam();
  const result = postObservation("metis", "flag", "User said 'trading bot' but could mean algo trading or copy trading — clarify");
  expect(result.ok).toBe(true);
  const status = store.teamStatus(getActiveOnboardingTeamId()!);
  expect("error" in status).toBe(false);
  if (!("error" in status)) {
    expect(status.messageCount).toBe(1);
  }
});

test("postObservation without active team returns error", () => {
  const result = postObservation("conseil", "note", "should check reference docs");
  expect(result.ok).toBe(false);
  expect(result.error).toBeDefined();
});

test("executeOnboardingCheckMailbox returns messages when team is active", () => {
  startOnboardingTeam();
  postObservation("momus", "flag", "HM is assuming the user wants a web app — unverified");
  postObservation("conseil", "note", "Check docs-corpus for postgres best practices");

  const result = executeOnboardingCheckMailbox();
  const details = result.details as { messages: unknown[]; active: boolean };
  expect(details.active).toBe(true);
  expect(details.messages.length).toBe(2);
  const text = result.content[0];
  expect(text?.type === "text" ? text.text : "").toContain("momus");
  expect(text?.type === "text" ? text.text : "").toContain("conseil");
});

test("executeOnboardingCheckMailbox returns empty when no messages", () => {
  startOnboardingTeam();
  const result = executeOnboardingCheckMailbox();
  const details = result.details as { messages: unknown[]; active: boolean };
  expect(details.active).toBe(true);
  expect(details.messages.length).toBe(0);
  const content = result.content[0];
  expect(content?.type === "text" ? content.text : "").toContain("empty");
});

test("executeOnboardingCheckMailbox returns inactive when no team", () => {
  const result = executeOnboardingCheckMailbox();
  const details = result.details as { messages: unknown[]; active: boolean };
  expect(details.active).toBe(false);
  expect(details.messages.length).toBe(0);
});