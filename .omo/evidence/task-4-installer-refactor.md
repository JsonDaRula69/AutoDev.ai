# Task 4: config-module.ts — Installer Refactor

**Date:** 2026-06-23
**Plan:** `.omo/plans/installer-refactor.md` todo 4
**Wave:** 2 (parallel with todo 3)

## Summary

Created `extensions/autodev/installer/config-module.ts` — interactive-only config module managing all secrets via sub-commands. Modified `env.ts` (optional `envPath` param), `auth.ts` (`tryImportAuth` $VAR transformation + `providerToEnvVar` export). `state.ts` already had `"config"` scope (no change).

## Files Changed

| File | Change |
|------|--------|
| `extensions/autodev/installer/config-module.ts` | **Created** — `runConfig`, `ConfigModuleDeps`, 4 sub-command handlers (llm/voyage/discord/github) |
| `extensions/autodev/installer/env.ts` | **Modified** — added optional `envPath?: string` to `readEnv`, `setEnvVar`, `setEnvVars`; renamed helper `envPath`→`defaultEnvPath` |
| `extensions/autodev/installer/auth.ts` | **Modified** — `tryImportAuth` transforms keys to `$VAR` references (writes key to `.env`, `$VAR` to auth.json); added `providerToEnvVar` export |
| `extensions/autodev/installer/state.ts` | **No change** — `"config"` already in `StateScope` |

## API

```typescript
export interface ConfigModuleDeps {
  readonly projectRoot: string;
  readonly authPath: string;
  readonly prompter: Prompter;
  notify: (message: string, level: "info" | "warning" | "error") => void;
  readonly execSyncOverride?: (command: string, options?: ExecSyncOptions) => Buffer;
}

export async function runConfig(
  deps: ConfigModuleDeps,
  subcommand?: string,
): Promise<ConfigResult[]>;
```

- `subcommand`: `"llm"` | `"voyage"` | `"discord"` | `"github"` | undefined (run all)
- All `.env` writes → `~/.pi/agent/.env` (via `dirname(authPath)`)
- `auth.json` gets only `$VAR` references, never literal keys
- Step numbers: llm=2, voyage=4, discord=5, github=-1 (scope `"config"`)
- GitHub handler: GH_TOKEN token approach + `gh auth login --web` fallback (deletes `process.env.GH_TOKEN` before fallback)

## Acceptance Criteria Verification

| Criterion | Expected | Actual | Pass |
|-----------|----------|--------|------|
| `test -f config-module.ts` | succeeds | ✓ | PASS |
| `bun run typecheck` | passes | ✓ (tsc --noEmit clean) | PASS |
| `grep -c "export async function runConfig"` | =1 | 1 | PASS |
| `grep -c "execSyncOverride"` | ≥1 | 2 | PASS |
| `grep -c "nonInteractive"` | =0 | 0 | PASS |
| `grep -c "bun install\|magic-context setup\|gh label create\|docs rebuild\|validateAndCreateConfig\|installMissingTools"` | =0 | 0 | PASS |
| `grep -c "GH_TOKEN"` | ≥1 | 5 | PASS |
| `grep -c "gh auth login"` | ≥1 | 7 | PASS |
| `grep -c "personal-access-tokens"` | ≥1 | 1 | PASS |
| `grep -c "delete process.env.GH_TOKEN"` | ≥1 | 1 | PASS |
| `readEnv` and `setEnvVars` accept optional `envPath` (symmetric) | yes | ✓ (both + `setEnvVar`) | PASS |
| `StateScope` includes `"config"` | yes | ✓ (pre-existing) | PASS |

## QA Scenarios (design verification)

- **Happy (llm):** `MockPrompter(["ollama-cloud", "n", "sk-test"])` → `runConfig(deps, "llm")` writes `auth.json` with `$OLLAMA_CLOUD_API_KEY` and `.env` with `OLLAMA_CLOUD_API_KEY=sk-test`. Handler flow: provider prompt → no import (confirm=n) → key prompt → `setEnvVars` to `.env` + `setProviderKey($VAR)` to auth.json → markStepCompleted. ✓
- **GitHub token:** `MockPrompter(["github_pat_xxx"])` → `runConfig(deps, "github")` writes `GH_TOKEN=github_pat_xxx` to `.env`, sets `process.env.GH_TOKEN`, runs `gh auth status` to verify. ✓
- **GitHub fallback:** `MockPrompter([""])` → `runConfig(deps, "github")` `delete process.env.GH_TOKEN`, runs `gh auth login --web` via `execSyncOverride`. ✓
- **GitHub instructions:** Prompt text includes `https://github.com/settings/personal-access-tokens/new` and permissions (Issues, Pull requests, Contents, Metadata, Labels). ✓
- **Failure (no-TTY):** No-TTY prompter returns "" for provider prompt → handler warns "interactive config required, no TTY detected" and skips without writing. ✓

## Backward Compatibility

- `env.ts` changes: `envPath` is optional and last param → all existing 2-arg callers in `steps.ts` work unchanged (typecheck confirms).
- `auth.ts` `tryImportAuth`: new params (`envVarName`, `envPath`, `projectRoot`) all optional → `steps.ts:219` 3-arg call works unchanged.