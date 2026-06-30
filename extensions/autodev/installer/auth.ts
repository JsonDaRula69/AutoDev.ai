/**
 * Auth file read/write — manages `auth.json` in the pi agent directory.
 *
 * The pi agent directory is resolved via `getAgentDir()` (typically
 * `~/.pi/agent/`). The auth file stores provider credentials in the format:
 *
 * ```json
 * {
 *   "ollama-cloud": { "type": "api_key", "key": "..." },
 *   "openai": { "type": "api_key", "key": "sk-..." }
 * }
 * ```
 *
 * See `docs-corpus/pi/providers.md` for the full list of provider keys.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setEnvVar } from "./env.js";

/** Shape of a single provider entry in auth.json. */
export interface AuthEntry {
  readonly type: "api_key";
  readonly key: string;
}

/** Shape of the full auth.json file. */
export type AuthData = Record<string, AuthEntry>;

/** Read the current auth.json, returning an empty object if missing. */
export async function readAuth(authPath: string): Promise<AuthData> {
  if (!existsSync(authPath)) return {};
  try {
    const raw = await readFile(authPath, "utf-8");
    return JSON.parse(raw) as AuthData;
  } catch {
    return {};
  }
}

/** Write the full auth data to auth.json. */
export async function writeAuth(authPath: string, data: AuthData): Promise<void> {
  const dir = join(authPath, "..");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(authPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Set a single provider's API key in auth.json. */
export async function setProviderKey(
  authPath: string,
  provider: string,
  key: string,
): Promise<void> {
  const data = await readAuth(authPath);
  data[provider] = { type: "api_key", key };
  await writeAuth(authPath, data);
}

/**
 * Import credentials from an existing auth.json, transforming them to `$VAR`
 * references: the actual key is written to `.env` and only a `$VAR` reference
 * is stored in `auth.json`. Never writes literal key values to `auth.json`.
 */
export async function tryImportAuth(
  sourcePath: string,
  targetPath: string,
  provider: string,
  envVarName?: string,
  envPath?: string,
  projectRoot?: string,
): Promise<boolean> {
  if (!existsSync(sourcePath)) return false;
  try {
    const source = await readAuth(sourcePath);
    const entry = source[provider];
    if (entry === undefined || entry.type !== "api_key" || entry.key === "") return false;

    const varName = envVarName ?? providerToEnvVar(provider);
    const resolvedEnvPath = envPath ?? join(targetPath, "..", ".env");
    const resolvedProjectRoot = projectRoot ?? targetPath;

    await setEnvVar(resolvedProjectRoot, varName, entry.key, resolvedEnvPath);
    await setProviderKey(targetPath, provider, `$${varName}`);
    return true;
  } catch {
    return false;
  }
}

export function providerToEnvVar(provider: string): string {
  const map: Record<string, string> = {
    "ollama-cloud": "OLLAMA_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    google: "GEMINI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  return map[provider] ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}
