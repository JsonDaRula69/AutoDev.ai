/**
 * Mock SessionManager fixture for session_* tool tests.
 *
 * Distinct from test/mocks/pi-session.ts (Plan 2 T8), which mocks
 * `createAgentSession`. This mock implements the narrow SessionDeps interface
 * (list / open / getEntries) used by the AutoDev session tools, so tests can
 * drive `executeSessionList`, `executeSessionRead`, and `executeSessionSearch`
 * without touching real pi session files.
 *
 * Usage:
 *   import { createMockSessionDeps, type MockSessionData } from "../mocks/session-manager.js";
 *   const deps = createMockSessionDeps([
 *     { id: "ses_1", path: "/p/ses_1.jsonl", entries: [...] },
 *   ]);
 *   const result = await executeSessionList({}, deps, "/cwd");
 */
import type { SessionEntry, SessionInfo } from "@earendil-works/pi-coding-agent";

/** A single mock session with its entries pre-populated. */
export interface MockSessionData {
  readonly id: string;
  readonly path: string;
  readonly messageCount?: number;
  readonly firstMessage?: string;
  readonly created?: Date;
  readonly modified?: Date;
  readonly entries?: readonly SessionEntry[];
}

/**
 * Build a SessionDeps-compatible mock from an array of mock sessions.
 * `list(cwd)` returns SessionInfo objects synthesized from the mock data;
 * `open(path)` returns an object whose `getEntries()` yields the matching
 * session's entries (or [] if not found).
 */
export function createMockSessionDeps(
  sessions: readonly MockSessionData[] = [],
): {
  list: (cwd: string) => Promise<readonly SessionInfo[]>;
  open: (path: string) => { getEntries: () => readonly SessionEntry[] };
} {
  return {
    list: (_cwd: string) => {
      const infos: SessionInfo[] = sessions.map((s) => ({
        path: s.path,
        id: s.id,
        cwd: _cwd,
        created: s.created ?? new Date("2026-01-01T00:00:00Z"),
        modified: s.modified ?? new Date("2026-01-01T00:00:00Z"),
        messageCount: s.messageCount ?? s.entries?.filter((e) => e.type === "message").length ?? 0,
        firstMessage: s.firstMessage ?? "",
        allMessagesText: "",
      }));
      return Promise.resolve(infos);
    },
    open: (path: string) => {
      const session = sessions.find((s) => s.id === path || s.path === path);
      const entries = session?.entries ?? [];
      return {
        getEntries: () => entries,
      };
    },
  };
}

/** Build a mock message entry — the entry type the session_* tools inspect. */
export function mockMessageEntry(
  id: string,
  parentId: string | null,
  role: string,
  content: string,
  timestamp = "2026-01-01T00:00:00Z",
): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: {
      role,
      content,
    },
  } as SessionEntry;
}