/**
 * Heartbeat — setInterval timer polling GitHub for new work.
 *
 * Each tick:
 * 1. Polls GitHub for issues labeled `autodev-request` across all projects.
 * 2. Checks for stalled PRs (autodev-ci-running > 30 min).
 * 3. Checks for blocked issues needing self-healing.
 *
 * Uses the `gh` CLI for all GitHub operations. Implements exponential backoff
 * on `gh` errors (base 30s, max 5 min, max 10 retries).
 */
import { execSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectEntry, ProjectRegistry } from "./projects.js";
import { loadRegistry, getActiveProject } from "./projects.js";
import { dispatchIssue } from "./dispatch.js";

// ---- Types ----

export interface HeartbeatState {
  readonly running: boolean;
  readonly intervalMs: number;
  readonly lastTickAt: number | undefined;
  readonly tickCount: number;
  readonly errors: number;
  readonly projects: number;
}

export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

export interface WorkItem {
  readonly issue_number: number;
  readonly dispatched_at: number;
  readonly state: string;
  readonly project: string;
}

export interface StalledPR {
  readonly number: number;
  readonly title: string;
  readonly minutesStalled: number;
}

// ---- Constants ----

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const BACKOFF_BASE_MS = 30_000; // 30 seconds
const BACKOFF_MAX_MS = 5 * 60_000; // 5 minutes
const MAX_RETRIES = 10;
const MAX_ISSUE_TEXT_CHARS = 50_000;

// ---- State ----

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let heartbeatRunning = false;
let heartbeatIntervalMs = DEFAULT_INTERVAL_MS;
let lastTickAt: number | undefined;
let tickCount = 0;
let errorCount = 0;
let currentBackoffMs = BACKOFF_BASE_MS;
let retryCount = 0;
let onTickCallbacks: Array<(state: HeartbeatState) => void> = [];

// ---- Public API ----

export function getHeartbeatState(): HeartbeatState {
  return {
    running: heartbeatRunning,
    intervalMs: heartbeatIntervalMs,
    lastTickAt,
    tickCount,
    errors: errorCount,
    projects: 1, // updated on each tick
  };
}

export function onTick(cb: (state: HeartbeatState) => void): void {
  onTickCallbacks.push(cb);
}

export function startHeartbeat(intervalMs?: number): void {
  if (heartbeatTimer !== undefined) return;
  if (intervalMs !== undefined) heartbeatIntervalMs = intervalMs;
  heartbeatRunning = true;
  // Fire immediately, then on interval
  void tick();
  heartbeatTimer = setInterval(() => void tick(), heartbeatIntervalMs);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== undefined) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
  heartbeatRunning = false;
}

export function setHeartbeatInterval(ms: number): void {
  heartbeatIntervalMs = ms;
  if (heartbeatRunning) {
    stopHeartbeat();
    startHeartbeat(ms);
  }
}

// ---- Tick ----

async function tick(): Promise<void> {
  if (!heartbeatRunning) return;
  lastTickAt = Date.now();
  tickCount++;

  try {
    const registry = await loadRegistry();
    const projects = registry.projects.filter((p) => p.active);

    for (const project of projects) {
      await pollProject(project);
    }

    // Success — reset backoff
    currentBackoffMs = BACKOFF_BASE_MS;
    retryCount = 0;
  } catch (err) {
    errorCount++;
    // Exponential backoff
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      currentBackoffMs = Math.min(currentBackoffMs * 2, BACKOFF_MAX_MS);
      // The next tick will fire after the backoff period
      if (heartbeatTimer !== undefined) {
        clearInterval(heartbeatTimer);
      }
      heartbeatTimer = setInterval(() => void tick(), currentBackoffMs);
    }
    // If max retries exceeded, keep running at normal interval (don't silent-fail forever)
  }

  // Notify callbacks
  const state = getHeartbeatState();
  for (const cb of onTickCallbacks) {
    try {
      cb(state);
    } catch {
      // Don't let callback errors crash the heartbeat
    }
  }
}

// ---- Project polling ----

async function pollProject(project: ProjectEntry): Promise<void> {
  // 1. Poll for new autodev-request issues
  const issues = await fetchIssues(project);
  for (const issue of issues) {
    await handleNewIssue(issue, project);
  }

  // 2. Check for stalled PRs
  const stalled = await checkStalledPRs(project);
  for (const pr of stalled) {
    await handleStalledPR(pr, project);
  }

  // 3. Check for blocked issues needing self-healing
  await checkBlockedIssues(project);
}

// ---- GitHub CLI helpers ----

