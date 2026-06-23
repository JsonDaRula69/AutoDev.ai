/**
 * Init module — project-level `autodev init` steps 1-5.
 *
 * Creates the `.autodev/` directory tree, copies templates from the central
 * package, sets up `.github/ISSUE_TEMPLATE/`, writes the project marker, and
 * creates `.omo/` subdirs. Idempotent via `state.ts` scope `"init"`.
 *
 * Steps 1-3 (dirs, templates, .github) are tracked as state step 6 ("project
 * structure"). Step 5 (.omo) is tracked as state step 7. Step 4 (marker) is an
 * idempotent write with no dedicated state step — it re-runs safely on every
 * invocation.
 *
 * Steps 6-9 (registry, AGENTS.md, repo, labels) and step 10 (onboard) are
 * implemented in T9/T10 — this module only owns steps 1-5.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { isStepCompleted, markStepCompleted } from "./state.js";
import type { InstallFixResult } from "./install-module.js";

// ---- Types ----

export interface InitModuleDeps {
  readonly projectRoot: string;
  /** Notify the user (maps to ctx.ui.notify in production). */
  readonly notify: (message: string, level: "info" | "warning" | "error") => void;
  /** Override for execSync (injectable for tests; used by step 4 repo detection
   * and T9/T10 gh commands). */
  readonly execSyncOverride?: (command: string, options?: ExecSyncOptions) => Buffer;
  /** Optional global package root for template source (tests). Defaults to
   * `~/.bun/install/global/node_modules/autodev/`. */
  readonly packageRoot?: string;
  /** If true, skip the onboard step (T10). Defaults to false. */
  readonly skipOnboard?: boolean;
}

// ---- Constants ----

/** `.autodev/` subdirs created by step 1. NOT config/skills/reference — those
 * are centralized via symlinks (T1). */
const AUTODEV_SUBDIRS = [
  "evidence", "decisions", "work-items", "debates",
  "embeddings", "research", "memory", "plans", "scripts",
] as const;

/** Templates copied from the central package into `.autodev/templates/`. */
const TEMPLATE_FILES = [
  "ADR-template.md", "autodev-delivery.md",
  "autodev-request.md", "harbor-log.md",
] as const;

/** `.omo/` subdirs created by step 5. */
const OMO_SUBDIRS = ["plans", "evidence", "rules", "drafts", "notepads"] as const;

/** Init state steps (scope "init"). Steps 1-3 share step 6; step 5 uses step 7. */
const STEP_STRUCTURE = 6;
const STEP_OMO = 7;

// ---- Public API ----

/**
 * Run `autodev init` steps 1-5 and return a result per step.
 *
 * Steps:
 *   1. Create `.autodev/` subdirs (9 dirs).
 *   2. Copy 4 templates from the central package into `.autodev/templates/`.
 *   3. Create `.github/ISSUE_TEMPLATE/` and copy `autodev-request.md`.
 *   4. Write `.autodev/project` marker JSON.
 *   5. Create `.omo/` subdirs (5 dirs).
 *
 * Idempotency: steps 1-3 are tracked as state step 6; step 5 as step 7. If a
 * state step is already complete, the corresponding steps are skipped. The
 * `.autodev/project` marker is a secondary fast-path: if it exists AND both
 * state steps are complete, init returns a single "already initialized"
 * result without running any step.
 */
export async function runInit(deps: InitModuleDeps): Promise<InstallFixResult[]> {
  const results: InstallFixResult[] = [];
  const { projectRoot, notify } = deps;

  // Fast path: marker exists AND both state steps complete → already initialized.
  const markerPath = join(projectRoot, ".autodev", "project");
  const structDone = await isStepCompleted(projectRoot, STEP_STRUCTURE, "init");
  const omoDone = await isStepCompleted(projectRoot, STEP_OMO, "init");
  if (existsSync(markerPath) && structDone && omoDone) {
    notify("Project already initialized.", "info");
    return [{ name: "init", ok: true, detail: "already initialized" }];
  }

  // ---- Steps 1-3: project structure (tracked as state step 6) ----
  if (structDone) {
    results.push({ name: "autodev-dirs", ok: true, detail: "Already completed (step 6)." });
    results.push({ name: "templates", ok: true, detail: "Already completed (step 6)." });
    results.push({ name: "github-template", ok: true, detail: "Already completed (step 6)." });
  } else {
    results.push(runStep1Dirs(projectRoot, notify));
    results.push(runStep2Templates(projectRoot, notify, deps.packageRoot));
    results.push(runStep3Github(projectRoot, notify));
    // Mark step 6 only if all three structure steps succeeded.
    const structOk = results.slice(-3).every((r) => r.ok);
    if (structOk) {
      await markStepCompleted(projectRoot, STEP_STRUCTURE, "init");
    }
  }

  // ---- Step 4: project marker (idempotent write, no dedicated state step) ----
  results.push(runStep4Marker(projectRoot, notify, deps.execSyncOverride));

  // ---- Step 5: .omo/ subdirs (tracked as state step 7) ----
  if (omoDone) {
    results.push({ name: "omo-dirs", ok: true, detail: "Already completed (step 7)." });
  } else {
    const omoResult = runStep5Omo(projectRoot, notify);
    results.push(omoResult);
    if (omoResult.ok) {
      await markStepCompleted(projectRoot, STEP_OMO, "init");
    }
  }

  return results;
}

