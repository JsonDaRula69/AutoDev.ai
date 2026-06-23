/**
 * T3 import resolution check.
 *
 * Verifies that `@earendil-works/pi-coding-agent` installs and exports the
 * core SDK symbols AutoDev depends on: `createAgentSession` and `SessionManager`.
 *
 * This is an import-resolution test only — no real agent session is created.
 * Run with: `bun run test/import-check.ts`
 */

/// <reference path="./declarations.d.ts" />

import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  defineTool,
  CONFIG_DIR_NAME,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${name}: ${detail}`);
}

check(
  "createAgentSession export",
  typeof createAgentSession === "function",
  `typeof = ${typeof createAgentSession}`,
);

check(
  "SessionManager export",
  typeof SessionManager === "function" && typeof SessionManager.inMemory === "function",
  `typeof = ${typeof SessionManager}; inMemory = ${typeof SessionManager.inMemory}`,
);

check(
  "SessionManager.inMemory() factory",
  typeof SessionManager.inMemory === "function",
  `inMemory() is callable`,
);

check(
  "SessionManager.create() factory",
  typeof SessionManager.create === "function",
  `create() is callable`,
);

check(
  "AuthStorage export",
  typeof AuthStorage === "function" && typeof AuthStorage.create === "function",
  `typeof = ${typeof AuthStorage}; create = ${typeof AuthStorage.create}`,
);

check(
  "ModelRegistry export",
  typeof ModelRegistry === "function" && typeof ModelRegistry.create === "function",
  `typeof = ${typeof ModelRegistry}; create = ${typeof ModelRegistry.create}`,
);

check(
  "DefaultResourceLoader export",
  typeof DefaultResourceLoader === "function",
  `typeof = ${typeof DefaultResourceLoader}`,
);

check(
  "defineTool export",
  typeof defineTool === "function",
  `typeof = ${typeof defineTool}`,
);

check(
  "CONFIG_DIR_NAME export",
  typeof CONFIG_DIR_NAME === "string" && CONFIG_DIR_NAME === ".pi",
  `value = ${JSON.stringify(CONFIG_DIR_NAME)}`,
);

check(
  "getAgentDir export",
  typeof getAgentDir === "function",
  `typeof = ${typeof getAgentDir}`,
);

// Also verify the magic-context pi extension package is installed.
async function checkMagicContext(): Promise<void> {
  try {
    const mod = await import("@cortexkit/pi-magic-context");
    const keys = Object.keys(mod).sort().join(", ") || "(no named exports)";
    check(
      "@cortexkit/pi-magic-context importable",
      true,
      `named exports: ${keys}`,
    );
  } catch (error) {
    check(
      "@cortexkit/pi-magic-context importable",
      false,
      `import threw: ${(error as Error).message}`,
    );
  }
}

await checkMagicContext();

const failed = checks.filter((c) => !c.ok);
const passed = checks.filter((c) => c.ok);

console.log("");
console.log(`PASS: ${passed.length}/${checks.length}`);
if (failed.length > 0) {
  console.error(`FAIL: ${failed.length}/${checks.length}`);
  for (const f of failed) {
    console.error(`  - ${f.name}: ${f.detail}`);
  }
  process.exit(1);
}

console.log("All import checks passed. AutoDev pi SDK imports resolve correctly.");
process.exit(0);