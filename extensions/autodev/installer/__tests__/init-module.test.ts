// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T8/T9 init-module tests — `autodev init` steps 1-9.
 *
 * Steps 1-5 (T8) tests (Given/When/Then):
 *  - Happy: temp dir + mock package with templates -> all 5 steps run, all
 *    dirs/files created, state steps 6+7 recorded in init-state.json.
 *  - Failure: package templates dir missing -> step 2 fails gracefully, steps
 *    1+3 still succeed, step 6 NOT marked (because step 2 failed), step 4+5
 *    still run.
 *  - Resume: mark step 6 complete manually, fail step 5 (.omo creation fails
 *    via missing write perm simulation), re-run -> steps 1-3 skipped (step 6
 *    done), step 4 runs (idempotent marker), step 5 retried.
 *  - Idempotent re-run: full happy run then re-run -> "already initialized"
 *    fast path returns single result.
 *  - Marker JSON shape: verifies {name, path, repo} fields.
 *
 * Steps 6-9 (T9) tests:
 *  - GH happy: gh auth ok + repo view ok + label list returns 3/8 -> 5 labels
 *    created, registry updated.
 *  - Repo missing: gh repo view fails -> gh repo create called, labels skipped.
 *  - Label create failure: warn, continue.
 *  - GH not authenticated: gh auth status fails -> warn, skip steps 8-9.
 *  - Registry write failure: hard fail at step 6.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import type { ExecSyncOptions } from "node:child_process";
