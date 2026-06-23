/**
 * loop_done tool — signals the ralph loop to stop.
 *
 * Ralph sessions call this tool when all work is complete.
 * The continuation loop detects this call and stops iterating.
 *
 * This is a simple tool with no parameters. Its mere invocation is the signal.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Register the `loop_done` tool with pi.
 *
 * The tool takes no parameters. When called, it returns a success message
 * indicating the loop should stop. The continuation loop monitors for this
 * tool call via the background manager's task state.
 */
export function registerLoopDoneTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "loop_done",
    label: "Loop Done",
    description:
      "Signal that the current ralph loop iteration is complete and the loop should stop. " +
      "Call this when all work is done. Do NOT call it until all work is truly complete.",
    parameters: Type.Object({}),
    execute: async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: "loop_done signal received. The ralph loop will stop after this iteration.",
          },
        ],
        details: { loop_done: true },
      };
    },
  });
}
