/**
 * Interactive readline prompt helpers — mockable for tests.
 *
 * Exports a `createPrompter()` factory that returns a `Prompter` object with
 * `prompt()` and `confirm()` methods. Tests can inject a custom readline
 * interface or use the `MockPrompter` class.
 */
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { openSync } from "node:fs";
import { createReadStream, createWriteStream } from "node:fs";
import { select as clackSelect } from "@clack/prompts";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface Prompter {
  prompt(question: string): Promise<string>;
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;
  select(message: string, options: SelectOption[], initialValue?: string): Promise<string | symbol>;
  close(): void;
}

/** Create a real prompter backed by stdin/stdout readline. */
export function createPrompter(): Prompter {
  if (processStdin.isTTY === true) {
    const rl = createInterface({
      input: processStdin,
      output: processStdout,
    });
    return createPrompterFromRl(rl);
  }
  return createTtyPrompter();
}

function createTtyPrompter(): Prompter {
  let ttyFd: number | undefined;
  try {
    ttyFd = openSync("/dev/tty", "r+");
  } catch {
    ttyFd = undefined;
  }

  if (ttyFd === undefined) {
    return createNoTtyPrompter();
  }

  const input = createReadStream("/dev/tty", { fd: ttyFd });
  const output = createWriteStream("/dev/tty", { fd: ttyFd });
  const rl = createInterface({ input, output });
  return createPrompterFromRl(rl);
}

function createNoTtyPrompter(): Prompter {
  return {
    prompt: async (_question: string): Promise<string> => "",
    confirm: async (_question: string, defaultYes = true): Promise<boolean> => defaultYes,
    select: async (_message: string, options: SelectOption[], initialValue?: string): Promise<string | symbol> => initialValue ?? options[0]?.value ?? "",
    close: () => {},
  };
}

export function createPrompterFromRl(rl: ReadlineInterface): Prompter {
  return {
    prompt: (question: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(question + " ", (answer: string) => {
          resolve(answer.trim());
        });
      });
    },
    confirm: (question: string, defaultYes = true): Promise<boolean> => {
      const hint = defaultYes ? "Y/n" : "y/N";
      return new Promise((resolve) => {
        rl.question(`${question} [${hint}] `, (answer: string) => {
          const trimmed = answer.trim().toLowerCase();
          if (trimmed === "") {
            resolve(defaultYes);
          } else if (trimmed === "y" || trimmed === "yes") {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    },
    select: async (message: string, options: SelectOption[], initialValue?: string): Promise<string | symbol> => {
      rl.pause();
      try {
        const result = await clackSelect({
          message,
          options: options.map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
          initialValue: initialValue ?? options[0]?.value,
        });
        return result;
      } finally {
        rl.resume();
      }
    },
    close: () => {
      rl.close();
    },
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
