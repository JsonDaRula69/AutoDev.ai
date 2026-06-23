# T13 — Skills loader failure / edge case evidence

Date: 2026-06-23

## Failure paths covered by tests

### 1. No central dir, no project dir → `loadAllSkills` returns `[]`

```typescript
test("loadAllSkills returns [] when neither central nor project skills dir exists", () => {
  rmSync(centralSkillsDir, { recursive: true, force: true });
  expect(existsSync(centralSkillsDir)).toBe(false);
  expect(loadAllSkills(projectRoot)).toEqual([]);
});
```

Result: **pass**. When neither layer exists, `loadAllSkills` returns an
empty array — both `existsSync` checks fail, the `Map` stays empty.

### 2. Skill absent from both layers → `resolveSkill` returns `undefined`

```typescript
test("resolveSkill returns undefined when skill is absent from both layers", () => {
  writeCentralSkill("autodev-triage", "Central triage body");
  expect(resolveSkill(projectRoot, "nonexistent")).toBeUndefined();
});
```

Result: **pass**. Neither the project path nor the central path exists,
so `resolveSkill` returns `undefined`.

### 3. Central dir missing, project skill present → project skill still loads

```typescript
test("loadAllSkills returns project skills even when central dir is missing", () => {
  rmSync(centralSkillsDir, { recursive: true, force: true });
  writeProjectSkill("only-project", "Project body");
  const skills = loadAllSkills(projectRoot);
  expect(skills.length).toBe(1);
  expect(skills[0].name).toBe("only-project");
  expect(skills[0].source).toBe("project");
});
```

Result: **pass**. The central `existsSync` returns false so central
loading is skipped; project skills still load.

### 4. `buildSkillPromptBlock` with no skills found → empty string

```typescript
test("buildSkillPromptBlock returns empty string when no skills are found", () => {
  const block = buildSkillPromptBlock(projectRoot, ["nonexistent"]);
  expect(block).toBe("");
});
```

Result: **pass**. When `resolveSkill` returns `undefined` for every
name, `blocks` is empty and the function returns `""`.

## Pre-existing sibling-task failures (NOT T13)

The full `bun test` run shows 8 failures in
`guardrails/__tests__/guardrails.test.ts` and
`orchestrator/__tests__/dispatch.test.ts` / `scripts/__tests__/cli.test.ts`.
These are caused by uncommitted sibling-task changes to
`extensions/autodev/guardrails/index.ts` and the new test files, not by
T13. T13's MUST NOT constraint forbids touching those files.

Verification that T13 is not the cause: running
`bun test extensions/autodev/delegation/__tests__/skills.test.ts
extensions/autodev/guardrails/__tests__/guardrails.test.ts` in isolation
produces 19 pass, 0 fail — no interaction between T13 and guardrails.

## Typecheck pre-existing error (NOT T13)

`bun run typecheck` reports one error:

```
extensions/autodev/guardrails/__tests__/guardrails.test.ts(102,33): error TS2339:
  Property 'DEFAULT_GUARDRAILS_CONFIG' does not exist on type 'typeof import("...")'.
```

This is from the sibling-task's `guardrails/index.ts` modification
(adding `DEFAULT_GUARDRAILS_CONFIG` export) combined with a test that
references it. T13's files produce zero typecheck errors.

## Conclusion

All T13 failure paths are covered and pass. The 8 full-suite failures
and 1 typecheck error are pre-existing sibling-task debt outside T13's
scope.