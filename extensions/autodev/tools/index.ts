/**
 * Tools module — custom crew tools registration.
 *
 * Registers 5 AutoDev-specific tools via pi's `pi.registerTool()`:
 *   - todowrite:    4-element format-enforcing todo writer
 *   - look_at:      media-file analyzer for multimodal processing
 *   - session_list: list pi sessions for the current project
 *   - session_read: read messages from a pi session
 *   - session_search: full-text search across session messages
 *
 * These do NOT duplicate Magic Context's ctx_* tools. The handler logic lives
 * in `handlers.ts` so tests can drive it directly with mock dependencies.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  executeLookAt,
  executeTodowrite,
  type SessionDeps,
} from "./handlers.js";
import {
  executeSessionList,
  executeSessionRead,
  executeSessionSearch,
} from "./session-handlers.js";

/**
 * Build the SessionDeps object used by the session_* tools in production.
 * Production uses the real pi `SessionManager` static methods.
 */
function productionSessionDeps(): SessionDeps {
  return {
    list: (cwd: string) => SessionManager.list(cwd),
    open: (path: string) => SessionManager.open(path),
  };
}

/**
 * Register the 5 AutoDev custom tools with pi. The signature stays
 * `(pi: ExtensionAPI) => void` — index.ts must not change it.
 */
export function register(pi: ExtensionAPI): void {
  const sessionDeps = productionSessionDeps();

  // --- todowrite ----------------------------------------------------------
  pi.registerTool({
    name: "todowrite",
    label: "TodoWrite",
    description:
      "Write, update, and cancel todos. Enforces 4-element format: WHERE, HOW, to WHY, expect RESULT.",
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          content: Type.String({
            description: "Todo content: [WHERE] [HOW] to [WHY] - expect [RESULT]",
          }),
          status: Type.String({
            description: "Status",
            enum: ["pending", "in_progress", "completed", "cancelled"],
          }),
          priority: Type.String({
            description: "Priority",
            enum: ["high", "medium", "low"],
          }),
        }),
        { description: "Array of todo items" },
      ),
    }),
    execute: async (_toolCallId, params) =>
      executeTodowrite({
        todos: (params.todos as unknown as readonly {
          content: string;
          status: "pending" | "in_progress" | "completed" | "cancelled";
          priority: "high" | "medium" | "low";
        }[]),
      }),
  });

  // --- look_at ------------------------------------------------------------
  pi.registerTool({
    name: "look_at",
    label: "Look At",
    description: "Analyze media files (images, PDFs) using multimodal capabilities.",
    parameters: Type.Object({
      file_path: Type.Optional(Type.String({ description: "Path to file to analyze" })),
      file_paths: Type.Optional(
        Type.Array(Type.String(), { description: "Multiple file paths" }),
      ),
      goal: Type.String({ description: "What specific information to extract" }),
    }),
    execute: async (_toolCallId, params) => executeLookAt(params),
  });

  // --- session_list -------------------------------------------------------
  pi.registerTool({
    name: "session_list",
    label: "Session List",
    description: "List all pi sessions for the current project.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max sessions to return" })),
    }),
    execute: async (_toolCallId, params) =>
      executeSessionList(params, sessionDeps, process.cwd()),
  });

  // --- session_read -------------------------------------------------------
  pi.registerTool({
    name: "session_read",
    label: "Session Read",
    description: "Read messages from a pi session.",
    parameters: Type.Object({
      session_id: Type.String({ description: "Session ID to read" }),
      limit: Type.Optional(Type.Number({ description: "Max messages to return" })),
    }),
    execute: async (_toolCallId, params) => executeSessionRead(params, sessionDeps, process.cwd()),
  });

  // --- session_search -----------------------------------------------------
  pi.registerTool({
    name: "session_search",
    label: "Session Search",
    description: "Search across session messages for content.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      session_id: Type.Optional(Type.String({ description: "Limit to specific session" })),
    }),
    execute: async (_toolCallId, params) =>
      executeSessionSearch(params, sessionDeps, process.cwd()),
  });
}