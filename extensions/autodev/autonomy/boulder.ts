/**
 * Boulder state — cross-session work plan tracking.
 *
 * State lives in `.omo/boulder.json` with fields:
 *   schema_version, active_work_id, works map, active_plan, plan_name,
 *   session_ids, started_at, status, updated_at, task_sessions, agent.
 *
 * On `/start-work`:
 *   - Resume mode: if boulder.json exists, read state, calculate progress,
 *     inject continuation prompt.
 *   - Init mode: if no boulder.json, find latest plan in `.omo/plans/`,
 *     create boulder.json, begin execution.
 */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, extname } from "node:path";

// ---- Types ----

export interface TaskSessionEntry {
  readonly task_key: string;
  readonly task_label: string;
  readonly task_title: string;
  readonly session_id: string;
  readonly agent: string;
  readonly category: string;
  readonly updated_at: string;
  readonly started_at: string;
  readonly status: string;
  readonly ended_at?: string;
  readonly elapsed_ms?: number;
}

export interface WorkEntry {
  readonly work_id: string;
  readonly active_plan: string;
  readonly plan_name: string;
  readonly status: string;
  readonly started_at: string;
  readonly updated_at: string;
  readonly session_ids: readonly string[];
  readonly session_origins: Record<string, string>;
  readonly agent: string;
  readonly task_sessions: Record<string, TaskSessionEntry>;
  readonly worktree_path?: string;
  readonly ended_at?: string;
  readonly elapsed_ms?: number;
}

export interface BoulderState {
  readonly schema_version: number;
  readonly active_work_id: string;
  readonly works: Record<string, WorkEntry>;
  readonly active_plan: string;
  readonly plan_name: string;
  readonly status: string;
  readonly started_at: string;
  readonly updated_at: string;
  readonly session_ids: readonly string[];
  readonly session_origins: Record<string, string>;
  readonly agent: string;
  readonly task_sessions: Record<string, TaskSessionEntry>;
}

export interface BoulderProgress {
  readonly totalTodos: number;
  readonly completedTodos: number;
  readonly percentComplete: number;
  readonly planName: string;
  readonly status: string;
}

export type BoulderMode = "resume" | "init";

export interface BoulderResult {
  readonly mode: BoulderMode;
  readonly state: BoulderState | undefined;
  readonly progress: BoulderProgress | undefined;
  readonly error: string | undefined;
}

// ---- Constants ----

const BOULDER_FILE = ".omo/boulder.json";
const PLANS_DIR = ".omo/plans";
const CURRENT_SCHEMA_VERSION = 2;

// ---- Public API ----

/**
 * Load the boulder state from disk.
 * Returns undefined if the file does not exist or is unreadable.
 */
export async function loadBoulder(projectRoot: string): Promise<BoulderState | undefined> {
  const path = join(projectRoot, BOULDER_FILE);
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as BoulderState;
  } catch {
    return undefined;
  }
}

/**
 * Save boulder state to disk.
 */
export async function saveBoulder(state: BoulderState, projectRoot: string): Promise<void> {
  const path = join(projectRoot, BOULDER_FILE);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Calculate progress from a boulder state.
 * Counts todos in the active work's task_sessions.
 */
export function calculateProgress(state: BoulderState): BoulderProgress {
  const taskSessions = state.task_sessions ?? {};
  const entries = Object.values(taskSessions);
  const totalTodos = entries.length;
  const completedTodos = entries.filter((e) => e.status === "completed").length;
  const percentComplete = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

  return {
    totalTodos,
    completedTodos,
    percentComplete,
    planName: state.plan_name,
    status: state.status,
  };
}

/**
 * Determine resume vs init mode for `/start-work`.
 *
 * Resume mode: boulder.json exists and has an active work with status "active".
 * Init mode: no boulder.json or no active work — find latest plan.
 */
export async function determineMode(projectRoot: string): Promise<BoulderResult> {
  const state = await loadBoulder(projectRoot);

  if (state !== undefined && state.status === "active") {
    const progress = calculateProgress(state);
    return {
      mode: "resume",
      state,
      progress,
      error: undefined,
    };
  }

  // Init mode — find latest plan
  try {
    const latestPlan = await findLatestPlan(projectRoot);
    if (latestPlan === undefined) {
      return {
        mode: "init",
        state: undefined,
        progress: undefined,
        error: "No plan files found in .omo/plans/",
      };
    }
    return {
      mode: "init",
      state: undefined,
      progress: {
        totalTodos: 0,
        completedTodos: 0,
        percentComplete: 0,
        planName: latestPlan.planName,
        status: "active",
      },
      error: undefined,
    };
  } catch (e) {
    return {
      mode: "init",
      state: undefined,
      progress: undefined,
      error: `Failed to find latest plan: ${(e as Error).message}`,
    };
  }
}

/**
 * Create a new boulder state for a plan.
 */
export function createBoulderState(
  planPath: string,
  planName: string,
  agent: string,
  projectRoot: string,
): BoulderState {
  const now = new Date().toISOString();
  const workId = `${planName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const workEntry: WorkEntry = {
    work_id: workId,
    active_plan: planPath,
    plan_name: planName,
    status: "active",
    started_at: now,
    updated_at: now,
    session_ids: [],
    session_origins: {},
    agent,
    task_sessions: {},
  };

  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    active_work_id: workId,
    works: { [workId]: workEntry },
    active_plan: planPath,
    plan_name: planName,
    status: "active",
    started_at: now,
    updated_at: now,
    session_ids: [],
    session_origins: {},
    agent,
    task_sessions: {},
  };
}

/**
 * Build a continuation prompt from boulder state for resume mode.
 */
export function buildContinuationPrompt(progress: BoulderProgress): string {
  return [
    `## Work Continuation`,
    ``,
    `Resuming plan: ${progress.planName}`,
    `Progress: ${progress.completedTodos}/${progress.totalTodos} todos completed (${progress.percentComplete}%)`,
    `Status: ${progress.status}`,
    ``,
    `Continue working on the next pending todo. Do NOT redo completed work.`,
  ].join("\n");
}

// ---- Internal helpers ----

async function findLatestPlan(projectRoot: string): Promise<{ planPath: string; planName: string } | undefined> {
  const plansDir = join(projectRoot, PLANS_DIR);
  if (!existsSync(plansDir)) {
    return undefined;
  }

  const files = await readdir(plansDir);
  const planFiles = files
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      name: f,
      path: join(plansDir, f),
      mtime: 0,
    }));

  if (planFiles.length === 0) {
    return undefined;
  }

  // Sort by modification time (newest first)
  const withStats = await Promise.all(
    planFiles.map(async (pf) => {
      try {
        const stat = await import("node:fs/promises").then((m) => m.stat(pf.path));
        return { ...pf, mtime: stat.mtimeMs };
      } catch {
        return { ...pf, mtime: 0 };
      }
    }),
  );

  withStats.sort((a, b) => b.mtime - a.mtime);
  const latest = withStats[0];
  if (latest === undefined) return undefined;

  const planName = basename(latest.name, extname(latest.name));
  return { planPath: latest.path, planName };
}
