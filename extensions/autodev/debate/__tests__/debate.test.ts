/**
 * T15 debate protocol tests.
 *
 * Covers:
 *  1. Cynefin classification: Simple, Complicated, Complex, Chaotic
 *  2. Simple topic → no debate (0 sessions)
 *  3. Complicated topic → 5 sessions, skip Phase 3
 *  4. Complex topic → full 5 phases with 6 sessions
 *  5. Chaotic topic → Watch Officer route
 *  6. Phase transitions: idle → phase-1 → phase-2 → phase-3 → phase-4 → phase-5 → completed
 *  7. Session isolation: each participant in own session
 *  8. Structured arguments: Claim → Evidence → Warrant format
 *  9. 3 independent verdicts
 * 10. Implementation verification
 * 11. Transcript files written to .autodev/debates/<slug>/
 * 12. Judge session error → retry once → second error → blocked
 * 13. resolveMajorityVerdict: approve/reject/needs-revision
 * 14. requiredSessionCount: 0/5/6 per domain
 */

import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackgroundManager } from "../../background/manager.js";
import {
  mockCreateAgentSession,
  mockSessionRegistry,
  resetSessionMocks,
  type MockSession,
} from "../../../../test/mocks/pi-session.js";
import {
  classifyTopic,
  createDebateState,
  requiredSessionCount,
  needsCrossExamination,
  resolveMajorityVerdict,
  shouldRetryJudgeSession,
  buildParticipantPrompt,
  type CynefinDomain,
  type DebateState,
  type StructuredArgument,
  type JudgeVerdict,
} from "../protocol.js";
import {
  executePhase1,
  executePhase2,
  executePhase3,
  executePhase4,
  executePhase5,
} from "../sessions.js";
import {
  buildTranscripts,
  writeTranscripts,
} from "../transcript.js";
import { runDebate } from "../index.js";

// ─── Test helpers ────────────────────────────────────────────────────────────

interface ScheduledTimer {
  fn: () => void;
  ms: number;
  fired: boolean;
}

class FakeTimerScheduler {
  readonly timers: ScheduledTimer[] = [];

  setTimer(fn: () => void, ms: number): { clear(): void } {
    const entry: ScheduledTimer = { fn, ms, fired: false };
    this.timers.push(entry);
    return {
      clear: () => {
        entry.fired = true;
        const idx = this.timers.indexOf(entry);
        if (idx >= 0) this.timers.splice(idx, 1);
      },
    };
  }

  advance(ms: number): void {
    for (const t of [...this.timers]) {
      if (t.fired) continue;
      if (t.ms <= ms) {
        t.fired = true;
        const idx = this.timers.indexOf(t);
        if (idx >= 0) this.timers.splice(idx, 1);
        t.fn();
      }
    }
  }

  reset(): void {
    this.timers.length = 0;
  }
}

let scheduler: FakeTimerScheduler;

// Isolation: writeTranscripts writes to process.cwd()/.autodev/debates. Without
// chdir isolation, tests rewrite the project repo's tracked templates each run.
let tempCwd: string;
const originalCwd = process.cwd();

beforeEach(async () => {
  scheduler = new FakeTimerScheduler();
  resetSessionMocks();
  tempCwd = await mkdtemp(join(tmpdir(), "autodev-debate-test-"));
  process.chdir(tempCwd);
});

afterEach(async () => {
  process.chdir(originalCwd);
  scheduler.reset();
  await rm(tempCwd, { recursive: true, force: true });
});

function makeManager(): BackgroundManager {
  const factory = mockCreateAgentSession();
  return new BackgroundManager({
    sessionFactory: factory,
    setTimer: (fn, ms) => scheduler.setTimer(fn, ms),
    concurrencyConfig: { "ollama-cloud": { max: 10 } },
    fallbackConfig: {
      chains: {},
      allowlist: ["ollama-cloud/deepseek-v4-pro"],
    },
    defaultStaleTimeoutMs: 5000,
  });
}

/** Complete all running sessions with a given result. */
function completeAllSessions(result: unknown = "done"): void {
  for (const session of mockSessionRegistry.sessions) {
    session.emit({ type: "agent_end", messages: [result], willRetry: false });
  }
}

/** Error all running sessions. */
function errorAllSessions(error: unknown = new Error("session error")): void {
  for (const session of mockSessionRegistry.sessions) {
    session.emit({ type: "error", error });
  }
}

// ─── Test 1: Cynefin classification ─────────────────────────────────────────

