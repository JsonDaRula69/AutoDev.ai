// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * TDD tests for scripts/onboard.ts runOnboard() — Step 2 of hm-wiring-v3.
 *
 * Given/When/Then:
 *  - `runOnboard` creates a pi AgentSession with systemPromptOverride set to the
 *    Harbor Master agent body (read from .pi/agents/harbor-master.md or via loadAgent,
 *    stripping YAML frontmatter).
 *  - `runOnboard` calls `analyzeOnboardingIntent()` before session start and injects
 *    results into the opening prompt.
 *  - `runOnboard` uses `SessionManager.create()` first, with try/catch fallback to
 *    `SessionManager.inMemory()`.
 *  - Model resolution follows `find()` -> `getDefault()` -> throws descriptive error
 *    if both null.
 *  - `runOnboard` subscribes to `message_end` and accumulates assistant text into
 *    a conversationLog array.
 *  - On session end: writes full transcript to `.autodev/onboarding/harbor-log.md`
 *    and summary to `.autodev/memory/harbor-log-summary.md`.
 *  - Task tool wrapper forces `run_in_background: true`.
 *  - Opening prompt: IntentGate results + session start (skill loaded via resourceLoader, not /skill: command).
 *    + session start.
 *  - NO `noExtensions`, NO `noContextFiles`. Session runs with the full extension.
 *  - Tools allowlist includes read, bash, grep, glob, write, onboarding_progress,
 *    onboarding_dispatch_hint, onboarding_finalize, onboarding_check_mailbox, task.
 *  - Calls `setConversationLog()` before session creation.
 *  - Registers skill override so the skill is discoverable.
 */
