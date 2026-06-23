/**
 * comment-checker — strips AI-slop from comments after write/edit tool calls.
 *
 * Strategy: a pure `stripSlop()` function scans written content for
 * AI-generated comment patterns and rewrites or removes them. The
 * `tool_result` handler inspects write/edit results, applies the stripper
 * to the content that was written, and — when slop is found — emits a
 * notification. The write itself is never blocked; slop is stripped and
 * good code passes through.
 *
 * Detected patterns (non-exhaustive; grown in later sub-plans):
 *  - "This function does X" (restates the function name)
 *  - "First, we ..." / "Next, we ..." (narrative filler)
 *  - "Note that ..." (obvious observation)
 *  - "TODO: implement ..." with no owner/date
 *  - "This is a ..." on a declaration that already names itself
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ExtensionAPI, ToolResultEvent } from "@earendil-works/pi-coding-agent";

/** A single slop pattern match found in written content. */
export interface SlopMatch {
  readonly line: number;
  readonly column: number;
  readonly matched: string;
  readonly pattern: SlopPattern;
  readonly suggestion: string;
}

/** Identifier for the kind of slop detected. */
export type SlopPattern =
  | "restates-name"
  | "narrative-filler"
  | "obvious-observation"
  | "vague-todo"
  | "declaration-restates-name";

/** Result of scanning a body of code. */
export interface SlopReport {
  readonly source: string;
  readonly cleaned: string;
  readonly matches: readonly SlopMatch[];
  readonly stripped: number;
}

interface PatternDef {
  readonly pattern: SlopPattern;
  readonly regex: RegExp;
  readonly suggestion: string;
}

const PATTERNS: readonly PatternDef[] = [
  {
    pattern: "restates-name",
    regex: /\/\/\s*This\s+(function|method|class|module)\s+\w+/gi,
    suggestion: "Remove the comment — the declaration already names itself.",
  },
  {
    pattern: "narrative-filler",
    regex: /\/\/\s*(First|Next|Then|Finally),?\s+we\s+/gi,
    suggestion: "Drop the narrative filler; comments explain why, not the story.",
  },
  {
    pattern: "obvious-observation",
    regex: /\/\/\s*Note\s+that\s+/gi,
    suggestion: "Remove 'Note that' — if it is obvious, the comment is noise.",
  },
  {
    pattern: "vague-todo",
    regex: /\/\/\s*TODO:\s*implement\b/gi,
    suggestion: "Replace with a concrete TODO including owner and due date.",
  },
  {
    pattern: "declaration-restates-name",
    regex: /\/\*\*\s*This\s+is\s+a\s+\w+/gi,
    suggestion: "Rewrite the doc comment to describe the contract, not the name.",
  },
];

/** Scan a single line for all pattern matches. */
function scanLine(
  line: string,
  lineIndex: number,
): readonly SlopMatch[] {
  const matches: SlopMatch[] = [];
  for (const def of PATTERNS) {
    def.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = def.regex.exec(line)) !== null) {
      matches.push({
        line: lineIndex + 1,
        column: m.index + 1,
        matched: m[0],
        pattern: def.pattern,
        suggestion: def.suggestion,
      });
      if (m.index === def.regex.lastIndex) def.regex.lastIndex++;
    }
  }
  return matches;
}

/** Strip a matched slop comment from a line. */
function stripFromLine(line: string, match: SlopMatch): string {
  // Comment-only line: drop the whole line.
  const commentOnly = /^\s*\/\/.*$/;
  if (commentOnly.test(line)) {
    return "";
  }
  // Inline trailing comment: cut from the match onward.
  const idx = match.column - 1;
  return line.slice(0, idx).trimEnd();
}

/**
 * Scan `source` for AI-slop comment patterns and return a report with the
 * cleaned content. Pure function — no side effects, safe to test directly.
 */
export function stripSlop(source: string): SlopReport {
  const lines = source.split("\n");
  const allMatches: SlopMatch[] = [];
  const cleanedLines: string[] = lines.slice();

  for (let i = 0; i < lines.length; i++) {
    const lineMatches = scanLine(lines[i] ?? "", i);
    for (const match of lineMatches) {
      allMatches.push(match);
      cleanedLines[i] = stripFromLine(cleanedLines[i] ?? "", match);
    }
  }

  const cleaned = cleanedLines.join("\n");
  return {
    source,
    cleaned,
    matches: allMatches,
    stripped: allMatches.length,
  };
}

/** Extract the written content from a write or edit tool result. */
function extractWrittenContent(event: ToolResultEvent): string | undefined {
  if (event.toolName !== "write" && event.toolName !== "edit") return undefined;
  const input = event.input as { content?: string; edits?: Array<{ newText?: string }> };
  if (typeof input.content === "string") return input.content;
  if (Array.isArray(input.edits)) {
    return input.edits.map((e) => e?.newText ?? "").join("\n");
  }
  return undefined;
}

export function register(pi: ExtensionAPI): void {
  pi.on("tool_result", async (event, ctx) => {
    const content = extractWrittenContent(event);
    if (content === undefined) return undefined;

    const report = stripSlop(content);
    if (report.stripped === 0) return undefined;

    // Extract file path from the tool result event
    const input = event.input as { filePath?: string };
    const filePath = input?.filePath;

    if (filePath) {
      try {
        // Read the file from disk
        const diskContent = readFileSync(filePath, "utf8");
        // Apply stripSlop to the actual file content
        const diskReport = stripSlop(diskContent);
        if (diskReport.stripped > 0) {
          // Write the cleaned content back
          writeFileSync(filePath, diskReport.cleaned, "utf8");
          ctx.ui.notify(
            `comment-checker: stripped ${diskReport.stripped} slop pattern(s) from ${filePath}`,
            "warning",
          );
          for (const m of diskReport.matches) {
            ctx.ui.notify(
              `  L${m.line}:${m.column} [${m.pattern}] ${m.suggestion}`,
              "info",
            );
          }
          return undefined;
        }
      } catch {
        // If we can't read/write the file, fall through to the original notification
      }
    }

    // Fallback: original notification behavior
    ctx.ui.notify(
      `comment-checker: detected ${report.stripped} slop pattern(s) in ${event.toolName} result`,
      "warning",
    );
    for (const m of report.matches) {
      ctx.ui.notify(
        `  L${m.line}:${m.column} [${m.pattern}] ${m.suggestion}`,
        "info",
      );
    }
    return undefined;
  });
}