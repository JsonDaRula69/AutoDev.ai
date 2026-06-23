# Evidence: Task 7 — Update .autodev/ docs, CONTEXT.md, AGENTS.md

**Date:** 2026-06-22
**Branch:** pi-foundation
**Task:** Add superseded notes to .autodev/ docs, update crew lists in CONTEXT.md and AGENTS.md, remove OpenCode-as-runtime references.

---

## Acceptance Criteria Checklist

- [x] .autodev/ARCHITECTURE.md has a superseded note at top
- [x] .autodev/KNOWLEDGE-ARCHITECTURE.md has a superseded note at top
- [x] .autodev/SETUP.md has a superseded note at top
- [x] CONTEXT.md has no OpenCode-as-runtime references (or they're updated to pi)
- [x] AGENTS.md has no OpenCode-as-runtime references (or they're updated to pi)
- [x] .autodev/reference/ files unchanged (immutable)
- [x] Evidence file written: `.omo/evidence/task-7-autodev-pi-docs.md`
- [x] Learnings appended to `.omo/notepads/autodev-pi-docs/learnings.md`

---

## Diffs

### .autodev/ARCHITECTURE.md (+2 lines)

```
+ > **SUPERSEDED.** This document describes the OpenCode-based AutoDev architecture. It is kept as a historical reference. The current pi-based architecture is documented at the root-level `ARCHITECTURE.md`. Refer to that file for the current system design.
```

Preprended before `# AutoDev Architecture` (line 1). File went from 181 to 183 lines.

### .autodev/KNOWLEDGE-ARCHITECTURE.md (+2 lines)

```
+ > **SUPERSEDED.** This document describes the OpenCode-based knowledge architecture. It is kept as a historical reference. The current pi-based knowledge architecture is documented at the root-level `ARCHITECTURE.md` §10 (Loreguard), §11 (Docs Query), §28 (Context Injection), and §29 (Magic Context Integration). Refer to those sections for the current design.
```

Preprended before `# AutoDev Knowledge Architecture` (line 1). File went from 255 to 257 lines.

### .autodev/SETUP.md (+2 lines)

```
+ > **SUPERSEDED.** This document describes the OpenCode-based setup process. It is kept as a historical reference. The current pi-based setup is documented at the root-level `README.md` §Quick Start and §Configuration. Refer to that file for current setup instructions.
```

Preprended before `# AutoDev Setup Guide` (line 1). File went from 206 to 208 lines.

### CONTEXT.md — Crew table replaced (8 agents → 13 agents)

**Old (8 agents):** Nemo, Aronnax, Ned Land, Conseil, Oracle, Momus, Metis, Engineer

**New (14 rows including shared-identity note):**
- Nemo (Captain)
- Harbor Master (Onboarding) — **added**
- Aronnax (Professor/Planner)
- Metis (Strategic Advisor)
- Ned Land (Harpooner/Implementer)
- Oracle (Seer/Reviewer)
- Momus (Satyr/Critic)
- Conseil (Steward/Knowledge Keeper)
- Explore (Investigator) — **added**
- Engineer (Engine Room)
- Boatswain (Operations) — **added**
- Navigator (Operations) — **added**
- Quartermaster (Operations) — **added**
- Watch Officer (Operations) — **added**
- Shared identity note: "The last four (Boatswain, Navigator, Quartermaster, Watch Officer) share the Engineer identity."

**OpenCode-as-runtime check:** No matches for `opencode serve`, `OpenCode.*runtime`, `opencode.*serve`, or `OmO` in CONTEXT.md. All crew protocol content preserved unchanged.

### AGENTS.md — Crew list replaced (7 agents → 13 agents)

**Old (7 agents):** Nemo, Aronnax, Ned Land, Conseil, Oracle, Momus, Engineer

**New (14 items including shared-identity note):**
- Nemo (Captain)
- Harbor Master (Onboarding) — **added**
- Aronnax (Professor/Architect)
- Metis (Strategist) — **added**
- Ned Land (Harpooner/Implementer)
- Oracle (Seer/Reviewer)
- Momus (Satyr/Critic)
- Conseil (Steward/Knowledge Keeper)
- Explore (Investigator) — **added**
- Engineer (Engine Room)
- Boatswain (Operations) — **added**
- Navigator (Operations) — **added**
- Quartermaster (Operations) — **added**
- Watch Officer (Operations) — **added**
- Shared identity note: "The last four (Boatswain, Navigator, Quartermaster, Watch Officer) share the Engineer identity."

**OpenCode-as-runtime check:** No matches for `opencode serve`, `OpenCode.*runtime`, `opencode.*serve`, or `OmO` in AGENTS.md. All standing orders, deployment protocol, label protocol, knowledge retrieval, and immutable sources sections preserved unchanged.

### .autodev/reference/ — Unchanged

```
$ git diff --stat HEAD -- .autodev/reference/
(no output)
```

All reference files are immutable and untouched.

---

## Summary

| File | Change | Lines |
|------|--------|-------|
| .autodev/ARCHITECTURE.md | Superseded note prepended | 181→183 |
| .autodev/KNOWLEDGE-ARCHITECTURE.md | Superseded note prepended | 255→257 |
| .autodev/SETUP.md | Superseded note prepended | 206→208 |
| CONTEXT.md | Crew table: 8→13 agents + shared-identity note | 84→92 |
| AGENTS.md | Crew list: 7→13 agents + shared-identity note | 93→102 |
| .autodev/reference/ | Unchanged (immutable) | — |
