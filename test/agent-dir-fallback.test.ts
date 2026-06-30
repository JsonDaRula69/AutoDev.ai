import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolveAgentDir } from "../scripts/cli.js";

const ORIG_HOME = process.env.HOME;
const ORIG_ENV = process.env.PI_CODING_AGENT_DIR;
let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "autodev-agentdir-"));
  process.env.HOME = fakeHome;
  delete process.env.PI_CODING_AGENT_DIR;
});

afterEach(() => {
  if (ORIG_ENV === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = ORIG_ENV;
  if (ORIG_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIG_HOME;
  if (fakeHome && existsSync(fakeHome)) rmSync(fakeHome, { recursive: true, force: true });
});

test("resolveAgentDir uses ~/.AutoDev/agent when env unset and dir exists", async () => {
  const autodevAgent = join(fakeHome, ".AutoDev", "agent");
  mkdirSync(autodevAgent, { recursive: true });

  const resolved = await resolveAgentDir();
  expect(resolved).toBe(autodevAgent);
  expect(process.env.PI_CODING_AGENT_DIR).toBe(autodevAgent);
});

test("resolveAgentDir does not override when PI_CODING_AGENT_DIR already set", async () => {
  const explicit = join(fakeHome, "explicit-agent-dir");
  mkdirSync(explicit, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = explicit;

  // Also create ~/.AutoDev/agent to prove it's not preferred over the env var
  mkdirSync(join(fakeHome, ".AutoDev", "agent"), { recursive: true });

  const resolved = await resolveAgentDir();
  expect(resolved).toBe(explicit);
});

test("resolveAgentDir falls back to SDK default when env unset and ~/.AutoDev/agent absent", async () => {
  // Neither PI_CODING_AGENT_DIR nor ~/.AutoDev/agent exist.
  // Should fall through to the SDK's getAgentDir() default. The SDK uses
  // os.homedir(), not process.env.HOME, so we only assert the env var stays
  // unset and a path is returned (the exact default is SDK-controlled).
  const resolved = await resolveAgentDir();
  expect(typeof resolved).toBe("string");
  expect(resolved.length).toBeGreaterThan(0);
  expect(process.env.PI_CODING_AGENT_DIR).toBeUndefined();
});

test("resolveAgentDir does not set env var when ~/.AutoDev/agent absent", async () => {
  await resolveAgentDir();
  expect(process.env.PI_CODING_AGENT_DIR).toBeUndefined();
});