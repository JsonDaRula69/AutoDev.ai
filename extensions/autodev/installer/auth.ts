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

/** Try to import credentials from an existing auth.json (e.g., from `.opencode/auth.json`). */
export async function tryImportAuth(
  sourcePath: string,
  targetPath: string,
  provider: string,
): Promise<boolean> {
  if (!existsSync(sourcePath)) return false;
  try {
    const source = await readAuth(sourcePath);
    const entry = source[provider];
    if (entry === undefined || entry.type !== "api_key" || entry.key === "") return false;
    await setProviderKey(targetPath, provider, entry.key);
    return true;
  } catch {
    return false;
  }
}