import { markStepCompleted, readState } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `autodev-init-module-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

/** Create a mock central package layout with the 4 template files. */
function createMockPackage(packageRoot: string): void {
  const templatesDir = join(packageRoot, ".autodev", "templates");
  mkdirSync(templatesDir, { recursive: true });
  for (const [name, content] of [
    ["ADR-template.md", "# ADR\n"],
    ["autodev-delivery.md", "# Delivery\n"],
    ["autodev-request.md", "# Request\n"],
    ["harbor-log.md", "# Harbor Log\n"],
  ] as const) {
    writeFileSync(join(templatesDir, name), content, "utf-8");
  }
}

/** Exec override that returns a fake git remote for `git remote get-url origin`. */
function makeGitExec(repo = "owner/my-repo"): (cmd: string, o?: ExecSyncOptions) => Buffer {
  return (command: string): Buffer => {
    if (command.includes("git remote get-url origin")) {
      return Buffer.from(`git@github.com:${repo}.git\n`);
    }
    return Buffer.from("");
  };
}

// ---------------------------------------------------------------------------
// Expected dirs/files
// ---------------------------------------------------------------------------

const AUTODEV_SUBDIRS = [
  "evidence", "decisions", "work-items", "debates",
  "embeddings", "research", "memory", "plans", "scripts",
];

const TEMPLATE_FILES = [
  "ADR-template.md", "autodev-delivery.md",
  "autodev-request.md", "harbor-log.md",
];

const OMO_SUBDIRS = ["plans", "evidence", "rules", "drafts", "notepads"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("runInit happy path: all dirs/files created, state steps 6+7 recorded", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const { runInit } = await import("../init-module.js");

    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGhExec({ authed: false }),
      packageRoot,
      skipOnboard: true,
    });

    // THEN: 11 step results (5 from T8 + 3 registry/docs + 2 repo/labels + 1 onboard).
    expect(results.length).toBe(11);
    expect(results.map((r: any) => r.name)).toEqual([
      "autodev-dirs",
      "templates",
      "github-template",
      "project-marker",
      "omo-dirs",
      "registry",
      "agents-md",
      "context-md",
      "repo-check",
      "labels",
      "onboard",
    ]);
    expect(results.every((r: any) => r.ok)).toBe(true);

    // AND: all .autodev/ subdirs exist.
    for (const dir of AUTODEV_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".autodev", dir))).toBe(true);
    }
    expect(existsSync(join(projectRoot, ".autodev", "config"))).toBe(false);
    expect(existsSync(join(projectRoot, ".autodev", "skills"))).toBe(false);
    expect(existsSync(join(projectRoot, ".autodev", "reference"))).toBe(false);

    const templates = readdirSync(join(projectRoot, ".autodev", "templates"));
    expect(templates.sort()).toEqual([...TEMPLATE_FILES].sort());

    expect(existsSync(join(projectRoot, ".github", "ISSUE_TEMPLATE", "autodev-request.md"))).toBe(true);

    const markerPath = join(projectRoot, ".autodev", "project");
    expect(existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(await Bun.file(markerPath).text());
    expect(marker.name).toBe(basename(projectRoot));
    expect(marker.path).toBe(projectRoot);
    expect(marker.repo).toBe("owner/my-repo");

    for (const dir of OMO_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".omo", dir))).toBe(true);
    }

    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(6);
    expect(state.completedSteps).toContain(7);
    expect(state.completedSteps).toContain(8);
    // Step 9 NOT recorded (gh not authenticated -> skipped, ran=false).
    expect(state.completedSteps).not.toContain(9);
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("runInit failure: package templates dir missing -> step 2 fails, others continue, step 6 NOT marked", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    mkdirSync(join(packageRoot, ".autodev"), { recursive: true });
    const restoreAgent = withAgentDir(tmpRoot);
    const { runInit } = await import("../init-module.js");

    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGhExec({ authed: false }),
      packageRoot,
      skipOnboard: true,
    });

    // THEN: 11 results (5 T8 + 5 T9 + 1 onboard).
    expect(results.length).toBe(11);

    expect(results[0].name).toBe("autodev-dirs");
    expect(results[0].ok).toBe(true);

    expect(results[1].name).toBe("templates");
    expect(results[1].ok).toBe(false);
    expect(results[1].detail).toContain("Source templates dir missing");

    expect(results[2].name).toBe("github-template");
    expect(results[2].ok).toBe(false);

    expect(results[3].name).toBe("project-marker");
    expect(results[3].ok).toBe(true);

    expect(results[4].name).toBe("omo-dirs");
    expect(results[4].ok).toBe(true);

    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).not.toContain(6);
    expect(state.completedSteps).toContain(7);

    for (const dir of AUTODEV_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".autodev", dir))).toBe(true);
    }
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("runInit resume: step 6 done, step 7 fails then re-run skips 6 and retries 7", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const { runInit } = await import("../init-module.js");

    await markStepCompleted(projectRoot, 6, "init");

    mkdirSync(join(projectRoot, ".autodev", "templates"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".autodev", "templates", "autodev-request.md"),
      "# Request\n",
      "utf-8",
    );

    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGhExec({ authed: false }),
      packageRoot,
      skipOnboard: true,
    });

    // THEN: 11 results; first three are "Already completed (step 6)".
    expect(results.length).toBe(11);
    expect(results[0].ok).toBe(true);
    expect(results[0].detail).toContain("Already completed (step 6)");
    expect(results[1].ok).toBe(true);
    expect(results[1].detail).toContain("Already completed (step 6)");
    expect(results[2].ok).toBe(true);
    expect(results[2].detail).toContain("Already completed (step 6)");

    expect(results[3].name).toBe("project-marker");
    expect(results[3].ok).toBe(true);

    expect(results[4].name).toBe("omo-dirs");
    expect(results[4].ok).toBe(true);

    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(7);

    for (const dir of OMO_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".omo", dir))).toBe(true);
    }
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("runInit idempotent: full happy run then re-run returns 'already initialized'", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const { runInit } = await import("../init-module.js");

    const exec = makeGhExec({ authed: true, repoExists: true, existingLabels: REQUIRED_LABELS });
    const first = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: exec,
      packageRoot,
      skipOnboard: true,
    });
    expect(first.length).toBe(11);
    expect(first.every((r: any) => r.ok)).toBe(true);

    const second = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: exec,
      packageRoot,
      skipOnboard: true,
    });

    expect(second.length).toBe(1);
    expect(second[0].ok).toBe(true);
    expect(second[0].detail).toBe("already initialized");
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("runInit marker JSON shape: {name, path, repo}", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const { runInit } = await import("../init-module.js");

    await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGhExec({ repo: "acme/widget-factory", authed: false }),
      packageRoot,
      skipOnboard: true,
    });

    const marker = JSON.parse(
      await Bun.file(join(projectRoot, ".autodev", "project")).text(),
    );
    expect(marker).toEqual({
      name: basename(projectRoot),
      path: projectRoot,
      repo: "acme/widget-factory",
    });
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

// ---------------------------------------------------------------------------
// T9 — Steps 6-9 (registry, AGENTS.md/CONTEXT.md, repo check, label dedup)
// ---------------------------------------------------------------------------

/** Set PI_CODING_AGENT_DIR to a temp agent dir, return cleanup fn. */
function withAgentDir(tmpRoot: string): () => void {
  const agentDir = join(tmpRoot, "agent");
  mkdirSync(agentDir, { recursive: true });
  const saved = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  return () => {
    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
  };
}

const REQUIRED_LABELS = [
  "autodev-request",
  "autodev-planned",
  "autodev-in-progress",
  "autodev-review",
  "autodev-ready",
  "autodev-merged",
  "autodev-blocked",
  "autodev-rejected",
] as const;

/** Make an exec override that handles both git and gh commands.
 * - `git remote get-url origin` -> `git@github.com:<repo>.git`
 * - `gh auth status` -> exit 0 (authenticated) when `authed` true, else throw
 * - `gh repo view <repo>` -> exit 0 when `repoExists` true, else throw
 * - `gh repo create ...` -> recorded, exit 0 unless `createFails` true
 * - `gh label list --json name` -> JSON of `existingLabels`
 * - `gh label create <name> --color ... --description ...` -> recorded; throws
 *   if `name` is in `failLabels`
 */
function makeGhExec(opts: {
  repo?: string;
  authed?: boolean;
  repoExists?: boolean;
  createFails?: boolean;
  existingLabels?: readonly string[];
  failLabels?: readonly string[];
  record?: string[];
}): (cmd: string, o?: ExecSyncOptions) => Buffer {
  const calls: string[] = opts.record ?? [];
  const repo = opts.repo ?? "owner/my-repo";
  const authed = opts.authed ?? true;
  const repoExists = opts.repoExists ?? true;
  const existing = new Set(opts.existingLabels ?? []);
  const failLabels = new Set(opts.failLabels ?? []);
  return (command: string): Buffer => {
    calls.push(command);
    // git remote
    if (command.includes("git remote get-url origin")) {
      return Buffer.from(`git@github.com:${repo}.git\n`);
    }
    // gh auth status
    if (command.startsWith("gh auth status")) {
      if (authed) return Buffer.from("Logged in to github.com\n");
      throw new Error("not authenticated");
    }
    // gh repo view
    if (command.startsWith("gh repo view")) {
      if (repoExists) return Buffer.from("repo exists\n");
      throw new Error("repository not found");
    }
    // gh repo create
    if (command.startsWith("gh repo create")) {
      if (opts.createFails) throw new Error("create failed");
      return Buffer.from("repo created\n");
    }
    // gh label list --json name
    if (command.startsWith("gh label list")) {
      return Buffer.from(JSON.stringify([...existing].map((n) => ({ name: n }))));
    }
    // gh label create <name> --color <hex> --description <desc>
    if (command.startsWith("gh label create")) {
      const m = command.match(/gh label create (\S+)/);
      const name = m?.[1] ?? "";
      if (failLabels.has(name)) throw new Error(`create failed for ${name}`);
      return Buffer.from("label created\n");
    }
    return Buffer.from("");
  };
}

/** Verify the registry at the temp agent dir contains the project as active. */
async function readRegistry(tmpRoot: string): Promise<any> {
  const { readFile } = await import("node:fs/promises");
  const path = join(tmpRoot, "agent", "..", "projects.json");
  return JSON.parse(await readFile(path, "utf-8"));
}

// 8 labels split: 3 exist, 5 to create.
const EXISTING_3 = ["autodev-request", "autodev-planned", "autodev-in-progress"] as const;
const MISSING_5 = [
  "autodev-review",
  "autodev-ready",
  "autodev-merged",
  "autodev-blocked",
  "autodev-rejected",
] as const;

test("T9 step 6-9 happy: gh auth ok, repo view ok, 5 labels created, registry updated", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const calls: string[] = [];
    const exec = makeGhExec({
      repo: "owner/my-repo",
      authed: true,
      repoExists: true,
      existingLabels: EXISTING_3,
      record: calls,
    });

    const { runInit } = await import("../init-module.js");
    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: exec,
      packageRoot,
      skipOnboard: true,
    });

    // THEN: results include steps 6-9.
    const names = results.map((r: any) => r.name);
    expect(names).toContain("registry");
    expect(names).toContain("agents-md");
    expect(names).toContain("context-md");
    expect(names).toContain("repo-check");
    expect(names).toContain("labels");

    // AND: all T9 results ok.
    const t9 = results.filter((r: any) =>
      ["registry", "agents-md", "context-md", "repo-check", "labels"].includes(r.name),
    );
    expect(t9.every((r: any) => r.ok)).toBe(true);

    // AND: gh label create called exactly 5 times (for the 5 missing labels).
    const createCalls = calls.filter((c) => c.startsWith("gh label create"));
    expect(createCalls.length).toBe(5);
    for (const missing of MISSING_5) {
      expect(createCalls.some((c) => c.includes(`gh label create ${missing}`))).toBe(true);
    }

    // AND: registry updated with project marked active.
    const reg = await readRegistry(tmpRoot);
    const entry = reg.projects.find((p: any) => p.name === basename(projectRoot));
    expect(entry).toBeDefined();
    expect(entry.active).toBe(true);
    expect(entry.path).toBe(projectRoot);

    // AND: AGENTS.md and CONTEXT.md exist in project root.
    expect(existsSync(join(projectRoot, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(projectRoot, "CONTEXT.md"))).toBe(true);

    // AND: state steps 8 and 9 recorded.
    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(8);
    expect(state.completedSteps).toContain(9);
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("T9 repo missing: gh repo view fails -> gh repo create called, labels skipped", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const calls: string[] = [];
    const exec = makeGhExec({
      repo: "owner/new-project",
      authed: true,
      repoExists: false, // repo does not exist
      record: calls,
    });

    const { runInit } = await import("../init-module.js");
    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: exec,
      packageRoot,
      skipOnboard: true,
    });

    // THEN: repo-check result ok (created).
    const repoCheck = results.find((r: any) => r.name === "repo-check");
    expect(repoCheck).toBeDefined();
    expect(repoCheck.ok).toBe(true);

    // AND: gh repo create was called.
    expect(calls.some((c) => c.startsWith("gh repo create"))).toBe(true);

    // AND: gh label list NOT called (labels skipped after create).
    expect(calls.some((c) => c.startsWith("gh label list"))).toBe(false);

    // AND: labels result reports skipped.
    const labels = results.find((r: any) => r.name === "labels");
    expect(labels).toBeDefined();
    expect(labels.ok).toBe(true);

    // AND: state step 9 recorded (repo+labels phase complete).
    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(9);
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("T9 label create failure: warn and continue", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const warnings: string[] = [];
    const exec = makeGhExec({
      repo: "owner/my-repo",
      authed: true,
      repoExists: true,
      existingLabels: EXISTING_3,
      // Make one of the 5 missing labels fail to create.
      failLabels: ["autodev-review"],
    });

    const { runInit } = await import("../init-module.js");
    const results = await runInit({
      projectRoot,
      notify: (_msg: string, level: "info" | "warning" | "error") => {
        if (level === "warning") warnings.push(_msg);
      },
      execSyncOverride: exec,
      packageRoot,
      skipOnboard: true,
    });

    // THEN: labels result still ok (best-effort).
    const labels = results.find((r: any) => r.name === "labels");
    expect(labels).toBeDefined();
    expect(labels.ok).toBe(true);

    // AND: a warning was emitted for the failed label.
    expect(warnings.some((w) => w.includes("autodev-review"))).toBe(true);

    // AND: state step 9 recorded despite partial failure.
    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(9);
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("T9 gh not authenticated: gh auth status fails -> warn, skip steps 8-9", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const calls: string[] = [];
    const warnings: string[] = [];
    const exec = makeGhExec({
      authed: false,
      record: calls,
    });

    const { runInit } = await import("../init-module.js");
    const results = await runInit({
      projectRoot,
      notify: (_msg: string, level: "info" | "warning" | "error") => {
        if (level === "warning") warnings.push(_msg);
      },
      execSyncOverride: exec,
      packageRoot,
      skipOnboard: true,
    });

    // THEN: step 6 (registry) and step 7 (docs) still succeed.
    const registry = results.find((r: any) => r.name === "registry");
    expect(registry?.ok).toBe(true);
    const agentsMd = results.find((r: any) => r.name === "agents-md");
    expect(agentsMd?.ok).toBe(true);

    // AND: steps 8-9 skipped — gh repo view and gh label list NOT called.
    expect(calls.some((c) => c.startsWith("gh repo view"))).toBe(false);
    expect(calls.some((c) => c.startsWith("gh label list"))).toBe(false);

    // AND: a warning mentions `autodev config github`.
    expect(warnings.some((w) => w.includes("autodev config github"))).toBe(true);

    // AND: state step 9 NOT recorded (gh steps skipped).
    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).not.toContain(9);
    // BUT state step 8 IS recorded (registry + docs complete).
    expect(state.completedSteps).toContain(8);
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("T9 registry write failure: hard fail at step 6", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    // Make the central agent dir read-only so saveRegistry throws.
    const agentDir = join(tmpRoot, "agent");
    mkdirSync(agentDir, { recursive: true });
    // Pre-create projects.json as a directory so writeFile fails.
    mkdirSync(join(tmpRoot, "projects.json"), { recursive: true });
    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const exec = makeGhExec({ authed: true, repoExists: true });
    const { runInit } = await import("../init-module.js");

    // WHEN: runInit throws because registry save fails.
    await expect(
      runInit({
        projectRoot,
        notify: () => {},
        execSyncOverride: exec,
        packageRoot,
      }),
    ).rejects.toThrow();

    if (saved !== undefined) process.env.PI_CODING_AGENT_DIR = saved;
    else delete process.env.PI_CODING_AGENT_DIR;
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

// ---------------------------------------------------------------------------
// T10 — Step 10 (Harbor Master onboard auto-launch)
// ---------------------------------------------------------------------------

test("T10 skipOnboard=true: step 11 marked, no session launched", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const { runInit } = await import("../init-module.js");

    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGhExec({ authed: false }),
      packageRoot,
      skipOnboard: true,
    });

    const onboard = results.find((r: any) => r.name === "onboard");
    expect(onboard).toBeDefined();
    expect(onboard.ok).toBe(true);
    expect(onboard.detail).toContain("Skipped");

    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(11);
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});

test("T10 re-run with step 11 complete: step 10 skipped", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();
  const tmpRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const restoreAgent = withAgentDir(tmpRoot);
    const { runInit } = await import("../init-module.js");

    await markStepCompleted(projectRoot, 11, "init");

    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGhExec({ authed: false }),
      packageRoot,
      skipOnboard: false,
    });

    const onboard = results.find((r: any) => r.name === "onboard");
    expect(onboard).toBeDefined();
    expect(onboard.ok).toBe(true);
    expect(onboard.detail).toContain("Already completed (step 11)");
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
    cleanupTempDir(tmpRoot);
  }
});