/**
 * Seeding framework for the central docs corpus.
 *
 * Pluggable source list → download → chunk → embed.
 *
 * Supported source types:
 *   - `git-sparse`: shallow sparse checkout of a git repo
 *   - `llms-txt`: parse an `llms.txt` index and fetch linked `.md` files
 *   - `llms-full`: fetch a single aggregated `llms-full.txt` / `llms.md`
 *
 * All downloaded/copied markdown is written under the central corpus root
 * (`<agentDir>/../docs-corpus/<targetSubdir>`). After sources finish, the
 * central vector DB is rebuilt with `docsRebuildTier("central", embedFn)`.
 */

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, copyFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { minimatch } from "minimatch";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { embed, type EmbedFn } from "../embeddings.js";
import { docsRebuildTier } from "./index.js";

export type { EmbedFn };
export { embed };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single pluggable documentation source. */
export interface SeedSource {
  /** Human-readable source name (used for logging and source_name tagging). */
  name: string;

  /** Source delivery mechanism. */
  type: "git-sparse" | "llms-txt" | "llms-full";

  /** Repository URL (`git-sparse`) or document URL (`llms-*`). */
  url: string;

  /** For `git-sparse`: directory/path inside the repo to sparse-checkout. */
  sparsePath?: string;

  /** Subdirectory under the central corpus root where files are written. */
  targetSubdir: string;

  /** Minimatch patterns applied to file paths; matches are excluded. */
  excludePatterns?: string[];

  /** When false, the source is skipped without error. */
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Central corpus root: `<agentDir>/../docs-corpus`. */
export function centralCorpusRoot(): string {
  return join(getAgentDir(), "..", "docs-corpus");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a relative path to POSIX-style for matching and storage. */
function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/** Check whether `relPath` matches any of the supplied exclude patterns. */
function isExcluded(relPath: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  for (const pattern of patterns) {
    if (minimatch(relPath, pattern, { matchBase: true })) return true;
  }
  return false;
}

/** Recursively copy `.md` files from `srcDir` to `destDir`, applying excludes. */
function copyMdFiles(srcDir: string, destDir: string, excludePatterns?: string[], prefix = ""): string[] {
  const copied: string[] = [];
  const visit = (dir: string, relPrefix: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        visit(full, rel);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const posixRel = toPosix(rel);
        if (isExcluded(posixRel, excludePatterns)) continue;
        const target = join(destDir, rel);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(full, target);
        copied.push(toPosix(join(prefix, posixRel)));
      }
    }
  };
  visit(srcDir, "");
  return copied;
}

/** HTTP fetch with a short timeout; returns text on success or throws. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Source handlers
// ---------------------------------------------------------------------------

/**
 * Sparse-checkout a git repo and copy the requested markdown files into the
 * central corpus. The temporary clone directory is always removed.
 */
