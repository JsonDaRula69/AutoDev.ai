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
import { suggestLore } from "../loreguard/index.js";

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
 * Store a decision — writes an ADR draft to Loreguard via `suggest_lore` and
 * returns a descriptor with `written: true` and the new decision id in the
 * note. The ADR starts in `draft` status; the caller (or a reviewing agent)
 * must `ratify_lore` it before it becomes truth.
 */
export function storeDecision(
  title: string,
  content: string,
): StorageDescriptor {
  const adrContent = `# ADR: ${title}\n\n${content}\n\n## Status\n\nDraft (suggest_lore)\n`;
  const res = suggestLore(title, adrContent, "fact");
  return {
    kind: "decision",
    backend: "loreguard:adr",
    target: `loreguard decision #${res.id}`,
    content: adrContent,
    written: true,
    note: `Decision #${res.id} created as draft in Loreguard. Call ratify_lore(id=${res.id}) to submit for review.`,
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

export function register(_pi: ExtensionAPI): void {
  // notepad is invoked directly by subagents; no event subscriptions or
  // tool registrations are required at load time.
}