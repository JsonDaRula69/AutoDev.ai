/**
 * Programmatic pi package installation — replaces `pi install` CLI shell-outs.
 *
 * The pi SDK exports `DefaultPackageManager` and `SettingsManager` which
 * together perform the same install-and-persist flow as the `pi install`
 * CLI command, but without requiring the `pi` binary to be on PATH.
 *
 * Bun only links the top-level package's `bin` entries to `~/.bun/bin/`;
 * transitive dependency bins like `pi` are NOT linked. This module lets
 * the autodev installer install pi extensions (providers, Magic Context,
 * etc.) programmatically using the SDK API.
 */
import {
  DefaultPackageManager,
  SettingsManager,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";

// ---- Types ----

export interface ProviderInstallResult {
  readonly source: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly alreadyInstalled: boolean;
}

export interface ProviderInstallDeps {
  /** Package source to install (e.g. "npm:pi-ollama-cloud"). */
  readonly source: string;
  /** Project root (cwd). Defaults to process.cwd(). */
  readonly cwd?: string;
  /** Agent directory. Defaults to getAgentDir(). */
  readonly agentDir?: string;
  /** Notify callback. */
  readonly notify?: (message: string, level: "info" | "warning" | "error") => void;
  /** Install project-locally (.pi/settings.json) instead of user-level. */
  readonly local?: boolean;
  /** Override the package manager (tests). */
  readonly packageManagerOverride?: DefaultPackageManager;
}

// ---- Public API ----

/**
 * Install a pi package programmatically via the SDK.
 *
 * Equivalent to: `pi install <source> [--local]`
 *
 * Uses `DefaultPackageManager.installAndPersist()` which:
 *   1. Parses the source (npm:, git:, local path)
 *   2. Runs the install (npm install / git clone)
 *   3. Adds the source to settings.json (user or project scope)
 *
 * User-scope installs do NOT require project trust — only project-scope
 * installs are gated by the trust manager.
 */
export async function installProvider(
  deps: ProviderInstallDeps,
): Promise<ProviderInstallResult> {
  const { source, notify, local = false } = deps;
  const cwd = deps.cwd ?? process.cwd();
  const agentDir = deps.agentDir ?? getAgentDir();

  notify?.(`Installing ${source}...`, "info");

  try {
    const pm = deps.packageManagerOverride ?? createPackageManager(cwd, agentDir);

    // Check if already installed (npm sources resolve to a node_modules dir).
    const alreadyInstalled = isAlreadyInstalled(pm, source, local);

    if (alreadyInstalled) {
      notify?.(`${source} already installed.`, "info");
      return {
        source,
        ok: true,
        detail: "already installed",
        alreadyInstalled: true,
      };
    }

    await pm.installAndPersist(source, { local });
    notify?.(`${source} installed successfully.`, "info");

    return {
      source,
      ok: true,
      detail: "installed",
      alreadyInstalled: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notify?.(`Failed to install ${source}: ${msg}`, "error");
    return {
      source,
      ok: false,
      detail: msg,
      alreadyInstalled: false,
    };
  }
}

// ---- Helpers ----

function createPackageManager(cwd: string, agentDir: string): DefaultPackageManager {
  const settingsManager = SettingsManager.create(cwd, agentDir);
  return new DefaultPackageManager({ cwd, agentDir, settingsManager });
}

/**
 * Check if an npm package is already installed in the pi agent dir's npm
 * node_modules. For non-npm sources, returns false (always attempt install).
 */
function isAlreadyInstalled(
  pm: DefaultPackageManager,
  source: string,
  local: boolean,
): boolean {
  // We use the public getNpmInstallRoot via the installed path check.
  // For npm: sources, the package lands in <agentDir>/npm/node_modules/<name>.
  // We check existence of that directory as a quick idempotency guard.
  const parsed = parseNpmSource(source);
  if (parsed === null) return false;

  const scope = local ? "project" : "user";
  try {
    const installRoot = (pm as unknown as {
      getNpmInstallRoot(scope: string, temporary: boolean): string;
    }).getNpmInstallRoot(scope, false);
    return existsSync(`${installRoot}/node_modules/${parsed.name}`);
  } catch {
    return false;
  }
}

/** Parse "npm:package-name" or "npm:@scope/package-name" into { name }. */
function parseNpmSource(source: string): { name: string } | null {
  if (!source.startsWith("npm:")) return null;
  const spec = source.slice(4);
  // Strip version pin (e.g. "npm:foo@1.0.0" → "foo")
  const atIdx = spec.lastIndexOf("@");
  const name = atIdx > 0 ? spec.slice(0, atIdx) : spec;
  if (name.length === 0) return null;
  return { name };
}