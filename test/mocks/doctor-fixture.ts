import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTempDir(prefix = "autodev-doctor-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, ".autodev"), { recursive: true });
  return dir;
}

export function cleanupTempDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { }
}

export const AGENT_NAMES = [
  "nemo", "aronnax", "ned-land", "conseil", "oracle", "momus", "metis",
  "harbor-master", "quartermaster", "boatswain", "navigator", "watch-officer", "explore",
] as const;

export const STUB_EXEC = (cmd: string): string => {
  if (cmd === "bun --version") return "1.2.3\n";
  if (cmd === "gh --version") return "gh version 2.40.0\n";
  if (cmd === "gh auth status") return "Logged in to github.com\n";
  if (cmd.startsWith("bunx @cortexkit/magic-context")) return "MC doctor OK\n";
  throw new Error(`unexpected command: ${cmd}`);
};

export const FAIL_EXEC = (): string => { throw new Error("command not found"); };

export function makeMcExecStub(mcResults: readonly ("ok" | "fail")[]): (cmd: string) => string {
  let mcCall = 0;
  return (cmd: string): string => {
    if (cmd === "bun --version") return "1.2.3\n";
    if (cmd === "gh --version") return "gh version 2.40.0\n";
    if (cmd === "gh auth status") return "Logged in to github.com\n";
    if (cmd.startsWith("bunx @cortexkit/magic-context")) {
      const idx = Math.min(mcCall, mcResults.length - 1);
      const result = mcResults[idx] ?? mcResults[mcResults.length - 1];
      mcCall++;
      if (result === "ok") return "MC doctor OK\n";
      throw new Error("MC doctor error: simulated failure");
    }
    throw new Error(`unexpected command: ${cmd}`);
  };
}

export function createMockPackage(packageRoot: string): void {
  mkdirSync(join(packageRoot, ".pi", "agents"), { recursive: true });
  mkdirSync(join(packageRoot, ".pi", "skills"), { recursive: true });
  mkdirSync(join(packageRoot, ".autodev", "reference"), { recursive: true });
  mkdirSync(join(packageRoot, ".autodev", "config"), { recursive: true });
  mkdirSync(join(packageRoot, "extensions", "autodev"), { recursive: true });
  writeFileSync(join(packageRoot, ".pi", "settings.json"), "{}");
  writeFileSync(join(packageRoot, ".pi", "magic-context.jsonc"), "{}");
  for (const a of AGENT_NAMES) {
    writeFileSync(join(packageRoot, ".pi", "agents", `${a}.md`), `---\nname: ${a}\n---\n`);
  }
  writeFileSync(join(packageRoot, ".autodev", "reference", "README.md"), "# ref\n");
  writeFileSync(join(packageRoot, ".pi", "skills", "SKILL.md"), "# skill\n");
  writeFileSync(join(packageRoot, "extensions", "autodev", "index.ts"), "// ext\n");
  for (const [name, content] of [
    ["concurrency.yaml", "max: 4\n"],
    ["debate-protocol.yaml", "rounds: 3\n"],
    ["dispatch-rules.yaml", "rules: []\n"],
    ["fallback.json", "{}"],
    ["guardrails.yaml", "rules: []\n"],
    ["mcp.json", "{}"],
    ["models.json", "{}"],
    ["standing-orders.md", "# orders\n"],
    ["team-spec.json", "{}"],
  ] as const) {
    writeFileSync(join(packageRoot, ".autodev", "config", name), content);
  }

  mkdirSync(join(packageRoot, "config"), { recursive: true });
  writeFileSync(join(packageRoot, "config", "docs-sources.yaml"), "sources: []\n");
}