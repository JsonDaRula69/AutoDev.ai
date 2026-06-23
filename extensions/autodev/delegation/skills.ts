/**
 * Skill resolver — loads skill markdown files by name and returns their
 * content for injection into spawned agent system prompts.
 *
 * Skills are resolved from two layers:
 *
 *   1. Central default: `join(getAgentDir(), "..", "skills")` — i.e.
 *      `~/.AutoDev/skills/` when `PI_CODING_AGENT_DIR` is set (T1 env wiring).
 *      This is the per-user global skill store shipped with the AutoDev
 *      install.
 *   2. Project override: `<projectRoot>/.autodev/skills/` — project-local
 *      skills that add to, or override (same directory name), the central
 *      set.
 *
 * Each skill lives in a directory `<name>/SKILL.md`. The `SKILL.md` file is
 * Markdown with optional YAML frontmatter; the resolver strips the
 * frontmatter and returns the body content.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Resolve the central skills directory.
 *
 * Skills live at `join(getAgentDir(), "..", "skills")` — the sibling
 * `skills/` directory of the pi agent config dir. `getAgentDir()` honors
 * the `PI_CODING_AGENT_DIR` env override, so tests can redirect
 * resolution to a temp directory without monkey-patching.
 */
function getCentralSkillsDir(): string {
  return join(getAgentDir(), "..", "skills");
}

/**
 * Resolve the project-level skills directory.
 *
 * Project skills live at `<projectRoot>/.autodev/skills/` and add to or
 * override (same directory name) the central skills.
 */
function getProjectSkillsDir(projectRoot: string): string {
  return resolve(projectRoot, ".autodev", "skills");
}

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

/** Read and strip a SKILL.md file, returning `undefined` on any read error. */
function readSkillFile(path: string): string | undefined {
  try {
    const raw = readFileSync(path, "utf8");
    return stripFrontmatter(raw);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a skill name to its file content.
 *
 * Checks the project override dir first (`<projectRoot>/.autodev/skills/
 * <name>/SKILL.md`), then falls back to the central skills dir
 * (`join(getAgentDir(), "..", "skills", <name>, "SKILL.md")`). Returns
 * `undefined` if the skill is not found in either layer.
 */
export function resolveSkill(projectRoot: string, name: string): string | undefined {
  const projectPath = join(getProjectSkillsDir(projectRoot), name, "SKILL.md");
  if (existsSync(projectPath)) {
    const content = readSkillFile(projectPath);
    if (content !== undefined) return content;
  }

  const centralPath = join(getCentralSkillsDir(), name, "SKILL.md");
  if (existsSync(centralPath)) {
    return readSkillFile(centralPath);
  }

  return undefined;
}

/** A loaded skill entry with its origin layer. */
export interface SkillEntry {
  /** Skill directory name. */
  readonly name: string;
  /** Body content with frontmatter stripped. */
  readonly content: string;
  /** Which layer the winning copy came from. */
  readonly source: "central" | "project";
}

/**
 * Load every skill from the central dir, then overlay project skills.
 *
 * Central skills are loaded first; project skills with the same directory
 * name override the central copy (project wins). Returns the merged list
 * in insertion order (central names first, then any project-only names).
 * Returns `[]` when neither layer exists.
 */
export function loadAllSkills(projectRoot: string): readonly SkillEntry[] {
  const merged = new Map<string, SkillEntry>();

  const centralDir = getCentralSkillsDir();
  if (existsSync(centralDir)) {
    for (const name of listSkillDirs(centralDir)) {
      const content = readSkillFile(join(centralDir, name, "SKILL.md"));
      if (content !== undefined) {
        merged.set(name, { name, content, source: "central" });
      }
    }
  }

  const projectDir = getProjectSkillsDir(projectRoot);
  if (existsSync(projectDir)) {
    for (const name of listSkillDirs(projectDir)) {
      const content = readSkillFile(join(projectDir, name, "SKILL.md"));
      if (content !== undefined) {
        merged.set(name, { name, content, source: "project" });
      }
    }
  }

  return [...merged.values()];
}

/** List immediate subdirectory names that contain a `SKILL.md` file. */
function listSkillDirs(dir: string): readonly string[] {
  let entries: readonly import("node:fs").Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (existsSync(join(dir, entry.name, "SKILL.md"))) {
      names.push(entry.name);
    }
  }
  return names;
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