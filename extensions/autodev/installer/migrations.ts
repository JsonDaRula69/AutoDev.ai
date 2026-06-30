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

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
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
  {
    version: "0.1.32",
    description: "Fix ollama-cloud provider config: API type, baseUrl, env var name, model IDs",
    run: (agentDir: string): MigrationResult => {
      let changed = 0;

      // Fix .env: rename OLLAMA_CLOUD_API_KEY to OLLAMA_API_KEY
      const envPath = join(agentDir, ".env");
      if (existsSync(envPath)) {
        try {
          const content = readFileSync(envPath, "utf-8");
          if (content.includes("OLLAMA_CLOUD_API_KEY")) {
            writeFileSync(envPath, content.replace(/OLLAMA_CLOUD_API_KEY/g, "OLLAMA_API_KEY"), "utf-8");
            changed++;
          }
        } catch {
        }
      }

      // Fix auth.json: change $OLLAMA_CLOUD_API_KEY to $OLLAMA_API_KEY
      const authPath = join(agentDir, "auth.json");
      if (existsSync(authPath)) {
        try {
          const content = readFileSync(authPath, "utf-8");
          if (content.includes("OLLAMA_CLOUD_API_KEY")) {
            writeFileSync(authPath, content.replace(/OLLAMA_CLOUD_API_KEY/g, "OLLAMA_API_KEY"), "utf-8");
            changed++;
          }
        } catch {
        }
      }

      // Fix models.json: change api type, baseUrl, add :cloud to model IDs
      const modelsPath = join(agentDir, "models.json");
      if (existsSync(modelsPath)) {
        try {
          const content = readFileSync(modelsPath, "utf-8");
          let updated = content
            .replace(/"api":\s*"openai"/g, '"api": "openai-completions"')
            .replace(/"baseUrl":\s*"https:\/\/api\.ollama\.cloud\/v1"/g, '"baseUrl": "https://ollama.com/v1"')
            .replace(/"apiKey":\s*"\$OLLAMA_CLOUD_API_KEY"/g, '"apiKey": "$OLLAMA_API_KEY"');
          // Add :cloud to model IDs that are missing it
          for (const id of ["glm-5.2", "deepseek-v4-pro", "deepseek-v4-flash", "kimi-k2.7-code", "glm-5.1"]) {
            updated = updated.replace(new RegExp(`"id":\\s*"${id}"`, "g"), `"id": "${id}:cloud"`);
          }
          if (updated !== content) {
            writeFileSync(modelsPath, updated, "utf-8");
            changed++;
          }
        } catch {
        }
      }

      // Fix agent .md files: add :cloud to model strings
      const agentsDir = join(agentDir, "..", "agents");
      if (existsSync(agentsDir)) {
        for (const file of readdirSync(agentsDir)) {
          if (!file.endsWith(".md")) continue;
          const path = join(agentsDir, file);
          try {
            const content = readFileSync(path, "utf-8");
            let updated = content;
            for (const id of ["glm-5.2", "deepseek-v4-pro", "deepseek-v4-flash", "kimi-k2.7-code", "glm-5.1"]) {
              updated = updated.replace(new RegExp(`ollama-cloud/${id}$`, "gm"), `ollama-cloud/${id}:cloud`);
            }
            if (updated !== content) {
              writeFileSync(path, updated, "utf-8");
              changed++;
            }
          } catch {
          }
        }
      }

      return {
        name: "0.1.32-fix-ollama-cloud-config",
        ok: true,
        detail: changed > 0 ? `Fixed ${changed} file(s).` : "No config changes needed.",
      };
    },
  },
];

export function _resetMigrations(): void {
  // Test helper — no-op for now, migrations array is const
}