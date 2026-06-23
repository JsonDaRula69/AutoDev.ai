import { execSync, type ExecSyncOptions } from "node:child_process";
import { platform } from "node:os";

export type Platform = "darwin" | "linux" | "win32";

type ExecFn = (cmd: string, opts?: ExecSyncOptions) => string;

const NOOP_NOTIFY: (msg: string, level: "info" | "warning" | "error") => void = () => {};

const DEFAULT_EXEC: ExecFn = (cmd: string, opts?: ExecSyncOptions) => {
  execSync(cmd, opts ?? {});
  return "";
};

export function detectPlatform(): Platform {
  const p = platform();
  if (p === "darwin") return "darwin";
  if (p === "win32") return "win32";
  return "linux";
}

export function commandExists(cmd: string): boolean {
  return commandExistsWith(cmd, DEFAULT_EXEC);
}

function commandExistsWith(cmd: string, exec: ExecFn): boolean {
  try {
    exec(`${cmd} --version`, { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const PM_CANDIDATES = ["brew", "apt-get", "winget"] as const;

export interface PackageManagerDetectionResult {
  readonly found: boolean;
  readonly name: string | null;
}

export function detectPackageManager(
  notify: (msg: string, level: "info" | "warning" | "error") => void = NOOP_NOTIFY,
  execOverride?: ExecFn,
): PackageManagerDetectionResult {
  const exec = execOverride ?? DEFAULT_EXEC;
  for (const name of PM_CANDIDATES) {
    try {
      exec(`command -v ${name}`, { stdio: "pipe", timeout: 5000 });
      notify(`Detected package manager: ${name}`, "info");
      return { found: true, name };
    } catch {
    }
  }
  notify("No supported package manager detected (brew/apt-get/winget).", "warning");
  return { found: false, name: null };
}

function isNonInteractive(): boolean {
  if (process.env.CI === "true" || process.env.CI === "1") return true;
  if (process.stdout != null && process.stdout.isTTY === false) return true;
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  return false;
}

const HOMEBREW_BOOTSTRAP_URL = "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";

/**
 * Bootstrap a missing system package manager for the given platform.
 *
 * Public API; behavior differs per platform and is non-obvious:
 * - darwin: runs the Homebrew install script.
 * - linux: installs apt prerequisites.
 * - win32: winget ships via App Installer; not script-installable.
 *
 * Auto-proceeds when CI=1, stdout is non-TTY, or --yes/-y is in argv.
 */
export function installPackageManager(
  plat: Platform,
  notify: (msg: string, level: "info" | "warning" | "error") => void = NOOP_NOTIFY,
  execOverride?: ExecFn,
): ToolInstallResult {
  const exec = execOverride ?? DEFAULT_EXEC;

  if (plat === "win32") {
    notify("winget is not available via script install on Windows.", "warning");
    notify("Install 'App Installer' from Settings → Apps → Optional features, or the Microsoft Store, then re-run.", "info");
    return {
      tool: "package-manager",
      installed: false,
      message: "winget not script-installable. Install App Installer via Settings manually.",
    };
  }

  const proceed = isNonInteractive();
  if (!proceed) {
    notify(
      plat === "darwin"
        ? `Homebrew bootstrap: ${HOMEBREW_BOOTSTRAP_URL}`
        : "apt bootstrap: sudo apt-get update && sudo apt-get install -y",
      "info",
    );
    notify("Pass --yes (or run in CI) to auto-proceed with package manager install.", "warning");
  }

  try {
    if (plat === "darwin") {
      notify(`Installing Homebrew from ${HOMEBREW_BOOTSTRAP_URL}...`, "info");
      exec(`bash -c 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL ${HOMEBREW_BOOTSTRAP_URL})"`, {
        stdio: "inherit",
        timeout: 300_000,
      });
      return { tool: "package-manager", installed: true, message: "Homebrew installed successfully" };
    }
    notify("Installing apt package manager prerequisites...", "info");
    exec("sudo apt-get update -y && sudo apt-get install -y apt-transport-https ca-certificates curl gnupg", {
      stdio: "inherit",
      timeout: 180_000,
    });
    return { tool: "package-manager", installed: true, message: "apt prerequisites installed successfully" };
  } catch (e) {
    const msg = (e as Error).message;
    notify(`Failed to bootstrap package manager: ${msg}`, "error");
    return {
      tool: "package-manager",
      installed: false,
      message: `Failed to install package manager: ${msg}`,
    };
  }
}

const BREW_INSTALL_GH = "brew install gh";
const BREW_INSTALL_GIT = "brew install git";
const BREW_INSTALL_NODE = "brew install node";

const APT_UPDATE = "sudo apt-get update -y";
const APT_INSTALL_GH = [
  "sudo mkdir -p -m 755 /etc/apt/keyrings",
  'out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg',
  'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
  "sudo apt-get update -y",
  "sudo apt-get install gh -y",
].join(" && ");
const APT_INSTALL_GIT = "sudo apt-get install git -y";
const APT_INSTALL_NODE = "curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs";

const WINGET_GH = "winget install GitHub.cli";
const WINGET_GIT = "winget install Git.Git";
const WINGET_NODE = "winget install OpenJS.NodeJS.LTS";

export interface ToolInstallResult {
  readonly tool: string;
  readonly installed: boolean;
  readonly message: string;
}

function installTool(
  tool: string,
  brewCmd: string,
  aptCmds: string[],
  wingetCmd: string,
  plat: Platform,
  notify: (msg: string, level: "info" | "warning" | "error") => void,
  execOverride?: (cmd: string, opts?: ExecSyncOptions) => string,
): ToolInstallResult {
  const exec = execOverride ?? ((cmd: string, opts?: ExecSyncOptions) => {
    execSync(cmd, opts ?? {});
    return "";
  });

  try {
    let cmd: string;
    if (plat === "darwin") {
      cmd = brewCmd;
    } else if (plat === "win32") {
      cmd = wingetCmd;
    } else {
      cmd = aptCmds.join(" && ");
    }
    notify(`Installing ${tool}...`, "info");
    exec(cmd, { stdio: "inherit", timeout: 120_000 });
    return { tool, installed: true, message: `${tool} installed successfully` };
  } catch (e) {
    return {
      tool,
      installed: false,
      message: `Failed to install ${tool}: ${(e as Error).message}. Install manually: see https://github.com/cli/cli#installation`,
    };
  }
}

export function installMissingTools(
  notify: (msg: string, level: "info" | "warning" | "error") => void,
  plat?: Platform,
  execOverride?: ExecFn,
): ToolInstallResult[] {
  const p = plat ?? detectPlatform();
  const results: ToolInstallResult[] = [];

  const pm = detectPackageManager(notify, execOverride);
  if (!pm.found) {
    notify("No package manager detected. Bootstrapping one before installing tools.", "warning");
    const pmResult = installPackageManager(p, notify, execOverride);
    results.push(pmResult);
    if (!pmResult.installed) {
      notify("Package manager bootstrap failed. Aborting tool installs.", "error");
      return results;
    }
  }

  const exec = execOverride ?? DEFAULT_EXEC;

  if (!commandExistsWith("gh", exec)) {
    results.push(installTool("GitHub CLI", BREW_INSTALL_GH, [APT_INSTALL_GH], WINGET_GH, p, notify, execOverride));
  }

  if (!commandExistsWith("git", exec)) {
    results.push(installTool("git", BREW_INSTALL_GIT, [APT_INSTALL_GIT], WINGET_GIT, p, notify, execOverride));
  }

  if (!commandExistsWith("bun", exec)) {
    notify("Bun is not installed. AutoDev requires Bun.", "error");
    notify("Install: curl -fsSL https://bun.sh/install | bash", "info");
    results.push({ tool: "Bun", installed: false, message: "Bun not found. Install manually." });
  }

  return results;
}