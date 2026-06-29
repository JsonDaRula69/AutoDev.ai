/**
 * Resolve CortexKit shared config paths.
 *
 * Magic Context v0.27.0+ and AFT v0.40.0+ moved their config files from
 * per-harness locations (`.pi/agent/`, `.opencode/`) to a shared CortexKit
 * directory:
 *
 *   User config:    `$XDG_CONFIG_HOME/cortexkit/<name>.jsonc`
 *                   (defaults to `~/.config/cortexkit/<name>.jsonc`)
 *   Project config: `<cwd>/.cortexkit/<name>.jsonc`
 *
 * Both packages auto-migrate old config files on first run (renaming them to
 * `*.MOVED_READPLEASE`), but AutoDev's installer should write defaults directly
 * to the new location so the migration step is unnecessary.
 *
 * @module
 */
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";

/**
 * Resolve the XDG config home directory.
 *
 * Honors `XDG_CONFIG_HOME` when set to an absolute path; otherwise defaults to
 * `~/.config` (or `%USERPROFILE%\.config` on Windows).
 */
export function configHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && isAbsolute(xdg)) return xdg;
  const home = process.platform === "win32"
    ? (process.env.USERPROFILE || homedir())
    : (process.env.HOME || homedir());
  return join(home, ".config");
}

/**
 * Resolve the user-level CortexKit config directory (`~/.config/cortexkit/`).
 */
export function cortexKitConfigDir(): string {
  return join(configHome(), "cortexkit");
}

/**
 * Resolve the user-level Magic Context config file path.
 *
 * This is where MC v0.27.0+ reads its user-level config from. AutoDev writes
 * its defaults here instead of the old `~/.pi/agent/magic-context.jsonc`.
 */
export function magicContextUserConfigPath(): string {
  return join(cortexKitConfigDir(), "magic-context.jsonc");
}

/**
 * Resolve the project-level Magic Context config file path.
 *
 * MC reads project-level config from `<cwd>/.cortexkit/magic-context.jsonc`.
 * Project config overrides user config for project-scoped keys.
 */
export function magicContextProjectConfigPath(projectRoot: string): string {
  return join(projectRoot, ".cortexkit", "magic-context.jsonc");
}

/**
 * Resolve the user-level AFT config file path.
 *
 * AFT v0.40.0+ reads from `~/.config/cortexkit/aft.jsonc`. AFT auto-migrates
 * from the old `~/.pi/agent/aft.json` location, so AutoDev does not need to
 * write this file — it's created by `npx @cortexkit/aft setup`.
 */
export function aftUserConfigPath(): string {
  return join(cortexKitConfigDir(), "aft.jsonc");
}