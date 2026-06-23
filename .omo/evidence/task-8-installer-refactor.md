# Task 8: Dead-code sweep — delete installer/index.ts + installer/steps.ts

**Plan:** installer-refactor — todo 8
**Date:** 2026-06-23
**Status:** COMPLETE

## Objective

Delete the dead `extensions/autodev/installer/index.ts` and `extensions/autodev/installer/steps.ts` files (superseded by `install-module.ts`, `config-module.ts`, and `scripts/cli.ts` per todos 2-6). Verify zero references to the 21 removed symbols anywhere in the project. Typecheck must pass. No tests run (per user instruction).

## Removed symbols (cataloged before deletion)

From `installer/index.ts`:
- `InstallOptions` (interface)
- `runInstall` (async function)
- `runInit` (async function)
- `handleInstall` (async function)
- `handleInit` (async function)
- `resolveAuthPath` (local helper, not exported)
- `autoNonInteractive` (local helper, not exported)

From `installer/steps.ts`:
- `StepContext` (interface)
- `StepResult` (interface)
- `step0ExternalTools`, `step0bGhAuth`, `step1BunCheck`, `step2LlmCredentials`, `step3MagicContext`, `step4VoyageAi`, `step5Discord`, `step6GitHubLabels`, `step7KnowledgeBase`, `step8DocsRebuild`, `step9Doctor` (step functions)
- `INSTALL_STEPS`, `INIT_STEPS` (step arrays)
- `INSTALL_STEP_NAMES`, `INIT_STEP_NAMES` (name arrays)
- `runInstallSteps`, `runInitSteps` (runner functions)

## Actions

### 1. Files deleted

```
extensions/autodev/installer/index.ts   (182 lines)
extensions/autodev/installer/steps.ts   (627 lines)
```

Verified via `ls extensions/autodev/installer/` — both files absent; remaining: `auth.ts config-defaults.ts config-module.ts doctor.ts env.ts install-module.ts prompts.ts state.ts tools.ts __tests__/`.

### 2. Test cleanup

`extensions/autodev/installer/__tests__/installer.test.ts` imported `../steps.js` in 508 lines of tests (lines 269-776 of the 794-line file). Removed those test blocks via `awk 'NR<=268 || NR>=776'`:
- Removed: all `step1BunCheck`/`step2LlmCredentials`/`step4VoyageAi`/`step5Discord`/`step7KnowledgeBase` tests (interactive + non-interactive), the "steps are skipped when already completed" integration test, and the `runInstallSteps runs all install steps` integration test.
- Kept: state/env/auth/prompts module tests (lines 1-268) and the `ensureGitignore` integration test (now at line 273, uses `env.js` only).
- File reduced from 794 → 285 lines.

### 3. Stale documentation references removed

`code-review-flow.md`:
- Section 1.3 header (line 51-54): rewrote from "`handleInstall()` in `installer/index.ts` / `runAllSteps()` in `installer/steps.ts`" to describe the refactored routing through `config-module.ts`/`install-module.ts`, noting the old files were removed.
- F4 bug-table row (line 352): changed File column from `installer/steps.ts` to `(design — old installer/steps.ts removed)`.

### 4. References left intentionally

- `scripts/cli.ts:31` — comment: `// ---- Helpers (ported from installer/index.ts:138-154, deleted in todo 8) ----`. This is provenance documentation of the refactor; it references no removed symbol and no live import. Accurate.

## Verification

### Grep for all 21 removed symbols (word-boundary)

```
$ grep -rnE '\b(runInstall|runInit|handleInstall|handleInit|INSTALL_STEPS|INIT_STEPS|StepContext|StepResult|step0ExternalTools|step0bGhAuth|step1BunCheck|step2LlmCredentials|step3MagicContext|step4VoyageAi|step5Discord|step6GitHubLabels|step7KnowledgeBase|step8DocsRebuild|step9Doctor|runInstallSteps|runInitSteps)\b' .
No matches found
```

**Zero references to any removed symbol.**

### Grep for deleted file paths

```
installer/index.ts  →  scripts/cli.ts:31 (provenance comment), code-review-flow.md:54 (notes removal)
installer/steps.ts  →  code-review-flow.md:54,353 (notes removal)
```

No live imports of either deleted file. All remaining mentions are documentation of the deletion itself.

### Typecheck

```
$ bun run typecheck
$ tsc --noEmit
EXIT=0
```

**Typecheck passes.**

## Acceptance criteria

| Criterion | Result |
|-----------|--------|
| `installer/index.ts` deleted | ✅ |
| `installer/steps.ts` deleted | ✅ |
| Zero references to all 21 removed symbols | ✅ (grep: no matches) |
| No import points to a deleted file | ✅ |
| `bun run typecheck` passes | ✅ (exit 0) |
| No tests run | ✅ (per user instruction) |
| No files modified outside installer dead-code scope | ✅ (only test file + code-review-flow.md stale-ref removal) |
| Learning appended to learnings.md | ✅ |