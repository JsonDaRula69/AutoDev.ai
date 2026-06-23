# T13 — Skills loader centralized ~/.AutoDev/skills/ (happy path)

Date: 2026-06-23

## Task

Update `extensions/autodev/delegation/skills.ts` to read skills from the
centralized `~/.AutoDev/skills/` directory by default (resolved via
`join(getAgentDir(), "..", "skills")`), with project-level
`.autodev/skills/` adding to or overriding (same directory name) the
central set.

## What changed

- `extensions/autodev/delegation/skills.ts`:
  - Added `getCentralSkillsDir()` → `join(getAgentDir(), "..", "skills")`.
  - Added `getProjectSkillsDir(projectRoot)` → `resolve(projectRoot, ".autodev", "skills")`.
  - `resolveSkill(projectRoot, name)` now checks project override first,
    then falls back to central. Returns `undefined` if neither has the skill.
  - New `loadAllSkills(projectRoot)` merges central + project skills into
    a `readonly SkillEntry[]` with `source: "central" | "project"`.
    Project entries with the same name override central entries (Map-based).
  - New `SkillEntry` interface: `{ name, content, source }`.
  - New `listSkillDirs(dir)` helper: lists subdirectories containing
    `SKILL.md` using `readdirSync(dir, { withFileTypes: true })`.
  - `stripFrontmatter` and `buildSkillPromptBlock` unchanged in behavior.
  - Removed old `SKILL_SEARCH_PATHS` constant (replaced by layered resolution).
- `extensions/autodev/delegation/__tests__/skills.test.ts` (new): 14 tests
  covering happy path, project override, no-central-dir, resolveSkill
  fallback, and buildSkillPromptBlock behavior.

## Verification

### Tests (T13 scope only)

```bash
$ bun test extensions/autodev/delegation/__tests__/skills.test.ts
extensions/autodev/delegation/__tests__/skills.test.ts:
(pass) loadAllSkills returns all 5 central skills when present [9.53ms]
(pass) loadAllSkills marks source as central for central-only skills [2.30ms]
(pass) loadAllSkills: project skill with same name overrides central [4.10ms]
(pass) loadAllSkills: project-only skill is added alongside central [3.25ms]
(pass) loadAllSkills returns [] when neither central nor project skills dir exists [1.05ms]
(pass) loadAllSkills returns project skills even when central dir is missing [2.01ms]
(pass) resolveSkill returns project skill when project overrides central [3.38ms]
(pass) resolveSkill falls back to central when project has no override [1.58ms]
(pass) resolveSkill returns undefined when skill is absent from both layers [2.08ms]
(pass) resolveSkill returns undefined when central dir is missing and no project skill [1.20ms]
(pass) buildSkillPromptBlock includes loaded skills from central dir [3.34ms]
(pass) buildSkillPromptBlock returns empty string for empty skillNames [0.69ms]
(pass) buildSkillPromptBlock returns empty string when no skills are found [0.68ms]
(pass) buildSkillPromptBlock prefers project override body [2.87ms]

 14 pass
 0 fail
 32 expect() calls
Ran 14 tests across 1 file. [1148.00ms]
```

### Typecheck (T13 scope)

```bash
$ bun run typecheck 2>&1 | grep -E "skills"
(no output)
```

No typecheck errors in skills.ts or skills.test.ts. One pre-existing
error in `guardrails/index.ts` (`DEFAULT_GUARDRAILS_CONFIG`) is from a
sibling task's uncommitted change and is out of T13 scope per MUST NOT.

### Pure LOC

- `skills.ts`: 171 pure LOC (healthy, well under 250 ceiling).
- `skills.test.ts`: 147 pure LOC (healthy).

### Full suite (regression check)

`bun test` (full suite): 556 pass, 8 fail. The 8 failures are all in
`guardrails/__tests__/` and `dispatch.test.ts`/`cli.test.ts` — they are
caused by sibling-task uncommitted changes (modified
`guardrails/index.ts`, new `guardrails/__tests__/`, new
`dispatch.test.ts`, new `cli.test.ts`), NOT by T13. Running T13's
skills tests alongside guardrails tests in isolation: 19 pass, 0 fail,
confirming no interaction between T13 and the sibling-task failures.

## Conclusion

T13 is complete. The skills loader reads from the centralized
`~/.AutoDev/skills/` directory by default and merges project-level
`.autodev/skills/` as overrides. All T13 tests pass, typecheck is clean
for skills files, and no regressions are introduced by T13.