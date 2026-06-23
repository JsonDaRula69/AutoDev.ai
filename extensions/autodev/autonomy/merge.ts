/**
 * Auto-merge — `auto_merge_pr` tool executor.
 *
 * Checks FOUR gates before merging:
 * 1. CI status green (`gh pr checks --json name,state` returns all passing).
 * 2. Evidence exists in `.omo/evidence/` (at least one `.md` or `.txt` file).
 * 3. PR has `autodev-ready` label (NOT `autodev-review` — that means "review started").
 * 4. PR is mergeable (`gh pr view --json mergeable` returns `MERGEABLE`).
 *
 * If all four pass: `gh pr merge --squash --delete-head`, transition label to
 * `autodev-merged`, post completion comment on the issue.
 *
 * If any gate fails, the merge is blocked with an explicit reason string.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

// ---- Types ----

export interface MergeGateResult {
  readonly name: string;
  readonly passed: boolean;
  readonly reason: string | undefined;
}

export interface MergeResult {
  readonly merged: boolean;
  readonly gates: readonly MergeGateResult[];
  readonly error: string | undefined;
}

// ---- Public API ----

/**
 * Execute the auto-merge pipeline for a given PR number.
 *
 * @param prNumber - The GitHub PR number to merge.
 * @param projectRoot - The project root directory (for evidence check and gh cwd).
 * @returns A MergeResult describing which gates passed/failed and whether the merge succeeded.
 */
export async function autoMergePr(
  prNumber: number,
  projectRoot: string,
): Promise<MergeResult> {
  const gates: MergeGateResult[] = [];

  // Gate 1: CI status green
  gates.push(await checkCiGreen(prNumber, projectRoot));

  // Gate 2: Evidence exists
  gates.push(await checkEvidence(projectRoot));

  // Gate 3: PR has autodev-ready label (not autodev-review)
  gates.push(await checkReadyLabel(prNumber, projectRoot));

  // Gate 4: PR is mergeable
  gates.push(await checkMergeable(prNumber, projectRoot));

  // Check if all gates passed
  const failedGate = gates.find((g) => !g.passed);
  if (failedGate !== undefined) {
    return {
      merged: false,
      gates,
      error: `Merge blocked: gate "${failedGate.name}" failed — ${failedGate.reason}`,
    };
  }

  // All gates passed — execute merge
  try {
    ghExec(["pr", "merge", String(prNumber), "--squash", "--delete-head"], projectRoot);
  } catch (e) {
    return {
      merged: false,
      gates,
      error: `Merge command failed: ${(e as Error).message}`,
    };
  }

  // Transition label: autodev-ready → autodev-merged
  try {
    ghExec(
      [
        "issue",
        "edit",
        String(prNumber),
        "--remove-label",
        "autodev-ready",
        "--add-label",
        "autodev-merged",
      ],
      projectRoot,
    );
  } catch {
    // Best-effort — label transition failure should not undo the merge
  }

  // Post completion comment on the issue
  try {
    ghExec(
      [
        "issue",
        "comment",
        String(prNumber),
        "--body",
        "✅ Auto-merge complete. All gates passed: CI green, evidence present, review clean, PR mergeable.",
      ],
      projectRoot,
    );
  } catch {
    // Best-effort
  }

  return { merged: true, gates, error: undefined };
}

// ---- Gate checkers ----

async function checkCiGreen(prNumber: number, cwd: string): Promise<MergeGateResult> {
  try {
    const raw = ghExec(["pr", "checks", String(prNumber), "--json", "name,state"], cwd);
    if (raw.length === 0) {
      return { name: "CI status", passed: false, reason: "No CI checks found on this PR" };
    }
    const checks = JSON.parse(raw) as Array<{ name: string; state: string }>;
    const failing = checks.filter((c) => c.state !== "SUCCESS" && c.state !== "NEUTRAL" && c.state !== "SKIPPED");
    if (failing.length > 0) {
      const names = failing.map((c) => `${c.name} (${c.state})`).join(", ");
      return { name: "CI status", passed: false, reason: `Failing checks: ${names}` };
    }
    return { name: "CI status", passed: true, reason: undefined };
  } catch (e) {
    return { name: "CI status", passed: false, reason: `Failed to check CI: ${(e as Error).message}` };
  }
}

async function checkEvidence(projectRoot: string): Promise<MergeGateResult> {
  try {
    const evidenceDir = join(projectRoot, ".omo", "evidence");
    const files = await readdir(evidenceDir);
    const evidenceFiles = files.filter(
      (f) => f.endsWith(".md") || f.endsWith(".txt"),
    );
    if (evidenceFiles.length === 0) {
      return {
        name: "Evidence exists",
        passed: false,
        reason: "No evidence files (.md or .txt) found in .omo/evidence/",
      };
    }
    return { name: "Evidence exists", passed: true, reason: undefined };
  } catch {
    return {
      name: "Evidence exists",
      passed: false,
      reason: "Cannot read .omo/evidence/ directory",
    };
  }
}

async function checkReadyLabel(prNumber: number, cwd: string): Promise<MergeGateResult> {
  try {
    const raw = ghExec(["pr", "view", String(prNumber), "--json", "labels"], cwd);
    if (raw.length === 0) {
      return { name: "autodev-ready label", passed: false, reason: "Cannot read PR labels" };
    }
    const data = JSON.parse(raw) as { labels: Array<{ name: string }> };
    const labelNames = data.labels.map((l) => l.name);

    if (labelNames.includes("autodev-ready")) {
      return { name: "autodev-ready label", passed: true, reason: undefined };
    }

    if (labelNames.includes("autodev-review")) {
      return {
        name: "autodev-ready label",
        passed: false,
        reason: "PR has autodev-review label (review started) but NOT autodev-ready (review not yet passed)",
      };
    }

    return {
      name: "autodev-ready label",
      passed: false,
      reason: "PR does not have autodev-ready label",
    };
  } catch (e) {
    return {
      name: "autodev-ready label",
      passed: false,
      reason: `Failed to check labels: ${(e as Error).message}`,
    };
  }
}

async function checkMergeable(prNumber: number, cwd: string): Promise<MergeGateResult> {
  try {
    const raw = ghExec(["pr", "view", String(prNumber), "--json", "mergeable"], cwd);
    if (raw.length === 0) {
      return { name: "PR mergeable", passed: false, reason: "Cannot read PR mergeable state" };
    }
    const data = JSON.parse(raw) as { mergeable: string };
    if (data.mergeable === "MERGEABLE") {
      return { name: "PR mergeable", passed: true, reason: undefined };
    }
    if (data.mergeable === "CONFLICTING") {
      return { name: "PR mergeable", passed: false, reason: "PR has merge conflicts" };
    }
    return {
      name: "PR mergeable",
      passed: false,
      reason: `PR mergeable state: ${data.mergeable} (expected MERGEABLE)`,
    };
  } catch (e) {
    return {
      name: "PR mergeable",
      passed: false,
      reason: `Failed to check mergeable: ${(e as Error).message}`,
    };
  }
}

// ---- GitHub CLI helper ----

function ghExec(args: string[], cwd: string): string {
  const result = require("node:child_process").execSync(`gh ${args.join(" ")}`, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.trim();
}
