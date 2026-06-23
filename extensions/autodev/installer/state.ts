/**
 * Install state — read/write state files for resume support.
 *
 * Two separate state files track two distinct lifecycles:
 *
 *   `.autodev/install-state.json` — machine-level `autodev install` steps
 *     (Bun check, LLM credentials, Magic Context, VoyageAI, Discord)
 *
 *   `.autodev/init-state.json` — project-level `autodev init` steps
 *     (GitHub labels, knowledge base check, docs rebuild)
 *
 * Both use the same schema. Keeping them separate means re-running `autodev
 * install` on a second project doesn't skip project-level steps that belong
 * to the first project, and vice versa.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface InstallState {
  readonly completedSteps: number[];
  readonly startedAt: string;
  readonly updatedAt: string;
}

/** Which lifecycle the state file belongs to. */
export type StateScope = "install" | "init" | "config";

const STATE_FILES: Record<StateScope, string> = {
  install: ".autodev/install-state.json",
  init: ".autodev/init-state.json",
  config: ".autodev/config-state.json",
};

function statePath(projectRoot: string, scope: StateScope): string {
  return join(projectRoot, STATE_FILES[scope]);
}

/** Read the current state for a given scope, or return a fresh one if none exists. */
export async function readState(projectRoot: string, scope: StateScope = "install"): Promise<InstallState> {
  const path = statePath(projectRoot, scope);
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
  scope: StateScope = "install",
): Promise<void> {
  const state = await readState(projectRoot, scope);
  if (state.completedSteps.includes(step)) return; // already done

  const now = new Date().toISOString();
  const updated: InstallState = {
    completedSteps: [...state.completedSteps, step],
    startedAt: state.startedAt || now,
    updatedAt: now,
  };
  await writeState(projectRoot, updated, scope);
}

/** Persist the full state object. */
export async function writeState(
  projectRoot: string,
  state: InstallState,
  scope: StateScope = "install",
): Promise<void> {
  const dir = join(projectRoot, ".autodev");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(statePath(projectRoot, scope), JSON.stringify(state, null, 2), "utf-8");
}

/** Check if a specific step has already been completed. */
export async function isStepCompleted(
  projectRoot: string,
  step: number,
  scope: StateScope = "install",
): Promise<boolean> {
  const state = await readState(projectRoot, scope);
  return state.completedSteps.includes(step);
}