#!/usr/bin/env bun
/**
 * Post-install hook — thin trigger.
 *
 * Fires automatically after `bun install -g autodev`. Hands off immediately
 * to `runDoctor({ launchConfigFlow: true })`, which is the single orchestrator:
 * local install guard, fresh-install detection, health checks, and config
 * flow launch all live inside doctor.
 */
import { runDoctor, type DoctorExecFn } from "../extensions/autodev/installer/doctor.js";
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

function notify(msg: string, level: "info" | "warning" | "error" = "info"): void {
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(msg + "\n");
}

const realExec: DoctorExecFn = (cmd, opts) =>
  execSync(cmd, opts ?? {}) as unknown as string;

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const authPath = getAuthPath();

  await runDoctor({
    projectRoot,
    authPath,
    execSyncOverride: realExec,
    launchConfigFlow: true,
    notify,
  });
}

main().catch((e) => {
  console.error(`AutoDev postinstall error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});