# T9 — Init Steps 6-9 (Registry, Docs, Repo, Labels) — Happy Path

Date: 2026-06-23

## Command

```bash
bun test extensions/autodev/installer/__tests__/init-module.test.ts
```

## Result

```
(pass) T9 step 6-9 happy: gh auth ok, repo view ok, 5 labels created, registry updated [59.10ms]
(pass) T9 repo missing: gh repo view fails -> gh repo create called, labels skipped [57.67ms]
```

## Verification

- **Step 6 (registry):** `loadRegistry()` → `addProject({name, path, repo})` → `setActiveProject(name)` → `saveRegistry()`. Registry file at `~/.AutoDev/projects.json` (resolved via `PI_CODING_AGENT_DIR` test override) contains the project entry with `active: true`, `path: projectRoot`, `repo: "owner/my-repo"`.
- **Step 7 (docs):** `AGENTS.md` and `CONTEXT.md` written to project root using inline fallbacks (no template source in mock package). Both files exist post-init.
- **Step 8 (repo):** `gh repo view owner/my-repo` exits 0 (mocked) → repo exists, no create needed.
- **Step 9 (labels):** `gh label list --json name` returns 3 of 8 labels. 5 `gh label create` calls made for: `autodev-review`, `autodev-ready`, `autodev-merged`, `autodev-blocked`, `autodev-rejected`.
- **State:** Steps 8 and 9 recorded in `.autodev/init-state.json`.
- **Repo missing path:** `gh repo view` fails → `gh repo create <name> --private --source=.` called → labels skipped (result detail: "Skipped (repo just created)").

## Idempotency

Re-running `runInit()` after a full happy run returns a single `{ok: true, detail: "already initialized"}` result — the fast path checks all four state steps (6, 7, 8, 9) plus the `.autodev/project` marker.