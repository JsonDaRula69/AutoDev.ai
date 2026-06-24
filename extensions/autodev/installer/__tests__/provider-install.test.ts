/**
 * Provider install module tests — installProvider() programmatic API.
 *
 * Tests:
 *  - installProvider installs an npm package via the SDK
 *  - installProvider detects already-installed packages (idempotency)
 *  - installProvider handles install failures gracefully
 *  - parseNpmSource parses npm: scoped and unscoped names with versions
 */
import { test, expect, describe } from "bun:test";
import { installProvider, type ProviderInstallDeps } from "../provider-install.js";
import { mkdtempSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "autodev-provider-test-"));
  mkdirSync(join(dir, "npm"), { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Mock package manager that simulates install behavior
class MockPackageManager {
  installed = false;
  persistCalls: string[] = [];
  npmRoot: string;

  constructor(npmRoot: string) {
    this.npmRoot = npmRoot;
  }

  async installAndPersist(source: string, options?: { local?: boolean }): Promise<void> {
    this.persistCalls.push(source);
    this.installed = true;
    // Simulate creating the package directory
    const pkgName = source.replace(/^npm:/, "").split("@")[0];
    mkdirSync(join(this.npmRoot, "node_modules", pkgName), { recursive: true });
  }

  getNpmInstallRoot(_scope: string, _temporary: boolean): string {
    return this.npmRoot;
  }
}

test("installProvider installs an npm package via the SDK", async () => {
  const agentDir = createTempDir();
  const npmRoot = join(agentDir, "npm");
  mkdirSync(join(npmRoot, "node_modules"), { recursive: true });

  try {
    const mockPm = new MockPackageManager(npmRoot);
    const result = await installProvider({
      source: "npm:test-pkg",
      cwd: agentDir,
      agentDir,
      packageManagerOverride: mockPm as never,
    });

    expect(result.ok).toBe(true);
    expect(result.alreadyInstalled).toBe(false);
    expect(result.detail).toBe("installed");
    expect(mockPm.persistCalls).toEqual(["npm:test-pkg"]);
  } finally {
    cleanupTempDir(agentDir);
  }
});

test("installProvider detects already-installed packages", async () => {
  const agentDir = createTempDir();
  const npmRoot = join(agentDir, "npm");
  const pkgDir = join(npmRoot, "node_modules", "pi-ollama-cloud");
  mkdirSync(pkgDir, { recursive: true });

  try {
    const mockPm = new MockPackageManager(npmRoot);
    const result = await installProvider({
      source: "npm:pi-ollama-cloud",
      cwd: agentDir,
      agentDir,
      packageManagerOverride: mockPm as never,
    });

    expect(result.ok).toBe(true);
    expect(result.alreadyInstalled).toBe(true);
    expect(result.detail).toBe("already installed");
    expect(mockPm.persistCalls.length).toBe(0);
  } finally {
    cleanupTempDir(agentDir);
  }
});

test("installProvider handles install failures gracefully", async () => {
  const agentDir = createTempDir();
  const npmRoot = join(agentDir, "npm");
  mkdirSync(join(npmRoot, "node_modules"), { recursive: true });

  try {
    const failingPm = {
      installAndPersist: async () => { throw new Error("network error"); },
      getNpmInstallRoot: () => npmRoot,
    };
    const result = await installProvider({
      source: "npm:failing-pkg",
      cwd: agentDir,
      agentDir,
      packageManagerOverride: failingPm as never,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("network error");
    expect(result.alreadyInstalled).toBe(false);
  } finally {
    cleanupTempDir(agentDir);
  }
});

test("installProvider passes local flag to the package manager", async () => {
  const agentDir = createTempDir();
  const npmRoot = join(agentDir, "npm");
  mkdirSync(join(npmRoot, "node_modules"), { recursive: true });

  let receivedLocal: boolean | undefined;
  const mockPm = {
    installAndPersist: async (_source: string, opts?: { local?: boolean }) => {
      receivedLocal = opts?.local;
    },
    getNpmInstallRoot: () => npmRoot,
  };

  try {
    await installProvider({
      source: "npm:test-pkg",
      cwd: agentDir,
      agentDir,
      local: true,
      packageManagerOverride: mockPm as never,
    });
    expect(receivedLocal).toBe(true);
  } finally {
    cleanupTempDir(agentDir);
  }
});