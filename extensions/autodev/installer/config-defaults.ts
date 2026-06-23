import { existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_OWNER = "autodev-team";
const REPO_NAME = "autodev";
const REPO_BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}`;

const REQUIRED_AGENT_FILES = [
  "nemo", "aronnax", "ned-land", "conseil", "oracle", "momus",
  "metis", "harbor-master", "quartermaster", "boatswain",
  "navigator", "watch-officer", "explore",
];

export interface ConfigCheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly created: boolean;
}

async function downloadFile(url: string): Promise<string | undefined> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return undefined;
    return await resp.text();
  } catch {
    return undefined;
  }
}

export async function validateAndCreateConfig(projectRoot: string): Promise<ConfigCheckResult[]> {
  const results: ConfigCheckResult[] = [];
  const piDir = join(projectRoot, ".pi");

  const settingsPath = join(piDir, "settings.json");
  if (!existsSync(settingsPath)) {
    mkdirSync(piDir, { recursive: true });
    const content = await downloadFile(`${RAW_BASE}/.pi/settings.json`);
    if (content !== undefined) {
      writeFileSync(settingsPath, content, "utf-8");
      results.push({ name: "settings.json", ok: true, detail: "downloaded from repo", created: true });
    } else {
      results.push({ name: "settings.json", ok: false, detail: "missing and download failed", created: false });
    }
  } else {
    results.push({ name: "settings.json", ok: true, detail: "exists", created: false });
  }

  const mcPath = join(piDir, "magic-context.jsonc");
  if (!existsSync(mcPath)) {
    if (!existsSync(piDir)) mkdirSync(piDir, { recursive: true });
    const content = await downloadFile(`${RAW_BASE}/.pi/magic-context.jsonc`);
    if (content !== undefined) {
      writeFileSync(mcPath, content, "utf-8");
      results.push({ name: "magic-context.jsonc", ok: true, detail: "downloaded from repo", created: true });
    } else {
      results.push({ name: "magic-context.jsonc", ok: false, detail: "missing and download failed", created: false });
    }
  } else {
    results.push({ name: "magic-context.jsonc", ok: true, detail: "exists", created: false });
  }

  const agentsDir = join(piDir, "agents");
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }

  const existing = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")) : [];
  const missing = REQUIRED_AGENT_FILES.filter((a) => !existing.includes(`${a}.md`));

  if (missing.length === 0) {
    results.push({ name: "agents/*.md", ok: true, detail: `${existing.length} agent files present`, created: false });
  } else {
    let downloaded = 0;
    let failed = 0;
    for (const agent of missing) {
      const content = await downloadFile(`${RAW_BASE}/.pi/agents/${agent}.md`);
      if (content !== undefined) {
        writeFileSync(join(agentsDir, `${agent}.md`), content, "utf-8");
        downloaded++;
      } else {
        failed++;
      }
    }
    if (failed === 0) {
      results.push({ name: "agents/*.md", ok: true, detail: `downloaded ${downloaded} missing agent files`, created: true });
    } else {
      results.push({
        name: "agents/*.md",
        ok: false,
        detail: `${downloaded} downloaded, ${failed} failed: ${missing.join(", ")}`,
        created: false,
      });
    }
  }

  return results;
}