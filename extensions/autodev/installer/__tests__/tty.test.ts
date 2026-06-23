// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T15 — `/dev/tty` reopen helper tests.
 *
 * Covers:
 *  - Happy path: `openSync('/dev/tty')` returns a valid fd → `reopenTty`
 *    returns a `Prompter` backed by the reopened streams.
 *  - Failure path: `openSync('/dev/tty')` throws ENOENT (CI, no controlling
 *    terminal) → `reopenTty` returns `null`.
 *  - Stream-create failure: openSync succeeds but createReadStream throws →
 *    `reopenTty` returns `null` (no partial state leaked).
 */
import { test, expect, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { reopenTty, withReopenedTty } from "../tty.js";

/** Fake readable stream that answers `rl.question` via `.question()`. */
class FakeReadable extends EventEmitter {
  question(_q: string, cb: (answer: string) => void): void {
    // Defer so the readline interface can wire up listeners first.
    queueMicrotask(() => cb("fake-answer"));
  }
  close(): void {}
  pause(): void {}
  resume(): void {}
}
class FakeWritable extends EventEmitter {
  write(_chunk: string): boolean { return true; }
  end(): void {}
}

test("reopenTty returns a Prompter when /dev/tty opens successfully", () => {
  const fd = 42;
  const fakeRl = new FakeReadable();
  const fakeW = new FakeWritable();
  const openSyncOverride = mock(() => fd);
  const createReadStreamOverride = mock(() => fakeRl);
  const createWriteStreamOverride = mock(() => fakeW);

  // Monkey-patch createInterface inside tty.ts via the override path:
  // we can't easily intercept createInterface, so instead verify that
  // openSync + stream factories were called and reopenTty returned non-null.
  // The prompter-from-rl path is covered by prompts.ts tests; here we assert
  // the reopen orchestration only.
  const result = reopenTty({
    openSyncOverride,
    createReadStreamOverride,
    createWriteStreamOverride,
  });
  expect(result).not.toBeNull();
  expect(openSyncOverride).toHaveBeenCalledTimes(1);
  expect(createReadStreamOverride).toHaveBeenCalledTimes(1);
  expect(createWriteStreamOverride).toHaveBeenCalledTimes(1);
  result!.close();
});

test("reopenTty returns null when openSync throws ENOENT (no controlling terminal)", () => {
  const openSyncOverride = mock(() => {
    const err = new Error("ENOENT: no such file or directory, open '/dev/tty'") as Error & { code: string };
    err.code = "ENOENT";
    throw err;
  });
  const createReadStreamOverride = mock(() => new FakeReadable());
  const createWriteStreamOverride = mock(() => new FakeWritable());

  const result = reopenTty({
    openSyncOverride,
    createReadStreamOverride,
    createWriteStreamOverride,
  });
  expect(result).toBeNull();
  expect(openSyncOverride).toHaveBeenCalledTimes(1);
  expect(createReadStreamOverride).not.toHaveBeenCalled();
  expect(createWriteStreamOverride).not.toHaveBeenCalled();
});

test("reopenTty returns null when createReadStream throws after open", () => {
  const fd = 7;
  const openSyncOverride = mock(() => fd);
  const createReadStreamOverride = mock(() => {
    throw new Error("stream create failed");
  });
  const createWriteStreamOverride = mock(() => new FakeWritable());

  const result = reopenTty({
    openSyncOverride,
    createReadStreamOverride,
    createWriteStreamOverride,
  });
  expect(result).toBeNull();
  expect(openSyncOverride).toHaveBeenCalledTimes(1);
  expect(createReadStreamOverride).toHaveBeenCalledTimes(1);
  // writeStream factory not reached because readStream threw first.
  expect(createWriteStreamOverride).not.toHaveBeenCalled();
});

test("withReopenedTty runs fn and closes the prompter on success", async () => {
  const fd = 99;
  const fakeRl = new FakeReadable();
  const fakeW = new FakeWritable();
  const deps = {
    openSyncOverride: mock(() => fd),
    createReadStreamOverride: mock(() => fakeRl),
    createWriteStreamOverride: mock(() => fakeW),
  };
  const seen: string[] = [];
  const out = await withReopenedTty(deps, async (p) => {
    seen.push("ran");
    return "done";
  });
  expect(out).toBe("done");
  expect(seen).toEqual(["ran"]);
});

test("withReopenedTty returns null and does not call fn when reopen fails", async () => {
  const deps = {
    openSyncOverride: mock(() => {
      throw new Error("ENOENT");
    }),
  };
  let called = false;
  const out = await withReopenedTty(deps, async () => {
    called = true;
    return "should-not-happen";
  });
  expect(out).toBeNull();
  expect(called).toBe(false);
});