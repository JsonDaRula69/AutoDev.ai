import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface UninstallResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface UninstallModuleDeps {
  readonly projectRoot: string;
  readonly notify: (message: string, level: "info" | "warning" | "error") => void;
  readonly removeProviderOverride?: (source: string) => void;
}

const PI_PROVIDER_SOURCES = [
  "npm:pi-ollama-cloud",
  "npm:@cortexkit/pi-magic-context",
  "npm:@cortexkit/aft-pi",
  "npm:@dreki-gg/pi-lsp",
] as const;

const SHELL_RC_CANDIDATES = [
  ".bashrc",
  ".zshrc",
  ".profile",
  ".config/fish/config.fish",
];

const PI_ENV_LINE_BASH = 'export PI_CODING_AGENT_DIR="$HOME/.AutoDev/agent"';
const PI_ENV_LINE_FISH = "set -gx PI_CODING_AGENT_DIR $HOME/.AutoDev/agent";

export async function runUninstall(deps: UninstallModuleDeps): Promise<UninstallResult[]> {
  const results: UninstallResult[] = [];
  const { projectRoot, notify } = deps;

  results.push(await removePiProviders(deps));
  results.push(removeCentralConfigHomes(deps));
  results.push(removeNpmGlobalPackage(deps));
  results.push(removeShellEnvLines(deps));
  results.push(removeCortexkitConfig(deps));
  results.push(removeProjectStateFiles(projectRoot));

  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    notify("AutoDev uninstalled successfully.", "info");
  } else {
    notify(`${failed.length} step(s) had issues during uninstall.`, "warning");
  }

  return results;
}

function removeCentralConfigHomes(deps: UninstallModuleDeps): UninstallResult {
  const { notify } = deps;
  const home = process.env.HOME ?? "~";
  const targets = [
    join(home, ".AutoDev"),
    join(home, ".pi"),
    join(home, ".autodev"),
  ];
  const removed: string[] = [];
  const errors: string[] = [];

  for (const dir of targets) {
    if (!existsSync(dir)) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
      notify(`Removed ${dir}`, "info");
    } catch (e) {
      errors.push(`${dir}: ${(e as Error).message}`);
    }
  }

  if (errors.length > 0) {
    return { name: "central-config-homes", ok: false, detail: errors.join("; ") };
  }
  return {
    name: "central-config-homes",
    ok: true,
    detail: removed.length > 0 ? `removed ${removed.join(", ")}` : "already absent",
  };
}

function removeNpmGlobalPackage(deps: UninstallModuleDeps): UninstallResult {
  const { notify } = deps;
  const home = process.env.HOME ?? "~";
  const removed: string[] = [];
  const errors: string[] = [];

  const packageDir = join(home, "node_modules", "autodev-ai");
  if (existsSync(packageDir)) {
    try {
      rmSync(packageDir, { recursive: true, force: true });
      removed.push("package");
    } catch (e) {
      errors.push(`package: ${(e as Error).message}`);
    }
  }

  const binSymlinks = [
    join(home, ".bun", "bin", "autodev"),
    join(home, "node_modules", ".bin", "autodev"),
  ];
  for (const link of binSymlinks) {
    if (!existsSync(link)) continue;
    try {
      rmSync(link, { force: true });
      removed.push(link);
    } catch (e) {
      errors.push(`${link}: ${(e as Error).message}`);
    }
  }

  if (removed.length > 0) notify(`Removed npm global package and bin symlinks`, "info");

  if (errors.length > 0) {
    return { name: "npm-global-package", ok: false, detail: errors.join("; ") };
  }
  return {
    name: "npm-global-package",
    ok: true,
    detail: removed.length > 0 ? `removed ${removed.length} item(s)` : "already absent",
  };
}

