#!/usr/bin/env bun
import { isFreshInstall, runDoctor, type DoctorExecFn } from "../extensions/autodev/installer/doctor.js";
import { runInstall } from "../extensions/autodev/installer/index.js";
import { execSync } from "node:child_process";
import { join } from "node:path";

function getAuthPath(): string {
  try {
    const { getAgentDir } = require("@earendil-works/pi-coding-agent") as {
      getAgentDir: () => string;
    };
    return join(getAgentDir(), "auth.json");
  } catch {
    return join(process.env.HOME ?? "~", ".pi", "agent", "auth.json");
  }
}

const realExec: DoctorExecFn = (cmd, opts) =>
  execSync(cmd, opts ?? {}) as unknown as string;

function isGlobalInstall(): boolean {
  return process.env.npm_config_global === "true";
}

function notify(msg: string, level: "info" | "warning" | "error" = "info"): void {
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(msg + "\n");
}

async function main(): Promise<void> {
  if (!isGlobalInstall()) {
    console.log("");
    console.log("AutoDev was installed as a local dependency.");
    console.log("============================================");
    console.log("AutoDev is a machine-level tool, not a project dependency.");
    console.log("Install it globally instead:");
    console.log("");
    console.log("  bun install -g autodev");
    console.log("");
    return;
  }

  const projectRoot = process.cwd();
  const authPath = getAuthPath();
  const fresh = await isFreshInstall({ projectRoot, authPath });

  if (!fresh) {
    const result = await runDoctor({ projectRoot, authPath, execSyncOverride: realExec });
    for (const check of result.checks) {
      const icon = check.ok ? "✓" : "✗";
      console.log(`  ${icon} ${check.name}: ${check.detail}`);
    }
    console.log(`\nResults: ${result.passed} passed, ${result.failed} failed`);
    if (result.failed > 0) {
      console.log("\nRunning autodev install to fix missing components...");
      await runInstall({
        projectRoot,
        authPath,
        nonInteractive: process.stdin.isTTY !== true,
        notify,
      });
    }
    return;
  }

  if (process.stdin.isTTY !== true) {
    console.log("");
    console.log("AutoDev detected a fresh installation.");
    console.log("============================================");
    console.log("To complete setup, run:");
    console.log("");
    console.log("  autodev install");
    console.log("");
    console.log("This will guide you through configuring LLM credentials,");
    console.log("Magic Context, and optional Discord integration.");
    console.log("");
    return;
  }

  console.log("");
  console.log("AutoDev detected a fresh installation.");
  console.log("Starting interactive setup...");
  console.log("");

  await runInstall({
    projectRoot,
    authPath,
    nonInteractive: false,
    notify,
  });
}

main().catch((e) => {
  console.error(`AutoDev postinstall error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});