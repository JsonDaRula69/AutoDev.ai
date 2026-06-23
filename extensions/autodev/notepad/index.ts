/**
 * notepad — Loreguard-backed wisdom accumulation across subagent tasks.
 *
 * Five storage mappings, each a pure function that describes where the
 * note should be persisted. The actual persistence is delegated to the
 * appropriate backend (ctx_memory, Loreguard, evidence files, research
 * notes); this module only computes the routing so callers can apply it.
 *
 *   Learnings    -> ARCHITECTURE memories via ctx_memory
 *   Decisions    -> ADRs via Loreguard (search_lore / suggest_lore)
 *   Issues       -> CONSTRAINTS memories via ctx_memory
 *   Verification -> evidence files in .omo/evidence/
 *   Problems     -> research notes in .autodev/research/
 */
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * suggestLore is imported from the loreguard extension module. If loreguard
 * is not yet built (or not installed), the import may fail at runtime; the
 * fallback path in {@link storeDecision} must still work in that case. We
 * capture the imported function here and tolerate a failed import by treating
 * loreguard as unavailable.
 */
let suggestLoreImpl: ((title: string, content: string, category?: string) => { id: number }) | undefined;

/**
 * Override suggestLoreImpl for tests that need synchronous injection.
 * Tests call this before setSearchLoreAvailable(true) to avoid the async
 * import race in initSuggestLore.
 */
export function setSuggestLoreImpl(
  impl: ((title: string, content: string, category?: string) => { id: number }) | undefined,
): void {
  suggestLoreImpl = impl;
}

async function initSuggestLore(): Promise<void> {
  try {
    const mod = await import("../loreguard/index.js");
    suggestLoreImpl = typeof mod.suggestLore === "function" ? (mod.suggestLore as typeof suggestLoreImpl) : undefined;
  } catch {
    suggestLoreImpl = undefined;
  }
}

/**
 * Module-level flag recording whether the `search_lore` tool was registered
 * on the pi runtime during {@link register}. When false, {@link storeDecision}
 * falls back to ctx_memory:ARCHITECTURE instead of routing to loreguard:adr.
 *
 * Exposed for tests (and direct callers) so the fallback path can be exercised
 * without a real pi session by calling {@link setSearchLoreAvailable}.
 */
let searchLoreAvailable = false;

/**
 * Override the search_lore availability flag (primarily for tests that do not
 * run the full pi registration lifecycle). When the loreguard module import
 * failed, the flag is forced to false regardless of this call.
 */
export function setSearchLoreAvailable(value: boolean): void {
  // If loreguard is not importable, decisions can never route to loreguard.
  if (suggestLoreImpl === undefined) {
    searchLoreAvailable = false;
    return;
  }
  searchLoreAvailable = value;
}

/** Read the current search_lore availability flag. */
export function isSearchLoreAvailable(): boolean {
  return searchLoreAvailable && suggestLoreImpl !== undefined;
}

/** Category tag used by ctx_memory for architecture facts. */
export const MEMORY_CATEGORY_ARCHITECTURE = "ARCHITECTURE";
/** Category tag used by ctx_memory for hard constraints. */
export const MEMORY_CATEGORY_CONSTRAINTS = "CONSTRAINTS";

/** Which backend a notepad entry is routed to. */
export type NotepadBackend =
  | "ctx_memory:ARCHITECTURE"
  | "loreguard:adr"
  | "ctx_memory:CONSTRAINTS"
  | "evidence-file"
  | "research-note";

/** Kind of notepad entry — maps 1:1 to a backend. */
export type NotepadKind = "learning" | "decision" | "issue" | "verification" | "problem";

