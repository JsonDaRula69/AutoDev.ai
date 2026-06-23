/**
 * Concurrency config loader.
 *
 * Loads per-provider concurrency limits from `.autodev/config/concurrency.yaml`.
 * The YAML shape is flat: top-level provider keys with a nested `max:` value.
 * No YAML dependency — a focused parser handles exactly this shape.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ConcurrencyConfig } from "./types.js";

/** Default per-provider concurrency limit. */
export const DEFAULT_MAX_CONCURRENCY = 5;

/** Minimal YAML parser for the flat concurrency.yaml shape. */
function parseConcurrencyYaml(text: string): ConcurrencyConfig {
  const config: Record<string, { max: number }> = {};
  let currentKey: string | undefined;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!line.startsWith(" ")) {
      const idx = trimmed.indexOf(":");
      if (idx > 0) {
        currentKey = trimmed.slice(0, idx).trim();
      }
    } else if (currentKey !== undefined) {
      const idx = trimmed.indexOf(":");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = Number(trimmed.slice(idx + 1).trim());
        if (key === "max" && !Number.isNaN(value) && currentKey !== undefined) {
          config[currentKey] = { max: value };
        }
      }
    }
  }
  return config;
}

/** Load concurrency config from `.autodev/config/concurrency.yaml`. */
export function loadConcurrencyConfig(projectRoot: string): ConcurrencyConfig {
  const path = resolve(projectRoot, ".autodev/config/concurrency.yaml");
  if (!existsSync(path)) return {};
  try {
    const text = readFileSync(path, "utf8");
    return parseConcurrencyYaml(text);
  } catch {
    return {};
  }
}