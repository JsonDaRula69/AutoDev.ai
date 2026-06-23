import { execSync, type ExecSyncOptions } from "node:child_process";
import { platform } from "node:os";

export type Platform = "darwin" | "linux" | "win32";

export function detectPlatform(): Platform {
  const p = platform();
  if (p === "darwin") return "darwin";
  if (p === "win32") return "win32";
  return "linux";
}

export function commandExists(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
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
  execOverride?: (cmd: string, opts?: ExecSyncOptions) => string,
): ToolInstallResult[] {
  const p = plat ?? detectPlatform();
  const results: ToolInstallResult[] = [];

  if (!commandExists("gh")) {
    results.push(installTool("GitHub CLI", BREW_INSTALL_GH, [APT_INSTALL_GH], WINGET_GH, p, notify, execOverride));
  }

  if (!commandExists("git")) {
    results.push(installTool("git", BREW_INSTALL_GIT, [APT_INSTALL_GIT], WINGET_GIT, p, notify, execOverride));
  }

  if (!commandExists("bun")) {
    notify("Bun is not installed. AutoDev requires Bun.", "error");
    notify("Install: curl -fsSL https://bun.sh/install | bash", "info");
    results.push({ tool: "Bun", installed: false, message: "Bun not found. Install manually." });
  }

  return results;
}