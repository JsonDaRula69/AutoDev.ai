import { execSync, type ExecSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readAuth } from "./auth.js";
import { readEnv } from "./env.js";
import { readState } from "./state.js";
import { validateAndCreateConfig } from "./config-defaults.js";

export interface DoctorCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DoctorResult {
  readonly checks: readonly DoctorCheck[];
  readonly passed: number;
  readonly failed: number;
}

export type DoctorExecFn = (command: string, options?: ExecSyncOptions) => string;

export interface DoctorDeps {
  readonly projectRoot: string;
  readonly authPath: string;
  readonly execSyncOverride?: DoctorExecFn;
}

export async function isFreshInstall(deps: Pick<DoctorDeps, "projectRoot" | "authPath">): Promise<boolean> {
  if (existsSync(deps.authPath)) {
    const auth = await readAuth(deps.authPath);
    const hasCreds = Object.values(auth).some((e) => e?.key !== undefined && e.key !== "");
    if (hasCreds) return false;
  }
  const state = await readState(deps.projectRoot, "install");
  if (state.completedSteps.length > 0) return false;
  const envPath = join(deps.projectRoot, ".env");
  if (existsSync(envPath)) {
    const env = await readEnv(deps.projectRoot);
    if (env.get("OLLAMA_CLOUD_API_KEY") !== undefined && env.get("OLLAMA_CLOUD_API_KEY") !== "") return false;
  }
  return true;
}

export async function runDoctor(deps: DoctorDeps): Promise<DoctorResult> {
  const exec: DoctorExecFn = deps.execSyncOverride ?? ((cmd: string, opts?: ExecSyncOptions) =>
    execSync(cmd, opts ?? {}) as unknown as string);
  const checks: DoctorCheck[] = [];

  try {
    const version = exec("bun --version", { encoding: "utf-8" }).trim();
    const major = parseInt(version.split(".")[0] ?? "0", 10);
    checks.push({ name: "Bun", ok: major >= 1, detail: `v${version}` });
  } catch {
    checks.push({ name: "Bun", ok: false, detail: "not found" });
  }

  try {
    const version = exec("gh --version", { encoding: "utf-8" }).trim().split("\n")[0] ?? "";
    checks.push({ name: "GitHub CLI", ok: true, detail: version });
  } catch {
    checks.push({ name: "GitHub CLI", ok: false, detail: "not found" });
  }

  try {
    exec("gh auth status", { encoding: "utf-8", stdio: "pipe" });
    checks.push({ name: "GitHub auth", ok: true, detail: "authenticated" });
  } catch {
    checks.push({ name: "GitHub auth", ok: false, detail: "not authenticated" });
  }

  try {
    const auth = await readAuth(deps.authPath);
    const providers = Object.keys(auth).filter((k) => auth[k]?.key !== "");
    checks.push({
      name: "LLM credentials",
      ok: providers.length > 0,
      detail: providers.length > 0 ? `${providers.length} provider(s): ${providers.join(", ")}` : "no credentials",
    });
  } catch {
    checks.push({ name: "LLM credentials", ok: false, detail: `auth.json not found at ${deps.authPath}` });
  }

  try {
    const env = await readEnv(deps.projectRoot);
    const hasOllama = env.get("OLLAMA_CLOUD_API_KEY") !== undefined && env.get("OLLAMA_CLOUD_API_KEY") !== "";
    const hasVoyage = env.get("VOYAGE_API_KEY") !== undefined;
    checks.push({
      name: "Environment vars",
      ok: hasOllama,
      detail: `OLLAMA_CLOUD_API_KEY: ${hasOllama ? "set" : "missing"}, VOYAGE_API_KEY: ${hasVoyage ? "set (or ONNX fallback)" : "missing"}`,
    });
  } catch {
    checks.push({ name: "Environment vars", ok: false, detail: ".env not found" });
  }

  try {
    const state = await readState(deps.projectRoot, "install");
    const installStepCount = state.completedSteps.length;
    checks.push({
      name: "Install state",
      ok: installStepCount >= 8,
      detail: `${installStepCount}/8 install steps completed`,
    });
  } catch {
    checks.push({ name: "Install state", ok: false, detail: "install-state.json not found" });
  }

  const configResults = await validateAndCreateConfig(deps.projectRoot);
  for (const cr of configResults) {
    checks.push({
      name: cr.name,
      ok: cr.ok,
      detail: cr.created ? `${cr.detail} (created)` : cr.detail,
    });
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  return { checks, passed, failed };
}