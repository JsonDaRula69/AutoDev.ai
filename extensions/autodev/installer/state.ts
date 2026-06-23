/**
 * Install state — read/write `.autodev/install-state.json` for resume.
 *
 * Records which steps have completed so re-running `autodev install` skips
 * already-finished steps. Idempotent by design.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface InstallState {
  readonly completedSteps: number[];
  readonly startedAt: string;
  readonly updatedAt: string;
}

const STATE_FILE = ".autodev/install-state.json";

function statePath(projectRoot: string): string {
  return join(projectRoot, STATE_FILE);
}

/** Read the current install state, or return a fresh one if none exists. */
export async function readState(projectRoot: string): Promise<InstallState> {
  const path = statePath(projectRoot);
  if (!existsSync(path)) {
    return { completedSteps: [], startedAt: "", updatedAt: "" };
  }
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as InstallState;
  } catch {
    return { completedSteps: [], startedAt: "", updatedAt: "" };
  }
}

/** Mark a step as completed and persist. */
export async function markStepCompleted(
  projectRoot: string,
  step: number,
): Promise<void> {
  const state = await readState(projectRoot);
  if (state.completedSteps.includes(step)) return; // already done

  const now = new Date().toISOString();
  const updated: InstallState = {
    completedSteps: [...state.completedSteps, step],
    startedAt: state.startedAt || now,
    updatedAt: now,
  };
  await writeState(projectRoot, updated);
}

/** Persist the full state object. */
export async function writeState(
  projectRoot: string,
  state: InstallState,
): Promise<void> {
  const dir = join(projectRoot, ".autodev");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(statePath(projectRoot), JSON.stringify(state, null, 2), "utf-8");
}

/** Check if a specific step has already been completed. */
export async function isStepCompleted(
  projectRoot: string,
  step: number,
): Promise<boolean> {
  const state = await readState(projectRoot);
  return state.completedSteps.includes(step);
}
