/**
 * Background agent manager — spawns, tracks, and supervises subagent sessions.
 *
 * Responsibilities:
 *
 *  - Spawn: create an in-memory agent session via the injectable session
 *    factory and track it in a Map<taskId, TaskState>.
 *  - Concurrency: per-provider-key counter. Max N per key (configurable
 *    via `.autodev/config/concurrency.yaml`, default 5). Overflow queues.
 *  - Circuit breaker: delegated to CircuitBreaker (see circuit-breaker.ts).
 *  - Parent-wake notifier: when a child completes, the parent's
 *    `onParentWake` callback fires.
 *  - Error + fallback: delegated to error-handler.ts.
 */
import {
  type ManagedSession,
  type SessionFactory,
  type SessionEvent,
  type SpawnConfig,
  type TaskState,
  type TaskStatus,
  type ConcurrencyConfig,
  createTaskState,
  isTerminal,
  providerKeyOf,
} from "./types.js";
import type { ResolvedFallbackConfig } from "./fallback.js";
import { handleSessionError } from "./error-handler.js";
import { CircuitBreaker, type TimerFactory, type TimerHandle, DEFAULT_STALE_TIMEOUT_MS } from "./circuit-breaker.js";
import { loadConcurrencyConfig, DEFAULT_MAX_CONCURRENCY } from "./concurrency.js";

/**
 * Default session factory — wires the background manager to the real pi SDK.
 *
 * Resolves the model string from `SpawnConfig` against the pi `ModelRegistry`,
 * then calls `createAgentSession` with an in-memory session manager. The
 * resulting `AgentSession` exposes `subscribe`, `abort`, and `dispose`, which
 * satisfies the `ManagedSession` interface.
 *
 * The pi SDK import is lazy (dynamic `import()`) so this module stays testable
 * without the real SDK fully initialized. If the import or session creation
 * fails, the factory throws and the manager marks the task as errored — tests
 * inject their own factory and never hit this path.
 */
const defaultSessionFactory: SessionFactory = async (config) => {
  const { createAgentSession, SessionManager, ModelRegistry, AuthStorage, DefaultResourceLoader, getAgentDir } =
    await import("@earendil-works/pi-coding-agent");
  const cwd = process.cwd();
  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create(`${agentDir}/auth.json`);
  const modelRegistry = ModelRegistry.create(authStorage, `${agentDir}/models.json`);
  const [provider, modelId] = config.model.split("/");
  const model = provider !== undefined && modelId !== undefined
    ? modelRegistry.find(provider, modelId)
    : undefined;
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: undefined as never,
  });
  await resourceLoader.reload();
  const sessionOpts: Record<string, unknown> = {
    cwd,
    tools: [...config.tools],
    customTools: config.customTools as never,
    sessionManager: SessionManager.inMemory(),
    resourceLoader,
    modelRegistry,
    authStorage,
  };
  if (model !== undefined) sessionOpts.model = model;
  if (config.thinkingLevel !== undefined) sessionOpts.thinkingLevel = config.thinkingLevel;
  const { session } = await createAgentSession(sessionOpts as never);
  return session as unknown as ManagedSession;
};

/** Manager options (injectable for tests). */
export interface BackgroundManagerOptions {
  readonly projectRoot?: string;
  readonly sessionFactory?: SessionFactory;
  readonly concurrencyConfig?: ConcurrencyConfig;
  readonly fallbackConfig?: ResolvedFallbackConfig;
  readonly defaultStaleTimeoutMs?: number;
  readonly setTimer?: TimerFactory;
}

interface QueuedTask {
  readonly taskId: string;
  readonly providerKey: string;
}

/**
 * Background manager. Tracks all live background tasks, enforces concurrency
 * limits per provider key, runs a circuit breaker per task, and notifies
 * parents when children complete.
 */
export class BackgroundManager {
  private readonly tasks = new Map<string, TaskState>();
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly runningPerKey = new Map<string, number>();
  private readonly queue: QueuedTask[] = [];
  private readonly sessionFactory: SessionFactory;
  private readonly concurrencyConfig: ConcurrencyConfig;
  private readonly fallbackConfig: ResolvedFallbackConfig | undefined;
  private readonly defaultStaleTimeoutMs: number;
  private readonly breaker: CircuitBreaker;
  private taskCounter = 0;

  constructor(options: BackgroundManagerOptions = {}) {
    this.sessionFactory = options.sessionFactory ?? defaultSessionFactory;
    this.concurrencyConfig = options.concurrencyConfig ?? loadConcurrencyConfig(options.projectRoot ?? ".");
    this.fallbackConfig = options.fallbackConfig;
    this.defaultStaleTimeoutMs = options.defaultStaleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;

    const timerFactory: TimerFactory =
      options.setTimer ??
      ((fn, ms) => {
        const handle = setTimeout(fn, ms);
        return { clear: () => clearTimeout(handle) };
      });

    this.breaker = new CircuitBreaker({
      timerFactory,
      defaultTimeoutMs: this.defaultStaleTimeoutMs,
      onTrip: (id) => this.onCircuitBreakerTrip(id),
      getTask: (id) => this.tasks.get(id) as TaskState | undefined,
    });
  }

  private maxFor(key: string): number {
    return this.concurrencyConfig[key]?.max ?? DEFAULT_MAX_CONCURRENCY;
  }

  private running(key: string): number {
    return this.runningPerKey.get(key) ?? 0;
  }

  private inc(key: string): void {
    this.runningPerKey.set(key, this.running(key) + 1);
  }

