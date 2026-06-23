/**
 * T13 skill loader tests — centralized `~/.AutoDev/skills/` resolution.
 *
 * Verifies that `resolveSkill` and `loadAllSkills` read skill SKILL.md
 * files from the centralized skills directory derived via `getAgentDir()`
 * (the `join(getAgentDir(), "..", "skills")` path), and that project-level
 * `.autodev/skills/` entries add to or override (same directory name) the
 * central set.
 *
 * Tests set `PI_CODING_AGENT_DIR` to a temp `<root>/agent` directory, so
 * `getAgentDir()` resolves there and central skills are planted at
 * `<root>/skills/`. Project skills are planted under a temp project dir.
 */
// @ts-nocheck
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempRoot: string;
let centralSkillsDir: string;
let projectRoot: string;
let savedEnv: string | undefined;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "autodev-t13-skills-"));
  // `getAgentDir()` returns `<PI_CODING_AGENT_DIR>`; central skills live at
  // `join(getAgentDir(), "..", "skills")` => `<tempRoot>/skills/`.
  centralSkillsDir = join(tempRoot, "skills");
  mkdirSync(centralSkillsDir, { recursive: true });
  projectRoot = mkdtempSync(join(tmpdir(), "autodev-t13-project-"));
  savedEnv = process.env["PI_CODING_AGENT_DIR"];
  process.env["PI_CODING_AGENT_DIR"] = join(tempRoot, "agent");
});

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env["PI_CODING_AGENT_DIR"];
  } else {
    process.env["PI_CODING_AGENT_DIR"] = savedEnv;
  }
  rmSync(tempRoot, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
});

/** Plant a skill directory + SKILL.md in the central dir. */
function writeCentralSkill(name: string, body: string): void {
  const dir = join(centralSkillsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`);
}

/** Plant a skill directory + SKILL.md in the project `.autodev/skills/` dir. */
function writeProjectSkill(name: string, body: string): void {
  const dir = join(projectRoot, ".autodev", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`);
}

import { resolveSkill, loadAllSkills, buildSkillPromptBlock } from "../skills.js";

// --- loadAllSkills happy path ----------------------------------------------

test("loadAllSkills returns all 5 central skills when present", () => {
  writeCentralSkill("autodev-triage", "Triage body");
  writeCentralSkill("autodev-plan", "Plan body");
  writeCentralSkill("autodev-implement", "Implement body");
  writeCentralSkill("autodev-review", "Review body");
  writeCentralSkill("autodev-deploy", "Deploy body");

  const skills = loadAllSkills(projectRoot);
  expect(skills.length).toBe(5);
  const names = skills.map((s) => s.name).sort();
  expect(names).toEqual(
    ["autodev-deploy", "autodev-implement", "autodev-plan", "autodev-review", "autodev-triage"],
  );
});

test("loadAllSkills marks source as central for central-only skills", () => {
  writeCentralSkill("autodev-triage", "Triage body");
  const skills = loadAllSkills(projectRoot);
  expect(skills.length).toBe(1);
  expect(skills[0].source).toBe("central");
  expect(skills[0].content).toContain("Triage body");
});

// --- Project override --------------------------------------------------------

test("loadAllSkills: project skill with same name overrides central", () => {
  writeCentralSkill("autodev-triage", "Central triage body");
  writeProjectSkill("autodev-triage", "PROJECT triage body");

  const skills = loadAllSkills(projectRoot);
  expect(skills.length).toBe(1);
  expect(skills[0].name).toBe("autodev-triage");
  expect(skills[0].source).toBe("project");
  expect(skills[0].content).toContain("PROJECT triage body");
  expect(skills[0].content).not.toContain("Central triage body");
});

test("loadAllSkills: project-only skill is added alongside central", () => {
  writeCentralSkill("autodev-triage", "Central triage body");
  writeProjectSkill("project-extra", "Extra project skill");

  const skills = loadAllSkills(projectRoot);
  expect(skills.length).toBe(2);
  const byName = new Map(skills.map((s) => [s.name, s]));
  expect(byName.get("autodev-triage")?.source).toBe("central");
  expect(byName.get("project-extra")?.source).toBe("project");
});

// --- No central dir ----------------------------------------------------------

test("loadAllSkills returns [] when neither central nor project skills dir exists", () => {
  rmSync(centralSkillsDir, { recursive: true, force: true });
  expect(existsSync(centralSkillsDir)).toBe(false);

  expect(loadAllSkills(projectRoot)).toEqual([]);
});

test("loadAllSkills returns project skills even when central dir is missing", () => {
  rmSync(centralSkillsDir, { recursive: true, force: true });
  writeProjectSkill("only-project", "Project body");

  const skills = loadAllSkills(projectRoot);
  expect(skills.length).toBe(1);
  expect(skills[0].name).toBe("only-project");
  expect(skills[0].source).toBe("project");
});

// --- resolveSkill ------------------------------------------------------------

test("resolveSkill returns project skill when project overrides central", () => {
  writeCentralSkill("autodev-triage", "Central triage body");
  writeProjectSkill("autodev-triage", "PROJECT triage body");

  const content = resolveSkill(projectRoot, "autodev-triage");
  expect(content).toContain("PROJECT triage body");
});

test("resolveSkill falls back to central when project has no override", () => {
  writeCentralSkill("autodev-triage", "Central triage body");

  const content = resolveSkill(projectRoot, "autodev-triage");
  expect(content).toContain("Central triage body");
});

test("resolveSkill returns undefined when skill is absent from both layers", () => {
  writeCentralSkill("autodev-triage", "Central triage body");
  expect(resolveSkill(projectRoot, "nonexistent")).toBeUndefined();
});

test("resolveSkill returns undefined when central dir is missing and no project skill", () => {
  rmSync(centralSkillsDir, { recursive: true, force: true });
  expect(resolveSkill(projectRoot, "nonexistent")).toBeUndefined();
});

// --- buildSkillPromptBlock ---------------------------------------------------

test("buildSkillPromptBlock includes loaded skills from central dir", () => {
  writeCentralSkill("autodev-triage", "Triage instructions");
  writeCentralSkill("autodev-review", "Review instructions");

  const block = buildSkillPromptBlock(projectRoot, ["autodev-triage", "autodev-review"]);
  expect(block).toContain("--- Loaded Skills ---");
  expect(block).toContain("## autodev-triage");
  expect(block).toContain("Triage instructions");
  expect(block).toContain("## autodev-review");
  expect(block).toContain("Review instructions");
  expect(block).toContain("--- End Skills ---");
});

test("buildSkillPromptBlock returns empty string for empty skillNames", () => {
  expect(buildSkillPromptBlock(projectRoot, [])).toBe("");
});

test("buildSkillPromptBlock returns empty string when no skills are found", () => {
  const block = buildSkillPromptBlock(projectRoot, ["nonexistent"]);
  expect(block).toBe("");
});

test("buildSkillPromptBlock prefers project override body", () => {
  writeCentralSkill("autodev-triage", "Central body");
  writeProjectSkill("autodev-triage", "PROJECT body");

  const block = buildSkillPromptBlock(projectRoot, ["autodev-triage"]);
  expect(block).toContain("PROJECT body");
  expect(block).not.toContain("Central body");
});