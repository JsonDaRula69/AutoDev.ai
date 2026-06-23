/**
 * Shared mock fixture for pi agent sessions.
 *
 * Exports mockCreateAgentSession — a `SessionFactory` compatible with
 * BackgroundManager — and mockSessionSubscribe, a controllable event emitter
 * for tests. Tests use these to drive the background manager without standing
 * up a real pi agent session.
 *
 * Usage:
 *   import { mockCreateAgentSession, mockSessionRegistry } from "../mocks/pi-session.js";
 *   const factory = mockCreateAgentSession();
 *   const manager = new BackgroundManager({ sessionFactory: factory, ... });
 *   const id = manager.spawn({ model: "ollama-cloud/glm-5.2:cloud", ... });
 *   const session = mockSessionRegistry.get(id);
 *   session.emit({ type: "agent_end", messages: [], willRetry: false });
 *   expect(manager.getTask(id)?.status).toBe("completed");
 *
 * Reset between tests with `resetSessionMocks()`.
 */
import { mock } from "bun:test";
import type { ManagedSession, SessionEvent, SessionFactory, SessionFactoryConfig } from "../../extensions/autodev/background/types.js";

type SessionListener = (event: SessionEvent) => void;

/**
 * A controllable mock session. Tests call `emit()` to push events to the
 * manager's subscribe listener, `abort()` / `dispose()` to verify lifecycle
 * cleanup, and inspect `aborted` / `disposed` / `listeners`.
 */
export class MockSession implements ManagedSession {
  readonly listeners = new Set<SessionListener>();
  aborted = false;
  disposed = false;
  readonly config: SessionFactoryConfig;

  constructor(config: SessionFactoryConfig) {
    this.config = config;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: SessionEvent): void {
    for (const l of this.listeners) {
      l(event);
    }
  }

  async abort(): Promise<void> {
    this.aborted = true;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}

/**
 * Registry of all sessions created by mockCreateAgentSession in the current
 * test. Tests look up sessions by task ID (the manager assigns sequential IDs
 * `bg-1`, `bg-2`, ...) to emit events at the right time.
 */
export const mockSessionRegistry: { readonly sessions: MockSession[] } = {
  sessions: [],
};

/**
 * Build a SessionFactory mock. Each call creates a MockSession, registers it
 * in `mockSessionRegistry`, and returns it. The factory itself is a `bun:test`
 * `mock()` so tests can assert call counts and args.
 *
 * `maxSessions` caps how many sessions the factory will create (default
 * Infinity). Beyond the cap, the factory throws — useful for testing the
 * concurrency-queue path where a queued task's session is never created
 * until a slot frees.
 */
export function mockCreateAgentSession(): SessionFactory {
  const factory = mock(
    (config: SessionFactoryConfig): Promise<ManagedSession> => {
      const session = new MockSession(config);
      mockSessionRegistry.sessions.push(session);
      return Promise.resolve(session);
    },
  );
  // Clear the registry on each new factory construction so tests start clean.
  mockSessionRegistry.sessions.length = 0;
  return factory as SessionFactory;
}

/** Reset all session mocks between tests. */
export function resetSessionMocks(): void {
  mockSessionRegistry.sessions.length = 0;
}