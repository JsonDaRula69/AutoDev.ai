# T12 — Guardrail & Dispatch Engines: Central Config Loading (Happy Path)

Date: 2026-06-23

## Task

Update guardrail and dispatch engines to read config from `~/.AutoDev/config/` by default, with project-level `.autodev/config/` file-level override.

## What changed

- `extensions/autodev/guardrails/index.ts`:
  - Imported `getAgentDir` from `@earendil-works/pi-coding-agent`.
  - Added `DEFAULT_GUARDRAILS_CONFIG` — hardcoded fallback with all 9 hard-stop + 5 soft-stop rule IDs (mirrors immutable reference YAML).
  - Rewrote `loadGuardrailsConfig(projectRoot)` with 3-tier resolution:
    1. Project `.autodev/config/guardrails.yaml` (file-level override, wins if present)
    2. Central `~/.AutoDev/config/guardrails.yaml` (via `join(getAgentDir(), "..", "config", "guardrails.yaml")`)
    3. `DEFAULT_GUARDRAILS_CONFIG` hardcoded fallback

- `extensions/autodev/orchestrator/dispatch.ts`:
  - Imported `getAgentDir`, `readFileSync`, `existsSync`, `resolve`, `join`.
  - Added `DispatchRule`, `DispatchRulesConfig` interfaces.
  - Added `DEFAULT_DISPATCH_CONFIG` — 6 hardcoded dispatch rules mirroring the reference `dispatch-rules.yaml` route table.
  - Added `parseDispatchYaml(text)` — minimal focused parser for the `dispatch_rules:` list shape (trigger/from/to/condition/evidence/route).
  - Added `loadDispatchConfig(projectRoot)` — same 3-tier resolution as guardrails.

## Verification — Happy path

### Guardrails config loader

```
$ bun test extensions/autodev/guardrails/__tests__/guardrails.test.ts
(pass) loadGuardrailsConfig loads central ~/.AutoDev/config/guardrails.yaml when no project override
(pass) loadGuardrailsConfig uses project .autodev/config/guardrails.yaml when both central and project exist
(pass) loadGuardrailsConfig returns hardcoded defaults when neither central nor project config exists
(pass) loadGuardrailsConfig loads project config when central does not exist
(pass) loadGuardrailsConfig project override replaces central entirely (no deep merge)
5 pass, 0 fail
```

### Dispatch config loader

```
$ bun test extensions/autodev/orchestrator/__tests__/dispatch.test.ts
(pass) loadDispatchConfig loads central ~/.AutoDev/config/dispatch-rules.yaml when no project override
(pass) loadDispatchConfig uses project .autodev/config/dispatch-rules.yaml when both central and project exist
(pass) loadDispatchConfig returns hardcoded defaults when neither central nor project config exists
(pass) loadDispatchConfig loads project config when central does not exist
(pass) loadDispatchConfig project override replaces central entirely (no deep merge)
5 pass, 0 fail
```

### Existing guardrails tests (regression)

```
$ bun test test/guardrails.test.ts
49 pass, 0 fail
```

Existing tests plant project `.autodev/config/guardrails.yaml`, which now wins as the file-level override — behavior unchanged.

### T12 + related tests

```
$ bun test extensions/autodev/guardrails/__tests__/guardrails.test.ts extensions/autodev/orchestrator/__tests__/dispatch.test.ts extensions/autodev/orchestrator/__tests__/orchestrator.test.ts test/guardrails.test.ts
79 pass, 0 fail
```

### Typecheck

```
$ bun run typecheck
$ echo $?
0
```

No new type errors introduced. (Pre-existing `skills.ts` Dirent error is unchanged and out of T12 scope.)

## Design decisions

- **Precedence: project > central > defaults.** The task spec says "First check central; if project exists, use it instead." This means project is the override. The implementation checks project first (early return), then central, then defaults — matching the spec's override semantics.
- **File-level override, NOT deep merge.** Per MUST NOT: no key-by-key merge. When project config exists, it replaces central entirely. Verified by the "no deep merge" test: project with empty `hard_stops` + one soft stop yields zero hard stops and only the project soft stop.
- **Central path via `getAgentDir()`.** `join(getAgentDir(), "..", "config", "guardrails.yaml")` resolves to `~/.AutoDev/config/guardrails.yaml` when `PI_CODING_AGENT_DIR` is set (T1's env wiring). Consistent with T2/T7 centralization pattern.
- **`DEFAULT_*_CONFIG` exported.** Tests assert `cfg === DEFAULT_GUARDRAILS_CONFIG` for the no-config case, proving the fallback is a stable reference, not a fresh object each call.
- **Minimal YAML parser for dispatch-rules.yaml.** Mirrors the guardrails parser approach — focused on the `dispatch_rules:` list shape only. Ignores `state_machine:` and other top-level sections (which are not used by the dispatch engine at runtime).

## Conclusion

T12 complete. Both engines now read from central `~/.AutoDev/config/` by default with project file-level override and hardcoded defaults fallback. No deep merge. All T12 tests green, typecheck clean.