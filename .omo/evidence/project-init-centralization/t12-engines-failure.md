# T12 — Guardrail & Dispatch Engines: Failure & Edge Case Evidence

Date: 2026-06-23

## Task

Document the failure modes, edge cases, and regression risks for T12's config loading changes.

## Failure modes considered

### 1. Neither central nor project config exists → hardcoded defaults

**Test:** `loadGuardrailsConfig returns hardcoded defaults when neither central nor project config exists`
**Test:** `loadDispatchConfig returns hardcoded defaults when neither central nor project config exists`

Both assert the returned config equals the exported `DEFAULT_*_CONFIG` and is non-empty. This guarantees the engines still enforce rules when no config file is present (fresh install, deleted config).

### 2. Project override replaces central entirely (no deep merge)

**Test:** `loadGuardrailsConfig project override replaces central entirely (no deep merge)`
**Test:** `loadDispatchConfig project override replaces central entirely (no deep merge)`

Guardrails: central has 1 hard + 1 soft; project has 0 hard + 1 different soft. Result: 0 hard, only project soft. Central rules are NOT merged in.

Dispatch: central has 2 rules; project has 1. Result: 1 rule (project's), central rules gone.

This pins the MUST NOT constraint: no deep key-by-key merge.

### 3. Project config exists, central does not → project loaded

**Test:** `loadGuardrailsConfig loads project config when central does not exist`
**Test:** `loadDispatchConfig loads project config when central does not exist`

Verifies the project-only path works without a central config present.

### 4. Central config exists, project does not → central loaded

**Test:** `loadGuardrailsConfig loads central ~/.AutoDev/config/guardrails.yaml when no project override`
**Test:** `loadDispatchConfig loads central ~/.AutoDev/config/dispatch-rules.yaml when no project override`

Verifies the central-first default path.

### 5. Both exist → project wins

**Test:** `loadGuardrailsConfig uses project .autodev/config/guardrails.yaml when both central and project exist`
**Test:** `loadDispatchConfig uses project .autodev/config/dispatch-rules.yaml when both central and project exist`

Project rule present, central rule absent in result. Confirms project override semantics.

## Regression risks

### Existing guardrails tests (`test/guardrails.test.ts`)

The existing test suite plants `.autodev/config/guardrails.yaml` in a temp project root and calls `loadGuardrailsConfig(root)`. Before T12, this was the only config source. After T12, the project config still wins (it's checked first), so all 49 existing tests pass unchanged.

**Verified:** `bun test test/guardrails.test.ts` → 49 pass, 0 fail.

### `register()` in guardrails/index.ts

`register()` calls `loadGuardrailsConfig(process.cwd())`. Behavior:
- If the project has `.autodev/config/guardrails.yaml`, it loads that (unchanged).
- If not, it now loads central `~/.AutoDev/config/guardrails.yaml` instead of returning empty config.
- If neither, it uses `DEFAULT_GUARDRAILS_CONFIG` instead of empty config.

This is a behavior improvement: previously, a project without local config got an empty config (no rules enforced). Now it gets central or hardcoded defaults (rules enforced). No test regression because the existing tests always plant a project config.

### `exactOptionalPropertyTypes` strict mode

`DispatchRule.evidence` and `DispatchRule.route` are optional. Under `exactOptionalPropertyTypes: true`, the parser's intermediate object (`{ evidence: string | undefined }`) was not assignable to `DispatchRule` (which had `evidence?: string`). Fixed by adding `| undefined` to the optional property types in the interface. Typecheck now clean.

## Pre-existing failures (NOT T12-caused)

13 test failures exist in the working tree from sibling tasks (T8/T9/T10 `init-module.test.ts`, `doctor-orchestrator.test.ts` cmdDoctor, `cli.test.ts` cmdInit). These are in untracked test files for incomplete sibling tasks. Confirmed by running T12-scoped tests only: 79 pass, 0 fail across guardrails + dispatch + orchestrator + existing guardrails tests.

The clean tree (stashing T12 changes) shows 311 pass, 0 fail — but does not include the untracked sibling test files. The 13 failures are entirely within those untracked files and reference `cmdInit`, `runInit` step 6-9, T9/T10 onboard steps — none of which T12 touches.

## Typecheck

```
$ bun run typecheck
EXIT 0
```

No new errors. Pre-existing `extensions/autodev/delegation/skills.ts` Dirent error was present before T12 and is out of scope.

## Conclusion

All failure modes and edge cases covered by tests. No regressions introduced. T12 is behavior-preserving for existing call sites and behavior-improving for projects without local config.