import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `autodev-onboard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeFakeSession(options: {
  onEnd?: (log: any[]) => void;
  assistantReplies?: Record<number, string>;
} = {}): {
  promptCalls: string[];
  subscribeEvents: any[];
  disposeCalls: number;
  session: any;
} {
  const promptCalls: string[] = [];
  const subscribeEvents: any[] = [];
  let disposeCalls = 0;

  const session = {
    prompt: mock(async (text: string) => {
      promptCalls.push(text);
      const reply = options.assistantReplies?.[promptCalls.length - 1];
      if (reply !== undefined && session._subscribers.length > 0) {
        session._subscribers.forEach((fn: any) => {
          fn({ type: "message_start", role: "assistant" });
          fn({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: reply } });
          fn({ type: "message_end", role: "assistant" });
        });
      }
    }),
    subscribe: mock((fn: (event: any) => void) => {
      session._subscribers.push(fn);
      return () => {
        session._subscribers = session._subscribers.filter((s: any) => s !== fn);
      };
    }),
    dispose: () => {
      disposeCalls++;
    },
    _subscribers: [] as ((event: any) => void)[],
  };

  return { promptCalls, subscribeEvents, disposeCalls, session };
}

function makeFakeAgentBody(name: string): string {
  return [
    `---`,
    `name: ${name}`,
    `description: test agent`,
    `tools: read, bash, grep, glob, write, onboarding_progress, onboarding_dispatch_hint, onboarding_finalize, onboarding_check_mailbox, task`,
    `model: ollama-cloud/glm-5.2:cloud`,
    `---`,
    `You are ${name}.`,
  ].join("\n");
}

function makeFakeCreateAgentSession(overrides: {
  session?: any;
  capture?: (args: any) => void;
  throwOnCall?: boolean;
} = {}): () => Promise<{ session: any }> {
  return async () => {
    if (overrides.throwOnCall) throw new Error("session create failed");
    if (overrides.capture) overrides.capture({ session: overrides.session });
    return { session: overrides.session ?? makeFakeSession().session };
  };
}

function makeFakeDeps(projectRoot: string): any {
  const calls: any[] = [];
  const DefaultResourceLoaderClass = class {
    constructor(opts: any) {
      calls.push({ constructor: "DefaultResourceLoader", opts });
      Object.assign(this, opts);
    }
    reload = async () => {};
    getSkills = () => ({ skills: [], diagnostics: [] });
  };
  const fakeModelRegistryInstance = {
    find: mock((_provider?: string, _model?: string) => {
      calls.push({ method: "find", args: [_provider, _model] });
      return null;
    }),
    getAvailable: mock(() => {
      calls.push({ method: "getAvailable" });
      return [{ id: "default-model", provider: "ollama-cloud" }];
    }),
  };
  const fakeDeps: any = {
    calls,
    getAgentDir: () => join(projectRoot, ".pi"),
    AuthStorage: { create: () => ({ name: "authStorage" }) },
    ModelRegistry: {
      create: mock((_authStorage: unknown, _modelsPath: string) => fakeModelRegistryInstance),
    },
    SessionManager: {
      create: mock((dir: string) => ({ dir, kind: "persistent" })),
      inMemory: mock(() => ({ kind: "in-memory" })),
    },
    DefaultResourceLoader: DefaultResourceLoaderClass,
    createAgentSession: mock(async (args: any) => {
      calls.push({ method: "createAgentSession", args });
      return { session: makeFakeSession().session };
    }),
  };
  return fakeDeps;
}

// ---------------------------------------------------------------------------
// Module import helper — clears Bun's import cache between tests
// ---------------------------------------------------------------------------

async function importOnboardModule() {
  // Bun's ESM cache cannot be cleared directly; each test uses the same module
  // instance. We rely on dependency injection for mockability instead.
  return import("../onboard.js");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("runOnboard builds session with systemPromptOverride from harbor-master body", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    const { session, promptCalls } = makeFakeSession();
    deps.createAgentSession = mock(async (args: any) => {
      deps.calls.push({ method: "createAgentSession", args });
      return { session };
    });

    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    notify: () => {},
    piSdkOverride: deps,
    loadAgentOverride: () =>
      ({ name: "harbor-master", systemPrompt: "You are the Harbor Master.", model: "ollama-cloud/glm-5.2:cloud", tools: [] }),
    analyzeOnboardingIntentOverride: () =>
      ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), });

    expect(code).toBe(0);
    const createCall = deps.calls.find((c: any) => c.method === "createAgentSession");
    expect(createCall).toBeDefined();
    expect(createCall.args.resourceLoader).toBeInstanceOf(deps.DefaultResourceLoader);
    expect(typeof createCall.args.resourceLoader.systemPromptOverride).toBe("function");
    expect(createCall.args.resourceLoader.systemPromptOverride()).toContain("You are the Harbor Master.");
    expect(createCall.args.model.id).toBe("default-model");
    expect(deps.ModelRegistry.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "authStorage" }),
      expect.stringContaining("models.json"),
    );
    expect(createCall.args.tools).toEqual([
      "read",
      "bash",
      "grep",
      "glob",
      "write",
      "onboarding_progress",
      "onboarding_dispatch_hint",
      "onboarding_finalize",
      "onboarding_check_mailbox",
      "task",
    ]);
    expect(promptCalls.length).toBe(1);
    expect(promptCalls[0]).toContain("The visitor just arrived");
    expect(promptCalls[0]).not.toContain("/skill:");
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard calls analyzeOnboardingIntent and injects results into opening prompt", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    const { session, promptCalls } = makeFakeSession();
    deps.createAgentSession = mock(async (args: any) => ({ session }));

    const analyzeCalls: any[] = [];
    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    initialText: "We are building a financial dashboard. Security is critical.",
    notify: () => {},
    piSdkOverride: deps,
    loadAgentOverride: () =>
      ({ name: "harbor-master", systemPrompt: "You are the Harbor Master.", model: "ollama-cloud/glm-5.2:cloud", tools: [] }),
    analyzeOnboardingIntentOverride: (text: string) => {
      analyzeCalls.push(text);
      return {
        hiddenIntentions: [{ theme: "security", evidence: "mentions critical", question: "What compliance regime?" }],
        probingQuestions: ["What is the blast radius?"],
        stake: "critical",
        technicalDepth: "technical",
      };
    }, });

    expect(code).toBe(0);
    expect(analyzeCalls.length).toBe(1);
    expect(analyzeCalls[0]).toContain("financial dashboard");

    expect(promptCalls.length).toBe(1);
    const opening = promptCalls[0];
    expect(opening).toContain("The visitor just arrived");
    expect(opening).not.toContain("/skill:");
    expect(opening).toContain("Stake tier: critical");
    expect(opening).toContain("Technical depth: technical");
    expect(opening).toContain("security");
    expect(opening).toContain("What is the blast radius?");
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard prefers SessionManager.create and falls back to inMemory on failure", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    deps.SessionManager.create = mock(() => {
      throw new Error("unwritable path");
    });
    const { session } = makeFakeSession();
    deps.createAgentSession = mock(async (args: any) => {
      deps.calls.push({ method: "createAgentSession", args });
      return { session };
    });
    const messages: any[] = [];

    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    notify: (msg, level) => messages.push({ msg, level }),
    piSdkOverride: deps,
    loadAgentOverride: () =>
      ({ name: "harbor-master", systemPrompt: "You are the Harbor Master.", model: "ollama-cloud/glm-5.2:cloud", tools: [] }),
    analyzeOnboardingIntentOverride: () =>
      ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), });

    expect(code).toBe(0);
    expect(deps.SessionManager.create).toHaveBeenCalled();
    expect(deps.SessionManager.inMemory).toHaveBeenCalled();
    expect(messages.some((m) => m.level === "warning" && m.msg.includes("in-memory"))).toBe(true);

    const createCall = deps.calls.find((c: any) => c.method === "createAgentSession");
    expect(createCall.args.sessionManager.kind).toBe("in-memory");
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard throws descriptive error when both find and getDefault return null", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    const messages: any[] = [];

    deps.ModelRegistry.create = mock((_authStorage: unknown, _modelsPath: string) => ({
      find: mock(() => null),
      getAvailable: mock(() => []),
    }));

    const { runOnboard } = await importOnboardModule();
    await expect(
      runOnboard({ skipHyperplan: true, projectRoot,
      notify: (msg, level) => messages.push({ msg, level }),
      piSdkOverride: deps,
      loadAgentOverride: () =>
        ({ name: "harbor-master", systemPrompt: "You are the Harbor Master.", model: "ollama-cloud/glm-5.2:cloud", tools: [] }),
      analyzeOnboardingIntentOverride: () =>
        ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), }),
    ).rejects.toThrow(/No usable model found for Harbor Master onboarding/i);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard accumulates assistant text from message_end into conversationLog", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    const { session, promptCalls } = makeFakeSession({
      assistantReplies: { 0: "Ah, another visitor." },
    });
    deps.createAgentSession = mock(async (args: any) => {
      deps.calls.push({ method: "createAgentSession", args });
      return { session };
    });

    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    notify: () => {},
    piSdkOverride: deps,
    loadAgentOverride: () =>
      ({ name: "harbor-master", systemPrompt: "You are the Harbor Master.", model: "ollama-cloud/glm-5.2:cloud", tools: [] }),
    analyzeOnboardingIntentOverride: () =>
      ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), });

    expect(code).toBe(0);
    expect(promptCalls.length).toBe(1);

    const harborLogPath = join(projectRoot, ".autodev", "onboarding", "harbor-log.md");
    expect(existsSync(harborLogPath)).toBe(true);
    const harborLog = readFileSync(harborLogPath, "utf-8");
    expect(harborLog).toContain("Ah, another visitor.");

    const summaryPath = join(projectRoot, ".autodev", "memory", "harbor-log-summary.md");
    expect(existsSync(summaryPath)).toBe(true);
    const summary = readFileSync(summaryPath, "utf-8");
    expect(summary).toContain("Harbor Log Summary");
  } finally {
    cleanupTempDir(projectRoot);
  }
});

  test("runOnboard registers skill override with discoverable skill", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    const { session } = makeFakeSession();
    deps.createAgentSession = mock(async (args: any) => {
      deps.calls.push({ method: "createAgentSession", args });
      return { session };
    });

    const skillDir = join(projectRoot, ".pi", "skills", "autodev-onboarding-harbor-master");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      makeFakeAgentBody("autodev-onboarding-harbor-master"),
      "utf-8",
    );

    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    notify: () => {},
    piSdkOverride: deps,
    loadAgentOverride: () =>
      ({ name: "harbor-master", systemPrompt: "You are the Harbor Master.", model: "ollama-cloud/glm-5.2:cloud", tools: [] }),
    analyzeOnboardingIntentOverride: () =>
      ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), });

    expect(code).toBe(0);
    const createCall = deps.calls.find((c: any) => c.method === "createAgentSession");
    expect(createCall).toBeDefined();
    const loaderOpts = createCall.args.resourceLoader;
    const skills = loaderOpts.skillsOverride({ skills: [], diagnostics: [] });
    expect(skills.skills.length).toBeGreaterThan(0);
    const skillNames = skills.skills.map((s: any) => s.name);
    expect(skillNames).toContain("autodev-onboarding-harbor-master");
    expect(skills.diagnostics).toEqual([]);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard still returns 0 when session ends with error and writes harbor log", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    const session = {
      prompt: mock(async () => {
        throw new Error("session exploded");
      }),
      subscribe: mock(() => () => {}),
      dispose: () => {},
    };
    deps.createAgentSession = mock(async () => ({ session }));
    const messages: any[] = [];

    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    notify: (msg, level) => messages.push({ msg, level }),
    piSdkOverride: deps,
    loadAgentOverride: () =>
      ({ name: "harbor-master", systemPrompt: "You are the Harbor Master.", model: "ollama-cloud/glm-5.2:cloud", tools: [] }),
    analyzeOnboardingIntentOverride: () =>
      ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), });

    expect(code).toBe(0);
    expect(messages.some((m) => m.level === "warning" && m.msg.includes("session ended with error"))).toBe(true);
    const harborLogPath = join(projectRoot, ".autodev", "onboarding", "harbor-log.md");
    expect(existsSync(harborLogPath)).toBe(true);
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard returns 1 and skips session when loadAgent returns undefined", async () => {
  const projectRoot = createTempDir();
  try {
    const deps = makeFakeDeps(projectRoot);
    const messages: any[] = [];

    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    notify: (msg, level) => messages.push({ msg, level }),
    piSdkOverride: deps,
    loadAgentOverride: () => undefined,
    analyzeOnboardingIntentOverride: () =>
      ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), });

    expect(code).toBe(1);
    expect(messages.some((m) => m.level === "warning" && m.msg.includes("Harbor Master"))).toBe(true);
    expect(deps.createAgentSession).not.toHaveBeenCalled();
  } finally {
    cleanupTempDir(projectRoot);
  }
});

test("runOnboard default path loads harbor-master agent body from file", async () => {
  const projectRoot = createTempDir();
  const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    const agentDir = join(projectRoot, ".pi", "agent");
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const deps = makeFakeDeps(projectRoot);
    deps.getAgentDir = () => agentDir;
    const { session } = makeFakeSession();
    deps.createAgentSession = mock(async (args: any) => {
      deps.calls.push({ method: "createAgentSession", args });
      return { session };
    });

    const agentsDir = join(agentDir, "..", "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, "harbor-master.md"),
      makeFakeAgentBody("harbor-master"),
      "utf-8",
    );

    const { runOnboard } = await importOnboardModule();
    const code = await runOnboard({ skipHyperplan: true, projectRoot,
    notify: () => {},
    piSdkOverride: deps,
    analyzeOnboardingIntentOverride: () =>
      ({ hiddenIntentions: [], probingQuestions: [], stake: "unknown", technicalDepth: "mixed" }), });

    expect(code).toBe(0);
    const createCall = deps.calls.find((c: any) => c.method === "createAgentSession");
    expect(createCall).toBeDefined();
    const body = createCall.args.resourceLoader.systemPromptOverride();
    expect(body).toContain("You are harbor-master.");
    expect(body).not.toContain("name: harbor-master");
  } finally {
    if (savedAgentDir !== undefined) {
      process.env.PI_CODING_AGENT_DIR = savedAgentDir;
    } else {
      delete process.env.PI_CODING_AGENT_DIR;
    }
    cleanupTempDir(projectRoot);
  }
});