  private dec(key: string): void {
    this.runningPerKey.set(key, Math.max(0, this.running(key) - 1));
  }

  private nextId(): string {
    this.taskCounter += 1;
    return `bg-${this.taskCounter}`;
  }

  spawn(config: SpawnConfig): string {
    const id = this.nextId();
    const providerKey = providerKeyOf(config.model);
    const state = createTaskState(id, config);
    this.tasks.set(id, state);

    if (this.running(providerKey) < this.maxFor(providerKey)) {
      void this.startTask(id);
    } else {
      // Queue — start when a slot frees.
      this.queue.push({ taskId: id, providerKey });
    }

    return id;
  }

  private async startTask(id: string): Promise<void> {
    const state = this.tasks.get(id);
    if (state === undefined || state.status !== "pending") return;

    this.inc(state.providerKey);
    state.status = "running";
    state.startedAt = Date.now();

    if (this.sessionFactory === undefined) {
      this.finishTask(id, "error", undefined, "no-session-factory-configured");
      this.freeSlot(state.providerKey);
      return;
    }

    try {
      const session = await this.sessionFactory({
        model: state.model,
        systemPrompt: state.systemPrompt,
        tools: state.tools,
        customTools: state.customTools,
        ...(state.thinkingLevel !== undefined ? { thinkingLevel: state.thinkingLevel } : {}),
      });
      this.sessions.set(id, session);
      this.breaker.arm(id, state.staleTimeoutMs);
      session.subscribe((event) => this.handleEvent(id, event));
    } catch (e) {
      this.finishTask(id, "error", undefined, `spawn-failed: ${(e as Error).message}`);
      this.freeSlot(state.providerKey);
    }
  }

  /** Circuit breaker tripped — abort session, mark error, free slot. */
  private onCircuitBreakerTrip(id: string): void {
    const state = this.tasks.get(id);
    if (state === undefined || isTerminal(state.status)) return;
    const session = this.sessions.get(id);
    void session?.abort();
    this.finishTask(id, "error", undefined, "circuit-breaker-timeout");
    this.freeSlot(state.providerKey);
  }

  private handleEvent(id: string, event: SessionEvent): void {
    const state = this.tasks.get(id);
    if (state === undefined || isTerminal(state.status)) return;

    this.breaker.arm(id, state.staleTimeoutMs);

    if (event.type === "error") {
      this.handleSessionError(id, event.error);
      return;
    }

    if (event.type === "agent_end") {
      this.breaker.clear(id);
      this.finishTask(id, "completed", event.messages, undefined);
      this.freeSlot(state.providerKey);
    }
  }

  private handleSessionError(id: string, error: unknown): void {
    const state = this.tasks.get(id);
    if (state === undefined || isTerminal(state.status)) return;

    const result = handleSessionError({ id, state, error, fallbackConfig: this.fallbackConfig });

    if (result.action === "terminate") {
      this.breaker.clear(id);
      this.finishTask(id, "error", undefined, result.error);
      this.freeSlot(state.providerKey);
      this.disposeSession(id);
      return;
    }

    // Respawn: abort current session, update model, re-spawn.
    this.breaker.clear(id);
    const session = this.sessions.get(id);
    void session?.abort();
    this.disposeSession(id);

    state.triedModels.push(result.model);
    state.model = result.model;
    const oldKey = state.providerKey;
    state.providerKey = result.providerKey;
    state.status = "pending";

    this.dec(oldKey);
    void this.startTask(id);
  }

  private disposeSession(id: string): void {
    const session = this.sessions.get(id);
    if (session !== undefined) {
      try {
        session.dispose();
      } catch {
        // ignore
      }
      this.sessions.delete(id);
    }
  }

  private finishTask(id: string, status: TaskStatus, result: unknown, error: string | undefined): void {
    const state = this.tasks.get(id);
    if (state === undefined || isTerminal(state.status)) return;

    state.status = status;
    state.completedAt = Date.now();
    state.result = result;
    state.error = error;

    this.breaker.clear(id);

    const cb = state.onParentWake;
    if (cb !== undefined) {
      try {
        cb(id, status, result);
      } catch {
        // Parent callback failure must not crash the manager.
      }
    }
  }

  private freeSlot(providerKey: string): void {
    this.dec(providerKey);
    void this.drainQueue();
  }

  private drainQueue(): void {
    for (let i = 0; i < this.queue.length; ) {
      const entry = this.queue[i];
      if (entry === undefined) {
        i++;
        continue;
      }
      if (this.running(entry.providerKey) < this.maxFor(entry.providerKey)) {
        this.queue.splice(i, 1);
        void this.startTask(entry.taskId);
      } else {
        i++;
      }
    }
  }

  getTask(id: string): TaskState | undefined {
    return this.tasks.get(id);
  }

  listTasks(): readonly TaskState[] {
    return [...this.tasks.values()];
  }

  cancel(id: string): boolean {
    const state = this.tasks.get(id);
    if (state === undefined || isTerminal(state.status)) return false;

    this.breaker.clear(id);
    const session = this.sessions.get(id);
    if (session !== undefined) {
      void session.abort();
      this.disposeSession(id);
    }

    this.finishTask(id, "cancelled", undefined, undefined);
    this.freeSlot(state.providerKey);
    return true;
  }

  dispose(): void {
    this.breaker.dispose();
    for (const id of this.sessions.keys()) {
      this.disposeSession(id);
    }
    this.sessions.clear();
    this.queue.length = 0;
  }
}