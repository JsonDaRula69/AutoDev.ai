# T2 — loadAgent / listAgentNames / loadAgentFallbackChains: Failure Path

**Task:** project-init-centralization T2 — failure-mode behavior after centralizing agent resolution.

**Date:** 2026-06-23

## Failure-path tests

From `extensions/autodev/delegation/__tests__/agents.test.ts` and `extensions/autodev/background/__tests__/fallback.test.ts`:

```
(pass) loadAgent returns undefined when the central agents dir is missing [0.70ms]
(pass) listAgentNames returns [] when the central agents dir is missing [1.08ms]
(pass) loadAgent returns undefined when the agent file is absent [1.02ms]
(pass) loadAgent returns undefined when frontmatter has no `model` field [1.63ms]
(pass) loadAgentFallbackChains returns {} when central agents dir is missing [1.48ms]
```

## Behavior summary

| Condition | `loadAgent` | `listAgentNames` | `loadAgentFallbackChains` |
|---|---|---|---|
| Central `agents/` dir missing | `undefined` | `[]` | `{}` |
| Specific `<name>.md` missing | `undefined` | (n/a) | (n/a) |
| Frontmatter has no `model` field | `undefined` | (n/a) | (n/a) |
| Frontmatter has no `name` field | falls back to filename | (n/a) | entry skipped |
| `fallback_models` empty after trim | (n/a) | (n/a) | entry skipped |
| Unreadable agent file | `undefined` (readFileSync catch) | skipped | skipped |

## Backward compatibility

- `projectRoot` parameter retained on all three public functions.
- Parameter prefixed `_projectRoot` to signal unused-for-resolution while preserving call sites (`executor.ts` line 194, `delegation/index.ts` line 37).
- No change to frontmatter YAML parsing, body extraction, or `FallbackConfig` shape.

## Conclusion

Failure path verified: missing central dir, missing file, and malformed frontmatter all degrade gracefully to empty/undefined returns, matching the previous `.pi/agents/` behavior.