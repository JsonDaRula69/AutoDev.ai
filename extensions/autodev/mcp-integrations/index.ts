/**
 * MCP integrations module — external service bridges.
 *
 * Registers Context7 (context7_query-docs, context7_resolve-library-id) and
 * Grep.app (grep_app_searchGitHub) tools via `pi.registerTool()`.
 *
 * These are lightweight wrappers that call the respective APIs. No API keys
 * are hardcoded — they are read from environment variables at call time.
 * Not Exa — AutoDev does not integrate Exa web search.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Context7 helpers
// ---------------------------------------------------------------------------

/** Context7 API base URL. */
const CONTEXT7_API = "https://api.context7.com/v1";

/**
 * Call the Context7 resolve-library-id endpoint.
 * Returns a JSON string with the result or an error.
 */
async function resolveLibraryId(libraryName: string, query: string): Promise<string> {
  try {
    const url = `${CONTEXT7_API}/resolve-library-id?libraryName=${encodeURIComponent(libraryName)}&query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return JSON.stringify({
        error: `Context7 resolve-library-id failed with status ${response.status}`,
        hint: "Check the library name and try again. The Context7 API may be temporarily unavailable.",
      });
    }

    const data = await response.json();
    return JSON.stringify({ result: "context7_resolve_library_id", data });
  } catch (err) {
    return JSON.stringify({
      error: `Context7 resolve-library-id request failed: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Ensure network connectivity. The Context7 API may be temporarily unavailable.",
    });
  }
}

/**
 * Call the Context7 query-docs endpoint.
 * Returns a JSON string with the result or an error.
 */
async function queryDocs(libraryId: string, query: string): Promise<string> {
  try {
    const url = `${CONTEXT7_API}/query-docs?libraryId=${encodeURIComponent(libraryId)}&query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return JSON.stringify({
        error: `Context7 query-docs failed with status ${response.status}`,
        hint: "Check the library ID and query. The Context7 API may be temporarily unavailable.",
      });
    }

    const data = await response.json();
    return JSON.stringify({ result: "context7_query_docs", data });
  } catch (err) {
    return JSON.stringify({
      error: `Context7 query-docs request failed: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Ensure network connectivity. The Context7 API may be temporarily unavailable.",
    });
  }
}

// ---------------------------------------------------------------------------
// Grep.app helpers
// ---------------------------------------------------------------------------

/** Grep.app API base URL. */
const GREP_APP_API = "https://grep.app/api";

/**
 * Call the Grep.app search endpoint.
 * Returns a JSON string with the result or an error.
 */
async function searchGitHub(
  query: string,
  options: {
    matchCase?: boolean | undefined;
    matchWholeWords?: boolean | undefined;
    useRegexp?: boolean | undefined;
    repo?: string | undefined;
    path?: string | undefined;
    language?: readonly string[] | undefined;
  },
): Promise<string> {
  try {
    const params = new URLSearchParams();
    params.set("q", query);
    if (options.matchCase) params.set("case", "true");
    if (options.matchWholeWords) params.set("words", "true");
    if (options.useRegexp) params.set("regexp", "true");
    if (options.repo) params.set("repo", options.repo);
    if (options.path) params.set("path", options.path);
    if (options.language && options.language.length > 0) {
      for (const lang of options.language) {
        params.append("lang", lang);
      }
    }

    const url = `${GREP_APP_API}/search?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return JSON.stringify({
        error: `Grep.app search failed with status ${response.status}`,
        hint: "The Grep.app API may be temporarily unavailable. Try a different query.",
      });
    }

    const data = await response.json();
    return JSON.stringify({ result: "grep_app_search", data });
  } catch (err) {
    return JSON.stringify({
      error: `Grep.app search request failed: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Ensure network connectivity. The Grep.app API may be temporarily unavailable.",
    });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI): void {
  // --- context7_resolve_library_id -----------------------------------------
  pi.registerTool({
    name: "context7_resolve_library_id",
    label: "Context7 Resolve Library ID",
    description:
      "Resolves a package/product name to a Context7-compatible library ID. Call this before context7_query_docs to get the correct library ID.",
    parameters: Type.Object({
      libraryName: Type.String({
        description: "Library name to search for (e.g., 'Next.js', 'React', 'Express.js')",
      }),
      query: Type.String({
        description: "The question or task you need help with, used to rank results by relevance",
      }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [
        {
          type: "text",
          text: await resolveLibraryId(
            params.libraryName as string,
            params.query as string,
          ),
        },
      ],
      details: {},
    }),
  });

  // --- context7_query_docs -------------------------------------------------
  pi.registerTool({
    name: "context7_query_docs",
    label: "Context7 Query Docs",
    description:
      "Retrieves and queries up-to-date documentation and code examples from Context7 for any programming library or framework. Use the library ID from context7_resolve_library_id.",
    parameters: Type.Object({
      libraryId: Type.String({
        description:
          "Context7-compatible library ID (e.g., '/vercel/next.js', '/facebook/react')",
      }),
      query: Type.String({
        description: "The question or task you need help with. Be specific and include relevant details.",
      }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [
        {
          type: "text",
          text: await queryDocs(
            params.libraryId as string,
            params.query as string,
          ),
        },
      ],
      details: {},
    }),
  });

  // --- grep_app_search_github ----------------------------------------------
  pi.registerTool({
    name: "grep_app_search_github",
    label: "Grep.app Search GitHub",
    description:
      "Search real-world code examples from over a million public GitHub repositories. Use for finding how other people solved the same problem.",
    parameters: Type.Object({
      query: Type.String({
        description: "The literal code pattern to search for (e.g., 'useState(', 'export function')",
      }),
      matchCase: Type.Optional(
        Type.Boolean({ description: "Whether the search should be case sensitive" }),
      ),
      matchWholeWords: Type.Optional(
        Type.Boolean({ description: "Whether to match whole words only" }),
      ),
      useRegexp: Type.Optional(
        Type.Boolean({ description: "Whether to interpret the query as a regular expression" }),
      ),
      repo: Type.Optional(
        Type.String({ description: "Filter by repository (e.g., 'facebook/react')" }),
      ),
      path: Type.Optional(
        Type.String({ description: "Filter by file path (e.g., 'src/components/Button.tsx')" }),
      ),
      language: Type.Optional(
        Type.Array(Type.String(), {
          description: "Filter by programming language (e.g., ['TypeScript', 'TSX'])",
        }),
      ),
    }),
    execute: async (_toolCallId, params) => ({
      content: [
        {
          type: "text",
          text: await searchGitHub(params.query as string, {
            matchCase: params.matchCase as boolean | undefined,
            matchWholeWords: params.matchWholeWords as boolean | undefined,
            useRegexp: params.useRegexp as boolean | undefined,
            repo: params.repo as string | undefined,
            path: params.path as string | undefined,
            language: params.language as readonly string[] | undefined,
          }),
        },
      ],
      details: {},
    }),
  });
}
