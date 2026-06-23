---
name: autodev-implement
description: "Implement a planned autodev task with evidence-bound QA. Extends the worktree PR workflow with project-specific validation gates. Use when implementing an autodev-planned issue. Triggers: 'autodev-implement', 'implement plan', 'execute plan', 'start work on issue'."
---

# AutoDev Implement

## Objective

Implement a planned change from `.autodev/plans/<slug>.md`, validate it with evidence, open a PR, and drive it through the verification loop until merged.

This skill uses the standard worktree PR workflow (worktree setup, implementation, PR creation, CI/review/merge loop). This skill adds evidence-bound QA and project-specific validation gates on top.

## Pre-conditions

Before starting implementation:

1. A plan exists at `.autodev/plans/<slug>.md`
2. The GitHub issue has label `autodev-planned`
3. The plan includes acceptance criteria, affected files, and test strategy

## Workflow

### Phase 0: Setup

Create an isolated worktree from the target branch. Install dependencies.

```bash
git worktree add ../<project>-<slug> -b autodev/<slug>
cd ../<project>-<slug>
bun install  # or the project's package manager
```

### Phase 1: Implement

Drive implementation through the continuous work loop (plan → implement → test → iterate). In addition to the standard evidence-bound QA, enforce these project-specific gates:

#### Gate P1: No breaking contract changes

If the change touches any file that interfaces with an external API or service:

```bash
# Verify API contract is preserved (adapt command to project)
rg "<api-pattern>" --type <project-type> -l | head
```

Evidence required: test output showing contract tests pass.

#### Gate P2: No breaking config changes

If the change touches configuration files:

```bash
# Validate config schema (adapt command to project)
<project-config-validator> <changed-config-file>
```

Evidence required: validation output showing config is valid.

#### Gate P3: No regression in critical paths

If the change touches a critical path (auth, data integrity, payment, etc.):

```bash
# Run critical-path tests specifically
<project-test-runner> --filter "<critical-path-pattern>"
```

Evidence required: test output showing critical-path tests pass.

### Phase 2: Evidence

Write evidence to `.autodev/evidence/<YYYYMMDD>-<slug>/`:

- `before.md` — State before the change
- `after.md` — State after the change
- `test-output.md` — CI or manual test results
- `summary.md` — What was tested and what passed

Every acceptance criterion from the plan must have corresponding evidence. No evidence = no commit.

### Phase 3: PR and verification loop

Open PR, drive through CI and review, iterate until merged.

```bash
git add -A
git commit -m "<conventional commit>"
git push -u origin autodev/<slug>
gh pr create --title "<title>" --body "<body>"
```

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Implementing without a plan | No acceptance criteria, no scope boundary |
| Skipping evidence | "Tests pass" is not validation |
| Adding features the plan doesn't call for | Scope creep, unvalidated changes |
| Working on main branch | Worktrees provide isolation for a reason |