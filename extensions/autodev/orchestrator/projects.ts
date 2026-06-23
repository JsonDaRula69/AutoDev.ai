/**
 * Project registry — load/save the machine-level registry at
 * `~/.AutoDev/projects.json` (i.e. `join(getAgentDir(), "..", "projects.json")`).
 *
 * Schema: { projects: [{ name, path, repo, active }] }
 * The default active project is the current working directory.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface ProjectEntry {
  readonly name: string;
  readonly path: string;
  readonly repo: string;
  readonly active: boolean;
}

export interface ProjectRegistry {
  readonly projects: ProjectEntry[];
}

/**
 * Resolve the registry file path. Always machine-level:
 * `join(getAgentDir(), "..", "projects.json")`.
 */
function registryPath(): string {
  return join(getAgentDir(), "..", "projects.json");
}

/**
 * Load the project registry from disk.
 * Returns a default registry (current cwd as the only project) if the file
 * does not exist or is unreadable.
 */
export async function loadRegistry(): Promise<ProjectRegistry> {
  const path = registryPath();
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as ProjectRegistry;
    if (!Array.isArray(parsed.projects)) {
      return defaultRegistry();
    }
    return parsed;
  } catch {
    return defaultRegistry();
  }
}

/**
 * Save the project registry to disk. Creates the central directory
 * (the parent of the agent dir, e.g. `~/.AutoDev/`) if it does not exist.
 */
export async function saveRegistry(registry: ProjectRegistry): Promise<void> {
  const path = registryPath();
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Build a default registry with the current working directory as the sole
 * active project. Derives the repo name from the git remote if possible.
 */
export function defaultRegistry(projectRoot?: string): ProjectRegistry {
  const cwd = projectRoot ?? process.cwd();
  const name = guessProjectName(cwd);
  const repo = guessRepo(cwd);
  return { projects: [{ name, path: cwd, repo, active: true }] };
}

/**
 * Get the active project from the registry. Falls back to the default
 * (current cwd) if no project is marked active.
 */
export function getActiveProject(registry: ProjectRegistry): ProjectEntry {
  const active = registry.projects.find((p) => p.active);
  if (active !== undefined) return active;
  // Fallback: first project
  const first = registry.projects[0];
  if (first !== undefined) return first;
  // Should not happen — registry always has at least one project
  return { name: "default", path: process.cwd(), repo: "", active: true };
}

/**
 * Set a project as active (deactivate all others).
 */
export function setActiveProject(registry: ProjectRegistry, name: string): ProjectRegistry {
  return {
    projects: registry.projects.map((p) => ({
      ...p,
      active: p.name === name,
    })),
  };
}

/**
 * Add a project to the registry. If a project with the same name already
 * exists, update it instead.
 */
export function addProject(
  registry: ProjectRegistry,
  entry: Omit<ProjectEntry, "active">,
): ProjectRegistry {
  const existing = registry.projects.findIndex((p) => p.name === entry.name);
  if (existing >= 0) {
    const updated = [...registry.projects];
    updated[existing] = { ...entry, active: registry.projects[existing]!.active };
    return { projects: updated };
  }
  return { projects: [...registry.projects, { ...entry, active: false }] };
}

/**
 * Remove a project from the registry by name.
 */
export function removeProject(registry: ProjectRegistry, name: string): ProjectRegistry {
  return {
    projects: registry.projects.filter((p) => p.name !== name),
  };
}

// ---- Helpers ----

function guessProjectName(cwd: string): string {
  return cwd.split("/").filter(Boolean).pop() ?? "project";
}

function guessRepo(cwd: string): string {
  try {
    const { execSync } = require("node:child_process");
    const remote = execSync("git remote get-url origin", { cwd, encoding: "utf-8" }).trim();
    // Normalise: git@github.com:user/repo.git -> user/repo
    return remote.replace(/^.*github.com[:\/]/, "").replace(/\.git$/, "");
  } catch {
    return "";
  }
}
