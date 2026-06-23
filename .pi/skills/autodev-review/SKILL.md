---
name: autodev-review
description: "Review a PR opened by the implementer. Checks code quality, test coverage, architectural consistency, security, and evidence completeness. Triggers: 'autodev-review', 'review PR', 'code review'."
---

# AutoDev Review

## Objective

Review a PR opened by the implementer before human review. Check: code quality, test coverage, architectural consistency with project patterns, security concerns, and evidence completeness. Post findings as PR comments. If critical issues are found, label the PR `autodev-blocked`. If review is clean, label `autodev-ready`.

## Pre-conditions

- A PR has been opened by the implementer
- The PR references a plan at `.autodev/plans/<slug>.md`
- The PR has label `autodev-review`

## Workflow

### Step 1: Read the plan

Fetch and read the implementation plan:

```bash
cat .autodev/plans/<slug>.md
```

Understand: acceptance criteria, affected files, test strategy, deployment risk, rollback plan.

### Step 2: Review the diff

```bash
gh pr diff <pr-number>
```

Check:
- Does the diff match the plan's scope? No extra changes?
- Are there any changes not in the plan?
- Are tests included alongside implementation?

### Step 3: Check evidence

```bash
ls -la .autodev/evidence/<YYYYMMDD>-<slug>/
```

Verify:
- Every acceptance criterion from the plan has evidence
- Evidence shows BEFORE/AFTER (red/green) where applicable
- Project-specific gates (P1-P3 from autodev-implement) have evidence if relevant
- Evidence is not just "tests pass" but shows actual validation on a real surface

### Step 4: Code review

Review the actual code changes:

- Code quality: naming, error handling, type annotations
- Test coverage: are all acceptance criteria tested?
- Architectural consistency: matches existing project patterns?
- Security: no secrets, no injection vulnerabilities, proper auth checks
- No AI slop: unnecessary abstractions, over-engineering, scope creep

### Step 5: Post findings

Post review as a PR comment:

```markdown
## AutoDev Review

### Summary
<1-line verdict: APPROVE / REQUEST CHANGES / BLOCK>

### Findings

| # | Severity | Category | Finding | File:Line |
|---|----------|----------|---------|-----------|
| 1 | High | Security | ... | ... |
| 2 | Medium | Pattern | ... | ... |

### Evidence Check
- [ ] <criterion>: <evidence status>
- [ ] <criterion>: <evidence status>

### Recommendation
<What should happen next>
```

Apply labels:
- All clean: `autodev-ready`
- Non-blocking findings: `autodev-ready` (with findings noted)
- Blocking findings: `autodev-blocked`

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Approving without checking evidence | "Tests pass" is not validation |
| Treating all findings as blocking | Minor style issues shouldn't block merge |
| Not checking plan conformance | Implementation may drift from plan without anyone noticing |
| Reviewing only the diff | Plan and evidence provide context the diff doesn't |