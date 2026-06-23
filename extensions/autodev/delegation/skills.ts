/**
 * Skill resolver — loads skill markdown files by name and returns their
 * content for injection into spawned agent system prompts.
 *
 * Searches skill directories in priority order:
 *   1. `.autodev/skills/<name>/SKILL.md`  (project skills)
 *   2. `.pi/skills/<name>/SKILL.md`        (pi skills)
 *
 * Each skill file is a Markdown file with optional YAML frontmatter. The
 * resolver strips the frontmatter and returns the body content.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Search paths for skill directories, in priority order. */
const SKILL_SEARCH_PATHS = [".autodev/skills", ".pi/skills"] as const;

/**
 * Parse YAML frontmatter from a skill markdown file.
 * Returns the body content (everything after the closing `---`).
 */
function stripFrontmatter(content: string): string {
  // YAML frontmatter is delimited by `---` on its own line at the start
  if (!content.startsWith("---")) return content;
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) return content;
  return content.slice(endIndex + 4).trimStart();
}

/**
 * Resolve a skill name to its file content.
 * Searches `.autodev/skills/<name>/SKILL.md` and `.pi/skills/<name>/SKILL.md`.
 * Returns `undefined` if the skill is not found in any search path.
 */
export function resolveSkill(projectRoot: string, name: string): string | undefined {
  for (const base of SKILL_SEARCH_PATHS) {
    const path = resolve(projectRoot, base, name, "SKILL.md");
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf8");
        return stripFrontmatter(raw);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Resolve multiple skill names and build a skill prompt block.
 *
 * Returns a string like:
 * ```
 * --- Loaded Skills ---
 *
 * ## autodev-triage
 * <skill body>
 *
 * ## autodev-review
 * <skill body>
 * --- End Skills ---
 * ```
 *
 * Returns an empty string when no skills are provided or none are found.
 */
export function buildSkillPromptBlock(projectRoot: string, skillNames: readonly string[]): string {
  if (skillNames.length === 0) return "";

  const blocks: string[] = [];
  for (const name of skillNames) {
    const content = resolveSkill(projectRoot, name);
    if (content !== undefined) {
      blocks.push(`## ${name}\n\n${content}`);
    }
  }

  if (blocks.length === 0) return "";

  return [
    "",
    "--- Loaded Skills ---",
    ...blocks,
    "--- End Skills ---",
    "",
  ].join("\n");
}
