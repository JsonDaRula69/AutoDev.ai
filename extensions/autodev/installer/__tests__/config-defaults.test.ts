// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T1 config-defaults tests — symlink-based centralization to ~/.AutoDev/.
 *
 * Tests (Given/When/Then):
 *  - getAgentDir baseline (no env var) returns SDK default ~/.pi/agent
 *  - getAgentDir with PI_CODING_AGENT_DIR returns custom dir
 *  - Symlink happy path: all symlinks + magic-context.jsonc created
 *  - Missing source file: that check is ok=false, detail "source file missing"
 *  - Idempotent re-run: existing symlinks -> ok=true, created=false
 *  - Windows EPERM fallback: symlink throws EPERM -> copy fallback with warning
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `autodev-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const REQUIRED_AGENTS = [
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
];

/**
 * Create a mock global package layout under `packageRoot` mirroring what
 * `~/.bun/install/global/node_modules/autodev/` would contain.
 */
function createMockPackage(packageRoot: string): void {
  // .pi/settings.json
  mkdirSync(join(packageRoot, ".pi", "agents"), { recursive: true });
  mkdirSync(join(packageRoot, ".pi", "skills"), { recursive: true });
  writeFileSync(join(packageRoot, ".pi", "settings.json"), '{"pi":{}}', "utf-8");

  // .pi/agents/*.md (13 files)
  for (const a of REQUIRED_AGENTS) {
    writeFileSync(
      join(packageRoot, ".pi", "agents", `${a}.md`),
      `---\nname: ${a}\n---\n# ${a}\n`,
      "utf-8",
    );
  }

  // .autodev/reference
  mkdirSync(join(packageRoot, ".autodev", "reference"), { recursive: true });
  writeFileSync(
    join(packageRoot, ".autodev", "reference", "README.md"),
    "# reference\n",
    "utf-8",
  );

  // .pi/skills (directory with skill subdirs)
  mkdirSync(
    join(packageRoot, ".pi", "skills", "autodev-triage"),
    { recursive: true },
  );
  writeFileSync(
    join(packageRoot, ".pi", "skills", "autodev-triage", "SKILL.md"),
    "# triage skill\n",
    "utf-8",
  );

  // extensions/autodev
  mkdirSync(join(packageRoot, "extensions", "autodev"), { recursive: true });
  writeFileSync(
    join(packageRoot, "extensions", "autodev", "index.ts"),
    "// extension entry\n",
    "utf-8",
  );

  // .autodev/config (9 files)
  mkdirSync(join(packageRoot, ".autodev", "config"), { recursive: true });
  const configFiles = [
    ["concurrency.yaml", "max: 4\n"],
    ["debate-protocol.yaml", "rounds: 3\n"],
    ["dispatch-rules.yaml", "rules: []\n"],
    ["fallback.json", '{"models":[]}\n'],
    ["guardrails.yaml", "rules: []\n"],
    ["mcp.json", '{"servers":{}}\n'],
    ["models.json", '{"default":"x"}\n'],
    ["standing-orders.md", "# Standing Orders\n"],
    ["team-spec.json", '{"crew":[]}\n'],
  ];
  for (const [name, content] of configFiles) {
    writeFileSync(join(packageRoot, ".autodev", "config", name), content, "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Tests: getAgentDir from pi SDK
// ---------------------------------------------------------------------------

test("getAgentDir returns default ~/.pi/agent when env var unset", async () => {
  const saved = process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_CODING_AGENT_DIR;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const dir = getAgentDir();
    expect(dir).toBe(join(homedir(), ".pi", "agent"));
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
  }
});

test("getAgentDir returns custom dir when PI_CODING_AGENT_DIR is set", async () => {
  const saved = process.env.PI_CODING_AGENT_DIR;
  const custom = "/tmp/custom-agent-dir-test";
  process.env.PI_CODING_AGENT_DIR = custom;
  try {
    const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const dir = getAgentDir();
    expect(dir).toBe(custom);
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
  }
});

// ---------------------------------------------------------------------------
// Tests: validateAndCreateConfig symlink creation
// ---------------------------------------------------------------------------

test("validateAndCreateConfig creates all symlinks and magic-context.jsonc on happy path", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  // Set env var so getAgentDir() returns our temp central agent dir.
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createMockPackage(packageRoot);
    const { validateAndCreateConfig } = await import("../config-defaults.js");
    const results = await validateAndCreateConfig(packageRoot);

    // All results should be ok.
    const failed = results.filter((r: any) => !r.ok);
    expect(failed.length).toBe(0);

    // Verify symlinks/files exist.
    // agent/settings.json -> package/.pi/settings.json
    const settingsPath = join(agentDir, "settings.json");
    expect(existsSync(settingsPath)).toBe(true);
    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(settingsPath)).toBe(join(packageRoot, ".pi", "settings.json"));

    // agents/*.md (13 files) -> package/.pi/agents/*.md
    const agentsDir = join(centralDir, "agents");
    expect(existsSync(agentsDir)).toBe(true);
    const agentFiles = readdirSync(agentsDir).filter((f: string) => f.endsWith(".md"));
    expect(agentFiles.length).toBe(REQUIRED_AGENTS.length);
    for (const a of REQUIRED_AGENTS) {
      const link = join(agentsDir, `${a}.md`);
      expect(existsSync(link)).toBe(true);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    }

    // reference/ -> package/.autodev/reference/
    const refLink = join(centralDir, "reference");
    expect(existsSync(refLink)).toBe(true);
    expect(lstatSync(refLink).isSymbolicLink()).toBe(true);

    // skills/ -> package/.pi/skills/
    const skillsLink = join(centralDir, "skills");
    expect(existsSync(skillsLink)).toBe(true);
    expect(lstatSync(skillsLink).isSymbolicLink()).toBe(true);

    // agent/extensions/autodev -> package/extensions/autodev
    const extLink = join(agentDir, "extensions", "autodev");
    expect(existsSync(extLink)).toBe(true);
    expect(lstatSync(extLink).isSymbolicLink()).toBe(true);

    // config/*.yaml|json|md (9 files) -> package/.autodev/config/*
    const configDir = join(centralDir, "config");
    expect(existsSync(configDir)).toBe(true);
    const configFiles = readdirSync(configDir);
    expect(configFiles.length).toBe(9);

    // magic-context.jsonc is a real file (not symlink)
    const mcPath = join(agentDir, "magic-context.jsonc");
    expect(existsSync(mcPath)).toBe(true);
    expect(lstatSync(mcPath).isSymbolicLink()).toBe(false);
    expect(lstatSync(mcPath).isFile()).toBe(true);
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("validateAndCreateConfig returns ok=false with 'source file missing' when package lacks settings.json", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    // Create package WITHOUT settings.json (but with other files).
    createMockPackage(packageRoot);
    rmSync(join(packageRoot, ".pi", "settings.json"), { force: true });

    const { validateAndCreateConfig } = await import("../config-defaults.js");
    const results = await validateAndCreateConfig(packageRoot);

    const settingsResult = results.find((r: any) => r.name === "settings.json");
    expect(settingsResult).toBeDefined();
    expect(settingsResult.ok).toBe(false);
    expect(settingsResult.detail).toContain("source file missing");
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("validateAndCreateConfig is idempotent: re-run returns ok=true, created=false for existing symlinks", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createMockPackage(packageRoot);
    const { validateAndCreateConfig } = await import("../config-defaults.js");

    // First run — creates everything.
    const first = await validateAndCreateConfig(packageRoot);
    const firstFailed = first.filter((r: any) => !r.ok);
    expect(firstFailed.length).toBe(0);

    // Second run — should be idempotent, created=false for existing links.
    const second = await validateAndCreateConfig(packageRoot);
    const secondFailed = second.filter((r: any) => !r.ok);
    expect(secondFailed.length).toBe(0);

    // settings.json should report created=false on re-run.
    const settingsSecond = second.find((r: any) => r.name === "settings.json");
    expect(settingsSecond.created).toBe(false);
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});

test("validateAndCreateConfig falls back to copy with warning when symlink throws EPERM", async () => {
  const centralDir = createTempDir();
  const packageRoot = createTempDir();
  const agentDir = join(centralDir, "agent");
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createMockPackage(packageRoot);
    const { validateAndCreateConfig } = await import("../config-defaults.js");

    // Inject a symlink override that throws EPERM (simulates Windows/no-dev-mode).
    const epermError = Object.assign(new Error("operation not permitted"), {
      code: "EPERM",
    });
    const results = await validateAndCreateConfig(packageRoot, {
      symlinkOverride: () => {
        throw epermError;
      },
    });

    // All results should still be ok (copy fallback succeeded).
    const failed = results.filter((r: any) => !r.ok);
    expect(failed.length).toBe(0);

    // At least one result should mention the copy fallback warning.
    const hasCopyWarning = results.some((r: any) =>
      r.detail.toLowerCase().includes("copied") ||
      r.detail.toLowerCase().includes("eperm") ||
      r.detail.toLowerCase().includes("symlink failed"),
    );
    expect(hasCopyWarning).toBe(true);

    // settings.json should exist as a real file (not symlink) after copy fallback.
    const settingsPath = join(agentDir, "settings.json");
    expect(existsSync(settingsPath)).toBe(true);
    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(false);
    expect(lstatSync(settingsPath).isFile()).toBe(true);
  } finally {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
    cleanupTempDir(centralDir);
    cleanupTempDir(packageRoot);
  }
});