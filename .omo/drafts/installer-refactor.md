# installer-refactor — planning draft

## Status
- 2024-06-23: intent routed CLEAR. Architecture approved by user (§83§).
- 2024-06-23: scaffolded plan + draft.
- 2024-06-23: wrote full plan (8 todos, 4 waves).
- 2024-06-23: Metis gap analysis completed — 3 blockers, 6 majors, 8 minors. ALL folded into plan.
- 2024-06-23: User clarified 4 forks: (1) config interactive-only, (2) sub-commands per secret, (3) consolidate secret storage, (4) install.sh auto-installs bun.
- 2024-06-23: Explore verified secret consumers — consolidation to .env feasible. auth.json becomes thin $VAR pointer. Folded into plan.
- 2024-06-23: Plan updated with all fixes. Ready for delivery.

## Approval gate
- User approved the approach (§83§). Plan written and refined. Next: deliver summary + offer high-accuracy review (CLEAR intent → Momus optional).

## Key decisions
1. install.sh is standalone shell (not TS), auto-installs Bun via curl.
2. Install module (no secrets) and config module (all secrets, interactive-only, sub-commands) are separate. Doctor is sole orchestrator.
3. `autodev install`/`autodev init` removed; `steps.ts` and `index.ts` deleted.
4. Project-level steps deferred entirely.
5. postinstall/preinstall removed (dead under Bun).
6. `bin.autodev` → `scripts/cli.ts` which reimplements subcommand switch (NOT registerCommands — no pi instance available standalone).
7. Secret storage: `.env` is single source of truth. `auth.json` holds only `$VAR` references, not actual secrets.
8. Config sub-commands: `autodev config llm|voyage|discord|github`.
9. Doctor TTY-gated: triggers config only when `process.stdin.isTTY === true`.

## Metis findings folded
- B1: steps.ts deletion assigned to todo 3 (explicit, not "split" side-effect).
- B2: cli.ts reimplements switch, calls handlers directly (like postinstall did), NOT registerCommands.
- B3: index.ts deleted unconditionally in todo 8 (no "if near-empty" hedge).
- M1: matrix reconciled with per-todo Blocks.
- M2: state contract remapped — 6 steps {−1,0,2,3,4,5}, threshold ≥6.
- M3: F3 rewritten as agent-executable simulation, no human gate.
- M4: function names pinned (runInstallFixes, runConfig — no "or equivalent").
- M5: MC detection = run setup unconditionally (idempotent).
- M6: execSyncOverride added to config-module deps.
- m1-m8: all addressed (PATH check grep, comment-safe grep, mock instructions, CI=1 for doctor QA, concrete test count ≥20, @ts-nocheck/as any ban, narrowed reference range, integration note).