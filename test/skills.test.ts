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
  "autodev-onboarding-harbor-master",
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

// --- Step 4: Harbor Master skill-specific audit tests ---

test("autodev-onboarding-harbor-master uses subagent_type: not agent:", () => {
  const body = readFileSync(
    join(SKILLS_DIR, "autodev-onboarding-harbor-master", "SKILL.md"),
    "utf8",
  );
  // The skill should use `subagent_type:` for dispatches, never `agent:`.
  // `agent:` may appear in prose (e.g. "dispatch Conseil agents") but never
  // as a code-style dispatch key.
  const agentDispatchMatches = body.match(/\bagent:\s*"/g);
  // Allow agent: in prose context like "dispatch Conseil agents" but not
  // as a dispatch key. We check that there's no `agent: "conseil"` pattern.
  expect(body).not.toContain('agent: "conseil"');
  expect(body).not.toContain('agent: "explore"');
  expect(body).not.toContain('agent: "navigator"');
});

test("autodev-onboarding-harbor-master uses prompt: not description: for dispatches", () => {
  const body = readFileSync(
    join(SKILLS_DIR, "autodev-onboarding-harbor-master", "SKILL.md"),
    "utf8",
  );
  // The skill should use `prompt:` for dispatch task descriptions, not `description:`.
  // `description:` in YAML frontmatter is fine — this checks the body text.
  // Look for the dispatch pattern: `subagent_type:` followed by a task description.
  // If `description:` appears in a code block or dispatch context, flag it.
  const bodyAfterFrontmatter = body.replace(/^---\n[\s\S]*?\n---\n/, "");
  // Check that any `description:` in the body is NOT in a dispatch context
  // (i.e., not immediately after a subagent_type line or inside a task() call)
  const dispatchDescriptionMatches = bodyAfterFrontmatter.match(
    /subagent_type:.*\n.*description:/g,
  );
  expect(dispatchDescriptionMatches).toBeNull();
});

test("autodev-onboarding-harbor-master references onboarding_dispatch_hint()", () => {
  const body = readFileSync(
    join(SKILLS_DIR, "autodev-onboarding-harbor-master", "SKILL.md"),
    "utf8",
  );
  expect(body).toContain("onboarding_dispatch_hint");
});

test("autodev-onboarding-harbor-master marks ideation team as future capability", () => {
  const body = readFileSync(
    join(SKILLS_DIR, "autodev-onboarding-harbor-master", "SKILL.md"),
    "utf8",
  );
  expect(body).toContain("future capability");
});

test("autodev-onboarding-harbor-master dispatches external research to Explore, not Navigator", () => {
  const body = readFileSync(
    join(SKILLS_DIR, "autodev-onboarding-harbor-master", "SKILL.md"),
    "utf8",
  );
  // External research should reference Explore, not Navigator
  expect(body).toContain("Explore");
  // Navigator should not appear as a dispatch target for research
  // (Navigator may appear in prose about the crew, but not as a dispatch instruction)
  const navigatorDispatchMatch = body.match(/dispatch.*Navigator/i);
  expect(navigatorDispatchMatch).toBeNull();
});

test("old autodev-onboard skill directory no longer exists", () => {
  const oldDir = join(SKILLS_DIR, "autodev-onboard");
  expect(existsSync(oldDir)).toBe(false);
});