/**
 * Init module — project-level `autodev init` steps 1-9.
 *
 * Creates the `.autodev/` directory tree, copies templates from the central
 * package, sets up `.github/ISSUE_TEMPLATE/`, writes the project marker, and
 * creates `.omo/` subdirs. Steps 6-9 update the machine-level project registry,
 * seed AGENTS.md/CONTEXT.md, ensure the GitHub repo exists, and dedup labels.
 * Idempotent via `state.ts` scope `"init"`.
 *
 * Steps 1-3 (dirs, templates, .github) are tracked as state step 6 ("project
 * structure"). Step 5 (.omo) is tracked as state step 7. Step 4 (marker) is an
 * idempotent write with no dedicated state step. Steps 6-7 (registry + docs)
 * are tracked as state step 8. Steps 8-9 (repo + labels) are tracked as state
 * step 9.
 *
 * Step 10 (onboard) is implemented in T10 — this module owns steps 1-9.
 *
 * allow: SIZE_OK - T9 task constraints forbid touching files outside
 * init-module.ts; split into steps-helpers deferred to post-merge follow-up.
 */
import { execSync, type ExecSyncOptions } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { isStepCompleted, markStepCompleted } from "./state.js";
import type { InstallFixResult } from "./install-module.js";
import {
  loadRegistry,
  addProject,
  setActiveProject,
  saveRegistry,
} from "../orchestrator/projects.js";

// ---- Types ----

