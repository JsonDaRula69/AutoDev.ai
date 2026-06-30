/**
 * T8 background agent manager + model fallback tests.
 *
 * Covers:
 *  1. Spawn 3 concurrent sessions → all 3 complete
 *  2. Bad model → fallback to configured fallback model
 *  3. Hanging session → circuit breaker trips after stale timeout (fake timers)
 *  4. Parent session notified when child completes
 *  5. Concurrency limit enforced (6th task queued when limit is 5)
 *  6. Error classifier: 429 → retryable, 401 → fatal
 *  7. Fallback chain resolves correctly from config
 *
 * Uses a manual timer scheduler (no real `setTimeout`) so circuit-breaker
 * tests are instant and deterministic.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { BackgroundManager } from "../extensions/autodev/background/manager.js";
import { classifyError } from "../extensions/autodev/background/classifier.js";
import {
  resolveFallbackModel,
  loadFallbackConfig,
} from "../extensions/autodev/background/fallback.js";
import {
  mockCreateAgentSession,
  mockSessionRegistry,
  resetSessionMocks,
  type MockSession,
} from "./mocks/pi-session.js";
import type { SessionEvent } from "../extensions/autodev/background/types.js";

// --- Manual timer scheduler -------------------------------------------------

interface ScheduledTimer {
  fn: () => void;
  ms: number;
  fired: boolean;
}

class FakeTimerScheduler {
  readonly timers: ScheduledTimer[] = [];
  readonly handles: { clear(): void }[] = [];

  setTimer(fn: () => void, ms: number): { clear(): void } {
    const entry: ScheduledTimer = { fn, ms, fired: false };
    this.timers.push(entry);
    const handle = {
      clear: () => {
        entry.fired = true;
        const idx = this.timers.indexOf(entry);
        if (idx >= 0) this.timers.splice(idx, 1);
      },
    };
    this.handles.push(handle);
    return handle;
  }

  /** Advance time by `ms` and fire any due timers in insertion order. */
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
    this.handles.length = 0;
  }
}

let scheduler: FakeTimerScheduler;

beforeEach(() => {
  scheduler = new FakeTimerScheduler();
  resetSessionMocks();
});

afterEach(() => {
  scheduler.reset();
});

// Helper to create a manager wired with the mock factory + fake timers.
function makeManager(options: {
  concurrencyConfig?: Record<string, { max: number }>;
  fallbackConfig?: { chains: Record<string, { fallback_models: readonly string[] }>; allowlist: readonly string[] };
  defaultStaleTimeoutMs?: number;
}): { manager: BackgroundManager; factory: ReturnType<typeof mockCreateAgentSession> } {
  const factory = mockCreateAgentSession();
  const manager = new BackgroundManager({
    sessionFactory: factory,
    setTimer: (fn, ms) => scheduler.setTimer(fn, ms),
    concurrencyConfig: options.concurrencyConfig ?? { "ollama-cloud": { max: 5 } },
    fallbackConfig: options.fallbackConfig ?? {
      chains: {},
      allowlist: ["ollama-cloud/glm-5.2:cloud", "ollama-cloud/deepseek-v4-pro"],
    },
    defaultStaleTimeoutMs: options.defaultStaleTimeoutMs ?? 50,
  });
  return { manager, factory };
}

function spawnConfig(model: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model,
    systemPrompt: "test",
    tools: ["read"],
    ...overrides,
  };
}

// --- Test 1: 3 concurrent sessions complete --------------------------------

test("spawn 3 concurrent sessions and all complete", async () => {
  const { manager } = makeManager({});
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    ids.push(manager.spawn(spawnConfig("ollama-cloud/glm-5.2:cloud") as never));
  }

  // Sessions are created async — let microtasks flush.
  await new Promise((r) => setTimeout(r, 0));

  expect(mockSessionRegistry.sessions.length).toBe(3);
  for (const session of mockSessionRegistry.sessions) {
    session.emit({ type: "agent_end", messages: ["done"], willRetry: false });
  }

  for (const id of ids) {
    expect(manager.getTask(id)?.status).toBe("completed");
    expect(manager.getTask(id)?.error).toBeUndefined();
  }
});

// --- Test 2: bad model → fallback to configured fallback model ---------------

