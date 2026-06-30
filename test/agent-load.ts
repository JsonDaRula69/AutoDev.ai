/**
 * T4 agent load verification.
 *
 * Loads each of the 13 crew agent definition files at `.pi/agents/*.md`,
 * parses the YAML frontmatter, and verifies:
 *   1. Required frontmatter fields are present and non-empty:
 *      name, description, tools, model.
 *   2. The system prompt body (Markdown after frontmatter) contains
 *      Nautilus identity markers.
 *   3. The `model` string is in the allowlist at
 *      `.autodev/config/models.json`.
 *
 * Run with: `bun test test/agent-load.ts`
 */

import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const AGENTS_DIR = join(import.meta.dirname ?? __dirname, "..", ".pi", "agents");
const MODELS_PATH = join(
  import.meta.dirname ?? __dirname,
  "..",
  ".autodev",
  "config",
  "models.json",
);

/** Canonical list of the 13 crew agents expected to exist. */
const EXPECTED_AGENTS = [
  "nemo",
  "aronnax",
  "ned-land",
  "conseil",
  "oracle",
  "momus",
  "metis",
  "harbor-master",
  "quartermaster",
  "boatswain",
  "navigator",
  "watch-officer",
  "explore",
] as const;

/** Nautilus identity markers — body must contain at least one. */
const NAUTILUS_MARKERS = [
  "Nautilus",
  "crew",
  "AutoDev",
  "self-sustaining engineering",
  "engineering team",
  "engineer",
  "captain",
  "harpooner",
  "steward",
  "seer",
  "satyr",
  "strategic advisor",
  "Harbor Master",
  "investigator",
  "Quartermaster",
  "Boatswain",
  "Navigator",
  "Watch Officer",
] as const;

interface AgentFrontmatter {
  name: string;
  description: string;
  tools: string;
  model: string;
}

/** Parse frontmatter (YAML between `---` fences) from a Markdown agent file. */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match || match[1] === undefined || match[2] === undefined) {
    throw new Error("No YAML frontmatter delimiters found");
  }
  const yamlBlock = match[1];
  const body = match[2];

  const frontmatter: Record<string, string> = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    // Skip blank lines and comments.
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key.length > 0) {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
}

/** Load and parse an agent file by slug name. */
function loadAgent(slug: string): {
  slug: string;
  frontmatter: Record<string, string>;
  body: string;
  raw: string;
} {
  const filePath = join(AGENTS_DIR, `${slug}.md`);
  const raw = readFileSync(filePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  return { slug, frontmatter, body, raw };
}

/** Load the model allowlist. */
function loadModelAllowlist(): readonly string[] {
  const raw = readFileSync(MODELS_PATH, "utf8");
  const parsed = JSON.parse(raw) as string[];
  if (!Array.isArray(parsed)) {
    throw new Error("models.json must be a JSON array of model strings");
  }
  return parsed;
}

const ALLOWED_MODELS = loadModelAllowlist();

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test("exactly 13 agent files exist in .pi/agents/", () => {
  const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  expect(files.length).toBe(13);
});

test("all 13 expected agent slugs are present", () => {
  const files = readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
  for (const slug of EXPECTED_AGENTS) {
    expect(files).toContain(slug);
  }
});

for (const slug of EXPECTED_AGENTS) {
  test(`${slug}: frontmatter has required fields (name, description, tools, model)`, () => {
    const agent = loadAgent(slug);
    const fm = agent.frontmatter;

    expect(fm["name"]).toBeDefined();
    expect(fm["name"]!.length).toBeGreaterThan(0);

    expect(fm["description"]).toBeDefined();
    expect(fm["description"]!.length).toBeGreaterThan(0);

    expect(fm["tools"]).toBeDefined();
    expect(fm["tools"]!.length).toBeGreaterThan(0);

    expect(fm["model"]).toBeDefined();
    expect(fm["model"]!.length).toBeGreaterThan(0);
  });

  test(`${slug}: frontmatter name matches filename`, () => {
    const agent = loadAgent(slug);
    expect(agent.frontmatter["name"]).toBe(slug);
  });

  test(`${slug}: model is in the allowlist`, () => {
    const agent = loadAgent(slug);
    const model = agent.frontmatter["model"]!;
    expect(ALLOWED_MODELS).toContain(model);
  });

  test(`${slug}: system prompt body contains Nautilus identity markers`, () => {
    const agent = loadAgent(slug);
    const body = agent.body;
    const hasMarker = NAUTILUS_MARKERS.some((marker) =>
      body.toLowerCase().includes(marker.toLowerCase()),
    );
    expect(hasMarker).toBe(true);
  });

  test(`${slug}: system prompt body contains Constraints section`, () => {
    const agent = loadAgent(slug);
    expect(agent.body).toContain("## Constraints");
  });

  test(`${slug}: system prompt body contains Capabilities section`, () => {
    const agent = loadAgent(slug);
    expect(agent.body).toContain("## Capabilities");
  });

  test(`${slug}: system prompt body is non-empty`, () => {
    const agent = loadAgent(slug);
    expect(agent.body.trim().length).toBeGreaterThan(50);
  });
}

test("model allowlist is non-empty and contains expected entries", () => {
  expect(ALLOWED_MODELS.length).toBeGreaterThan(0);
  expect(ALLOWED_MODELS).toContain("ollama-cloud/glm-5.2");
  expect(ALLOWED_MODELS).toContain("ollama-cloud/deepseek-v4-pro");
  expect(ALLOWED_MODELS).toContain("ollama-cloud/glm-5.1");
  expect(ALLOWED_MODELS).toContain("ollama-cloud/deepseek-v4-flash");
  expect(ALLOWED_MODELS).toContain("ollama-cloud/kimi-k2.7-code");
});

test("every agent uses a model from the allowlist (aggregate check)", () => {
  const violations: string[] = [];
  for (const slug of EXPECTED_AGENTS) {
    const agent = loadAgent(slug);
    const model = agent.frontmatter["model"]!;
    if (!ALLOWED_MODELS.includes(model)) {
      violations.push(`${slug}: model "${model}" not in allowlist`);
    }
  }
  expect(violations).toEqual([]);
});