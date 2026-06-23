/**
 * Context injection for AutoDev.
 *
 * Loads project context files (AGENTS.md, CONTEXT.md, .autodev/memory/*.md)
 * and exposes them as virtual agents-files for pi's system prompt assembly.
 *
 * The extension cannot construct the DefaultResourceLoader itself (sessions are
 * created by pi, not the extension), so context injection happens via the
 * `before_agent_start` event: we append the AutoDev context block to the
 * chained system prompt. This augments pi's default context loading rather
 * than replacing it.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";

/** A virtual context file contributed to the system prompt. */
export interface ContextFile {
  readonly path: string;
  readonly content: string;
}

const MEMORY_GLOB_DIR = ".autodev/memory";

/** Safely read a file, returning `undefined` when it is missing or unreadable. */
function readOptional(absPath: string): string | undefined {
  if (!existsSync(absPath)) return undefined;
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return undefined;
  }
}

/** Discover every `.md` file under `.autodev/memory/` (non-recursive). */
function listMemoryMarkdown(projectRoot: string): readonly string[] {
  const dir = resolve(projectRoot, MEMORY_GLOB_DIR);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Collect all AutoDev context files for the given project root.
 *
 * Order is deterministic: AGENTS.md, CONTEXT.md, then memory files in sorted
 * filename order. Missing files are silently skipped so a fresh checkout with
 * no `.autodev/memory/` still loads cleanly.
 */
export function loadContextFiles(projectRoot: string): readonly ContextFile[] {
  const files: ContextFile[] = [];

  const agents = readOptional(resolve(projectRoot, "AGENTS.md"));
  if (agents !== undefined) {
    files.push({ path: "/autodev/AGENTS.md", content: agents });
  }

  const context = readOptional(resolve(projectRoot, "CONTEXT.md"));
  if (context !== undefined) {
    files.push({ path: "/autodev/CONTEXT.md", content: context });
  }

  for (const name of listMemoryMarkdown(projectRoot)) {
    const content = readOptional(resolve(projectRoot, MEMORY_GLOB_DIR, name));
    if (content !== undefined) {
      files.push({ path: `/autodev/memory/${name}`, content });
    }
  }

  return files;
}

/** Render the collected context files into a single system-prompt block. */
export function renderContextBlock(files: readonly ContextFile[]): string {
  if (files.length === 0) return "";
  const sections = files.map(
    (f) => `<!-- autodev-context: ${f.path} -->\n${f.content}`,
  );
  return `\n\n# AutoDev Project Context\n\n${sections.join("\n\n")}\n`;
}

/**
 * Build the augmented system prompt for a `before_agent_start` handler.
 *
 * Appends the AutoDev context block to the existing chained system prompt.
 * Returns the original prompt unchanged when no context files are present.
 */
export function augmentSystemPrompt(
  event: BeforeAgentStartEvent,
  projectRoot: string,
): string {
  const files = loadContextFiles(projectRoot);
  const block = renderContextBlock(files);
  if (block === "") return event.systemPrompt;
  return `${event.systemPrompt}${block}`;
}