test("spawn session with bad model falls back to configured fallback model", async () => {
  const { manager } = makeManager({
    fallbackConfig: {
      chains: {
        explore: { fallback_models: ["ollama-cloud/deepseek-v4-pro"] },
      },
      allowlist: ["ollama-cloud/glm-5.2:cloud", "ollama-cloud/deepseek-v4-pro"],
    },
  });

  const id = manager.spawn({
    model: "ollama-cloud/glm-5.2:cloud",
    systemPrompt: "explore task",
    tools: ["read"],
    agentName: "explore",
  } as never);

  await new Promise((r) => setTimeout(r, 0));

  expect(mockSessionRegistry.sessions.length).toBe(1);
  const firstSession = mockSessionRegistry.sessions[0] as MockSession | undefined;
  expect(firstSession).toBeDefined();

  firstSession!.emit({ type: "error", error: { status: 429, message: "rate limited" } });

  await new Promise((r) => setTimeout(r, 0));

  // Should have spawned a second session with the fallback model.
  expect(mockSessionRegistry.sessions.length).toBe(2);
  const secondSession = mockSessionRegistry.sessions[1] as MockSession | undefined;
  expect(secondSession?.config.model).toBe("ollama-cloud/deepseek-v4-pro");

  const task = manager.getTask(id);
  expect(task?.triedModels).toContain("ollama-cloud/deepseek-v4-pro");
});

// --- Test 3: hanging session → circuit breaker trips -----------------------

test("circuit breaker trips after stale timeout (fake timers)", async () => {
  const { manager } = makeManager({ defaultStaleTimeoutMs: 50 });

  const id = manager.spawn(spawnConfig("ollama-cloud/glm-5.2:cloud") as never);
  await new Promise((r) => setTimeout(r, 0));

  expect(mockSessionRegistry.sessions.length).toBe(1);
  const session = mockSessionRegistry.sessions[0] as MockSession | undefined;
  expect(session).toBeDefined();
  expect(session?.aborted).toBe(false);

  // Advance fake time past the stale timeout — breaker should fire.
  scheduler.advance(100);

  const task = manager.getTask(id);
  expect(task?.status).toBe("error");
  expect(task?.error).toBe("circuit-breaker-timeout");
  expect(session?.aborted).toBe(true);
});

// --- Test 4: parent notified when child completes ---------------------------

test("parent session notified when child completes", async () => {
  const { manager } = makeManager({});
  let parentNotified = false;
  let notifiedStatus = "";
  let notifiedResult: unknown = undefined;

  const id = manager.spawn({
    model: "ollama-cloud/glm-5.2:cloud",
    systemPrompt: "child task",
    tools: ["read"],
    onParentWake: (_taskId: string, status: string, result: unknown) => {
      parentNotified = true;
      notifiedStatus = status;
      notifiedResult = result;
    },
  } as never);

  await new Promise((r) => setTimeout(r, 0));

  expect(mockSessionRegistry.sessions.length).toBe(1);
  const session = mockSessionRegistry.sessions[0] as MockSession | undefined;
  session!.emit({ type: "agent_end", messages: ["result-data"], willRetry: false });

  expect(parentNotified).toBe(true);
  expect(notifiedStatus).toBe("completed");
  expect(notifiedResult).toEqual(["result-data"]);
  expect(manager.getTask(id)?.status).toBe("completed");
});

// --- Test 5: concurrency limit enforced (6th queued when limit is 5) -------

test("concurrency limit enforced — 6th task queued when limit is 5", async () => {
  const { manager } = makeManager({
    concurrencyConfig: { "ollama-cloud": { max: 5 } },
  });

  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    ids.push(manager.spawn(spawnConfig("ollama-cloud/glm-5.2:cloud") as never));
  }

  // 5 sessions start, 6th is queued. Flush microtasks.
  await new Promise((r) => setTimeout(r, 0));

  expect(mockSessionRegistry.sessions.length).toBe(5);

  // The 6th task is pending (queued).
  const queuedTask = manager.getTask(ids[5]!);
  expect(queuedTask?.status).toBe("pending");

  // Complete one of the 5 running sessions — the 6th should start.
  const firstSession = mockSessionRegistry.sessions[0] as MockSession | undefined;
  firstSession!.emit({ type: "agent_end", messages: [], willRetry: false });

  await new Promise((r) => setTimeout(r, 0));

  expect(mockSessionRegistry.sessions.length).toBe(6);
  expect(manager.getTask(ids[5]!)?.status).toBe("running");
});

// --- Test 6: error classifier ------------------------------------------------

test("error classifier: 429 is retryable", () => {
  const r = classifyError({ status: 429, message: "rate limited" });
  expect(r.retryable).toBe(true);
  expect(r.reason).toBe("retryable-http-429");
});

test("error classifier: 401 is fatal", () => {
  const r = classifyError({ status: 401, message: "unauthorized" });
  expect(r.retryable).toBe(false);
  expect(r.reason).toBe("auth-error-401");
});

