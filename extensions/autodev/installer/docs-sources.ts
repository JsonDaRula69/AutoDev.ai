import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { multiselect, isCancel, cancel } from "@clack/prompts";
import type { Readable, Writable } from "node:stream";

export interface DocsSourceEntry {
  name: string;
  active: boolean;
  lineRange: [number, number];
  rawLines: string[];
}

export function parseDocsSources(yamlPath: string): DocsSourceEntry[] {
  if (!existsSync(yamlPath)) return [];
  const lines = readFileSync(yamlPath, "utf-8").split("\n");
  const entries: DocsSourceEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const commentedMatch = line.match(/^#\s*-\s*name:\s*(.+)/);
    const activeMatch = line.match(/^\s*-\s*name:\s*(.+)/);
    if (commentedMatch || activeMatch) {
      const name = (commentedMatch ?? activeMatch)![1]!.trim();
      const active = !!activeMatch;
      const start = i;
      const rawLines: string[] = [line];
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? "";
        if (next.match(/^#\s*-\s*name:/) || next.match(/^\s*-\s*name:/) || (next.trim().length > 0 && !next.startsWith("#") && !next.startsWith(" "))) {
          break;
        }
        const futureLine = lines[i + 1] ?? "";
        if (next.trim().length === 0 && (futureLine.match(/^#\s*-\s*name:/) || futureLine.match(/^\s*-\s*name:/))) {
          rawLines.push(next);
          i++;
          break;
        }
        rawLines.push(next);
        i++;
      }
      entries.push({ name, active, lineRange: [start, i - 1], rawLines });
    } else {
      i++;
    }
  }
  return entries;
}

export function toggleDocsSources(yamlPath: string, enabledNames: string[]): number {
  if (!existsSync(yamlPath)) return 0;
  const lines = readFileSync(yamlPath, "utf-8").split("\n");
  const entries = parseDocsSources(yamlPath);
  let changed = 0;

  for (const entry of entries) {
    const shouldEnable = enabledNames.includes(entry.name);
    if (entry.active === shouldEnable) continue;

    const [start, end] = entry.lineRange;
    if (shouldEnable) {
      for (let j = start; j <= end; j++) {
        lines[j] = lines[j]!.replace(/^#\s?/, "");
      }
    } else {
      for (let j = start; j <= end; j++) {
        if (lines[j]!.trim().length > 0) {
          lines[j] = "# " + lines[j];
        }
      }
    }
    changed++;
  }

  if (changed > 0) {
    writeFileSync(yamlPath, lines.join("\n"), "utf-8");
  }
  return changed;
}

export async function runDocsSourcesCommand(opts: {
  yamlPath: string;
  input?: Readable;
  output?: Writable;
}): Promise<number> {
  const { yamlPath } = opts;
  if (!existsSync(yamlPath)) {
    console.error(`Docs sources file not found: ${yamlPath}`);
    return 1;
  }

  const entries = parseDocsSources(yamlPath);
  if (entries.length === 0) {
    console.log("No docs sources found in config.");
    return 0;
  }

  const options = entries.map((e) => ({
    value: e.name,
    label: e.name,
    hint: e.active ? "enabled" : "disabled",
  }));

  const initialValues = entries.filter((e) => e.active).map((e) => e.name);

  const selected = await multiselect({
    message: "Toggle docs sources (Space to toggle, Enter to submit):",
    options,
    initialValues,
    required: false,
    ...(opts.input ? { input: opts.input } : {}),
    ...(opts.output ? { output: opts.output } : {}),
  });

  if (isCancel(selected)) {
    cancel("Operation cancelled.");
    return 1;
  }

  const enabledNames = selected as string[];
  const changed = toggleDocsSources(yamlPath, enabledNames);

  if (changed > 0) {
    console.log(`Updated ${changed} source(s). Run 'autodev docs rebuild central' to fetch new docs.`);
  } else {
    console.log("No changes.");
  }
  return 0;
}