function ghExec(args: string[], cwd: string): string {
  const result = require("node:child_process").execSync(`gh ${args.join(" ")}`, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.trim();
}

async function fetchIssues(project: ProjectEntry): Promise<GitHubIssue[]> {
  try {
    const raw = ghExec(
      [
        "issue",
        "list",
        "--label",
        "autodev-request",
        "--state",
        "open",
        "--json",
        "number,title,body",
        "--limit",
        "50",
      ],
      project.path,
    );
    if (raw.length === 0) return [];
    return JSON.parse(raw) as GitHubIssue[];
  } catch {
    return [];
  }
}

async function checkStalledPRs(project: ProjectEntry): Promise<StalledPR[]> {
  try {
    const raw = ghExec(
      [
        "pr",
        "list",
        "--label",
        "autodev-ci-running",
        "--state",
        "open",
        "--json",
        "number,title,createdAt",
        "--limit",
        "20",
      ],
      project.path,
    );
    if (raw.length === 0) return [];

    const prs = JSON.parse(raw) as Array<{ number: number; title: string; createdAt: string }>;
    const now = Date.now();
    const stalled: StalledPR[] = [];

    for (const pr of prs) {
      const created = new Date(pr.createdAt).getTime();
      const elapsed = now - created;
      if (elapsed > STALL_THRESHOLD_MS) {
        stalled.push({
          number: pr.number,
          title: pr.title,
          minutesStalled: Math.floor(elapsed / 60_000),
        });
      }
    }

    return stalled;
  } catch {
    return [];
  }
}

async function checkBlockedIssues(project: ProjectEntry): Promise<void> {
  try {
    const raw = ghExec(
      [
        "issue",
        "list",
        "--label",
        "autodev-blocked",
        "--state",
        "open",
        "--json",
        "number,title",
        "--limit",
        "20",
      ],
      project.path,
    );
    // Currently a no-op — blocked issues are surfaced to the user.
    // Future: self-healing logic (e.g., re-trigger stalled CI).
  } catch {
    // Silently ignore — blocked issue check is best-effort
  }
}

// ---- Issue handling ----

async function handleNewIssue(issue: GitHubIssue, project: ProjectEntry): Promise<void> {
  // Check work-items file for dedup
  const workItemPath = workItemPathFor(issue.number, project);
  const existing = await readWorkItem(workItemPath);

  if (existing !== undefined && existing.state !== "autodev-blocked") {
    // Already dispatched and not blocked — skip
    return;
  }

  // Truncate issue text
  const body = issue.body.length > MAX_ISSUE_TEXT_CHARS
    ? issue.body.slice(0, MAX_ISSUE_TEXT_CHARS) + "\n\n[...truncated]"
    : issue.body;

  // Dispatch to Nemo triage
  const taskId = await dispatchIssue({
    issueNumber: issue.number,
    title: issue.title,
    body,
    project,
  });

  // Write work-item file
  const workItem: WorkItem = {
    issue_number: issue.number,
    dispatched_at: Date.now(),
    state: "dispatched",
    project: project.name,
  };
  await writeWorkItem(workItemPath, workItem);
}

async function handleStalledPR(pr: StalledPR, project: ProjectEntry): Promise<void> {
  try {
    // Comment on the PR about the stall
    ghExec(
      [
        "pr",
        "comment",
        String(pr.number),
        "--body",
        `⚠️ This PR has been stalled for ${pr.minutesStalled} minutes with the \`autodev-ci-running\` label. AutoDev is investigating.`,
      ],
      project.path,
    );
    // Transition to blocked
    ghExec(
      [
        "issue",
        "edit",
        String(pr.number),
        "--remove-label",
        "autodev-ci-running",
        "--add-label",
        "autodev-blocked",
      ],
      project.path,
    );
  } catch {
    // Best-effort
  }
}

// ---- Work-item persistence ----

function workItemPathFor(issueNumber: number, project: ProjectEntry): string {
  return join(project.path, ".autodev", "work-items", `${issueNumber}.json`);
}

async function readWorkItem(path: string): Promise<WorkItem | undefined> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as WorkItem;
  } catch {
    return undefined;
  }
}

async function writeWorkItem(path: string, item: WorkItem): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(item, null, 2), "utf-8");
}

// ---- Label transitions ----

export async function transitionLabel(
  issueNumber: number,
  removeLabel: string,
  addLabel: string,
  projectRoot?: string,
): Promise<void> {
  try {
    ghExec(
      [
        "issue",
        "edit",
        String(issueNumber),
        "--remove-label",
        removeLabel,
        "--add-label",
        addLabel,
      ],
      projectRoot ?? process.cwd(),
    );
  } catch {
    // Best-effort — label transitions should not crash the heartbeat
  }
}
