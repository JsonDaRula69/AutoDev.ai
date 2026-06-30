/**
 * Agent definition loader — parses central `~/.AutoDev/agents/*.md` frontmatter.
 *
 * Each pi agent file is Markdown with YAML frontmatter delimited by `---`
 * fences. The frontmatter carries `name`, `description`, `tools` (comma-
 * separated string), and `model` (provider-qualified string). The body after
 * the closing `---` fence is the agent's system prompt.
 *
 * Agent files are read from the centralized agent directory derived via
 * `getAgentDir()`: `join(getAgentDir(), "..", "agents")`. The `projectRoot`
 * parameter on every public function is accepted for API compatibility but
 * is NOT used for agent resolution — agents are a global, per-user resource.
 *
 * The delegation module uses this to spawn specific crew agents when
 * `subagent_type` is provided to the `task` tool.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, parseCommaList, extractBody, getCentralAgentsDir } from "../shared/agent-parser.js";

/** Parsed agent definition ready for delegation. */
export interface AgentDefinition {
  readonly name: string;
  readonly model: string;
  readonly tools: readonly string[];
  readonly systemPrompt: string;
}

export function loadAgent(_projectRoot: string, name: string): AgentDefinition | undefined {
  const path = join(getCentralAgentsDir(), `${name}.md`);
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
    tools: parseCommaList(toolsRaw),
    systemPrompt: extractBody(text),
  };
}

/**
 * List all agent names available in the central `agents/` directory
 * (filenames without the `.md` extension). The `projectRoot` parameter is
 * accepted for API compatibility but is not used for resolution. Returns
 * an empty array when the directory is missing.
 */
export function listAgentNames(_projectRoot: string): readonly string[] {
  const dir = getCentralAgentsDir();
  if (!existsSync(dir)) return [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return entries.map((f) => f.slice(0, -3));
}