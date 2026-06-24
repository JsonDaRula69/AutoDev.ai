import { execSync } from "node:child_process";

export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export interface KeyValidatorDeps {
  readonly fetchOverride?: (url: string, init?: RequestInit) => Promise<Response>;
  readonly execSyncOverride?: (command: string, options?: { stdio?: string; timeout?: number; env?: NodeJS.ProcessEnv }) => string;
}

type ProviderConfig = {
  readonly method: string;
  readonly url: (key: string) => string;
  readonly headers: (key: string) => Record<string, string>;
  readonly body?: string;
  readonly successCodes: readonly number[];
  readonly invalidCodes: readonly number[];
};

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  "ollama-cloud": {
    method: "GET",
    url: () => "https://ollama.com/api/tags",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    successCodes: [200],
    invalidCodes: [401, 403],
  },
  openai: {
    method: "GET",
    url: () => "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    successCodes: [200],
    invalidCodes: [401, 403],
  },
  anthropic: {
    method: "GET",
    url: () => "https://api.anthropic.com/v1/models",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
    successCodes: [200],
    invalidCodes: [401, 404],
  },
  google: {
    method: "GET",
    url: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    headers: () => ({}),
    successCodes: [200],
    invalidCodes: [401, 403],
  },
};

const VOYAGE_CONFIG: ProviderConfig = {
  method: "POST",
  url: () => "https://api.voyageai.com/v1/embeddings",
  headers: (key) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" }),
  body: JSON.stringify({ model: "voyage-3-lite", input: ["test"] }),
  successCodes: [200],
  invalidCodes: [401, 403],
};

export async function validateLlmKey(
  provider: string,
  apiKey: string,
  deps: KeyValidatorDeps = {},
): Promise<ValidationResult> {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    return { valid: false, error: `Unknown provider: ${provider}` };
  }
  return validateKey(config, apiKey, deps);
}

export async function validateVoyageKey(
  apiKey: string,
  deps: KeyValidatorDeps = {},
): Promise<ValidationResult> {
  return validateKey(VOYAGE_CONFIG, apiKey, deps);
}

export function validateGithubToken(
  token: string,
  deps: KeyValidatorDeps = {},
): ValidationResult {
  const exec = deps.execSyncOverride ?? execSync;
  const env = { ...process.env, GH_TOKEN: token };
  try {
    exec("gh auth status", { stdio: "pipe", timeout: 10_000, env });
    return { valid: true };
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? (e as Error).message;
    if (stderr.includes("HTTP 401") || stderr.includes("HTTP 403") || stderr.includes("token is invalid")) {
      return { valid: false, error: "GitHub rejected this token (HTTP 401/403)." };
    }
    return { valid: false, error: `GitHub auth check failed: ${stderr.slice(0, 200)}` };
  }
}

async function validateKey(
  config: ProviderConfig,
  apiKey: string,
  deps: KeyValidatorDeps,
): Promise<ValidationResult> {
  const fetchFn = deps.fetchOverride ?? fetch;
  try {
    const response = await fetchFn(config.url(apiKey), {
      method: config.method,
      headers: config.headers(apiKey),
      ...(config.body ? { body: config.body } : {}),
    });
    if (config.successCodes.includes(response.status)) {
      return { valid: true };
    }
    if (config.invalidCodes.includes(response.status)) {
      return { valid: false, error: `API rejected key (HTTP ${response.status}).` };
    }
    return { valid: false, error: `Unexpected response (HTTP ${response.status}).` };
  } catch (e) {
    return { valid: false, error: `Network error: ${(e as Error).message.slice(0, 200)}` };
  }
}