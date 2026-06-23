# Evidence — Task 6: Update pi-foundation plan with design-specification references

- **Date:** 2026-06-23
- **Branch:** pi-foundation
- **Task:** Add a "Design Specification" references section to `.omo/plans/autodev-pi-foundation.md` and a `Design refs:` line to every todo, pointing each at the relevant ARCHITECTURE.md section. Do NOT rewrite any todo.
- **Plan file:** `.omo/plans/autodev-pi-foundation.md` (339 lines → 366 lines after edits; +27 lines: 11 for the new section, 16 for the Design refs lines)

## Outcome checklist

- [x] Pi-foundation plan has a "Design Specification" references section listing all 4 docs
- [x] Every todo in the plan references at least one doc section
- [x] The prerequisite note at the top is intact
- [x] No plan todos were rewritten (only references added)
- [x] ROADMAP.md referenced for future waves
- [x] Evidence file written (this file)
- [ ] Learnings appended to `.omo/notepads/autodev-pi-docs/learnings.md` (see final step below)

## Step 1 — "Design Specification" section added

Inserted after the TL;DR block and before the `## Scope` heading (now lines 23-33 of the updated plan). Verbatim text:

```
## Design Specification

This plan implements the design described in the following documents. If this plan and the docs disagree, the docs win.

| Document | What it specifies | Key sections |
|----------|-------------------|--------------|
| `README.md` | User-facing design: crew roles, quick start, workflow, configuration, coexistence | §The Crew (13 agents), §How It Works (pipeline), §Configuration (.pi/ + .autodev/) |
| `ARCHITECTURE.md` | Developer-facing system design: 32 sections covering every component | §4 Agent Sessions, §5 Extension Architecture, §6 Guardrails, §7-8 Background + Fallback, §9 Category System, §10 Loreguard, §11 Docs Query, §12 Custom Tools, §13 Skills, §14 Heartbeat, §15 Discord, §16 Debate, §17 Auto-Merge, §18 Boulder, §19 Continuation, §20 Team Mode, §21 Comment Checker, §22 Notepad, §23 IntentGate, §24 Built-in MCPs, §25 LSP, §26 Tmux, §27 Rules Injection, §28 Context Injection, §29 Magic Context, §30 CLI Commands |
| `STRUCTURE.md` | Directory map and reference catalog: where every file lives | §1 Project Layout (directory tree), §4 Config Files (9 config files), §5 Agent Definitions (13 agents), §6 Skills (4 skills), §7 Coexistence (.pi/ + .opencode/) |
| `ROADMAP.md` | Future waves: features NOT in this plan | §Near-term (hashline, notifications, CLI commands, think mode), §Medium-term (MCP OAuth, CodeGraph, babysitter), §Long-term (multi-project, installer, single binary), §Magic Context future (caveman, embedding providers, desktop app) |
```

## Step 2 — Design refs added to every todo

Each todo now has a `Design refs:` line at the end of its `References` block. No todo's What to do, Must NOT do, Parallelization, Acceptance criteria, QA scenarios, or Commit lines were changed. Only one new line per todo.

| Todo | Design refs line (appended to References) |
|------|-------------------------------------------|
| T1  (Fresh branch + delete) | `Design refs: STRUCTURE.md §1 Project Layout (target directory structure established by fresh start)` |
| T2  (Extract identity blocks) | `Design refs: ARCHITECTURE.md §4 Agent Session Architecture` |
| T3  (Install pi + Magic Context) | `Design refs: ARCHITECTURE.md §2 Process Topology, ARCHITECTURE.md §29 Magic Context Integration` |
| T4  (Port 13 crew agents) | `Design refs: ARCHITECTURE.md §4 Agent Session Architecture, STRUCTURE.md §5 Agent Definitions` |
| T5  (Base extension + context injection) | `Design refs: ARCHITECTURE.md §5 Extension Architecture, ARCHITECTURE.md §28 Context Injection` |
| T6  (Magic Context verification) | `Design refs: ARCHITECTURE.md §29 Magic Context Integration` |
| T7  (Guardrails via tool_call) | `Design refs: ARCHITECTURE.md §6 Guardrail Engine` |
| T8  (Background agent + model fallback) | `Design refs: ARCHITECTURE.md §7 Background Agent Management, ARCHITECTURE.md §8 Model Fallback Chains` |
| T9  (Category system + task delegation) | `Design refs: ARCHITECTURE.md §9 Category System for Task Delegation` |
| T10 (Loreguard) | `Design refs: ARCHITECTURE.md §10 Loreguard` |
| T11 (Docs query) | `Design refs: ARCHITECTURE.md §11 Docs Query System` |
| T12 (Custom tools + skills) | `Design refs: ARCHITECTURE.md §12 Custom Tools, ARCHITECTURE.md §13 Skills System` |
| T13 (Heartbeat + crew dispatch) | `Design refs: ARCHITECTURE.md §3 Crew Dispatch Model, ARCHITECTURE.md §14 Heartbeat, ARCHITECTURE.md §30 CLI Commands` |
| T14 (Discord bridge) | `Design refs: ARCHITECTURE.md §15 Discord Bridge` |
| T15 (Debate protocol) | `Design refs: ARCHITECTURE.md §16 Debate Protocol` |
| T16 (Auto-merge + boulder + continuation) | `Design refs: ARCHITECTURE.md §17 Auto-Merge Pipeline, ARCHITECTURE.md §18 Boulder State, ARCHITECTURE.md §19 Continuation Loops` |

Coverage: 16/16 todos have a `Design refs:` line. All 4 docs are referenced (README indirectly via the Design Specification section, ARCHITECTURE.md directly for 15 todos, STRUCTURE.md directly for T1 and T4, ROADMAP.md in the Design Specification table for future waves).

## Step 3 — Prerequisite note

The prerequisite note at line 5 of the plan was already the exact text the task spec required, so no change was needed. Confirmed intact after edits by re-reading lines 1-10 of the updated file.

## Step 4 — No-todo-rewrite verification

To confirm only references were added (no todo body rewritten), I used surgical `edit` calls that matched on the existing `References:` paragraph and the first line of the `Acceptance criteria:` block for each todo, inserting exactly one new `Design refs:` line between them. No `What to do`, `Must NOT do`, `Parallelization`, `Acceptance criteria`, `QA scenarios`, or `Commit` content was touched. The plan's dependency matrix (lines 116-136 originally) and execution waves (lines 108-114) are unchanged.

The only structural change is the insertion of the `## Design Specification` section between the TL;DR and the `## Scope` heading. The `## Scope`, `### Must have`, `### Must NOT have`, `### Future waves`, `## Verification strategy`, `## Execution strategy`, `## Todos`, `## Final verification wave`, `## Commit strategy`, and `## Success criteria` sections are all unchanged in content and ordering.