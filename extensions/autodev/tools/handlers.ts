/**
 * Tool execute handlers for AutoDev custom tools.
 *
 * Each handler is an exported async function that takes typed params and an
 * optional dependency object. `register()` in `index.ts` wires these to
 * `pi.registerTool()` with real dependencies; tests call them directly with
 * mock dependencies. This split keeps the handlers testable without spinning
 * up a real pi session.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extname } from "node:path";
import type { SessionEntry, SessionInfo } from "@earendil-works/pi-coding-agent";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";

/** A single todo item enforced by the todowrite tool. */
export interface TodoItem {
  readonly content: string;
  readonly status: "pending" | "in_progress" | "completed" | "cancelled";
  readonly priority: "high" | "medium" | "low";
}

export interface ToolResult {
  content: (TextContent | ImageContent)[];
  details: Record<string, unknown>;
  isError?: boolean;
}

const VISUAL_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/** Injectable session access used by the three session_* tools. */
export interface SessionDeps {
  /** List sessions for a working directory. Returns SessionInfo[]. */
  readonly list: (cwd: string) => Promise<readonly SessionInfo[]>;
  /** Open a session file by path; returns an object exposing getEntries(). */
  readonly open: (path: string) => { readonly getEntries: () => readonly SessionEntry[] };
}

// ---------------------------------------------------------------------------
// todowrite
// ---------------------------------------------------------------------------

/**
 * Validate that a todo content string matches the 4-element format:
 * [WHERE] [HOW] to [WHY] - expect [RESULT]
 *
 * The format requires the literal separators " to " and " - expect " so each
 * of the four elements is present and non-empty. Exported for unit testing.
 */
export function isValidTodoFormat(content: string): boolean {
  const toIdx = content.indexOf(" to ");
  const expectIdx = content.indexOf(" - expect ");
  if (toIdx <= 0 || expectIdx <= toIdx + 4) return false;
  // Ensure something follows " - expect ".
  return expectIdx + 10 < content.length;
}

/** In-memory todo store. Replaced on each todowrite call. */
let todoStore: readonly TodoItem[] = [];

/** Read-only access to the current todo store (for tests and inspection). */
export function getTodoStore(): readonly TodoItem[] {
  return todoStore;
}

/** Execute handler for the todowrite tool. */
export async function executeTodowrite(params: {
  readonly todos: readonly TodoItem[];
}): Promise<ToolResult> {
  for (const todo of params.todos) {
    if (!isValidTodoFormat(todo.content)) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid todo format. Expected: [WHERE] [HOW] to [WHY] - expect [RESULT]. Got: "${todo.content}"`,
          },
        ],
        details: {},
        isError: true,
      };
    }
  }
  todoStore = params.todos.slice();
  return {
    content: [{ type: "text", text: `Wrote ${todoStore.length} todo(s).` }],
    details: { todos: todoStore, count: todoStore.length },
  };
}

// ---------------------------------------------------------------------------
// look_at
// ---------------------------------------------------------------------------

/** Map a file extension to a MIME type for multimodal content. */
function mediaTypeFor(ext: string): string {
  const lower = ext.toLowerCase();
  switch (lower) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/** Execute handler for the look_at tool. */
export async function executeLookAt(params: {
  readonly file_path?: string;
  readonly file_paths?: readonly string[];
  readonly goal: string;
}): Promise<ToolResult> {
  const paths = params.file_paths ?? (params.file_path ? [params.file_path] : []);
  if (paths.length === 0) {
    return {
      content: [{ type: "text", text: "look_at requires file_path or file_paths." }],
      details: {},
      isError: true,
    };
  }
  const blocks: (TextContent | ImageContent)[] = [];
  const summaries: string[] = [];
  for (const rawPath of paths) {
    const abs = resolve(rawPath);
    let buffer: Buffer;
    try {
      buffer = await readFile(abs);
    } catch {
      return {
        content: [{ type: "text", text: `Cannot read file: ${rawPath}` }],
        details: {},
        isError: true,
      };
    }
    const mediaType = mediaTypeFor(extname(rawPath));
    summaries.push(`${rawPath} (${mediaType})`);
    if (VISUAL_MEDIA_TYPES.has(mediaType)) {
      blocks.push({
        type: "image",
        data: buffer.toString("base64"),
        mimeType: mediaType,
      });
    }
  }
  blocks.unshift({
    type: "text",
    text: `Analyzing ${summaries.join(", ")} for: ${params.goal}`,
  });
  return {
    content: blocks,
    details: { files: summaries, goal: params.goal },
  };
}
