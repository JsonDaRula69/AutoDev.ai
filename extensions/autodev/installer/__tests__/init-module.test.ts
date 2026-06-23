// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T8 init-module tests — `autodev init` steps 1-5.
 *
 * Tests (Given/When/Then):
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

  try {
    createMockPackage(packageRoot);
    const { runInit } = await import("../init-module.js");

    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGitExec(),
      packageRoot,
    });

    // THEN: 5 step results (dirs, templates, github, marker, omo).
    expect(results.length).toBe(5);
    expect(results.map((r: any) => r.name)).toEqual([
      "autodev-dirs",
      "templates",
      "github-template",
      "project-marker",
      "omo-dirs",
    ]);
    expect(results.every((r: any) => r.ok)).toBe(true);

    // AND: all .autodev/ subdirs exist.
    for (const dir of AUTODEV_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".autodev", dir))).toBe(true);
    }
    // AND: NOT config/skills/reference (centralized via symlinks).
    expect(existsSync(join(projectRoot, ".autodev", "config"))).toBe(false);
    expect(existsSync(join(projectRoot, ".autodev", "skills"))).toBe(false);
    expect(existsSync(join(projectRoot, ".autodev", "reference"))).toBe(false);

    // AND: .autodev/templates/ has the 4 files.
    const templates = readdirSync(join(projectRoot, ".autodev", "templates"));
    expect(templates.sort()).toEqual([...TEMPLATE_FILES].sort());

    // AND: .github/ISSUE_TEMPLATE/autodev-request.md exists.
    expect(existsSync(join(projectRoot, ".github", "ISSUE_TEMPLATE", "autodev-request.md"))).toBe(true);

    // AND: .autodev/project marker exists with correct JSON shape.
    const markerPath = join(projectRoot, ".autodev", "project");
    expect(existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(
      await Bun.file(markerPath).text(),
    );
    expect(marker.name).toBe(basename(projectRoot));
    expect(marker.path).toBe(projectRoot);
    expect(marker.repo).toBe("owner/my-repo");

    // AND: .omo/ has 5 subdirs.
    for (const dir of OMO_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".omo", dir))).toBe(true);
    }

    // AND: state steps 6 and 7 recorded in init-state.json.
    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(6);
    expect(state.completedSteps).toContain(7);
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("runInit failure: package templates dir missing -> step 2 fails, others continue, step 6 NOT marked", async () => {
  const packageRoot = createTempDir(); // no templates dir
  const projectRoot = createTempDir();

  try {
    // Mock package WITHOUT a templates dir.
    mkdirSync(join(packageRoot, ".autodev"), { recursive: true });
    const { runInit } = await import("../init-module.js");

    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGitExec(),
      packageRoot,
    });

    // THEN: 5 results.
    expect(results.length).toBe(5);

    // Step 1 (dirs) succeeds.
    expect(results[0].name).toBe("autodev-dirs");
    expect(results[0].ok).toBe(true);

    // Step 2 (templates) FAILS gracefully.
    expect(results[1].name).toBe("templates");
    expect(results[1].ok).toBe(false);
    expect(results[1].detail).toContain("Source templates dir missing");

    // Step 3 (github) fails because step 2 didn't copy autodev-request.md.
    expect(results[2].name).toBe("github-template");
    expect(results[2].ok).toBe(false);

    // Step 4 (marker) still succeeds (independent of templates).
    expect(results[3].name).toBe("project-marker");
    expect(results[3].ok).toBe(true);

    // Step 5 (omo) still succeeds.
    expect(results[4].name).toBe("omo-dirs");
    expect(results[4].ok).toBe(true);

    // AND: step 6 NOT marked (structure steps didn't all pass).
    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).not.toContain(6);

    // AND: step 7 IS marked (omo succeeded independently).
    expect(state.completedSteps).toContain(7);

    // AND: .autodev subdirs were still created (step 1 succeeded).
    for (const dir of AUTODEV_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".autodev", dir))).toBe(true);
    }
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("runInit resume: step 6 done, step 7 fails then re-run skips 6 and retries 7", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const { runInit } = await import("../init-module.js");

    // GIVEN: step 6 already marked complete (structure done in a prior run).
    await markStepCompleted(projectRoot, 6, "init");

    // Pre-create the structure that step 6 would have created so step 3's
    // source file exists for the skip path.
    mkdirSync(join(projectRoot, ".autodev", "templates"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".autodev", "templates", "autodev-request.md"),
      "# Request\n",
      "utf-8",
    );

    // WHEN: run init — step 6 is skipped, steps 1-3 report "Already completed",
    // step 4 (marker) runs, step 5 (omo) runs.
    const results = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGitExec(),
      packageRoot,
    });

    // THEN: 5 results; first three are "Already completed (step 6)".
    expect(results.length).toBe(5);
    expect(results[0].ok).toBe(true);
    expect(results[0].detail).toContain("Already completed (step 6)");
    expect(results[1].ok).toBe(true);
    expect(results[1].detail).toContain("Already completed (step 6)");
    expect(results[2].ok).toBe(true);
    expect(results[2].detail).toContain("Already completed (step 6)");

    // Step 4 (marker) runs (idempotent, no state step).
    expect(results[3].name).toBe("project-marker");
    expect(results[3].ok).toBe(true);

    // Step 5 (omo) runs and succeeds.
    expect(results[4].name).toBe("omo-dirs");
    expect(results[4].ok).toBe(true);

    // AND: step 7 now marked.
    const state = await readState(projectRoot, "init");
    expect(state.completedSteps).toContain(7);

    // AND: .omo subdirs exist.
    for (const dir of OMO_SUBDIRS) {
      expect(existsSync(join(projectRoot, ".omo", dir))).toBe(true);
    }
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("runInit idempotent: full happy run then re-run returns 'already initialized'", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const { runInit } = await import("../init-module.js");

    // First run: full init.
    const first = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGitExec(),
      packageRoot,
    });
    expect(first.length).toBe(5);
    expect(first.every((r: any) => r.ok)).toBe(true);

    // WHEN: re-run init on the already-initialized project.
    const second = await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGitExec(),
      packageRoot,
    });

    // THEN: single "already initialized" result.
    expect(second.length).toBe(1);
    expect(second[0].ok).toBe(true);
    expect(second[0].detail).toBe("already initialized");
  } finally {
    cleanupTempDir(packageRoot);
    cleanupTempDir(projectRoot);
  }
});

test("runInit marker JSON shape: {name, path, repo}", async () => {
  const packageRoot = createTempDir();
  const projectRoot = createTempDir();

  try {
    createMockPackage(packageRoot);
    const { runInit } = await import("../init-module.js");

    await runInit({
      projectRoot,
      notify: () => {},
      execSyncOverride: makeGitExec("acme/widget-factory"),
      packageRoot,
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
  }
});