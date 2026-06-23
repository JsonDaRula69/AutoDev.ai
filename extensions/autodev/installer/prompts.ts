/**
 * Interactive readline prompt helpers — mockable for tests.
 *
 * Exports a `createPrompter()` factory that returns a `Prompter` object with
 * `prompt()` and `confirm()` methods. Tests can inject a custom readline
 * interface or use the `MockPrompter` class.
 */
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { stdin as processStdin, stdout as processStdout } from "node:process";

export interface Prompter {
  /** Ask an open-ended question and return the answer. */
  prompt(question: string): Promise<string>;
  /** Ask a yes/no question and return true/false. */
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;
  /** Close the readline interface. */
  close(): void;
}

/** Create a real prompter backed by stdin/stdout readline. */
export function createPrompter(): Prompter {
  const rl = createInterface({
    input: processStdin,
    output: processStdout,
  });
  return createPrompterFromRl(rl);
}

/** Create a prompter from an existing readline interface (injectable for tests). */
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
  private answerIndex = 0;

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

  close(): void {
    // no-op for tests
  }

  /** Reset the answer queue. */
  reset(): void {
    this.answers = [];
    this.answerIndex = 0;
  }
}
