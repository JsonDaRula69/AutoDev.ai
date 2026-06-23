/**
 * Autonomy module — auto-merge, boulder state, continuation loops.
 *
 * Exports `register(pi)` which:
 * 1. Registers the `auto_merge_pr` tool (4-gate merge pipeline).
 * 2. Registers the `loop_done` tool (ralph loop completion signal).
 * 3. Registers the `autodev stop-continuation` subcommand.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { autoMergePr } from "./merge.js";
import { determineMode, createBoulderState, saveBoulder, buildContinuationPrompt } from "./boulder.js";
import { stopAllLoops, resetLoops } from "./continuation.js";
import { registerLoopDoneTool } from "./loop-done-tool.js";

export { autoMergePr } from "./merge.js";
export type { MergeResult, MergeGateResult } from "./merge.js";
export {
  loadBoulder,
  saveBoulder,
  calculateProgress,
  determineMode,
  createBoulderState,
  buildContinuationPrompt,
} from "./boulder.js";
export type { BoulderState, BoulderProgress, BoulderMode, BoulderResult, WorkEntry, TaskSessionEntry } from "./boulder.js";
export {
  startRalphLoop,
  startUlwLoop,
  checkDoneSignal,
  checkDoneInMessage,
  advanceLoop,
  getLoopState,
  getAllLoopStates,
  stopAllLoops,
  resetLoops,
  enforceTodoContinuation,
  buildRalphContinuationPrompt,
} from "./continuation.js";
export type { LoopState, LoopType, ContinuationState, TodoEnforcerResult } from "./continuation.js";

export function register(pi: ExtensionAPI): void {
  // Register the auto_merge_pr tool
  pi.registerTool({
    name: "auto_merge_pr",
    label: "Auto Merge PR",
    description:
      "Check four merge gates (CI green, evidence exists, autodev-ready label, PR mergeable) " +
      "and merge the PR if all pass. Blocks with reason if any gate fails.",
    parameters: Type.Object({
      pr_number: Type.Number({ description: "The GitHub PR number to merge" }),
      project_root: Type.Optional(
        Type.String({ description: "Project root directory (defaults to cwd)" }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      const prNumber = params.pr_number as number;
      const projectRoot = (params.project_root as string | undefined) ?? process.cwd();
      const result = await autoMergePr(prNumber, projectRoot);
      return {
        content: [
          {
            type: "text" as const,
            text: result.merged
              ? `✅ PR #${prNumber} merged successfully.`
              : `❌ PR #${prNumber} not merged: ${result.error}`,
          },
        ],
        details: {
          merged: result.merged,
          gates: result.gates.map((g) => ({
            name: g.name,
            passed: g.passed,
            reason: g.reason,
          })),
          error: result.error,
        },
      };
    },
  });

  // Register the loop_done tool
  registerLoopDoneTool(pi);

  // Register the autodev stop-continuation subcommand
  // Note: This is also registered in orchestrator/cli.ts for the main autodev command.
  // We register it here as a standalone command for direct access.
  pi.registerCommand("stop-continuation", {
    description: "Stop all continuation loops (ralph, ULW, todo enforcer).",
    handler: async (_args, ctx) => {
      stopAllLoops();
      ctx.ui.notify("All continuation loops stopped.", "info");
    },
  });
}
