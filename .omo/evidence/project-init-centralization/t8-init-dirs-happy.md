# T8 Init Module — Happy Path Evidence

**Task:** T8 — implement `autodev init` steps 1-5 (project structure, templates, `.github`, marker, `.omo/`) in `extensions/autodev/installer/init-module.ts`.

**Date:** 2026-06-23

## Changed files

- `extensions/autodev/installer/init-module.ts` — new file. `runInit(deps: InitModuleDeps): Promise<InitFixResult[]>` implements steps 1-5:
  - Step 1: Create `.autodev/` subdirs (9 dirs: evidence, decisions, work-items, debates, embeddings, research, memory, plans, scripts — NOT config/skills/reference).
  - Step 2: Copy 4 templates from the central package (default `~/.bun/install/global/node_modules/autodev/.autodev/templates/` or `deps.packageRoot`) into `.autodev/templates/`.
  - Step 3: Create `.github/ISSUE_TEMPLATE/` and copy `autodev-request.md` from `.autodev/templates/`.
  - Step 4: Write `.autodev/project` marker JSON `{name, path, repo}` (repo derived from `git remote get-url origin` via `execSyncOverride`).
  - Step 5: Create `.omo/` subdirs (plans, evidence, rules, drafts, notepads).
  - Idempotency: steps 1-3 tracked as state step 6 ("structure"); step 5 as step 7. Fast path: if `.autodev/project` marker exists AND both steps 6+7 complete, returns single "already initialized" result.
- `extensions/autodev/installer/__tests__/init-module.test.ts` — new file, 5 tests (Given/When/Then).

## Verification command

```bash
bun test extensions/autodev/installer/__tests__/init-module.test.ts
```

## Result

```
bun test v1.3.14 (0d9b296a)

extensions/autodev/installer/__tests__/init-module.test.ts:
(pass) runInit happy path: all dirs/files created, state steps 6+7 recorded [20.34ms]
(pass) runInit failure: package templates dir missing -> step 2 fails, others continue, step 6 NOT marked [8.13ms]
(pass) runInit resume: step 6 done, step 7 fails then re-run skips 6 and retries 7 [6.52ms]
(pass) runInit idempotent: full happy run then re-run returns 'already initialized' [11.24ms]
(pass) runInit marker JSON shape: {name, path, repo} [10.17ms]

 5 pass
 0 fail
 74 expect() calls
Ran 5 tests across 1 file. [105.00ms]
```

## What was verified (happy path)

- `runInit()` returns 5 `InstallFixResult[]` entries: `autodev-dirs`, `templates`, `github-template`, `project-marker`, `omo-dirs`.
- All 9 `.autodev/` subdirs created; `config/`, `skills/`, `reference/` NOT created (centralized via symlinks).
- `.autodev/templates/` contains the 4 template files copied from the central package.
- `.github/ISSUE_TEMPLATE/autodev-request.md` exists.
- `.autodev/project` marker exists with correct JSON: `{name: <dir-name>, path: <cwd>, repo: <owner/repo>}`.
- All 5 `.omo/` subdirs created.
- `init-state.json` records steps 6 and 7 as completed.

## Full-suite verification

```bash
$ bun test
 527 pass
 0 fail
 1999 expect() calls
Ran 527 tests across 30 files. [16.88s]
```

## Typecheck

```bash
$ bun run typecheck
$ tsc --noEmit
---EXIT: 0---
```