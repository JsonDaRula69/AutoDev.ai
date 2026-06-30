import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MIGRATIONS,
  compareSemver,
  selectMigrations,
  runMigrations,
  getLastMigratedVersion,
  writeCurrentVersion,
  type Migration,
} from "../migrations.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "autodev-migration-"));
});

afterEach(() => {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { }
});

test("compareSemver compares version strings correctly", () => {
  expect(compareSemver("0.1.10", "0.1.11")).toBe(-1);
  expect(compareSemver("0.1.11", "0.1.11")).toBe(0);
  expect(compareSemver("0.1.14", "0.1.11")).toBe(1);
  expect(compareSemver("0.2.0", "0.1.99")).toBe(1);
  expect(compareSemver("1.0.0", "0.9.99")).toBe(1);
});

test("compareSemver strips v prefix", () => {
  expect(compareSemver("v0.1.10", "0.1.10")).toBe(0);
  expect(compareSemver("v0.1.14", "v0.1.13")).toBe(1);
});

test("writeCurrentVersion and getLastMigratedVersion round-trip", () => {
  writeCurrentVersion(join(tempDir, "agent"), "0.1.14");
  expect(getLastMigratedVersion(join(tempDir, "agent"))).toBe("0.1.14");
});

test("getLastMigratedVersion returns null when no version file", () => {
  expect(getLastMigratedVersion(join(tempDir, "agent"))).toBeNull();
});

test("selectMigrations returns migrations between from and to versions", () => {
  const testMigrations: readonly Migration[] = [
    { version: "0.1.11", description: "a", run: () => ({ name: "a", ok: true, detail: "" }) },
    { version: "0.1.12", description: "b", run: () => ({ name: "b", ok: true, detail: "" }) },
    { version: "0.1.13", description: "c", run: () => ({ name: "c", ok: true, detail: "" }) },
    { version: "0.1.14", description: "d", run: () => ({ name: "d", ok: true, detail: "" }) },
  ];
  const selected = selectMigrations(testMigrations, "0.1.11", "0.1.14");
  expect(selected.length).toBe(3);
  expect(selected[0]!.version).toBe("0.1.12");
  expect(selected[2]!.version).toBe("0.1.14");
});

test("selectMigrations returns all when fromVersion is null", () => {
  const testMigrations: readonly Migration[] = [
    { version: "0.1.11", description: "a", run: () => ({ name: "a", ok: true, detail: "" }) },
    { version: "0.1.14", description: "b", run: () => ({ name: "b", ok: true, detail: "" }) },
  ];
  const selected = selectMigrations(testMigrations, null, "0.1.14");
  expect(selected.length).toBe(2);
});

test("runMigrations executes migrations in order and collects results", () => {
  const testMigrations: readonly Migration[] = [
    {
      version: "0.1.12",
      description: "create test file",
      run: (agentDir: string) => {
        writeFileSync(join(agentDir, "migrated.txt"), "done");
        return { name: "0.1.12-create-file", ok: true, detail: "Created migrated.txt" };
      },
    },
    {
      version: "0.1.13",
      description: "verify test file",
      run: (agentDir: string) => {
        if (!existsSync(join(agentDir, "migrated.txt"))) {
          return { name: "0.1.13-verify", ok: false, detail: "migrated.txt missing" };
        }
        return { name: "0.1.13-verify", ok: true, detail: "migrated.txt exists" };
      },
    },
  ];
  const agentDir = join(tempDir, "agent");
  mkdirSync(agentDir, { recursive: true });
  const results = runMigrations(testMigrations, agentDir);
  expect(results.length).toBe(2);
  expect(results[0]!.ok).toBe(true);
  expect(results[1]!.ok).toBe(true);
  expect(existsSync(join(agentDir, "migrated.txt"))).toBe(true);
});

test("runMigrations catches thrown errors and reports them as failures", () => {
  const testMigrations: readonly Migration[] = [
    {
      version: "0.1.12",
      description: "throws",
      run: () => { throw new Error("boom"); },
    },
  ];
  const results = runMigrations(testMigrations, tempDir);
  expect(results.length).toBe(1);
  expect(results[0]!.ok).toBe(false);
  expect(results[0]!.detail).toContain("boom");
});

test("MIGRATIONS array includes the 0.1.14 migration", () => {
  const v0114 = MIGRATIONS.find((m) => m.version === "0.1.14");
  expect(v0114).toBeDefined();
  expect(v0114!.description).toContain("AutoDev");
});

test("0.1.14 migration runs without error", () => {
  const agentDir = join(tempDir, "agent");
  const migration = MIGRATIONS.find((m) => m.version === "0.1.14")!;
  const result = migration.run(agentDir);
  expect(result.ok).toBe(true);
});

test("MIGRATIONS array includes the 0.1.32 migration", () => {
  const v0132 = MIGRATIONS.find((m) => m.version === "0.1.32");
  expect(v0132).toBeDefined();
  expect(v0132!.description).toContain("ollama-cloud");
});

test("0.1.32 migration fixes models.json api type, baseUrl, and model IDs", () => {
  const agentDir = join(tempDir, "agent");
  mkdirSync(agentDir, { recursive: true });
  const agentsDir = join(tempDir, "agent", "..", "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, "nemo.md"), "---\nmodel: ollama-cloud/glm-5.2\n---\nBody.\n");
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({
    providers: {
      "ollama-cloud": {
        api: "openai",
        baseUrl: "https://api.ollama.cloud/v1",
        apiKey: "$OLLAMA_CLOUD_API_KEY",
        models: [{ id: "glm-5.2", name: "GLM 5.2", context: 976000, output: 131072 }],
      },
    },
  }));
  writeFileSync(join(agentDir, ".env"), "OLLAMA_CLOUD_API_KEY=test-key\n");
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
    "ollama-cloud": { type: "api_key", key: "$OLLAMA_CLOUD_API_KEY" },
  }));

  const migration = MIGRATIONS.find((m) => m.version === "0.1.32")!;
  const result = migration.run(agentDir);
  expect(result.ok).toBe(true);
  expect(result.detail).toContain("file");

  const modelsContent = readFileSync(join(agentDir, "models.json"), "utf-8");
  expect(modelsContent).toContain("openai-completions");
  expect(modelsContent).toContain("https://ollama.com/v1");
  expect(modelsContent).toContain("glm-5.2:cloud");
  expect(modelsContent).toContain("$OLLAMA_API_KEY");

  const envContent = readFileSync(join(agentDir, ".env"), "utf-8");
  expect(envContent).toContain("OLLAMA_API_KEY=test-key");
  expect(envContent).not.toContain("OLLAMA_CLOUD_API_KEY");

  const nemoContent = readFileSync(join(agentsDir, "nemo.md"), "utf-8");
  expect(nemoContent).toContain("ollama-cloud/glm-5.2:cloud");
});

test("0.1.32 migration reports no changes when config is already correct", () => {
  const agentDir = join(tempDir, "agent");
  mkdirSync(agentDir, { recursive: true });
  const migration = MIGRATIONS.find((m) => m.version === "0.1.32")!;
  const result = migration.run(agentDir);
  expect(result.ok).toBe(true);
  expect(result.detail).toContain("No config changes");
});