/**
 * Interactive readline prompt helpers — mockable for tests.
 *
 * Exports a `createPrompter()` factory that returns a `Prompter` object with
 * `prompt()` and `confirm()` methods. Tests can inject a custom readline
 * interface or use the `MockPrompter` class.
 */
import { createInterface } from "node:readline";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { openSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { ReadStream as TtyReadStream } from "node:tty";
import type { Readable, Writable } from "node:stream";
import { select as clackSelect, text as clackText, confirm as clackConfirm, isCancel } from "@clack/prompts";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface Prompter {
  prompt(question: string): Promise<string>;
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;
  select(message: string, options: SelectOption[], initialValue?: string): Promise<string | symbol | undefined>;
  close(): void;
}

/** Create a real prompter backed by stdin/stdout readline. */
export function createPrompter(): Prompter {
  if (processStdin.isTTY === true) {
    return createClackPrompter(processStdin, processStdout);
  }
  return createTtyPrompter();
}

function createTtyPrompter(): Prompter {
  try {
    const fd = openSync("/dev/tty", "r+");
    const input = new TtyReadStream(fd, { encoding: "utf-8" } as ConstructorParameters<typeof TtyReadStream>[1]);
    input.isRaw = false;
    const output = createWriteStream("/dev/tty", { fd });
    return createClackPrompter(input, output);
  } catch {
    return createNoTtyPrompter();
  }
}

function createNoTtyPrompter(): Prompter {
  return {
    prompt: async (_question: string): Promise<string> => "",
    confirm: async (_question: string, defaultYes = true): Promise<boolean> => defaultYes,
    select: async (_message: string, options: SelectOption[], initialValue?: string): Promise<string | symbol> => initialValue ?? options[0]?.value ?? "",
    close: () => {},
  };
}

export function createPrompterFromStreams(input: Readable, output: Writable): Prompter {
  return createClackPrompter(input, output);
}

function createClackPrompter(input: Readable, output: Writable): Prompter {
  return {
    prompt: async (question: string): Promise<string> => {
      const result = await clackText({ message: question, input, output });
      if (isCancel(result)) return "";
      return String(result).trim();
    },
    confirm: async (question: string, defaultYes = true): Promise<boolean> => {
      const result = await clackConfirm({ message: question, initialValue: defaultYes, input, output });
      if (isCancel(result)) return false;
      return Boolean(result);
    },
    select: async (message: string, options: SelectOption[], initialValue?: string): Promise<string | symbol | undefined> => {
      const result = await clackSelect({
        message,
        options: options.map((o) => ({
          value: o.value,
          label: o.label,
          ...(o.hint !== undefined ? { hint: o.hint } : {}),
        })),
        initialValue: initialValue ?? options[0]?.value,
        input,
        output,
      });
      return result;
    },
    close: () => {},
  };
}

/**
 * Mock prompter — returns predetermined answers for testing.
 *
 * Usage:
 * ```ts
 * const mock = new MockPrompter();
 * mock.answers.push("my-api-key");
 * mock.answers.push("y");
 * const answer = await mock.prompt("Enter key:"); // returns "my-api-key"
 * ```
 */
export class MockPrompter implements Prompter {
  answers: string[] = [];
  selectAnswers: string[] = [];
  private answerIndex = 0;
  private selectIndex = 0;

  async prompt(_question: string): Promise<string> {
    const answer = this.answers[this.answerIndex];
    this.answerIndex++;
    return answer ?? "";
  }

  async confirm(_question: string, defaultYes = true): Promise<boolean> {
    const answer = this.answers[this.answerIndex];
    this.answerIndex++;
    if (answer === undefined) return defaultYes;
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "") return defaultYes;
    return trimmed === "y" || trimmed === "yes";
  }

  async select(_message: string, options: SelectOption[], initialValue?: string): Promise<string | symbol> {
    const answer = this.selectAnswers[this.selectIndex];
    this.selectIndex++;
    if (answer === undefined) return initialValue ?? options[0]?.value ?? "";
    return answer;
  }

  close(): void {}

  reset(): void {
    this.answers = [];
    this.answerIndex = 0;
    this.selectAnswers = [];
    this.selectIndex = 0;
  }
}
