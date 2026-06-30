/**
 * Reopen `/dev/tty` (Unix) or `\\.\CONIN$` (Windows) for interactive prompts
 * when `process.stdin` is not a TTY (piped stdin, CI shells, detached processes).
 *
 * Returns a `Prompter` backed by the reopened controlling terminal, or `null`
 * when no controlling terminal is available (CI, daemonized processes,
 * containers without `/dev/tty`). Callers must handle `null` by falling back
 * to the existing non-interactive behavior.
 *
 * Windows note: `\\.\CONIN$` supports line-mode prompts. Raw-mode reads
 * (keypress-level) may throw EPERM; the config flow only needs line input,
 * so that is acceptable.
 */
import { openSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { ReadStream as TtyReadStream } from "node:tty";
import type { Readable, Writable } from "node:stream";
import type { Prompter } from "./prompts.js";
import { createPrompterFromStreams } from "./prompts.js";

/** TTY device path for the current platform. */
export const TTY_DEVICE: string =
  process.platform === "win32" ? "\\\\.\\CONIN$" : "/dev/tty";

export interface ReopenTtyDeps {
  /** Override `openSync` for tests. Defaults to the real `node:fs`. */
  readonly openSyncOverride?: (path: string, flags: string) => number;
  /** Override `createReadStream` / `createWriteStream` for tests. */
  readonly createReadStreamOverride?: (path: string, opts: { fd: number }) => NodeJS.ReadableStream;
  readonly createWriteStreamOverride?: (path: string, opts: { fd: number }) => NodeJS.WritableStream;
  /**
   * When set, `reopenTty` returns this prompter directly after a successful
   * `openSync`, skipping stream/interface creation. Used by doctor tests to
   * inject a `MockPrompter` without faking the readline layer.
   */
  readonly prompterOverride?: Prompter;
}

/**
 * Attempt to reopen the controlling terminal and return a `Prompter` bound to
 * it. Returns `null` when the reopen fails (no controlling terminal, CI).
 *
 * The returned prompter owns the readline interface; callers MUST call
 * `prompter.close()` when finished to release the fd.
 */
export function reopenTty(deps: ReopenTtyDeps = {}): Prompter | null {
  const open = deps.openSyncOverride ?? openSync;

  let fd: number;
  try {
    fd = open(TTY_DEVICE, "r+");
  } catch {
    return null;
  }

  if (deps.prompterOverride !== undefined) {
    return deps.prompterOverride;
  }

  const createRs = deps.createReadStreamOverride ?? ((path: string, opts: { fd: number }) => new TtyReadStream(opts.fd, { encoding: "utf-8" } as ConstructorParameters<typeof TtyReadStream>[1]));
  const createWs = deps.createWriteStreamOverride ?? createWriteStream;

  let input: Readable;
  let output: Writable;
  try {
    input = createRs(TTY_DEVICE, { fd }) as Readable;
    output = createWs(TTY_DEVICE, { fd }) as Writable;
  } catch {
    return null;
  }

  return createPrompterFromStreams(input, output);
}

/** Reopen-and-prompt helper: reopen TTY, call `fn(prompter)`, close regardless. */
export async function withReopenedTty<T>(
  deps: ReopenTtyDeps | undefined,
  fn: (prompter: Prompter) => Promise<T>,
): Promise<T | null> {
  const prompter = reopenTty(deps);
  if (prompter === null) return null;
  try {
    return await fn(prompter);
  } finally {
    prompter.close();
  }
}