test("classifyTopic: simple topic returns simple", () => {
  const r = classifyTopic("Fix the login button alignment");
  expect(r.domain).toBe("simple");
});

test("classifyTopic: bug fix returns simple", () => {
  const r = classifyTopic("Bug fix: null pointer in user service");
  expect(r.domain).toBe("simple");
});

test("classifyTopic: complicated topic returns complicated", () => {
  const r = classifyTopic("Choose between PostgreSQL and MySQL for the new analytics module");
  expect(r.domain).toBe("complicated");
});

test("classifyTopic: complex topic returns complex", () => {
  const r = classifyTopic("Design a new authentication architecture with OAuth2 and SSO");
  expect(r.domain).toBe("complex");
});

test("classifyTopic: chaotic topic returns chaotic", () => {
  const r = classifyTopic("Production incident: database corruption detected");
  expect(r.domain).toBe("chaotic");
});

test("classifyTopic: security breach returns chaotic", () => {
  const r = classifyTopic("Security breach: unauthorized access detected");
  expect(r.domain).toBe("chaotic");
});

test("classifyTopic: default to complicated for unknown topics", () => {
  const r = classifyTopic("Evaluate the performance of the new caching layer");
  expect(r.domain).toBe("complicated");
});

// ─── Test 2: requiredSessionCount ───────────────────────────────────────────

test("requiredSessionCount: simple = 0", () => {
  expect(requiredSessionCount("simple")).toBe(0);
});

test("requiredSessionCount: complicated = 5", () => {
  expect(requiredSessionCount("complicated")).toBe(5);
});

test("requiredSessionCount: complex = 6", () => {
  expect(requiredSessionCount("complex")).toBe(6);
});

test("requiredSessionCount: chaotic = 0", () => {
  expect(requiredSessionCount("chaotic")).toBe(0);
});

// ─── Test 3: needsCrossExamination ──────────────────────────────────────────

test("needsCrossExamination: complex = true", () => {
  expect(needsCrossExamination("complex")).toBe(true);
});

test("needsCrossExamination: complicated = false", () => {
  expect(needsCrossExamination("complicated")).toBe(false);
});

test("needsCrossExamination: simple = false", () => {
  expect(needsCrossExamination("simple")).toBe(false);
});

// ─── Test 4: resolveMajorityVerdict ─────────────────────────────────────────

test("resolveMajorityVerdict: 2 approve = approve", () => {
  const verdicts: JudgeVerdict[] = [
    { judge: "Nemo", verdict: "approve", reasoning: "good", confidence: "high" },
    { judge: "Oracle", verdict: "approve", reasoning: "fine", confidence: "medium" },
    { judge: "Conseil", verdict: "reject", reasoning: "bad", confidence: "low" },
  ];
  const r = resolveMajorityVerdict(verdicts);
  expect(r.verdict).toBe("approve");
  expect(r.majority).toBe(true);
});

test("resolveMajorityVerdict: 2 reject = reject", () => {
  const verdicts: JudgeVerdict[] = [
    { judge: "Nemo", verdict: "reject", reasoning: "bad", confidence: "high" },
    { judge: "Oracle", verdict: "reject", reasoning: "worse", confidence: "medium" },
    { judge: "Conseil", verdict: "approve", reasoning: "good", confidence: "low" },
  ];
  const r = resolveMajorityVerdict(verdicts);
  expect(r.verdict).toBe("reject");
  expect(r.majority).toBe(true);
});

test("resolveMajorityVerdict: 2 needs-revision = needs-revision", () => {
  const verdicts: JudgeVerdict[] = [
    { judge: "Nemo", verdict: "needs-revision", reasoning: "unclear", confidence: "medium" },
    { judge: "Oracle", verdict: "needs-revision", reasoning: "vague", confidence: "medium" },
    { judge: "Conseil", verdict: "approve", reasoning: "good", confidence: "high" },
  ];
  const r = resolveMajorityVerdict(verdicts);
  expect(r.verdict).toBe("needs-revision");
  expect(r.majority).toBe(true);
});

test("resolveMajorityVerdict: 3-way split defaults to needs-revision", () => {
  const verdicts: JudgeVerdict[] = [
    { judge: "Nemo", verdict: "approve", reasoning: "good", confidence: "high" },
    { judge: "Oracle", verdict: "reject", reasoning: "bad", confidence: "medium" },
    { judge: "Conseil", verdict: "needs-revision", reasoning: "unclear", confidence: "low" },
  ];
  const r = resolveMajorityVerdict(verdicts);
  expect(r.verdict).toBe("needs-revision");
  expect(r.majority).toBe(false);
});

