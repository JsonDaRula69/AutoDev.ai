/**
 * T12 skills port tests.
 *
 * Verifies the 5 ported skills under .pi/skills/ have valid YAML frontmatter,
 * substantive body content, are discoverable at the expected paths, and carry
 * no OmO / OpenCode references (which must be stripped during porting).
 */
import { test, expect } from "bun:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const SKILLS_DIR = join(process.cwd(), ".pi", "skills");
const EXPECTED_SKILLS = [
  "autodev-triage",
  "autodev-implement",
  "autodev-review",
  "autodev-deploy",
  "autodev-onboard",
] as const;

/** Parse YAML frontmatter (name + description) from a SKILL.md body. */
function parseFrontmatter(
  body: string,
): { name: string | undefined; description: string | undefined; raw: string } {
  const match = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { name: undefined, description: undefined, raw: body };
  const raw = match[1] ?? "";
  const nameMatch = raw.match(/^name:\s*(.+)$/m);
  const descMatch = raw.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
    raw,
  };
}

test("all 5 expected skill directories exist under .pi/skills/", () => {
  for (const skill of EXPECTED_SKILLS) {
    const dir = join(SKILLS_DIR, skill);
    expect(existsSync(dir)).toBe(true);
    expect(statSync(dir).isDirectory()).toBe(true);
  }
});

test("each skill directory contains a SKILL.md file", () => {
  for (const skill of EXPECTED_SKILLS) {
    const file = join(SKILLS_DIR, skill, "SKILL.md");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).isFile()).toBe(true);
  }
});

test("each SKILL.md has valid YAML frontmatter with name and description", () => {
  for (const skill of EXPECTED_SKILLS) {
    const body = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8");
    const fm = parseFrontmatter(body);
    expect(fm.name, `${skill} should have name`).toBeDefined();
    expect(fm.name).toBe(skill);
    expect(fm.description, `${skill} should have description`).toBeDefined();
    expect((fm.description ?? "").length).toBeGreaterThan(10);
  }
});

test("each SKILL.md has substantive body content (>100 chars)", () => {
  for (const skill of EXPECTED_SKILLS) {
    const body = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8");
    // Strip frontmatter, measure the body.
    const stripped = body.replace(/^---\n[\s\S]*?\n---\n/, "");
    expect(stripped.length).toBeGreaterThan(100);
  }
});

test("skills are discoverable: .pi/skills/ contains the 5 directories", () => {
  const entries = readdirSync(SKILLS_DIR);
  for (const skill of EXPECTED_SKILLS) {
    expect(entries).toContain(skill);
  }
});

test("no OmO or OpenCode references remain in ported skills", () => {
  const forbidden = ["oh-my-openagent", "work-with-pr", "ulw-loop", "OpenCode", "opencode"];
  for (const skill of EXPECTED_SKILLS) {
    const body = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8");
    for (const term of forbidden) {
      expect(body).not.toContain(term);
    }
  }
});

test("skills match the pi SKILL.md name rules (lowercase, hyphens, <=64 chars)", () => {
  for (const skill of EXPECTED_SKILLS) {
    expect(skill).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(skill.length).toBeLessThanOrEqual(64);
    expect(skill).not.toMatch(/--/); // no consecutive hyphens
    expect(skill.endsWith("-")).toBe(false);
  }
});

test("skill descriptions are within the 1024-char limit", () => {
  for (const skill of EXPECTED_SKILLS) {
    const body = readFileSync(join(SKILLS_DIR, skill, "SKILL.md"), "utf8");
    const fm = parseFrontmatter(body);
    expect((fm.description ?? "").length).toBeLessThanOrEqual(1024);
  }
});