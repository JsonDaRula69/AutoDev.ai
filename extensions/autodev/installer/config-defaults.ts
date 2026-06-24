/**
 * T1 config-defaults — centralize pi config to `~/.AutoDev/` via symlinks.
 *
 * Resolves the agent dir via `getAgentDir()` from the pi SDK (honors
 * `PI_CODING_AGENT_DIR`). Creates symlinks from the central config home into
 * the installed global npm package so `bun update -g autodev` propagates
 * automatically. `magic-context.jsonc` is written as a real file (AutoDev
 * defaults) rather than symlinked, because it carries consumer-specific keys.
 *
 * No network calls. `fetchOverride` (prior GitHub-raw download param) is
 * replaced by `packageRoot` (defaults to the global npm package path) and
 * `SymlinkOverrides` (test EPERM simulation).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAGIC_CONTEXT_JSONC } from "./magic-context-defaults.js";
import {
  COPY_FALLBACK_WARNING,
  detailFor,
  linkOrCopy,
  type SymlinkOverrides,
} from "./symlink-link.js";

const REQUIRED_AGENT_FILES = [
  "nemo",
  "aronnax",
  "ned-land",
  "conseil",
  "oracle",
  "momus",
  "metis",
  "harbor-master",
  "quartermaster",
  "boatswain",
  "navigator",
  "watch-officer",
  "explore",
] as const;

export interface ConfigCheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly created: boolean;
}

export type ValidateAndCreateConfigOverrides = SymlinkOverrides;

function defaultPackageRoot(): string {
  return join(
    process.env.HOME ?? "",
    ".bun",
    "install",
    "global",
    "node_modules",
    "autodev-ai",
  );
}

/**
 * Create the centralized `~/.AutoDev/` config tree via symlinks into the
 * installed global npm package.
 *
 * When `PI_CODING_AGENT_DIR` is set (configured by `install.sh`), the agent
 * dir resolves to `~/.AutoDev/agent/` and the sibling central home is
 * `~/.AutoDev/`. When unset, falls back to the SDK default `~/.pi/agent/`.
 */
export async function validateAndCreateConfig(
  packageRoot?: string,
  overrides?: ValidateAndCreateConfigOverrides,
): Promise<ConfigCheckResult[]> {
  const results: ConfigCheckResult[] = [];
  const pkg = packageRoot ?? defaultPackageRoot();
  const agentDir = getAgentDir();
  const centralHome = join(agentDir, "..");

  linkSingle(results, "settings.json", join(pkg, ".pi", "settings.json"), join(agentDir, "settings.json"), "symlinked to package .pi/settings.json", overrides);

  linkAgentFiles(results, pkg, centralHome, overrides);

  linkSingle(results, "reference/", join(pkg, ".autodev", "reference"), join(centralHome, "reference"), "symlinked to package .autodev/reference/", overrides);
  linkSingle(results, "skills/", join(pkg, ".pi", "skills"), join(centralHome, "skills"), "symlinked to package .pi/skills/", overrides);
  linkSingle(results, "extensions/autodev", join(pkg, "extensions", "autodev"), join(agentDir, "extensions", "autodev"), "symlinked to package extensions/autodev", overrides);

  linkConfigDir(results, pkg, centralHome, overrides);
  writeMagicContext(results, agentDir);

  return results;
}

function linkSingle(
  results: ConfigCheckResult[],
  name: string,
  target: string,
  link: string,
  createdMsg: string,
  overrides?: ValidateAndCreateConfigOverrides,
): void {
  if (!existsSync(target)) {
    results.push({ name, ok: false, detail: "source file missing", created: false });
    return;
  }
  const r = linkOrCopy(target, link, true, overrides);
  results.push({ name, ok: r.ok, detail: detailFor(r, createdMsg), created: r.created });
}

function linkAgentFiles(
  results: ConfigCheckResult[],
  pkg: string,
  centralHome: string,
  overrides?: ValidateAndCreateConfigOverrides,
): void {
  const agentsCentralDir = join(centralHome, "agents");
  if (!existsSync(join(pkg, ".pi", "agents"))) {
    results.push({ name: "agents/*.md", ok: false, detail: "source directory missing", created: false });
    return;
  }
  let allOk = true;
  let anyCreated = false;
  let anyCopied = false;
  const missingNames: string[] = [];
  for (const a of REQUIRED_AGENT_FILES) {
    const target = join(pkg, ".pi", "agents", `${a}.md`);
    const link = join(agentsCentralDir, `${a}.md`);
    if (!existsSync(target)) {
      allOk = false;
      missingNames.push(a);
      continue;
    }
    const r = linkOrCopy(target, link, false, overrides);
    if (!r.ok) allOk = false;
    if (r.created) anyCreated = true;
    if (r.copied) anyCopied = true;
  }
  results.push({
    name: "agents/*.md",
    ok: allOk && missingNames.length === 0,
    detail: allOk && missingNames.length === 0
      ? anyCopied ? COPY_FALLBACK_WARNING : anyCreated ? `symlinked ${REQUIRED_AGENT_FILES.length} agent files` : `${REQUIRED_AGENT_FILES.length} agent files present`
      : missingNames.length > 0 ? `source file missing: ${missingNames.join(", ")}` : "one or more agent symlinks failed",
    created: anyCreated,
  });
}

function linkConfigDir(
  results: ConfigCheckResult[],
  pkg: string,
  centralHome: string,
  overrides?: ValidateAndCreateConfigOverrides,
): void {
  const configCentralDir = join(centralHome, "config");
  const configPkgDir = join(pkg, ".autodev", "config");
  if (!existsSync(configPkgDir)) {
    results.push({ name: "config/", ok: false, detail: "source directory missing", created: false });
    return;
  }
  const entries = readdirSync(configPkgDir).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".json") || f.endsWith(".md"),
  );
  let allOk = true;
  let anyCreated = false;
  let anyCopied = false;
  const missingNames: string[] = [];
  for (const f of entries) {
    const r = linkOrCopy(join(configPkgDir, f), join(configCentralDir, f), false, overrides);
    if (!r.ok) {
      allOk = false;
      missingNames.push(f);
    }
    if (r.created) anyCreated = true;
    if (r.copied) anyCopied = true;
  }
  results.push({
    name: "config/",
    ok: allOk,
    detail: allOk
      ? anyCopied ? COPY_FALLBACK_WARNING : anyCreated ? `symlinked ${entries.length} config files` : `${entries.length} config files present`
      : `failed: ${missingNames.join(", ")}`,
    created: anyCreated,
  });
}

function writeMagicContext(results: ConfigCheckResult[], agentDir: string): void {
  const mcPath = join(agentDir, "magic-context.jsonc");
  if (existsSync(mcPath)) {
    results.push({ name: "magic-context.jsonc", ok: true, detail: "exists", created: false });
    return;
  }
  try {
    if (!existsSync(agentDir)) mkdirSync(agentDir, { recursive: true });
    writeFileSync(mcPath, DEFAULT_MAGIC_CONTEXT_JSONC, "utf-8");
    results.push({ name: "magic-context.jsonc", ok: true, detail: "written with AutoDev defaults", created: true });
  } catch (e) {
    results.push({ name: "magic-context.jsonc", ok: false, detail: `write failed: ${(e as Error).message}`, created: false });
  }
}