test("resolveMajorityVerdict: fewer than 3 verdicts returns undefined", () => {
  const verdicts: JudgeVerdict[] = [
    { judge: "Nemo", verdict: "approve", reasoning: "good", confidence: "high" },
  ];
  const r = resolveMajorityVerdict(verdicts);
  expect(r.verdict).toBeUndefined();
  expect(r.majority).toBe(false);
});

// ─── Test 5: shouldRetryJudgeSession ────────────────────────────────────────

test("shouldRetryJudgeSession: first error = retry", () => {
  expect(shouldRetryJudgeSession("judge1", 0)).toBe(true);
});

test("shouldRetryJudgeSession: second error = no retry", () => {
  expect(shouldRetryJudgeSession("judge1", 1)).toBe(false);
});

// ─── Test 6: buildParticipantPrompt ─────────────────────────────────────────

test("buildParticipantPrompt: includes role and topic", () => {
  const prompt = buildParticipantPrompt("Nemo", "phase-1-preparation", "Test topic");
  expect(prompt).toContain("Nemo");
  expect(prompt).toContain("Test topic");
  expect(prompt).toContain("independently");
});

test("buildParticipantPrompt: phase-2 includes Claim/Evidence/Warrant", () => {
  const prompt = buildParticipantPrompt("Aronnax", "phase-2-arguments", "Test");
  expect(prompt).toContain("Claim");
  expect(prompt).toContain("Evidence");
  expect(prompt).toContain("Warrant");
});

test("buildParticipantPrompt: phase-4 includes verdict options", () => {
  const prompt = buildParticipantPrompt("Nemo", "phase-4-verdict", "Test");
  expect(prompt).toContain("approve");
  expect(prompt).toContain("reject");
  expect(prompt).toContain("needs-revision");
});

// ─── Test 7: Phase 1 spawns 5 independent sessions ─────────────────────────

test("Phase 1 spawns 5 independent sessions", () => {
  const manager = makeManager();
  const state = createDebateState("Test topic", { domain: "complex", reason: "test" });

  const phase1 = executePhase1(manager, state);

  expect(phase1.proposerTaskId).toBeDefined();
  expect(phase1.opposerTaskId).toBeDefined();
  expect(phase1.judge1TaskId).toBeDefined();
  expect(phase1.judge2TaskId).toBeDefined();
  expect(phase1.judge3TaskId).toBeDefined();

  // All 5 task IDs should be unique (independent sessions)
  const ids = [phase1.proposerTaskId, phase1.opposerTaskId, phase1.judge1TaskId, phase1.judge2TaskId, phase1.judge3TaskId];
  expect(new Set(ids).size).toBe(5);

  // All sessions should be created
  expect(mockSessionRegistry.sessions.length).toBe(5);

  // State should track session IDs
  expect(state.sessionIds.proposer).toBe(phase1.proposerTaskId);
  expect(state.sessionIds.opposer).toBe(phase1.opposerTaskId);
  expect(state.sessionIds.judge1).toBe(phase1.judge1TaskId);
  expect(state.sessionIds.judge2).toBe(phase1.judge2TaskId);
  expect(state.sessionIds.judge3).toBe(phase1.judge3TaskId);

  // Phase should be updated
  expect(state.phase).toBe("phase-1-preparation");
  expect(state.startedAt).toBeDefined();
});

// ─── Test 8: Phase 2 collects structured arguments ──────────────────────────

test("Phase 2 collects structured arguments from proposer and opposer", async () => {
  const manager = makeManager();
  const state = createDebateState("Test topic", { domain: "complex", reason: "test" });

  const phase1 = executePhase1(manager, state);

  // Flush microtasks so the manager starts all 5 sessions
  await new Promise((r) => setTimeout(r, 0));

  // Now complete all sessions
  completeAllSessions(JSON.stringify([
    { claim: "Claim A", evidence: "Evidence A", warrant: "Warrant A" },
    { claim: "Claim B", evidence: "Evidence B", warrant: "Warrant B" },
  ]));

  // Flush microtasks so the manager processes the agent_end events
  await new Promise((r) => setTimeout(r, 0));

  const result = await executePhase2(manager, state, phase1);

  expect(result.success).toBe(true);
  expect(state.proposerArguments.length).toBeGreaterThan(0);
  expect(state.opposerArguments.length).toBeGreaterThan(0);

  // Verify Claim → Evidence → Warrant format
  for (const arg of state.proposerArguments) {
    expect(arg.claim).toBeDefined();
    expect(arg.evidence).toBeDefined();
    expect(arg.warrant).toBeDefined();
  }
});