async function handleGitSparse(source: SeedSource): Promise<string[]> {
  const url = source.url;
  const sparsePath = source.sparsePath ?? "";
  const tmpDir = mkdtempSync(join(tmpdir(), "autodev-seed-"));

  try {
    // Shallow clone with no checkout, then enable sparse checkout.
    const clone = spawnSync("git", ["clone", "--depth=1", "--no-checkout", url, tmpDir], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (clone.status !== 0) {
      throw new Error(`git clone failed: ${clone.stderr || clone.stdout || "unknown error"}`);
    }

    const sparseInit = spawnSync("git", ["-C", tmpDir, "sparse-checkout", "init", "--cone"], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (sparseInit.status !== 0) {
      throw new Error(`git sparse-checkout init failed: ${sparseInit.stderr || sparseInit.stdout}`);
    }

    const sparseSet = spawnSync("git", ["-C", tmpDir, "sparse-checkout", "set", sparsePath], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (sparseSet.status !== 0) {
      throw new Error(`git sparse-checkout set failed: ${sparseSet.stderr || sparseSet.stdout}`);
    }

    const checkout = spawnSync("git", ["-C", tmpDir, "checkout"], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    if (checkout.status !== 0) {
      throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
    }

    const srcDir = sparsePath ? join(tmpDir, sparsePath) : tmpDir;
    if (!existsSync(srcDir)) {
      throw new Error(`sparse path not found in checkout: ${sparsePath}`);
    }

    const destDir = join(centralCorpusRoot(), source.targetSubdir);
    mkdirSync(destDir, { recursive: true });
    return copyMdFiles(srcDir, destDir, source.excludePatterns, source.targetSubdir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Parse an `llms.txt` file, fetch each linked `.md` file, and write it under
 * the target subdirectory. Relative links are resolved against the base URL.
 */
async function handleLlmsTxt(source: SeedSource): Promise<string[]> {
  const baseUrl = source.url;
  const indexText = await fetchText(baseUrl);

  // Markdown link pattern: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const mdUrls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(indexText)) !== null) {
    const href = match[2];
    if (href !== undefined && href.endsWith(".md")) {
      mdUrls.push(new URL(href, baseUrl).toString());
    }
  }

  const destDir = join(centralCorpusRoot(), source.targetSubdir);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];

  for (const mdUrl of mdUrls) {
    try {
      const text = await fetchText(mdUrl);
      const parsed = new URL(mdUrl);
      const fileName = basename(parsed.pathname) || "doc.md";
      const rel = toPosix(join(source.targetSubdir, fileName));
      if (isExcluded(rel, source.excludePatterns)) continue;
      const target = join(destDir, fileName);
      writeFileSync(target, text, "utf8");
      written.push(rel);
    } catch (err) {
      // Per-source failures are collected outside; rethrow so the caller
      // can record this URL as an error and continue with the next source.
      throw new Error(`llms-txt fetch ${mdUrl}: ${(err as Error).message}`);
    }
  }

  return written;
}

/**
 * Fetch or read a single aggregated docs file (`llms-full.txt` / `llms.md`)
 * and write it as `full-docs.md` under the target subdirectory.
 */
async function handleLlmsFull(source: SeedSource): Promise<string[]> {
  let text: string;
  const url = source.url;

  if (url.startsWith("file://")) {
    text = readFileSync(url.slice(7), "utf8");
  } else if (url.startsWith("http://") || url.startsWith("https://")) {
    text = await fetchText(url);
  } else {
    throw new Error(`llms-full url must be http(s):// or file://: ${url}`);
  }

  const destDir = join(centralCorpusRoot(), source.targetSubdir);
  mkdirSync(destDir, { recursive: true });
  const target = join(destDir, "full-docs.md");
  writeFileSync(target, text, "utf8");
  return [toPosix(join(source.targetSubdir, "full-docs.md"))];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed the central docs corpus from the configured sources and rebuild the
 * central vector DB.
 *
 * Partial failures are collected in `errors` but do not abort seeding; any
 * sources that succeeded still contribute to the final rebuild.
 */
export async function seedCentralDocs(
  sources: SeedSource[],
  embedFn: EmbedFn = embed,
): Promise<{ chunks: number; errors: string[] }> {
  const errors: string[] = [];

  for (const source of sources) {
    if (source.active === false) continue;

    try {
      switch (source.type) {
        case "git-sparse": {
          await handleGitSparse(source);
          break;
        }
        case "llms-txt": {
          await handleLlmsTxt(source);
          break;
        }
        case "llms-full": {
          await handleLlmsFull(source);
          break;
        }
        default: {
          // Exhaustiveness guard — TypeScript narrows this away at compile time.
          const _exhaustive: never = source.type;
          errors.push(`${source.name}: unsupported source type ${_exhaustive}`);
        }
      }
    } catch (err) {
      errors.push(`${source.name}: ${(err as Error).message}`);
    }
  }

  const rebuild = await docsRebuildTier("central", embedFn);
  return { chunks: rebuild.chunks, errors: [...errors, ...rebuild.errors] };
}
