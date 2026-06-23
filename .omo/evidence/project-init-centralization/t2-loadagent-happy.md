# T2 — loadAgent / listAgentNames / loadAgentFallbackChains: Happy Path

**Task:** project-init-centralization T2 — read agent Markdown files from the central `~/.AutoDev/agents/` directory (derived via `getAgentDir()`) instead of `projectRoot/.pi/agents/`.

**Date:** 2026-06-23

## Changed files

- `extensions/autodev/delegation/agents.ts` — `loadAgent` and `listAgentNames` now resolve via `join(getAgentDir(), "..", "agents")`. `projectRoot` kept for API compatibility, prefixed `_` to mark unused.
- `extensions/autodev/background/fallback.ts` — `loadAgentFallbackChains` resolves the same central dir.
- `extensions/autodev/delegation/executor.ts` — docstrings + error message updated to reference `~/.AutoDev/agents/`.

## Happy-path verification

New unit tests in `extensions/autodev/delegation/__tests__/agents.test.ts` and `extensions/autodev/background/__tests__/fallback.test.ts`. Tests set `PI_CODING_AGENT_DIR=<tempRoot>/agent` so `getAgentDir()` resolves there; agent fixtures are planted at `<tempRoot>/agents/`.

```
$ bun test extensions/autodev/delegation/__tests__/agents.test.ts \
          extensions/autodev/background/__tests__/fallback.test.ts
...
(pass) loadAgent reads from central agents dir and parses frontmatter + body [3.30ms]
(pass) listAgentNames lists all .md filenames in the central agents dir [1.56ms]
(pass) loadAgent falls back to filename when frontmatter `name` is absent [1.69ms]
(pass) loadAgentFallbackChains reads fallback_models from central agents dir [3.29ms]
(pass) loadAgentFallbackChains skips agents without fallback_models field [1.86ms]
(pass) loadAgentFallbackChains skips agents whose fallback_models is empty after trim [1.30ms]
(pass) loadAgentFallbackChains skips agents with no `name` frontmatter field [1.26ms]
 12 pass
 0 fail
```

Existing `test/delegation.test.ts` updated to redirect `PI_CODING_AGENT_DIR` into the temp tree and plant agent fixtures at `<tempRoot>/agents/`. All 22 tests pass:

```
$ bun test test/delegation.test.ts
 22 pass
 0 fail
```

## Type check

```
$ bun run typecheck
$ tsc --noEmit
(no output — clean)
```

## Conclusion

Happy path verified: `loadAgent`, `listAgentNames`, and `loadAgentFallbackChains` read agent definitions from the central `~/.AutoDev/agents/` directory. `projectRoot` is accepted but unused for agent resolution.