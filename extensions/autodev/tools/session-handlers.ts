/**
 * Session tool execute handlers: session_list, session_read, session_search.
 *
 * Split out from handlers.ts to keep both files under the 250 pure-LOC
 * ceiling. These handlers receive a `SessionDeps` injection so tests can drive
 * them with the mock SessionManager in test/mocks/session-manager.ts.
 */
import type { SessionEntry, SessionInfo } from "@earendil-works/pi-coding-agent";
import type { SessionDeps, ToolResult } from "./handlers.js";

// Re-export the SessionInfo type so callers don't need a second import.
export type { SessionInfo };

/** Extract text from a session entry's message, if it carries one. */
function entryText(entry: SessionEntry): string {
  if (entry.type !== "message") return "";
  const msg = entry.message;
  // AgentMessage is a union; only the standard LLM messages carry `content`.
  // BashExecutionMessage and other custom types don't, so narrow with a guard.
  if (!("content" in msg)) return "";
  const content = (msg as { content: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) =>
        part && typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join(" ");
  }
  return "";
}

/** Execute handler for the session_list tool. */
export async function executeSessionList(
  params: { readonly limit?: number },
  deps: SessionDeps,
  cwd: string,
): Promise<ToolResult> {
  const sessions = await deps.list(cwd);
  const limited = params.limit ? sessions.slice(0, params.limit) : sessions;
  const lines = limited.map(
    (s) =>
      `${s.id}\t${s.messageCount} msgs\t${s.created.toISOString()}\t${s.firstMessage.slice(0, 60)}`,
  );
  return {
    content: [
      {
        type: "text",
        text:
          lines.length === 0
            ? "No sessions found."
            : `${lines.length} session(s):\n${lines.join("\n")}`,
      },
    ],
    details: { count: limited.length, sessions: limited },
  };
}

/** Execute handler for the session_read tool. */
export async function executeSessionRead(
  params: { readonly session_id: string; readonly limit?: number },
  deps: SessionDeps,
  cwd: string,
): Promise<ToolResult> {
  const sessions = await deps.list(cwd);
  const target = sessions.find(
    (s) => s.id === params.session_id || s.path === params.session_id,
  );
  if (!target) {
    return {
      content: [{ type: "text", text: `Session not found: ${params.session_id}` }],
    };
  }
  const sm = deps.open(target.path);
  const entries = sm.getEntries();
  const messages = entries.filter((e) => e.type === "message");
  const limited = params.limit ? messages.slice(0, params.limit) : messages;
  const lines = limited.map((e) => {
    if (e.type !== "message") return "";
    const role = e.message.role ?? "unknown";
    return `[${e.timestamp}] ${role}: ${entryText(e).slice(0, 2000)}`;
  });
  return {
    content: [
      {
        type: "text",
        text:
          lines.length === 0
            ? `No messages in session ${params.session_id}.`
            : `${lines.length} message(s):\n${lines.join("\n")}`,
      },
    ],
    details: { count: limited.length },
  };
}

/** Maximum sessions scanned by session_search. */
const SEARCH_SESSION_LIMIT = 50;
/** Maximum characters of entry text considered per entry. */
const SEARCH_ENTRY_CHAR_LIMIT = 2000;

/** Execute handler for the session_search tool. */
export async function executeSessionSearch(
  params: { readonly query: string; readonly session_id?: string },
  deps: SessionDeps,
  cwd: string,
): Promise<ToolResult> {
  const needle = params.query.toLowerCase();
  const matches: Array<{
    readonly session_id: string;
    readonly role: string;
    readonly excerpt: string;
  }> = [];

  const sessions = await deps.list(cwd);
  const targets = params.session_id
    ? sessions.filter((s) => s.id === params.session_id || s.path === params.session_id)
    : sessions.slice(0, SEARCH_SESSION_LIMIT);

  for (const session of targets) {
    const sm = deps.open(session.path);
    const entries = sm.getEntries();
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const text = entryText(entry).slice(0, SEARCH_ENTRY_CHAR_LIMIT);
      if (text.toLowerCase().includes(needle)) {
        const idx = text.toLowerCase().indexOf(needle);
        const start = Math.max(0, idx - 40);
        const excerpt = text.slice(start, idx + params.query.length + 40);
        matches.push({
          session_id: session.id,
          role: entry.message.role ?? "unknown",
          excerpt,
        });
        if (matches.length >= 50) break;
      }
    }
    if (matches.length >= 50) break;
  }

  return {
    content: [
      {
        type: "text",
        text:
          matches.length === 0
            ? `No matches for "${params.query}".`
            : `${matches.length} match(es) for "${params.query}":\n${matches
                .map((m) => `[${m.session_id}] ${m.role}: ...${m.excerpt}...`)
                .join("\n")}`,
      },
    ],
    details: { count: matches.length, matches },
  };
}