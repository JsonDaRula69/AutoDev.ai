/**
 * Model fallback chain resolver.
 *
 * Two modes of fallback:
 *
 * - **Proactive**: per-agent `fallback_models` chain loaded from the
 *   central `agents/*.md` frontmatter (a `fallback_models` field,
 *   comma-separated) or from `.autodev/config/fallback.json`. When the
 *   agent's current model fails, the next model in the chain takes over.
 *
 * - **Reactive**: on any retryable API error, pick the next available model
 *   from the allowlist (`.autodev/config/models.json`) that has not been
 *   tried yet. Non-retryable errors (auth, context overflow) do not trigger
 *   fallback.
 *
 * The resolver is pure — it takes config + inputs and returns a model string
 * or undefined. The manager owns task state and calls the resolver when an
 * error event arrives.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { FallbackConfig } from "./types.js";
import { classifyError } from "./classifier.js";
import { parseFrontmatter, parseCommaList, getCentralAgentsDir } from "../shared/agent-parser.js";

/** Allowlist of approved models (loaded from .autodev/config/models.json). */
export type ModelAllowlist = readonly string[];

/** Full fallback configuration: per-agent chains + the model allowlist. */
export interface ResolvedFallbackConfig {
  readonly chains: FallbackConfig;
  readonly allowlist: ModelAllowlist;
}

/** Options for resolveFallbackModel. */
export interface FallbackOptions {
  readonly agentName: string;
  readonly error: unknown;
  readonly currentModel: string;
  readonly triedModels: readonly string[];
  readonly config: ResolvedFallbackConfig | undefined;
}

/** Result of a fallback resolution. */
export interface FallbackResolution {
  readonly model: string;
  readonly mode: "proactive" | "reactive";
  readonly reason: string;
}

export function loadAgentFallbackChains(_projectRoot: string): FallbackConfig {
  const dir = getCentralAgentsDir();
  if (!existsSync(dir)) return {};
  const chains: Record<string, { fallback_models: readonly string[] }> = {};
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return {};
  }
  for (const name of entries) {
    try {
      const text = readFileSync(join(dir, name), "utf8");
      const fm = parseFrontmatter(text);
      const agentName = fm["name"];
      const raw = fm["fallback_models"];
      if (agentName !== undefined && raw !== undefined) {
        const models = parseCommaList(raw);
        if (models.length > 0) {
          chains[agentName] = { fallback_models: models };
        }
      }
    } catch {
      // Skip unreadable files.
    }
  }
  return chains;
}

/**
 * Load fallback chains from `.autodev/config/fallback.json` if it exists.
 * This is an alternative to per-agent frontmatter. Returns an empty config
 * when the file is missing or unparseable.
 */
export function loadFallbackConfigFile(projectRoot: string): FallbackConfig {
  const path = resolve(projectRoot, ".autodev/config/fallback.json");
  if (!existsSync(path)) return {};
  try {
    const text = readFileSync(path, "utf8");
    const parsed = JSON.parse(text) as Record<string, { fallback_models: string[] }>;
    const chains: Record<string, { fallback_models: readonly string[] }> = {};
    for (const [agentName, entry] of Object.entries(parsed)) {
      if (entry?.fallback_models !== undefined) {
        chains[agentName] = { fallback_models: entry.fallback_models };
      }
    }
    return chains;
  } catch {
    return {};
  }
}

/**
 * Load the model allowlist from `.autodev/config/models.json`.
 * Returns an empty array when the file is missing.
 */
export function loadModelAllowlist(projectRoot: string): ModelAllowlist {
  const path = resolve(projectRoot, ".autodev/config/models.json");
  if (!existsSync(path)) return [];
  try {
    const text = readFileSync(path, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is string => typeof m === "string");
  } catch {
    return [];
  }
}

/**
 * Load the full fallback configuration.
 *
 * Merges per-agent frontmatter chains with config-file chains (config-file
 * takes precedence for overlapping agent names) and loads the model
 * allowlist. Safe to call multiple times — reads from disk each time.
 */
export function loadFallbackConfig(projectRoot: string): ResolvedFallbackConfig {
  const frontmatterChains = loadAgentFallbackChains(projectRoot);
  const fileChains = loadFallbackConfigFile(projectRoot);
  const chains = { ...frontmatterChains, ...fileChains };
  const allowlist = loadModelAllowlist(projectRoot);
  return { chains, allowlist };
}

/**
 * Resolve the next fallback model for a failed task.
 *
 * Resolution order:
 * 1. Classify the error. If non-retryable, return undefined (no fallback).
 * 2. **Proactive**: look up the agent's `fallback_models` chain. Return the
 *    first model in the chain that has not been tried yet.
 * 3. **Reactive**: if no proactive chain is configured (or all chain models
 *    have been tried), pick the next model from the allowlist that has not
 *    been tried and is not the current model.
 * 4. If no candidate is found, return undefined — the error surfaces.
 */
export function resolveFallbackModel(options: FallbackOptions): FallbackResolution | undefined {
  const { agentName, error, currentModel, triedModels, config } = options;
  const cfg = config ?? loadFallbackConfig(resolve("."));

  // Non-retryable errors never trigger fallback.
  const classification = classifyError(error);
  if (!classification.retryable) return undefined;

  const tried = new Set(triedModels);
  tried.add(currentModel);

  // Proactive: agent's configured fallback chain.
  const chain = cfg.chains[agentName];
  if (chain !== undefined) {
    for (const model of chain.fallback_models) {
      if (!tried.has(model)) {
        return { model, mode: "proactive", reason: `proactive-chain-for-${agentName}` };
      }
    }
  }

  // Reactive: pick next untried model from the allowlist.
  for (const model of cfg.allowlist) {
    if (!tried.has(model)) {
      return { model, mode: "reactive", reason: "reactive-allowlist-next" };
    }
  }

  return undefined;
}