/**
 * `.env` file read/write/update — manages credential persistence.
 *
 * Reads an existing `.env` file, updates or appends key=value pairs, and
 * ensures `.gitignore` includes `.env`.
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = ".env";
const GITIGNORE_FILE = ".gitignore";

function envPath(projectRoot: string): string {
  return join(projectRoot, ENV_FILE);
}

function gitignorePath(projectRoot: string): string {
  return join(projectRoot, GITIGNORE_FILE);
}

/** Parse a `.env` file into a map of key → value. */
export function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    map.set(key, value);
  }
  return map;
}

/** Serialize a map of env vars back to `.env` format. */
export function serializeEnv(vars: Map<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of vars) {
    lines.push(`${key}=${value}`);
  }
  return lines.join("\n") + "\n";
}

/** Read the current `.env` file, returning a map. Returns empty map if file doesn't exist. */
export async function readEnv(projectRoot: string): Promise<Map<string, string>> {
  const path = envPath(projectRoot);
  if (!existsSync(path)) return new Map();
  const content = await readFile(path, "utf-8");
  return parseEnv(content);
}

/** Set a key=value pair in the env map and persist. */
export async function setEnvVar(
  projectRoot: string,
  key: string,
  value: string,
): Promise<void> {
  const vars = await readEnv(projectRoot);
  vars.set(key, value);
  await writeFile(envPath(projectRoot), serializeEnv(vars), "utf-8");
}

/** Set multiple key=value pairs at once. */
export async function setEnvVars(
  projectRoot: string,
  entries: ReadonlyArray<[string, string]>,
): Promise<void> {
  const vars = await readEnv(projectRoot);
  for (const [key, value] of entries) {
    vars.set(key, value);
  }
  await writeFile(envPath(projectRoot), serializeEnv(vars), "utf-8");
}

/** Ensure `.gitignore` includes `.env`. Appends if missing. */
export async function ensureGitignore(projectRoot: string): Promise<void> {
  const path = gitignorePath(projectRoot);
  if (!existsSync(path)) {
    await writeFile(path, ".env\n", "utf-8");
    return;
  }
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n").map((l) => l.trim());
  if (lines.includes(".env")) return; // already present
  await appendFile(path, ".env\n", "utf-8");
}
