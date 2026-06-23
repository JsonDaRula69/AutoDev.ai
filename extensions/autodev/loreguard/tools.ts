/**
 * loreguard tool executors — the five pi tool `execute` functions.
 *
 * Each executor calls the typed public API on the module root and wraps the
 * result into the `AgentToolResult`-shaped object pi expects. Splitting the
 * executors out of `index.ts` keeps the module root under the 250-LOC ceiling
 * and makes the tool layer independently testable.
 */
import { Type, type Static } from "typebox";
import type { Decision } from "./operations.js";
import {
  suggestDecision,
  ratifyDecision,
  approveDecision,
  rejectDecision,
  searchDecisions,
  archiveDecision,
} from "./operations.js";
import { getDb } from "./db.js";

// --- Parameter schemas ------------------------------------------------------

export const SuggestLoreSchema = Type.Object({
  title: Type.String({ description: "Decision title" }),
  content: Type.String({ description: "Decision content in markdown" }),
  category: Type.Union(
    [Type.Literal("fact"), Type.Literal("onboarding"), Type.Literal("design")],
    { description: "Category: fact, onboarding, or design", default: "fact" },
  ),
});
export type SuggestLoreInput = Static<typeof SuggestLoreSchema>;

export const RatifyLoreSchema = Type.Object({
  id: Type.Number({ description: "Decision ID" }),
});
export type RatifyLoreInput = Static<typeof RatifyLoreSchema>;

export const ApproveLoreSchema = Type.Object({
  id: Type.Number({ description: "Decision ID" }),
  reasoning: Type.String({ description: "Reasoning for approval" }),
  approver_name: Type.String({ description: "Name of the approving agent" }),
});
export type ApproveLoreInput = Static<typeof ApproveLoreSchema>;

export const RejectLoreSchema = Type.Object({
  id: Type.Number({ description: "Decision ID" }),
  reasoning: Type.String({ description: "Reasoning for rejection" }),
  approver_name: Type.String({ description: "Name of the rejecting agent" }),
});
export type RejectLoreInput = Static<typeof RejectLoreSchema>;

export const SearchLoreSchema = Type.Object({
  query: Type.String({ description: "Search query" }),
  include_drafts: Type.Optional(
    Type.Boolean({ description: "Include drafts in results", default: false }),
  ),
});
export type SearchLoreInput = Static<typeof SearchLoreSchema>;

export const ArchiveLoreSchema = Type.Object({
  id: Type.Number({ description: "Decision ID to archive" }),
});
export type ArchiveLoreInput = Static<typeof ArchiveLoreSchema>;

// --- Result shape -----------------------------------------------------------

export interface ToolDetails {
  readonly name: string;
  readonly result: unknown;
}

export interface ToolResult {
  readonly content: [{ type: "text"; text: string }];
  readonly details: ToolDetails;
}

function text(body: string, details: ToolDetails): ToolResult {
  return { content: [{ type: "text", text: body }], details };
}

// --- Executors --------------------------------------------------------------

export async function suggestLoreExecute(
  _toolCallId: string,
  params: SuggestLoreInput,
): Promise<ToolResult> {
  const cat = params.category;
  const res = suggestDecision(getDb(), params.title, params.content, cat);
  return text(
    `Draft ADR #${res.id} created (status: ${res.status}). Call ratify_lore to submit for review.`,
    { name: "suggest_lore", result: res },
  );
}

export async function ratifyLoreExecute(
  _toolCallId: string,
  params: RatifyLoreInput,
): Promise<ToolResult> {
  const res = ratifyDecision(getDb(), params.id);
  return text(`Decision #${params.id} submitted for review.`, {
    name: "ratify_lore",
    result: res,
  });
}

export async function approveLoreExecute(
  _toolCallId: string,
  params: ApproveLoreInput,
): Promise<ToolResult> {
  const res = approveDecision(getDb(), params.id, params.reasoning, params.approver_name);
  return text(
    `Approval recorded for #${params.id} (status: ${res.status}, approvals: ${res.approvals_count}).`,
    { name: "approve_lore", result: res },
  );
}

export async function rejectLoreExecute(
  _toolCallId: string,
  params: RejectLoreInput,
): Promise<ToolResult> {
  const res = rejectDecision(getDb(), params.id, params.reasoning, params.approver_name);
  return text(
    `Rejection recorded for #${params.id} (status: ${res.status}).`,
    { name: "reject_lore", result: res },
  );
}

export async function searchLoreExecute(
  _toolCallId: string,
  params: SearchLoreInput,
): Promise<ToolResult> {
  const res = searchDecisions(getDb(), params.query, params.include_drafts ?? false);
  const summary = res.results.length === 0
    ? `No decisions matched "${params.query}".`
    : `${res.results.length} decision(s) matched "${params.query}":\n` +
      res.results
        .map((d: Decision) => `  #${d.id} [${d.status}] ${d.title}`)
        .join("\n");
  return text(summary, { name: "search_lore", result: res });
}

export async function archiveLoreExecute(
  _toolCallId: string,
  params: ArchiveLoreInput,
): Promise<ToolResult> {
  const res = archiveDecision(getDb(), params.id);
  return text(`Decision #${params.id} archive result: ${res.archived}.`, {
    name: "archive_lore",
    result: res,
  });
}