export interface InitModuleDeps {
  readonly projectRoot: string;
  /** Notify the user (maps to ctx.ui.notify in production). */
  readonly notify: (message: string, level: "info" | "warning" | "error") => void;
  /** Override for execSync (injectable for tests; used by step 4 repo detection
   * and steps 8-9 gh commands). */
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

/** Init state steps (scope "init"). Steps 1-3 share step 6; step 5 uses step 7;
 * steps 6-7 (registry + docs) use step 8; steps 8-9 (repo + labels) use step 9. */
const STEP_STRUCTURE = 6;
const STEP_OMO = 7;
const STEP_REGISTRY_DOCS = 8;
const STEP_REPO_LABELS = 9;

/** The 8 required AutoDev workflow labels. */
const REQUIRED_LABELS: ReadonlyArray<{ readonly name: string; readonly color: string; readonly description: string }> = [
  { name: "autodev-request", color: "fbca04", description: "New work requested, awaiting triage" },
  { name: "autodev-planned", color: "0e8a16", description: "Triage complete, plan exists, ready to implement" },
  { name: "autodev-in-progress", color: "1d76db", description: "Currently being implemented" },
  { name: "autodev-review", color: "5319e7", description: "PR open, awaiting review" },
  { name: "autodev-ready", color: "006b75", description: "Review passed, CI green, ready to merge" },
  { name: "autodev-merged", color: "6e40c9", description: "Merged to main" },
  { name: "autodev-blocked", color: "b60205", description: "Blocked, needs human input" },
  { name: "autodev-rejected", color: "c5def5", description: "Rejected, will not implement" },
];

// ---- Public API ----

/**
 * Run `autodev init` steps 1-9 and return a result per step.
 *
 * Steps 1-5: project structure (dirs, templates, .github, marker, .omo).
 * Step 6: Update the machine-level project registry (~/.AutoDev/projects.json),
 *         add this project, mark it active. Hard-fails if registry write fails.
 * Step 7: Check AGENTS.md / CONTEXT.md in project root; copy from
 *         `~/.AutoDev/reference/templates/` if available, else write inline
 *         fallbacks (AutoDev standing-orders header + placeholder sections).
 * Step 8: `gh repo view` to check repo; `gh repo create --private --source=.`
 *         if missing. Skips labels if repo was just created.
 * Step 9: `gh label list --json name`, diff against the 8 required labels,
 *         `gh label create` for each missing one. Best-effort (warns, continues).
 *
 * A `gh auth status` pre-check gates steps 8-9: if it fails, warns "run
 * `autodev config github` first" and skips both steps.
 *
 * Idempotency: steps 1-3 tracked as state step 6; step 5 as step 7; steps 6-7
 * as state step 8; steps 8-9 as state step 9. If `.autodev/project` exists AND
 * state steps 6+7+8+9 are all complete, returns a single "already initialized"
 * result without running any step.
 */
export async function runInit(deps: InitModuleDeps): Promise<InstallFixResult[]> {
  const results: InstallFixResult[] = [];
  const { projectRoot, notify } = deps;

  // Fast path: marker exists AND all four state steps complete → already initialized.
  const markerPath = join(projectRoot, ".autodev", "project");
  const structDone = await isStepCompleted(projectRoot, STEP_STRUCTURE, "init");
  const omoDone = await isStepCompleted(projectRoot, STEP_OMO, "init");
  const regDocsDone = await isStepCompleted(projectRoot, STEP_REGISTRY_DOCS, "init");
  const repoLabelsDone = await isStepCompleted(projectRoot, STEP_REPO_LABELS, "init");
  if (existsSync(markerPath) && structDone && omoDone && regDocsDone && repoLabelsDone) {
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

  // ---- Steps 6-7: registry + docs (tracked as state step 8) ----
  if (regDocsDone) {
    results.push({ name: "registry", ok: true, detail: "Already completed (step 8)." });
    results.push({ name: "agents-md", ok: true, detail: "Already completed (step 8)." });
    results.push({ name: "context-md", ok: true, detail: "Already completed (step 8)." });
  } else {
    const regResult = await runStep6Registry(projectRoot, notify, deps.execSyncOverride);
    // Step 6 hard-fails: if registry write fails, throw to abort init.
    if (!regResult.ok) {
      throw new Error(`init step 6 (registry) failed: ${regResult.detail}`);
    }
    results.push(regResult);
    results.push(runStep7AgentsMd(projectRoot, notify, deps.packageRoot));
    results.push(runStep7ContextMd(projectRoot, notify, deps.packageRoot));
    const regDocsOk = results.slice(-3).every((r) => r.ok);
    if (regDocsOk) {
      await markStepCompleted(projectRoot, STEP_REGISTRY_DOCS, "init");
    }
  }

  // ---- Steps 8-9: repo + labels (tracked as state step 9) ----
  if (repoLabelsDone) {
    results.push({ name: "repo-check", ok: true, detail: "Already completed (step 9)." });
    results.push({ name: "labels", ok: true, detail: "Already completed (step 9)." });
  } else {
    const { results: ghResults, ran } = runSteps8to9(projectRoot, notify, deps.execSyncOverride);
    for (const r of ghResults) results.push(r);
    // Only mark step 9 if the gh steps actually ran (not skipped due to auth).
    if (ran && ghResults.every((r) => r.ok)) {
      await markStepCompleted(projectRoot, STEP_REPO_LABELS, "init");
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

/** Step 6: Load registry, add this project, mark active, save. Hard-fails. */
async function runStep6Registry(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
  execOverride?: (command: string, options?: ExecSyncOptions) => Buffer,
): Promise<InstallFixResult> {
  notify("Updating project registry...", "info");
  const name = basename(projectRoot);
  const repo = guessRepo(projectRoot, execOverride);
  try {
    const registry = await loadRegistry();
    const updated = setActiveProject(
      addProject(registry, { name, path: projectRoot, repo }),
      name,
    );
    await saveRegistry(updated);
    return { name: "registry", ok: true, detail: `Registry updated: ${name} active.` };
  } catch (e) {
    return { name: "registry", ok: false, detail: `Registry write failed: ${(e as Error).message}` };
  }
}

/** Step 7a: Ensure AGENTS.md exists in project root. Copy from
 * `~/.AutoDev/reference/templates/AGENTS.md` if available, else inline fallback. */
function runStep7AgentsMd(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
  packageRoot?: string,
): InstallFixResult {
  return runStep7Doc(projectRoot, notify, "AGENTS.md", FALLBACK_AGENTS_MD, packageRoot);
}

/** Step 7b: Ensure CONTEXT.md exists in project root. Copy from
 * `~/.AutoDev/reference/templates/CONTEXT.md` if available, else inline fallback. */
function runStep7ContextMd(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
  packageRoot?: string,
): InstallFixResult {
  return runStep7Doc(projectRoot, notify, "CONTEXT.md", FALLBACK_CONTEXT_MD, packageRoot);
}

/** Shared logic for step 7: check a doc file, copy from templates or write fallback. */
function runStep7Doc(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
  fileName: "AGENTS.md" | "CONTEXT.md",
  fallback: string,
  packageRoot?: string,
): InstallFixResult {
  const dest = join(projectRoot, fileName);
  if (existsSync(dest)) {
    return { name: fileName === "AGENTS.md" ? "agents-md" : "context-md", ok: true, detail: `${fileName} already exists.` };
  }
  notify(`Writing ${fileName}...`, "info");
  const templateSrc = join(packageRoot ?? defaultPackageRoot(), ".autodev", "reference", "templates", fileName);
  try {
    if (existsSync(templateSrc)) {
      cpSync(templateSrc, dest);
      return { name: fileName === "AGENTS.md" ? "agents-md" : "context-md", ok: true, detail: `${fileName} copied from template.` };
    }
    writeFileSync(dest, fallback, "utf-8");
    return { name: fileName === "AGENTS.md" ? "agents-md" : "context-md", ok: true, detail: `${fileName} written (inline fallback).` };
  } catch (e) {
    return { name: fileName === "AGENTS.md" ? "agents-md" : "context-md", ok: false, detail: `Failed: ${(e as Error).message}` };
  }
}

/** Steps 8-9: gh auth pre-check, repo check/create, label dedup. Best-effort.
 * Returns the results and whether the gh steps actually ran (false = skipped
 * due to auth failure, in which case the caller should not mark state step 9). */
function runSteps8to9(
  projectRoot: string,
  notify: (m: string, l: "info" | "warning" | "error") => void,
  execOverride?: (command: string, options?: ExecSyncOptions) => Buffer,
): { results: InstallFixResult[]; ran: boolean } {
  const exec = execOverride ?? execSync;
  const repo = guessRepo(projectRoot, execOverride);

  if (!ghAuthCheck(exec, projectRoot)) {
    notify("GitHub CLI not authenticated. Run `autodev config github` first.", "warning");
    return {
      results: [
        { name: "repo-check", ok: true, detail: "Skipped (gh not authenticated)." },
        { name: "labels", ok: true, detail: "Skipped (gh not authenticated)." },
      ],
      ran: false,
    };
  }

  const repoResult = runStep8Repo(projectRoot, repo, exec, notify);
  if (!repoResult.ok) {
    return { results: [repoResult, { name: "labels", ok: false, detail: "Skipped (repo check failed)." }], ran: true };
  }

  if (repoResult.detail.includes("Repo created")) {
    return { results: [repoResult, { name: "labels", ok: true, detail: "Skipped (repo just created)." }], ran: true };
  }

  const labelResult = runStep9Labels(projectRoot, exec, notify);
  return { results: [repoResult, labelResult], ran: true };
}

/** Step 8: Check if repo exists via `gh repo view`; create if missing. */
function runStep8Repo(
  projectRoot: string,
  repo: string,
  exec: (command: string, options?: ExecSyncOptions) => Buffer,
  notify: (m: string, l: "info" | "warning" | "error") => void,
): InstallFixResult {
  if (!repo) {
    return { name: "repo-check", ok: false, detail: "Cannot determine repo from git remote." };
  }
  notify(`Checking GitHub repo ${repo}...`, "info");
  try {
    exec(`gh repo view ${repo}`, { cwd: projectRoot, encoding: "utf-8", stdio: "pipe" });
    return { name: "repo-check", ok: true, detail: `Repo ${repo} exists.` };
  } catch {
    notify(`Repo ${repo} not found, creating...`, "info");
    try {
      const repoName = repo.includes("/") ? repo.split("/").pop()! : repo;
      exec(`gh repo create ${repoName} --private --source=.`, { cwd: projectRoot, encoding: "utf-8", stdio: "pipe" });
      return { name: "repo-check", ok: true, detail: `Repo created: ${repoName} (private).` };
    } catch (e) {
      return { name: "repo-check", ok: false, detail: `Repo create failed: ${(e as Error).message}` };
    }
  }
}

/** Step 9: List existing labels, create missing ones. Best-effort. */
function runStep9Labels(
  projectRoot: string,
  exec: (command: string, options?: ExecSyncOptions) => Buffer,
  notify: (m: string, l: "info" | "warning" | "error") => void,
): InstallFixResult {
  notify("Deduplicating GitHub labels...", "info");
  let existingNames: Set<string>;
  try {
    const raw = exec("gh label list --json name", { cwd: projectRoot, encoding: "utf-8", stdio: "pipe" }).toString().trim();
    const parsed = JSON.parse(raw) as ReadonlyArray<{ name: string }>;
    existingNames = new Set(parsed.map((l) => l.name));
  } catch (e) {
    return { name: "labels", ok: false, detail: `Label list failed: ${(e as Error).message}` };
  }

  const missing = REQUIRED_LABELS.filter((l) => !existingNames.has(l.name));
  if (missing.length === 0) {
    return { name: "labels", ok: true, detail: "All required labels already exist." };
  }

  let created = 0;
  let failed = 0;
  for (const label of missing) {
    try {
      exec(
        `gh label create ${label.name} --color ${label.color} --description "${label.description}"`,
        { cwd: projectRoot, encoding: "utf-8", stdio: "pipe" },
      );
      created++;
    } catch (e) {
      notify(`Label create failed for ${label.name}: ${(e as Error).message}`, "warning");
      failed++;
    }
  }
  return {
    name: "labels",
    ok: true,
    detail: `Labels: ${created} created, ${failed} failed, ${missing.length - failed} of ${missing.length} ok.`,
  };
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

/** Check if `gh` is authenticated. Returns false on any failure. */
function ghAuthCheck(
  exec: (command: string, options?: ExecSyncOptions) => Buffer,
  cwd: string,
): boolean {
  try {
    exec("gh auth status", { cwd, encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ---- Inline fallback doc content ----

const FALLBACK_AGENTS_MD = `# AGENTS.md

AutoDev Standing Orders are in effect for this project. See \`~/.AutoDev/config/standing-orders.md\` for the full text.

## Project

<!-- Replace <PROJECT_NAME> and <PROJECT_CRITICALITY> below. -->
You develop **<PROJECT_NAME>**. This system **<PROJECT_CRITICALITY>**. Act accordingly.

## Crew

The AutoDev crew (Nemo, Aronnax, Ned Land, Oracle, Momus, Conseil, etc.) operates autonomously on this project via GitHub issues and PRs. See the AutoDev README for the full crew roster.

## Conventions

<!-- Add project-specific coding conventions here. -->

## Build & Test

<!-- Add build and test commands here. -->
`;

const FALLBACK_CONTEXT_MD = `# CONTEXT.md

## Project Brief

<!-- One-paragraph description of what this project is and why it exists. -->

## Architecture

<!-- High-level architecture. Link to ARCHITECTURE.md if present. -->

## Tech Stack

<!-- Languages, frameworks, key dependencies. -->

## Active Context

<!-- Current work, open decisions, in-flight plans. -->
`;