// ---- Step implementations ----

/** Step 1: Create `.autodev/` subdirs (9 dirs, not config/skills/reference). */
function runStep1Dirs(projectRoot: string, notify: (m: string, l: "info" | "warning" | "error") => void): InstallFixResult {
  notify("Creating .autodev/ subdirectories...", "info");
  const base = join(projectRoot, ".autodev");
  try {
    for (const dir of AUTODEV_SUBDIRS) {
      mkdirSync(join(base, dir), { recursive: true });
    }
    return { name: "autodev-dirs", ok: true, detail: `Created ${AUTODEV_SUBDIRS.length} subdirs.` };
  } catch (e) {
    return { name: "autodev-dirs", ok: false, detail: `Failed: ${(e as Error).message}` };
  }
}

/** Step 2: Copy 4 templates from the central package into `.autodev/templates/`. */
function runStep2Templates(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
  packageRoot?: string,
): InstallFixResult {
  notify("Copying templates from central package...", "info");
  const srcDir = join(packageRoot ?? defaultPackageRoot(), ".autodev", "templates");
  if (!existsSync(srcDir)) {
    return { name: "templates", ok: false, detail: `Source templates dir missing: ${srcDir}` };
  }
  const destDir = join(projectRoot, ".autodev", "templates");
  const failed: string[] = [];
  let copied = 0;
  for (const file of TEMPLATE_FILES) {
    const src = join(srcDir, file);
    if (!existsSync(src)) {
      failed.push(file);
      continue;
    }
    try {
      mkdirSync(destDir, { recursive: true });
      cpSync(src, join(destDir, file));
      copied++;
    } catch (e) {
      failed.push(`${file} (${(e as Error).message})`);
    }
  }
  if (failed.length > 0) {
    return { name: "templates", ok: false, detail: `Failed: ${failed.join(", ")}` };
  }
  return { name: "templates", ok: true, detail: `Copied ${copied} templates.` };
}

/** Step 3: Create `.github/ISSUE_TEMPLATE/` and copy `autodev-request.md`. */
function runStep3Github(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
): InstallFixResult {
  notify("Creating .github/ISSUE_TEMPLATE/...", "info");
  const src = join(projectRoot, ".autodev", "templates", "autodev-request.md");
  const destDir = join(projectRoot, ".github", "ISSUE_TEMPLATE");
  const dest = join(destDir, "autodev-request.md");
  if (!existsSync(src)) {
    return { name: "github-template", ok: false, detail: "Source autodev-request.md not found in .autodev/templates/." };
  }
  try {
    mkdirSync(destDir, { recursive: true });
    cpSync(src, dest);
    return { name: "github-template", ok: true, detail: "Copied autodev-request.md to .github/ISSUE_TEMPLATE/." };
  } catch (e) {
    return { name: "github-template", ok: false, detail: `Failed: ${(e as Error).message}` };
  }
}

/** Step 4: Write `.autodev/project` marker JSON with name/path/repo. */
function runStep4Marker(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
  execOverride?: (command: string, options?: ExecSyncOptions) => Buffer,
): InstallFixResult {
  notify("Writing .autodev/project marker...", "info");
  const markerPath = join(projectRoot, ".autodev", "project");
  const name = basename(projectRoot);
  const repo = guessRepo(projectRoot, execOverride);
  const marker = { name, path: projectRoot, repo };
  try {
    mkdirSync(join(projectRoot, ".autodev"), { recursive: true });
    writeFileSync(markerPath, JSON.stringify(marker, null, 2) + "\n", "utf-8");
    return { name: "project-marker", ok: true, detail: `Marker written: ${name} (${repo || "no repo"}).` };
  } catch (e) {
    return { name: "project-marker", ok: false, detail: `Failed: ${(e as Error).message}` };
  }
}

/** Step 5: Create `.omo/` subdirs (plans, evidence, rules, drafts, notepads). */
function runStep5Omo(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
): InstallFixResult {
  notify("Creating .omo/ subdirectories...", "info");
  const base = join(projectRoot, ".omo");
  try {
    for (const dir of OMO_SUBDIRS) {
      mkdirSync(join(base, dir), { recursive: true });
    }
    return { name: "omo-dirs", ok: true, detail: `Created ${OMO_SUBDIRS.length} subdirs.` };
  } catch (e) {
    return { name: "omo-dirs", ok: false, detail: `Failed: ${(e as Error).message}` };
  }
}

// ---- Helpers ----

function defaultPackageRoot(): string {
  return join(
    process.env.HOME ?? "",
    ".bun", "install", "global", "node_modules", "autodev",
  );
}

/** Derive `owner/repo` from the git remote origin. Returns "" if unavailable. */
function guessRepo(
  cwd: string,
  execOverride?: (command: string, options?: ExecSyncOptions) => Buffer,
): string {
  try {
    const fn = execOverride ?? execSync;
    const remote = fn("git remote get-url origin", { cwd, encoding: "utf-8" }).toString().trim();
    return remote.replace(/^.*github.com[:\/]/, "").replace(/\.git$/, "");
  } catch {
    return "";
  }
}