function removeCortexkitConfig(deps: UninstallModuleDeps): UninstallResult {
  const { notify } = deps;
  const home = process.env.HOME ?? "~";
  const removed: string[] = [];
  const errors: string[] = [];

  const mcConfig = join(home, ".config", "cortexkit", "magic-context.jsonc");
  if (existsSync(mcConfig)) {
    try {
      rmSync(mcConfig, { force: true });
      removed.push("magic-context.jsonc");
    } catch (e) {
      errors.push(`magic-context.jsonc: ${(e as Error).message}`);
    }
  }

  const autodevEnv = join(home, ".config", "autodev.env");
  if (existsSync(autodevEnv)) {
    try {
      rmSync(autodevEnv, { force: true });
      removed.push("autodev.env");
    } catch (e) {
      errors.push(`autodev.env: ${(e as Error).message}`);
    }
  }

  if (removed.length > 0) notify(`Removed CortexKit config files`, "info");

  if (errors.length > 0) {
    return { name: "cortexkit-config", ok: false, detail: errors.join("; ") };
  }
  return {
    name: "cortexkit-config",
    ok: true,
    detail: removed.length > 0 ? `removed ${removed.join(", ")}` : "already absent",
  };
}

async function removePiProviders(deps: UninstallModuleDeps): Promise<UninstallResult> {
  const { notify, removeProviderOverride } = deps;
  const errors: string[] = [];

  for (const source of PI_PROVIDER_SOURCES) {
    if (removeProviderOverride) {
      try {
        removeProviderOverride(source);
        notify(`Uninstalled ${source}`, "info");
      } catch (e) {
        errors.push(`${source}: ${(e as Error).message}`);
      }
      continue;
    }

    try {
      const { execSync } = await import("node:child_process");
      const cmd = `npx @earendil-works/pi-coding-agent uninstall ${source}`;
      execSync(cmd, { stdio: "pipe", timeout: 60_000, cwd: process.cwd() });
      notify(`Uninstalled ${source}`, "info");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes("not installed") || msg.toLowerCase().includes("not found")) {
        notify(`${source} not installed — skipping`, "info");
      } else {
        errors.push(`${source}: ${msg}`);
      }
    }
  }

  if (errors.length === 0) {
    return { name: "pi-providers", ok: true, detail: "all providers removed" };
  }
  return { name: "pi-providers", ok: false, detail: errors.join("; ") };
}

function removeShellEnvLines(deps: UninstallModuleDeps): UninstallResult {
  const { notify } = deps;
  const home = process.env.HOME ?? "~";
  let modified = 0;

  for (const rc of SHELL_RC_CANDIDATES) {
    const rcPath = join(home, rc);
    if (!existsSync(rcPath)) continue;

    let content: string;
    try {
      content = readFileSync(rcPath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const isFish = rc.endsWith("config.fish");
    const targetLine = isFish ? PI_ENV_LINE_FISH : PI_ENV_LINE_BASH;
    const filtered = lines.filter((l) => l.trim() !== targetLine.trim());

    if (filtered.length === lines.length) continue;

    try {
      writeFileSync(rcPath, filtered.join("\n"), "utf-8");
      modified++;
      notify(`Removed PI_CODING_AGENT_DIR from ${rc}`, "info");
    } catch (e) {
      notify(`Failed to update ${rc}: ${(e as Error).message}`, "warning");
    }
  }

  return {
    name: "shell-env-lines",
    ok: true,
    detail: modified > 0 ? `cleaned ${modified} rc file(s)` : "no rc lines found",
  };
}

function removeProjectStateFiles(projectRoot: string): UninstallResult {
  const stateFiles = [
    join(projectRoot, ".autodev", "install-state.json"),
    join(projectRoot, ".autodev", "config-state.json"),
    join(projectRoot, ".autodev", "init-state.json"),
  ];
  let removed = 0;
  const errors: string[] = [];

  for (const f of stateFiles) {
    if (!existsSync(f)) continue;
    try {
      rmSync(f, { force: true });
      removed++;
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
    }
  }

  if (errors.length > 0) {
    return { name: "project-state-files", ok: false, detail: errors.join("; ") };
  }
  return {
    name: "project-state-files",
    ok: true,
    detail: removed > 0 ? `removed ${removed} file(s)` : "no state files found",
  };
}