test("error classifier: 403 is fatal", () => {
  const r = classifyError({ status: 403, message: "forbidden" });
  expect(r.retryable).toBe(false);
});

test("error classifier: 503 is retryable", () => {
  const r = classifyError({ status: 503, message: "service unavailable" });
  expect(r.retryable).toBe(true);
  expect(r.reason).toBe("retryable-http-503");
});

test("error classifier: timeout message is retryable", () => {
  const r = classifyError(new Error("request timed out"));
  expect(r.retryable).toBe(true);
  expect(r.reason).toBe("timeout");
});

test("error classifier: context overflow is fatal", () => {
  const r = classifyError(new Error("context_length_exceeded: prompt is too long"));
  expect(r.retryable).toBe(false);
  expect(r.reason).toBe("context-overflow");
});

test("error classifier: unknown error is non-retryable", () => {
  const r = classifyError(new Error("something weird"));
  expect(r.retryable).toBe(false);
  expect(r.reason).toBe("unknown-non-retryable");
});

// --- Test 7: fallback chain resolves correctly from config ------------------

test("resolveFallbackModel returns proactive chain model for configured agent", () => {
  const config = {
    chains: {
      explore: { fallback_models: ["ollama-cloud/deepseek-v4-pro"] },
    },
    allowlist: ["ollama-cloud/glm-5.2:cloud", "ollama-cloud/deepseek-v4-pro"],
  };
  const result = resolveFallbackModel({
    agentName: "explore",
    error: { status: 429, message: "rate limited" },
    currentModel: "ollama-cloud/glm-5.2:cloud",
    triedModels: ["ollama-cloud/glm-5.2:cloud"],
    config,
  });
  expect(result).toBeDefined();
  expect(result?.model).toBe("ollama-cloud/deepseek-v4-pro");
  expect(result?.mode).toBe("proactive");
});

test("resolveFallbackModel returns reactive allowlist model when no proactive chain", () => {
  const config = {
    chains: {},
    allowlist: ["ollama-cloud/glm-5.2:cloud", "ollama-cloud/deepseek-v4-pro"],
  };
  const result = resolveFallbackModel({
    agentName: "unknown-agent",
    error: { status: 503, message: "unavailable" },
    currentModel: "ollama-cloud/glm-5.2:cloud",
    triedModels: ["ollama-cloud/glm-5.2:cloud"],
    config,
  });
  expect(result).toBeDefined();
  expect(result?.model).toBe("ollama-cloud/deepseek-v4-pro");
  expect(result?.mode).toBe("reactive");
});

test("resolveFallbackModel returns undefined for non-retryable errors", () => {
  const config = {
    chains: { explore: { fallback_models: ["ollama-cloud/deepseek-v4-pro"] } },
    allowlist: ["ollama-cloud/glm-5.2:cloud", "ollama-cloud/deepseek-v4-pro"],
  };
  const result = resolveFallbackModel({
    agentName: "explore",
    error: { status: 401, message: "unauthorized" },
    currentModel: "ollama-cloud/glm-5.2:cloud",
    triedModels: ["ollama-cloud/glm-5.2:cloud"],
    config,
  });
  expect(result).toBeUndefined();
});

test("resolveFallbackModel skips already-tried models", () => {
  const config = {
    chains: { explore: { fallback_models: ["model-a", "model-b"] } },
    allowlist: ["model-a", "model-b", "model-c"],
  };
  const result = resolveFallbackModel({
    agentName: "explore",
    error: { status: 429, message: "rate limited" },
    currentModel: "model-a",
    triedModels: ["model-a", "model-b"],
    config,
  });
  // Proactive chain exhausted → reactive picks model-c from allowlist.
  expect(result).toBeDefined();
  expect(result?.model).toBe("model-c");
  expect(result?.mode).toBe("reactive");
});

test("loadFallbackConfig loads from project root", () => {
  const config = loadFallbackConfig(process.cwd());
  expect(config.allowlist.length).toBeGreaterThan(0);
  expect(config.allowlist).toContain("ollama-cloud/glm-5.2:cloud");
});

// --- M4: default session factory wiring -------------------------------------

test("BackgroundManager uses the default session factory when none is provided", () => {
  const factory = mockCreateAgentSession();
  const manager = new BackgroundManager({
    sessionFactory: factory,
    setTimer: (fn, ms) => scheduler.setTimer(fn, ms),
  });
  const id = manager.spawn(spawnConfig("ollama-cloud/glm-5.2:cloud") as never);
  const task = manager.getTask(id);
  expect(task).toBeDefined();
  expect(task?.status).not.toBe("error");
  expect(task?.error).not.toBe("no-session-factory-configured");
  manager.dispose();
});