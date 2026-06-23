/**
 * Agent definition loader — parses `.pi/agents/*.md` frontmatter.
 *
 * Each pi agent file is Markdown with YAML frontmatter delimited by `---`
 * fences. The frontmatter carries `name`, `description`, `tools` (comma-
 * separated string), and `model` (provider-qualified string). The body after
 * the closing `---` fence is the agent's system prompt.
 *
 * The delegation module uses this to spawn specific crew agents when
 * `subagent_type` is provided to the `task` tool.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/** Parsed agent definition ready for delegation. */
export interface AgentDefinition {
  readonly name: string;
  readonly model: string;
  /** Tools as an array of tool-name strings (split from the comma-separated frontmatter field). */
  readonly tools: readonly string[];
  /** Full system prompt — the Markdown body after the frontmatter fence. */
  readonly systemPrompt: string;
}

/** Parse the YAML frontmatter block (flat key:value lines, no nesting). */
function parseFrontmatter(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null || match[1] === undefined) return result;
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

/** Split a comma-separated tools string into a trimmed, non-empty array. */
function parseTools(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Extract the system prompt body — everything after the closing `---` fence. */
function extractBody(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (match === null || match[1] === undefined) return text.trim();
  return match[1].trim();
}

/**
 * Load a single agent definition from `.pi/agents/<name>.md`.
 *
 * Returns `undefined` when the file is missing or has no `model` frontmatter
 * field (the minimum we need to spawn a session).
 */
export function loadAgent(projectRoot: string, name: string): AgentDefinition | undefined {
  const path = resolve(projectRoot, ".pi/agents", `${name}.md`);
  if (!existsSync(path)) return undefined;

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }

  const fm = parseFrontmatter(text);
  const agentName = fm["name"] ?? name;
  const model = fm["model"];
  if (model === undefined) return undefined;
  const toolsRaw = fm["tools"] ?? "";
  return {
    name: agentName,
    model,
    tools: parseTools(toolsRaw),
    systemPrompt: extractBody(text),
  };
}

/**
 * List all agent names available in `.pi/agents/` (filenames without the
 * `.md` extension). Returns an empty array when the directory is missing.
 */
export function listAgentNames(projectRoot: string): readonly string[] {
  const dir = resolve(projectRoot, ".pi/agents");
  if (!existsSync(dir)) return [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return entries.map((f) => f.slice(0, -3));
}