/** Descriptor returned by every store* function. */
export interface StorageDescriptor {
  readonly kind: NotepadKind;
  readonly backend: NotepadBackend;
  readonly target: string;
  readonly content: string;
  readonly written: boolean;
  readonly note: string;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeEvidenceFile(projectRoot: string, name: string, content: string): string {
  const dir = resolve(projectRoot, ".omo", "evidence");
  ensureDir(dir);
  const path = resolve(dir, name.endsWith(".txt") ? name : `${name}.txt`);
  writeFileSync(path, content, "utf8");
  return path;
}

function writeResearchNote(projectRoot: string, name: string, content: string): string {
  const dir = resolve(projectRoot, ".autodev", "research");
  ensureDir(dir);
  const path = resolve(dir, name.endsWith(".md") ? name : `${name}.md`);
  writeFileSync(path, content, "utf8");
  return path;
}

/**
 * Store a learning (architecture fact) — routed to ctx_memory ARCHITECTURE.
 * The caller is responsible for invoking `ctx_memory write` with the
 * returned content; this function computes the descriptor and does not
 * itself call ctx_memory (which is an agent tool, not an extension API).
 */
export function storeLearning(
  content: string,
): StorageDescriptor {
  return {
    kind: "learning",
    backend: "ctx_memory:ARCHITECTURE",
    target: "ctx_memory ARCHITECTURE",
    content,
    written: false,
    note: "Call ctx_memory(action='write', category='ARCHITECTURE', content=<content>) to persist.",
  };
}

/**
 * Store a decision. When `search_lore` is available (loreguard registered),
 * writes a draft ADR via `suggest_lore` and returns a descriptor with
 * `written: true` and the new decision id in the note — the ADR starts in
 * `draft` status and must be `ratify_lore`d before it becomes truth.
 *
 * When `search_lore` is NOT available (loreguard not registered or not
 * importable), falls back to ctx_memory:ARCHITECTURE with `written: false`,
 * so the caller is responsible for invoking `ctx_memory write` with the
 * returned content.
 */
export function storeDecision(
  title: string,
  content: string,
): StorageDescriptor {
  if (searchLoreAvailable && suggestLoreImpl !== undefined) {
    const adrContent = `# ADR: ${title}\n\n${content}\n\n## Status\n\nDraft (suggest_lore)\n`;
    const res = suggestLoreImpl(title, adrContent, "fact");
    return {
      kind: "decision",
      backend: "loreguard:adr",
      target: `loreguard decision #${res.id}`,
      content: adrContent,
      written: true,
      note: `Decision #${res.id} created as draft in Loreguard. Call ratify_lore(id=${res.id}) to submit for review.`,
    };
  }
  const fallbackContent = `# ADR: ${title}\n\n${content}\n\n## Status\n\nDraft (ctx_memory fallback)\n`;
  return {
    kind: "decision",
    backend: "ctx_memory:ARCHITECTURE",
    target: "ctx_memory ARCHITECTURE",
    content: fallbackContent,
    written: false,
    note: "search_lore unavailable; routed to ctx_memory. Call ctx_memory(action='write', category='ARCHITECTURE', content=<content>) to persist.",
  };
}

/** Store an issue (hard constraint) — routed to ctx_memory CONSTRAINTS. */
export function storeIssue(
  content: string,
): StorageDescriptor {
  return {
    kind: "issue",
    backend: "ctx_memory:CONSTRAINTS",
    target: "ctx_memory CONSTRAINTS",
    content,
    written: false,
    note: "Call ctx_memory(action='write', category='CONSTRAINTS', content=<content>) to persist.",
  };
}

/**
 * Store verification evidence — written immediately to
 * `.omo/evidence/<name>.txt`. Returns a descriptor with `written: true`
 * and the absolute path in `target`.
 */
export function storeVerification(
  projectRoot: string,
  name: string,
  content: string,
): StorageDescriptor {
  const path = writeEvidenceFile(projectRoot, name, content);
  return {
    kind: "verification",
    backend: "evidence-file",
    target: path,
    content,
    written: true,
    note: `Evidence written to ${path}`,
  };
}

/**
 * Store a research note — written immediately to
 * `.autodev/research/<name>.md`. Returns a descriptor with `written: true`.
 */
export function storeProblem(
  projectRoot: string,
  name: string,
  content: string,
): StorageDescriptor {
  const path = writeResearchNote(projectRoot, name, content);
  return {
    kind: "problem",
    backend: "research-note",
    target: path,
    content,
    written: true,
    note: `Research note written to ${path}`,
  };
}

export function register(pi: ExtensionAPI): void {
  // Kick off lazy import of loreguard so suggestLoreImpl is available by the
  // time storeDecision is called during agent work.
  void initSuggestLore();

  // notepad is invoked directly by subagents; no event subscriptions or
  // tool registrations are required at load time. However, we DO probe the
  // pi runtime for the `search_lore` tool (registered by the loreguard
  // extension) so storeDecision knows whether it can route to loreguard:adr
  // or must fall back to ctx_memory:ARCHITECTURE.
  try {
    const active = pi.getActiveTools();
    searchLoreAvailable = Array.isArray(active) && active.includes("search_lore");
  } catch {
    searchLoreAvailable = false;
  }
  // If loreguard is not importable, decisions can never route to loreguard.
  if (suggestLoreImpl === undefined) {
    searchLoreAvailable = false;
  }
}