/**
 * Tmux module — interactive bash via tmux sessions.
 *
 * Registers the `interactive_bash` tool via `pi.registerTool()`. The tool
 * creates and manages persistent tmux sessions for commands that need state
 * between calls (REPLs, log watchers, long-running processes).
 *
 * Returns a graceful error if tmux is not installed on the system.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if tmux is installed by running `tmux -V`. */
function isTmuxInstalled(): boolean {
  try {
    const result = spawnSync("tmux", ["-V"], {
      timeout: 5000,
      stdio: "pipe",
      encoding: "utf8",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/** Build a graceful error response when tmux is not installed. */
function noTmuxError(): string {
  return JSON.stringify({
    error: "tmux is not installed. Install tmux to use interactive bash sessions.",
    hint: "Install tmux: brew install tmux (macOS) or apt install tmux (Linux).",
  });
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

function interactiveBashExecute(
  params: Record<string, unknown>,
): string {
  if (!isTmuxInstalled()) {
    return noTmuxError();
  }

  const tmuxCommand = params.tmux_command as string | undefined;
  if (!tmuxCommand) {
    return JSON.stringify({
      error: "tmux_command is required.",
      hint: "Provide a tmux subcommand (e.g., 'new-session -d -s my-session', 'send-keys -t my-session \"echo hello\" Enter').",
    });
  }

  // Execute the tmux command
  try {
    const result = spawnSync("tmux", [tmuxCommand], {
      timeout: 30000,
      stdio: "pipe",
      encoding: "utf8",
      shell: false,
    });

    if (result.status === 0) {
      return JSON.stringify({
        result: "ok",
        tmux_command: tmuxCommand,
        stdout: (result.stdout ?? "").trim(),
        stderr: (result.stderr ?? "").trim(),
      });
    }

    return JSON.stringify({
      error: `tmux command failed with exit code ${result.status ?? "unknown"}`,
      tmux_command: tmuxCommand,
      stderr: (result.stderr ?? "").trim(),
    });
  } catch (err) {
    return JSON.stringify({
      error: `Failed to execute tmux command: ${err instanceof Error ? err.message : String(err)}`,
      tmux_command: tmuxCommand,
    });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "interactive_bash",
    label: "Interactive Bash",
    description:
      "Execute a tmux command for persistent shell sessions. Use for commands that need state between calls (REPLs, log watchers, long-running processes). Pass tmux subcommands directly (without 'tmux' prefix). Examples: new-session -d -s omo-dev, send-keys -t omo-dev \"vim\" Enter",
    parameters: Type.Object({
      tmux_command: Type.String({
        description: "The tmux command to execute (without 'tmux' prefix)",
      }),
    }),
    execute: async (_toolCallId, params) => ({
      content: [{ type: "text", text: interactiveBashExecute(params) }],
      details: {},
    }),
  });
}