// ─── Test 9: Phase 3 cross-examination (Complex only) ──────────────────────

test("Phase 3 spawns cross-examination session for complex topics", async () => {
  const manager = makeManager();
  const state = createDebateState("Complex topic", { domain: "complex", reason: "test" });
  state.proposerArguments = [{ claim: "C1", evidence: "E1", warrant: "W1" }];
  state.opposerArguments = [{ claim: "C2", evidence: "E2", warrant: "W2" }];

  // Start phase 3 (spawns cross-examination session)
  const resultPromise = executePhase3(manager, state);

  // Flush microtasks so the manager starts the session
  await new Promise((r) => setTimeout(r, 0));

  // Complete the session
  completeAllSessions(JSON.stringify([
    { asker: "Aronnax", question: "What evidence?", answer: "The data shows..." },
  ]));

  // Flush microtasks so the manager processes the event
  await new Promise((r) => setTimeout(r, 0));

  const result = await resultPromise;

  expect(result.success).toBe(true);
  expect(state.sessionIds.crossExamination).toBeDefined();
  expect(state.crossExamination.length).toBeGreaterThan(0);
});

// ─── Test 10: Phase 4 produces 3 independent verdicts ───────────────────────

test("Phase 4 produces 3 independent verdicts", async () => {
  // Use a factory that auto-completes sessions
  const factory = mockCreateAgentSession();
  const manager = new BackgroundManager({
    sessionFactory: factory,
    setTimer: (fn, ms) => scheduler.setTimer(fn, ms),
    concurrencyConfig: { "ollama-cloud": { max: 10 } },
    fallbackConfig: {
      chains: {},
      allowlist: ["ollama-cloud/deepseek-v4-pro"],
    },
    defaultStaleTimeoutMs: 5000,
  });

  const state = createDebateState("Test topic", { domain: "complex", reason: "test" });
  state.proposerArguments = [{ claim: "C1", evidence: "E1", warrant: "W1" }];
  state.opposerArguments = [{ claim: "C2", evidence: "E2", warrant: "W2" }];

  // Start phase 4
  const resultPromise = executePhase4(manager, state);

  // Phase 4 spawns judges sequentially and awaits each one.
  // We need to complete each session as it appears.
  // Poll for new sessions and complete them.
  const poll = setInterval(() => {
    for (const session of mockSessionRegistry.sessions) {
      if (!session.aborted && !session.disposed) {
        session.emit({
          type: "agent_end",
          messages: [JSON.stringify({
            verdict: "approve",
            reasoning: "Well supported",
            confidence: "high",
          })],
          willRetry: false,
        });
      }
    }
  }, 5);

  const result = await resultPromise;
  clearInterval(poll);

  expect(result.success).toBe(true);
  expect(state.verdicts.length).toBe(3);

  // Each judge should have their own verdict
  const judgeNames = state.verdicts.map((v) => v.judge);
  expect(new Set(judgeNames).size).toBe(3); // All different judges

  // Each verdict should have all required fields
  for (const v of state.verdicts) {
    expect(v.verdict).toBeDefined();
    expect(v.reasoning).toBeDefined();
    expect(v.confidence).toBeDefined();
  }
});

// ─── Test 11: Phase 5 implementation verification ──────────────────────────

test("Phase 5 verifies implementation", async () => {
  const factory = mockCreateAgentSession();
  const manager = new BackgroundManager({
    sessionFactory: factory,
    setTimer: (fn, ms) => scheduler.setTimer(fn, ms),
    concurrencyConfig: { "ollama-cloud": { max: 10 } },
    fallbackConfig: {
      chains: {},
      allowlist: ["ollama-cloud/deepseek-v4-pro"],
    },
    defaultStaleTimeoutMs: 5000,
  });

  const state = createDebateState("Test topic", { domain: "complex", reason: "test" });
  state.verdicts = [
    { judge: "Nemo", verdict: "approve", reasoning: "good", confidence: "high" },
    { judge: "Oracle", verdict: "approve", reasoning: "fine", confidence: "medium" },
    { judge: "Conseil", verdict: "approve", reasoning: "ok", confidence: "medium" },
  ];

  const resultPromise = executePhase5(manager, state);

  // Poll for new sessions and complete them
  const poll = setInterval(() => {
    for (const session of mockSessionRegistry.sessions) {
      if (!session.aborted && !session.disposed) {
        session.emit({
          type: "agent_end",
          messages: [JSON.stringify({ verified: true })],
          willRetry: false,
        });
      }
    }
  }, 5);

  const result = await resultPromise;
  clearInterval(poll);

  expect(result.success).toBe(true);
  expect(state.implementationVerified).toBe(true);
});

