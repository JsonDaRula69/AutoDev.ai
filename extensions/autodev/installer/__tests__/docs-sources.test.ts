import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocsSources, toggleDocsSources } from "../docs-sources.js";

let tempDir: string;
let yamlPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "docs-sources-"));
  yamlPath = join(tempDir, "docs-sources.yaml");
});

afterEach(() => {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { }
});

const SAMPLE_YAML = `# Central documentation seeding sources.
sources:
  - name: pi
    type: git-sparse
    url: https://github.com/earendil-works/pi
    active: true

# - name: omo
#   type: git-sparse
#   url: https://github.com/code-yeongyu/oh-my-openagent
#   active: true

# - name: bun
#   type: git-sparse
#   active: false
`;

test("parseDocsSources finds active and commented sources", () => {
  writeFileSync(yamlPath, SAMPLE_YAML);
  const entries = parseDocsSources(yamlPath);
  expect(entries.length).toBe(3);
  expect(entries[0]!.name).toBe("pi");
  expect(entries[0]!.active).toBe(true);
  expect(entries[1]!.name).toBe("omo");
  expect(entries[1]!.active).toBe(false);
  expect(entries[2]!.name).toBe("bun");
  expect(entries[2]!.active).toBe(false);
});

test("parseDocsSources returns empty for missing file", () => {
  expect(parseDocsSources(join(tempDir, "nonexistent.yaml"))).toEqual([]);
});

test("toggleDocsSources enables a disabled source", () => {
  writeFileSync(yamlPath, SAMPLE_YAML);
  const changed = toggleDocsSources(yamlPath, ["pi", "omo"]);
  expect(changed).toBe(1);
  const content = readFileSync(yamlPath, "utf-8");
  expect(content).toContain("- name: omo");
  expect(content).not.toContain("# - name: omo");
});

test("toggleDocsSources disables an enabled source", () => {
  writeFileSync(yamlPath, SAMPLE_YAML);
  const changed = toggleDocsSources(yamlPath, ["omo"]);
  expect(changed).toBe(2);
  const content = readFileSync(yamlPath, "utf-8");
  expect(content).toContain("#   - name: pi");
  expect(content).toContain("- name: omo");
});

test("toggleDocsSources makes no changes when state matches", () => {
  writeFileSync(yamlPath, SAMPLE_YAML);
  const changed = toggleDocsSources(yamlPath, ["pi"]);
  expect(changed).toBe(0);
});