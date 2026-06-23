/**
 * Shared mock fixture for Magic Context's 5 ctx_* tools.
 *
 * Exports mock implementations of ctx_search, ctx_memory, ctx_note,
 * ctx_expand, and ctx_reduce using `bun:test`'s `mock()` primitive.
 * Tests import these to verify the AutoDev extension's interaction
 * with Magic Context's tool interface without standing up a real
 * Magic Context SQLite database.
 *
 * Usage:
 *   import { mockCtxSearch, mockCtxMemory, ... } from "../mocks/magic-context.js";
 *   // ... drive a store* function, then assert on the mock ...
 *   expect(mockCtxMemory).toHaveBeenCalledWith("write", expect.objectContaining({
 *     category: "ARCHITECTURE",
 *   }));
 *
 * Reset between tests with `resetCtxMocks()` in a `beforeEach`.
 */
import { mock } from "bun:test";

/** Shape of a single ctx_search hit. */
export interface CtxSearchHit {
  readonly source: "memory" | "message" | "git_commit";
  readonly content: string;
  readonly score: number;
}

/** Shape returned by ctx_search. */
export interface CtxSearchResult {
  readonly results: readonly CtxSearchHit[];
  readonly total: number;
}

/** Shape returned by ctx_memory. */
export interface CtxMemoryResult {
  readonly id?: number;
  readonly action: string;
  readonly success: boolean;
  readonly memories?: readonly unknown[];
  readonly total?: number;
}

/** Shape returned by ctx_note. */
export interface CtxNoteResult {
  readonly success: boolean;
  readonly note_id: number;
}

/** Shape returned by ctx_expand. */
export interface CtxExpandResult {
  readonly content: string;
  readonly messages: readonly unknown[];
}

/** Shape returned by ctx_reduce. */
export interface CtxReduceResult {
  readonly success: boolean;
  readonly dropped: string;
}

/**
 * ctx_search mock — returns two canned hits (one memory, one message)
 * whose content echoes the query so tests can assert query formation.
 */
export const mockCtxSearch = mock(
  (query: string, options?: { sources?: string[]; limit?: number }): Promise<CtxSearchResult> => {
    void options;
    return Promise.resolve({
      results: [
        { source: "memory", content: `Mocked memory result for: ${query}`, score: 0.85 },
        { source: "message", content: `Mocked message result for: ${query}`, score: 0.72 },
      ],
      total: 2,
    });
  },
);

/**
 * ctx_memory mock — handles write/read/list/update/archive/merge actions.
 * `write` returns a fixed id (999) so tests can assert id assignment.
 * `list`/`read` return empty memory arrays.
 */
export const mockCtxMemory = mock(
  (action: string, options?: Record<string, unknown>): Promise<CtxMemoryResult> => {
    if (action === "write") {
      return Promise.resolve({ id: 999, action: "write", success: true });
    }
    if (action === "list" || action === "read") {
      return Promise.resolve({ action, success: true, memories: [], total: 0 });
    }
    return Promise.resolve({ action, success: true });
  },
);

/** ctx_note mock — accepts any action, returns a fixed note_id of 1. */
export const mockCtxNote = mock(
  (_action: string, _options?: Record<string, unknown>): Promise<CtxNoteResult> => {
    return Promise.resolve({ success: true, note_id: 1 });
  },
);

/** ctx_expand mock — returns canned expanded content. */
export const mockCtxExpand = mock(
  (options: { start?: number; end?: number; message?: number }): Promise<CtxExpandResult> => {
    void options;
    return Promise.resolve({ content: "Mocked expanded content", messages: [] });
  },
);

/** ctx_reduce mock — echoes back the dropped tag range. */
export const mockCtxReduce = mock(
  (options: { drop: string }): Promise<CtxReduceResult> => {
    return Promise.resolve({ success: true, dropped: options.drop });
  },
);

/**
 * Reset all 5 mocks between tests. Call in `beforeEach` to keep
 * `toHaveBeenCalledTimes` / `toHaveBeenCalledWith` assertions isolated.
 */
export function resetCtxMocks(): void {
  mockCtxSearch.mockClear();
  mockCtxMemory.mockClear();
  mockCtxNote.mockClear();
  mockCtxExpand.mockClear();
  mockCtxReduce.mockClear();
}

/** All 5 ctx_* mocks as a tuple, for aggregate assertions. */
export const ALL_CTX_MOCKS = [
  mockCtxSearch,
  mockCtxMemory,
  mockCtxNote,
  mockCtxExpand,
  mockCtxReduce,
] as const;