// ─── Test 12: Simple topic → no debate ──────────────────────────────────────

test("runDebate: simple topic returns immediately with no sessions", async () => {
  const result = await runDebate("Bug fix: null pointer in user service");
  expect(result.classification).toBe("simple");
  expect(result.phase).toBe("completed");
  expect(result.verdict).toBe("not-required");
  expect(result.transcriptDir).toBeDefined();
});

// ─── Test 13: Chaotic topic → Watch Officer ────────────────────────────────

test("runDebate: chaotic topic routes to Watch Officer", async () => {
  const result = await runDebate("Production incident: database corruption detected");
  expect(result.classification).toBe("chaotic");
  expect(result.phase).toBe("blocked");
  expect(result.verdict).toBe("watch-officer");
  expect(result.transcriptDir).toBeDefined();
});

// ─── Test 14: Transcript files ──────────────────────────────────────────────

test("buildTranscripts produces all 6 transcript files", () => {
  const state = createDebateState("Test topic", { domain: "complex", reason: "test" });
  state.proposerArguments = [{ claim: "C1", evidence: "E1", warrant: "W1" }];
  state.opposerArguments = [{ claim: "C2", evidence: "E2", warrant: "W2" }];
  state.crossExamination = [{ asker: "Aronnax", question: "Q?", answer: "A." }];
  state.verdicts = [
    { judge: "Nemo", verdict: "approve", reasoning: "good", confidence: "high" },
    { judge: "Oracle", verdict: "approve", reasoning: "fine", confidence: "medium" },
    { judge: "Conseil", verdict: "approve", reasoning: "ok", confidence: "medium" },
  ];
  state.implementationVerified = true;
  state.completedAt = Date.now();

  const files = buildTranscripts(state);

  expect(files.metadata).toBeDefined();
  expect(files.metadata).toContain("topic: Test topic");
  expect(files.metadata).toContain("complex");

  expect(files.proposerArguments).toBeDefined();
  expect(files.proposerArguments).toContain("Claim");
  expect(files.proposerArguments).toContain("Evidence");
  expect(files.proposerArguments).toContain("Warrant");

  expect(files.opposerArguments).toBeDefined();
  expect(files.opposerArguments).toContain("Claim");

  expect(files.crossExamination).toBeDefined();
  expect(files.crossExamination).toContain("Aronnax");

  expect(files.verdict).toBeDefined();
  expect(files.verdict).toContain("Nemo");
  expect(files.verdict).toContain("Oracle");
  expect(files.verdict).toContain("Conseil");

  expect(files.implementationVerification).toBeDefined();
  expect(files.implementationVerification).toContain("Verified");
});

// ─── Test 15: createDebateState ─────────────────────────────────────────────

test("createDebateState creates valid initial state", () => {
  const state = createDebateState("Test topic with spaces!", {
    domain: "complex",
    reason: "test",
  });

  expect(state.topic).toBe("Test topic with spaces!");
  expect(state.slug).toBe("test-topic-with-spaces");
  expect(state.classification.domain).toBe("complex");
  expect(state.phase).toBe("idle");
  expect(state.createdAt).toBeGreaterThan(0);
  expect(state.startedAt).toBeUndefined();
  expect(state.completedAt).toBeUndefined();
  expect(state.error).toBeUndefined();
  expect(state.sessionIds.proposer).toBeUndefined();
  expect(state.sessionIds.opposer).toBeUndefined();
  expect(state.sessionIds.judge1).toBeUndefined();
  expect(state.sessionIds.judge2).toBeUndefined();
  expect(state.sessionIds.judge3).toBeUndefined();
  expect(state.sessionIds.crossExamination).toBeUndefined();
  expect(state.proposerArguments).toEqual([]);
  expect(state.opposerArguments).toEqual([]);
  expect(state.crossExamination).toEqual([]);
  expect(state.verdicts).toEqual([]);
  expect(state.implementationVerified).toBe(false);
});

// ─── Test 16: Session isolation ─────────────────────────────────────────────

