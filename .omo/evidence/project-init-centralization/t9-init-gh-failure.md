# T9 — Init Steps 6-9 — Failure Paths

Date: 2026-06-23

## Command

```bash
bun test extensions/autodev/installer/__tests__/init-module.test.ts
```

## Result

```
(pass) T9 label create failure: warn and continue [54.29ms]
(pass) T9 gh not authenticated: gh auth status fails -> warn, skip steps 8-9 [54.49ms]
(pass) T9 registry write failure: hard fail at step 6 [54.95ms]
```

## Failure paths verified

### Label create failure (best-effort)

- `gh label create` throws for `autodev-review` (mocked `failLabels`).
- `runStep9Labels` catches per-label errors, emits a warning via `notify(msg, "warning")`, increments `failed` counter, continues to the next label.
- Labels result: `{ok: true, detail: "Labels: 4 created, 1 failed, 4 of 5 ok."}` — `ok: true` because label dedup is best-effort.
- State step 9 still recorded (the phase ran and completed, even with partial failures).

### GH not authenticated (skip steps 8-9)

- `gh auth status` throws → `ghAuthCheck()` returns false.
- `runSteps8to9` emits warning: "GitHub CLI not authenticated. Run `autodev config github` first."
- Returns `{results: [skipped, skipped], ran: false}` — the `ran: false` flag tells `runInit` NOT to mark state step 9.
- `gh repo view` and `gh label list` are never called.
- Steps 6-7 still succeed (registry + docs are independent of gh).
- State: step 8 recorded, step 9 NOT recorded.

### Registry write failure (hard fail)

- `~/.AutoDev/projects.json` pre-created as a directory (not a file) → `saveRegistry()` throws EISDIR.
- `runStep6Registry` returns `{ok: false, detail: "Registry write failed: ..."}`.
- `runInit` checks `!regResult.ok` and throws `Error("init step 6 (registry) failed: ...")` — aborting init entirely.
- No subsequent steps run (7, 8, 9 all skipped).
- `await expect(runInit(...)).rejects.toThrow()` confirms the hard fail.

## Key design decision

Step 6 is the only step that hard-fails (throws). All other steps return `{ok: false}` results and continue. This is because a broken registry means AutoDev cannot track the project at all — there's no point proceeding to docs/repo/labels if the project can't be registered.