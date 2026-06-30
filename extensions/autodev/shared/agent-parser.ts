import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export function parseFrontmatter(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null || match[1] === undefined) return result;
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

export function parseCommaList(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function extractBody(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (match === null || match[1] === undefined) return text.trim();
  return match[1].trim();
}

export function getCentralAgentsDir(): string {
  return join(getAgentDir(), "..", "agents");
}