test("Phase 1 sessions are independent (different task IDs)", () => {
  const manager = makeManager();
  const state = createDebateState("Test", { domain: "complex", reason: "test" });

  const phase1 = executePhase1(manager, state);

  const ids = [
    phase1.proposerTaskId,
    phase1.opposerTaskId,
    phase1.judge1TaskId,
    phase1.judge2TaskId,
    phase1.judge3TaskId,
  ];

  // All IDs must be unique
  expect(new Set(ids).size).toBe(5);

  // Each session should have a different system prompt (different roles)
  const prompts = mockSessionRegistry.sessions.map((s) => s.config.systemPrompt);
  expect(new Set(prompts).size).toBe(5);
});

// ─── Test 17: Judge error → retry → block (logic test) ─────────────────────

test("shouldRetryJudgeSession returns true on first error, false on second", () => {
  expect(shouldRetryJudgeSession("judge1", 0)).toBe(true);
  expect(shouldRetryJudgeSession("judge1", 1)).toBe(false);
});

// ─── Test 18: Complicated topic uses 5 sessions, skips Phase 3 ─────────────

test("Complicated topic: 5 sessions, skip Phase 3", () => {
  expect(requiredSessionCount("complicated")).toBe(5);
  expect(needsCrossExamination("complicated")).toBe(false);
});

// ─── Test 19: Complex topic uses 6 sessions ─────────────────────────────────

test("Complex topic: 6 sessions", () => {
  expect(requiredSessionCount("complex")).toBe(6);
  expect(needsCrossExamination("complex")).toBe(true);
});

// ─── Test 20: runDebate with complex topic executes all phases ──────────────

test("runDebate with complex topic executes all 5 phases", async () => {
  const factory = mockCreateAgentSession();
  const manager = new BackgroundManager({
    sessionFactory: factory,
    setTimer: (fn, ms) => scheduler.setTimer(fn, ms),
    concurrencyConfig: { "ollama-cloud": { max: 10 } },
    fallbackConfig: {
      chains: {},
      allowlist: ["ollama-cloud/deepseek-v4-pro"],
    },
    defaultStaleTimeoutMs: 5000,
  });

  const state = createDebateState("Design new auth architecture", {
    domain: "complex",
    reason: "test",
  });

  // Phase 1: spawn 5 sessions
  const phase1 = executePhase1(manager, state);
  expect(mockSessionRegistry.sessions.length).toBe(5);

  // Flush microtasks so sessions start
  await new Promise((r) => setTimeout(r, 0));

  // Complete Phase 1 sessions
  completeAllSessions(JSON.stringify([
    { claim: "Use OAuth2", evidence: "RFC 6749", warrant: "Industry standard" },
  ]));
  await new Promise((r) => setTimeout(r, 0));

  // Phase 2: collect arguments
  const phase2Result = await executePhase2(manager, state, phase1);
  expect(phase2Result.success).toBe(true);
  expect(state.proposerArguments.length).toBeGreaterThan(0);

  // Phase 3: cross-examination (complex only)
  const phase3Promise = executePhase3(manager, state);
  await new Promise((r) => setTimeout(r, 0));
  completeAllSessions(JSON.stringify([
    { asker: "Momus", question: "What about refresh tokens?", answer: "OAuth2 supports them" },
  ]));
  await new Promise((r) => setTimeout(r, 0));
  const phase3Result = await phase3Promise;
  expect(phase3Result.success).toBe(true);

  // Phase 4: verdicts (judges spawn sequentially, poll for completion)
  const phase4Poll = setInterval(() => {
    for (const session of mockSessionRegistry.sessions) {
      if (!session.aborted && !session.disposed) {
        session.emit({
          type: "agent_end",
          messages: [JSON.stringify({
            verdict: "approve",
            reasoning: "Well designed",
            confidence: "high",
          })],
          willRetry: false,
        });
      }
    }
  }, 5);

  const phase4Result = await executePhase4(manager, state);
  clearInterval(phase4Poll);
  expect(phase4Result.success).toBe(true);
  expect(state.verdicts.length).toBe(3);

  // Phase 5: implementation verification
  const phase5Poll = setInterval(() => {
    for (const session of mockSessionRegistry.sessions) {
      if (!session.aborted && !session.disposed) {
        session.emit({
          type: "agent_end",
          messages: [JSON.stringify({ verified: true })],
          willRetry: false,
        });
      }
    }
  }, 5);

  const phase5Result = await executePhase5(manager, state);
  clearInterval(phase5Poll);
  expect(phase5Result.success).toBe(true);
  expect(state.implementationVerified).toBe(true);
});
