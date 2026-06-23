/**
 * Category config loader — built-in task categories + custom override.
 *
 * Defines the 8 built-in delegation categories (quick, deep, ultrabrain,
 * visual-engineering, artistry, writing, unspecified-low, unspecified-high)
 * with their default model assignments, and loads custom categories from
 * `.autodev/config/categories.json` (which override / extend the built-ins).
 *
 * Models are NOT hardcoded into the executor — they live here and are
 * overridable via config. The executor validates any model against the
 * `.autodev/config/models.json` allowlist before spawning.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** A single category definition: which model to use + human description. */
export interface CategoryDefinition {
  readonly model: string;
  readonly description: string;
  /**
   * Optional thinking level for the pi SDK's `setThinkingLevel()`.
   * Plumbed through SpawnConfig → SessionFactoryConfig to the spawned
   * session (e.g. ultrabrain sets "xhigh").
   */
  readonly thinkingLevel?: string;
}

/** Map of category name → definition. */
export type CategoryMap = Readonly<Record<string, CategoryDefinition>>;

/**
 * Default category → model mapping.
 *
 * Per task spec:
 *   quick             → deepseek-v4-flash
 *   deep              → kimi-k2.7-code
 *   ultrabrain        → deepseek-v4-pro (thinkingLevel "xhigh")
 *   visual-engineering → glm-5.2:cloud
 *   artistry          → glm-5.2:cloud
 *   writing           → glm-5.2:cloud
 *   unspecified-low   → deepseek-v4-flash
 *   unspecified-high  → glm-5.2:cloud
 *
 * Full provider-qualified strings are used so the background manager can
 * derive the provider key (everything before the first `/`).
 */
const BUILTIN_CATEGORIES: Readonly<Record<string, CategoryDefinition>> = {
  quick: {
    model: "ollama-cloud/deepseek-v4-flash",
    description: "Fast, cheap model for simple one-off tasks (typos, small fixes).",
  },
  deep: {
    model: "ollama-cloud/kimi-k2.7-code",
    description: "High-capability model for complex implementation requiring deep reasoning.",
  },
  ultrabrain: {
    model: "ollama-cloud/deepseek-v4-pro",
    description: "Strongest reasoning model for architecture, review, and hard problems.",
    thinkingLevel: "xhigh",
  },
  "visual-engineering": {
    model: "ollama-cloud/glm-5.2:cloud",
    description: "Model tuned for frontend / visual work and UI engineering.",
  },
  artistry: {
    model: "ollama-cloud/glm-5.2:cloud",
    description: "Model for creative design, aesthetics, and craft.",
  },
  writing: {
    model: "ollama-cloud/glm-5.2:cloud",
    description: "Model for prose, documentation, and communication.",
  },
  "unspecified-low": {
    model: "ollama-cloud/deepseek-v4-flash",
    description: "Low-cost default when no specific category fits.",
  },
  "unspecified-high": {
    model: "ollama-cloud/glm-5.2:cloud",
    description: "Higher-capability default when no specific category fits.",
  },
};

/** The 8 built-in category names, in canonical order. */
export const BUILTIN_CATEGORY_NAMES: readonly string[] = Object.keys(BUILTIN_CATEGORIES);

/**
 * Load the effective category map for `projectRoot`.
 *
 * Reads `.autodev/config/categories.json` if present and merges it over the
 * built-in categories (custom entries override built-ins with the same name;
 * new entries are added). Missing or unparseable files fall back to the
 * built-ins alone.
 *
 * `categories.json` shape:
 * ```json
 * {
 *   "category-name": { "model": "provider/model", "description": "..." }
 * }
 * ```
 */
export function loadCategoryMap(projectRoot: string): CategoryMap {
  const path = resolve(projectRoot, ".autodev/config/categories.json");
  if (!existsSync(path)) return BUILTIN_CATEGORIES;

  let custom: Record<string, CategoryDefinition>;
  try {
    const text = readFileSync(path, "utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    custom = {};
    for (const [name, raw] of Object.entries(parsed)) {
      if (raw === null || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const model = entry["model"];
      const description = entry["description"];
      if (typeof model === "string" && typeof description === "string") {
        custom[name] = { model, description };
      }
    }
  } catch {
    // Unparseable config → fall back to built-ins alone.
    return BUILTIN_CATEGORIES;
  }

  return { ...BUILTIN_CATEGORIES, ...custom };
}

/**
 * Look up a category by name. Returns `undefined` when the name is not
 * registered in either the built-ins or the custom config.
 */
export function getCategory(
  projectRoot: string,
  name: string,
): CategoryDefinition | undefined {
  return loadCategoryMap(projectRoot)[name];
}