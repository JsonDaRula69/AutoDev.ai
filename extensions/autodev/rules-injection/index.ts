/**
 * Rules injection module — dynamic guardrail rule loading.
 *
 * Loads `.omo/rules/*.md` files and injects them into agent context via the
 * `before_agent_start` event handler. This is distinct from T5's context
 * injection (which loads AGENTS.md, CONTEXT.md, and `.autodev/memory/*.md`);
 * rules-injection adds project-specific coding standards from `.omo/rules/`.
 *
 * No-op if `.omo/rules/` is empty or doesn't exist.
 */
import type { ExtensionAPI, BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Discover every `.md` file under `.omo/rules/` (non-recursive). */
function listRuleFiles(projectRoot: string): readonly string[] {
  const dir = resolve(projectRoot, ".omo", "rules");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
}

/** Safely read a file, returning `undefined` when it is missing or unreadable. */
function readOptional(absPath: string): string | undefined {
  if (!existsSync(absPath)) return undefined;
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return undefined;
  }
}

/** Load all rule files and return them as a single context block. */
function loadRulesBlock(projectRoot: string): string {
  const ruleFiles = listRuleFiles(projectRoot);
  if (ruleFiles.length === 0) return "";

  const sections: string[] = [];
  for (const name of ruleFiles) {
    const content = readOptional(resolve(projectRoot, ".omo", "rules", name));
    if (content !== undefined) {
      sections.push(`<!-- autodev-rule: ${name} -->\n${content}`);
    }
  }

  if (sections.length === 0) return "";

  return `\n\n# Project Rules (.omo/rules)\n\n${sections.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI): void {
  const projectRoot = process.cwd();

  pi.on("before_agent_start", async (event: BeforeAgentStartEvent, _ctx) => {
    const block = loadRulesBlock(projectRoot);
    if (block === "") return undefined;
    return { systemPrompt: `${event.systemPrompt}${block}` };
  });
}
