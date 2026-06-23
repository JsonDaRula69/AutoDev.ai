# Task 3 — Install Module Refactor

## Date
2026-06-23

## What was done
- Created `extensions/autodev/installer/install-module.ts` with `runInstallFixes(deps: InstallModuleDeps): Promise<InstallFixResult[]>`
- Deleted `extensions/autodev/installer/steps.ts` (git rm)
- Deleted `extensions/autodev/installer/index.ts` (git rm — dead code, blocked typecheck)
- Updated `doctor.ts` dynamic imports from `./index.js` → `./install-module.js`
- Updated `orchestrator/cli.ts` — removed `handleInstall`/`handleInit` import, removed `install`/`init` case branches, updated help text

## Verification

### File existence
- `install-module.ts` EXISTS ✓
- `steps.ts` DELETED ✓
- `index.ts` DELETED ✓

### Typecheck
```
$ bun run typecheck
# exits 0 (clean)
```

### Grep sweep (installer/ source, excluding tests)
- `runInstallSteps|runInitSteps|INSTALL_STEPS|INIT_STEPS` → only in test file ✓
- `step0ExternalTools|step0bGhAuth|step1BunCheck|step2LlmCredentials|step3MagicContext|step4VoyageAi|step5Discord|step6GitHubLabels|step7KnowledgeBase|step8DocsRebuild|step9Doctor` → only in test file ✓
- `handleInstall|handleInit` → only in comment in cli.ts ✓

### Exported function name
```
$ grep -c "export async function runInstallFixes" extensions/autodev/installer/install-module.ts
1
```

### No secret/prompt handling
```
$ grep -cE "(^|[^/])\b(prompt|confirm|auth\.json|gh auth login|DISCORD)" extensions/autodev/installer/install-module.ts
0
```

## Side effects
- `index.ts` was deleted early (it blocked typecheck by importing from deleted `steps.ts`). This is consistent with the plan (todo 8 deletes it unconditionally).
- `doctor.ts` dynamic imports updated to use `install-module.js` instead of `index.js`.
- `orchestrator/cli.ts` import and case branches for `install`/`init` removed.
