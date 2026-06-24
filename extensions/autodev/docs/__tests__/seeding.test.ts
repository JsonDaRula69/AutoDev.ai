// @ts-nocheck — bun:test mock types are complex for strict mode
/**
 * T8 seeding tests.
 *
 * Exercises `seedCentralDocs` with mock sources only. All real network and git
 * activity is pointed at local temp fixtures or monkey-patched `fetch`.
 */
import { test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { seedCentralDocs, type SeedSource } from "../seeding.js";
import { mockEmbedFn } from "../../../../test/mocks/embeddings.js";

// ---------------------------------------------------------------------------
// Temp dir helpers
// ---------------------------------------------------------------------------

function createTempDir(prefix: string): string {
  const dir = resolve(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

let savedAgentDir: string | undefined;
let agentDirOverride: string | undefined;
let centralRoot: string | undefined;

function setAgentDir(dir: string): void {
  savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  agentDirOverride = dir;
}

function restoreAgentDir(): void {
  if (savedAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = savedAgentDir;
  }
  savedAgentDir = undefined;
  agentDirOverride = undefined;
}

beforeEach(() => {
  centralRoot = createTempDir("autodev-seed-central");
  const agentDir = join(centralRoot, "agent");
  mkdirSync(agentDir, { recursive: true });
  setAgentDir(agentDir);
});

afterEach(() => {
  if (centralRoot) cleanupTempDir(centralRoot);
  if (agentDirOverride) restoreAgentDir();
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/** Create a git repo with optional markdown files under `sparsePath`. */
function createMockGitRepo(files: Record<string, string>): string {
  const repo = createTempDir("autodev-seed-repo");
  writeFileSync(join(repo, "README.md"), "# repo", "utf8");
  for (const [rel, content] of Object.entries(files)) {
    const full = join(repo, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  git(repo, ["init", "--quiet"], "git init failed");
  git(repo, ["config", "user.email", "test@example.com"], "git config failed");
  git(repo, ["config", "user.name", "Test"], "git config failed");
  git(repo, ["add", "."], "git add failed");
  git(repo, ["commit", "-m", "seed", "--quiet"], "git commit failed");
  return repo;
}

function git(cwd: string, args: string[], errMsg: string): void {
  const result = spawnSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${errMsg}: ${result.stderr || result.stdout || "unknown"}`);
  }
}

/** Build a source record for tests. */
function source(type: SeedSource["type"], name: string, url: string, targetSubdir: string, extra?: Partial<SeedSource>): SeedSource {
  return { type, name, url, targetSubdir, ...extra };
}

/** Count markdown files under the central corpus. */
function corpusFileCount(): number {
  const corpusRoot = join(centralRoot!, "docs-corpus");
  let count = 0;
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        count++;
      }
    }
  };
  if (existsSync(corpusRoot)) visit(corpusRoot);
  return count;
}

// ---------------------------------------------------------------------------
// 1. Empty sources
// ---------------------------------------------------------------------------

test("empty sources returns 0 chunks and no errors", async () => {
  const result = await seedCentralDocs([], mockEmbedFn);
  expect(result.chunks).toBe(0);
  expect(result.errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Valid git-sparse
// ---------------------------------------------------------------------------

test("valid git-sparse populates central DB with chunks > 0", async () => {
  const repo = createMockGitRepo({
    "docs/pi/sdk.md": [
      "# Pi SDK",
      "",
      "## Overview",
      "",
      "The SDK exposes createAgentSession and SessionManager for embedding pi.",
    ].join("\n"),
    "docs/omo/readme.md": [
      "# Omo",
      "",
      "## What is Omo",
      "",
      "Omo is an orchestration layer for coding agents built on pi.",
    ].join("\n"),
  });

  try {
    const result = await seedCentralDocs(
      [source("git-sparse", "pi-docs", repo, "pi", { sparsePath: "docs/pi" })],
      mockEmbedFn,
    );
    expect(result.errors).toEqual([]);
    expect(result.chunks).toBeGreaterThan(0);
    expect(corpusFileCount()).toBeGreaterThan(0);
  } finally {
    cleanupTempDir(repo);
  }
});

// ---------------------------------------------------------------------------
// 3. Invalid git URL
// ---------------------------------------------------------------------------

test("invalid git URL returns graceful error and 0 chunks", async () => {
  const result = await seedCentralDocs(
    [source("git-sparse", "bad-docs", "file:///not-a-real-repo.git", "bad")],
    mockEmbedFn,
  );
  expect(result.chunks).toBe(0);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0]).toContain("bad-docs");
  expect(result.errors[0]).toMatch(/git clone failed/);
});

// ---------------------------------------------------------------------------
// 4. Multiple valid sources
// ---------------------------------------------------------------------------

test("multiple valid sources all populate corpus", async () => {
  const repo1 = createMockGitRepo({
    "docs/a.md": "# A\n\n## Section\nContent for source one with enough text.",
  });
  const repo2 = createMockGitRepo({
    "docs/b.md": "# B\n\n## Section\nContent for source two with enough text.",
  });

  try {
    const result = await seedCentralDocs(
      [
        source("git-sparse", "src-one", repo1, "one", { sparsePath: "docs" }),
        source("git-sparse", "src-two", repo2, "two", { sparsePath: "docs" }),
      ],
      mockEmbedFn,
    );
    expect(result.errors).toEqual([]);
    expect(result.chunks).toBeGreaterThan(0);
    expect(corpusFileCount()).toBe(2);
  } finally {
    cleanupTempDir(repo1);
    cleanupTempDir(repo2);
  }
});

// ---------------------------------------------------------------------------
// 5. Partial failure
// ---------------------------------------------------------------------------

test("partial failure: one valid source plus one invalid source", async () => {
  const repo = createMockGitRepo({
    "docs/a.md": "# A\n\n## Section\nContent for the valid source with enough text.",
  });

  try {
    const result = await seedCentralDocs(
      [
        source("git-sparse", "valid-src", repo, "valid", { sparsePath: "docs" }),
        source("git-sparse", "bad-src", "file:///not-a-real-repo.git", "bad"),
      ],
      mockEmbedFn,
    );
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("bad-src");
    expect(corpusFileCount()).toBe(1);
  } finally {
    cleanupTempDir(repo);
  }
});

// ---------------------------------------------------------------------------
// 6. excludePatterns filtering
// ---------------------------------------------------------------------------

test("excludePatterns filters out matching markdown files", async () => {
  const repo = createMockGitRepo({
    "docs/keep1.md": "# Keep 1\n\n## Section\nContent one with enough text.",
    "docs/keep2.md": "# Keep 2\n\n## Section\nContent two with enough text.",
    "docs/skip.md": "# Skip\n\n## Section\nContent skip with enough text.",
  });

  try {
    await seedCentralDocs(
      [
        source("git-sparse", "filtered-src", repo, "filtered", {
          sparsePath: "docs",
          excludePatterns: ["skip.md"],
        }),
      ],
      mockEmbedFn,
    );
    expect(corpusFileCount()).toBe(2);
    const corpusRoot = join(centralRoot!, "docs-corpus");
    const files = readdirSync(join(corpusRoot, "filtered"), { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
    expect(files).toContain("keep1.md");
    expect(files).toContain("keep2.md");
    expect(files).not.toContain("skip.md");
  } finally {
    cleanupTempDir(repo);
  }
});

// ---------------------------------------------------------------------------
// 7. llms-txt source
// ---------------------------------------------------------------------------

test("llms-txt fetches index and downloads linked markdown files", async () => {
  const links = new Map<string, string>([
    [
      "/guide.md",
      "# Guide\n\n## Introduction\nThis guide content has enough text to produce a chunk after chunking.",
    ],
    [
      "/api.md",
      "# API\n\n## Reference\nThis API reference content has enough text to produce a chunk after chunking.",
    ],
  ]);
  const indexUrl = "http://localhost:9999/llms.txt";
  let fetchCallCount = 0;

  const restore = spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      const raw = typeof input === "string" ? input : (input as URL)?.toString?.();
      const url = new URL(raw || indexUrl);
      fetchCallCount++;

      if (url.pathname === "/llms.txt") {
        return new Response(
          "# Docs\n\n- [Guide](/guide.md)\n- [API Reference](/api.md)\n",
          { status: 200 },
        );
      }

      const content = links.get(url.pathname);
      if (content === undefined) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(content, { status: 200 });
    },
  );

  try {
    const result = await seedCentralDocs(
      [source("llms-txt", "llms-index", indexUrl, "llms")],
      mockEmbedFn,
    );
    expect(result.errors).toEqual([]);
    expect(result.chunks).toBeGreaterThan(0);
    expect(fetchCallCount).toBeGreaterThanOrEqual(3);
    expect(corpusFileCount()).toBe(2);

    const targetDir = join(centralRoot!, "docs-corpus", "llms");
    const files = readdirSync(targetDir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
    expect(files).toContain("guide.md");
    expect(files).toContain("api.md");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// 8. llms-full HTTP source
// ---------------------------------------------------------------------------

test("llms-full HTTP source fetches single file and writes full-docs.md", async () => {
  const fullContent = [
    "# Complete docs",
    "",
    "## Overview",
    "",
    "This is the full aggregated content with enough text to produce a chunk.",
  ].join("\n");
  const indexUrl = "http://localhost:9999/llms-full.txt";

  const restore = spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      const raw = typeof input === "string" ? input : (input as URL)?.toString?.();
      const url = new URL(raw || indexUrl);
      if (url.toString() === indexUrl) {
        return new Response(fullContent, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    },
  );

  try {
    const result = await seedCentralDocs(
      [source("llms-full", "http-full", indexUrl, "full")],
      mockEmbedFn,
    );
    expect(result.errors).toEqual([]);
    expect(result.chunks).toBeGreaterThan(0);
    expect(corpusFileCount()).toBe(1);

    const target = join(centralRoot!, "docs-corpus", "full", "full-docs.md");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(fullContent);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// 9. llms-full file:// source
// ---------------------------------------------------------------------------

test("llms-full file:// source reads local file and writes full-docs.md", async () => {
  const fullFile = join(createTempDir("autodev-seed-llms"), "llms-full.md");
  const fullContent = [
    "# File docs",
    "",
    "## Section",
    "",
    "Local file content with enough characters to form a chunk properly.",
  ].join("\n");
  writeFileSync(fullFile, fullContent, "utf8");

  try {
    const result = await seedCentralDocs(
      [source("llms-full", "file-full", `file://${fullFile}`, "file")],
      mockEmbedFn,
    );
    expect(result.errors).toEqual([]);
    expect(result.chunks).toBeGreaterThan(0);
    expect(corpusFileCount()).toBe(1);

    const target = join(centralRoot!, "docs-corpus", "file", "full-docs.md");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(fullContent);
  } finally {
    cleanupTempDir(join(fullFile, ".."));
  }
});

// ---------------------------------------------------------------------------
// 10. Temp dir cleanup on success
// ---------------------------------------------------------------------------

test("temp clone directory is removed after successful git-sparse", async () => {
  const repo = createMockGitRepo({
    "docs/a.md": "# A\n\n## Section\nContent with enough text for chunking.",
  });

  let capturedTempDir: string | undefined;
  const originalRmSync = rmSync;

  try {
    await seedCentralDocs(
      [
        source("git-sparse", "clean-src", repo, "clean", {
          sparsePath: "docs",
        }),
      ],
      mockEmbedFn,
    );

    for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
      const full = join(tmpdir(), entry.name);
      if (entry.isDirectory() && entry.name.startsWith("autodev-seed-")) {
        capturedTempDir = full;
        if (existsSync(full)) rmSync(full, { recursive: true, force: true });
      }
    }
    expect(capturedTempDir).toBeDefined();
    expect(existsSync(capturedTempDir!)).toBe(false);
  } finally {
    cleanupTempDir(repo);
  }
});

// ---------------------------------------------------------------------------
// 11. Temp dir cleanup on failure
// ---------------------------------------------------------------------------

test("temp clone directory is removed even when git-sparse fails", async () => {
  let capturedTempDir: string | undefined;

  try {
    await seedCentralDocs(
      [
        source(
          "git-sparse",
          "failing-src",
          "file:///not-a-real-repo.git",
          "fail",
        ),
      ],
      mockEmbedFn,
    );

    for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
      const full = join(tmpdir(), entry.name);
      if (entry.isDirectory() && entry.name.startsWith("autodev-seed-")) {
        capturedTempDir = full;
        if (existsSync(full)) rmSync(full, { recursive: true, force: true });
      }
    }
    expect(capturedTempDir).toBeDefined();
    expect(existsSync(capturedTempDir!)).toBe(false);
  } finally {
  }
});
