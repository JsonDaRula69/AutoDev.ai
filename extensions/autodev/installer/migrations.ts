/**
 * Migration framework — version-gated config transformations run during
 * `autodev update` before the software itself is updated.
 *
 * Each migration is a function that receives the agent directory
 * (`~/.AutoDev/agent/`) and transforms config files, tokens, env vars,
 * or other state to the format expected by the new version.
 *
 * The last-migrated version is tracked in `~/.AutoDev/.autodev-version`.
 * On update, migrations between the recorded version and the target
 * version run in order. If no version file exists, all migrations run
 * (treats the install as pre-migration-framework).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export interface MigrationResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface Migration {
  readonly version: string;
  readonly description: string;
  readonly run: (agentDir: string) => MigrationResult;
}

const VERSION_FILE = ".autodev-version";

function versionFilePath(agentDir: string): string {
  return join(dirname(agentDir), VERSION_FILE);
}

export function getLastMigratedVersion(agentDir: string): string | null {
  const path = versionFilePath(agentDir);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return null;
  }
}

export function writeCurrentVersion(agentDir: string, version: string): void {
  const path = versionFilePath(agentDir);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, version, "utf-8");
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

export function selectMigrations(
  all: readonly Migration[],
  fromVersion: string | null,
  toVersion: string,
): readonly Migration[] {
  return all
    .filter((m) => {
      if (fromVersion === null) return true;
      return compareSemver(m.version, fromVersion) > 0 && compareSemver(m.version, toVersion) <= 0;
    })
    .sort((a, b) => compareSemver(a.version, b.version));
}

export function runMigrations(
  migrations: readonly Migration[],
  agentDir: string,
): MigrationResult[] {
  const results: MigrationResult[] = [];
  for (const m of migrations) {
    try {
      const result = m.run(agentDir);
      results.push(result);
    } catch (e) {
      results.push({
        name: m.version,
        ok: false,
        detail: `Migration ${m.version} threw: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return results;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: "0.1.14",
    description: "Ensure PI_CODING_AGENT_DIR fallback to ~/.AutoDev/agent",
    run: (agentDir: string): MigrationResult => {
      const home = process.env.HOME ?? "~";
      const autodevAgentDir = join(home, ".AutoDev", "agent");
      if (process.env.PI_CODING_AGENT_DIR === undefined && existsSync(autodevAgentDir)) {
        return {
          name: "0.1.14-pi-agent-dir-fallback",
          ok: true,
          detail: `~/.AutoDev/agent exists; resolveAgentDir will auto-detect it.`,
        };
      }
      return {
        name: "0.1.14-pi-agent-dir-fallback",
        ok: true,
        detail: "No action needed — env var already set or ~/.AutoDev/agent absent.",
      };
    },
  },
];

export function _resetMigrations(): void {
  // Test helper — no-op for now, migrations array is const
}