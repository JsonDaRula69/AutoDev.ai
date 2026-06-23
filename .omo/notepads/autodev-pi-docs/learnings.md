# Learnings — autodev-pi-docs

## 2026-06-23T02:22:33Z — Session Start
- Branch: pi-foundation (confirmed)
- Plan: 7 todos + 4 final wave reviewers
- Wave 1: T1 (README), T2 (ARCHITECTURE), T3 (STRUCTURE), T4 (ROADMAP) — all parallel
- Wave 2: T5 (cross-reference) depends on T1-T4, T6 (update pi-foundation plan) depends on T5, T7 (update .autodev/ docs) depends on T6
- Key references loaded: workflow-specification.md, onboarding-protocol.md, pi-foundation plan, existing README.md, .autodev/ARCHITECTURE.md, STRUCTURE.md, CONTEXT.md, AGENTS.md, techContext.md, KNOWLEDGE-ARCHITECTURE.md, SETUP.md

## T1 — README.md (completed)
- Wrote 252-line README replacing the 191-line OpenCode-based one
- 8 sections present: What is AutoDev, The Crew, Architecture, Quick Start, How It Works, Configuration, Coexistence, Prerequisites
- 13 agents in crew table: Nemo, Aronnax, Ned Land, Conseil, Oracle, Momus, Metis, Harbor Master, Quartermaster, Boatswain, Navigator, Watch Officer, Explore (last 4 ops agents share Engineer identity, listed individually)
- Source-of-truth note at top references .omo/plans/autodev-pi-foundation.md
- OpenCode mentioned only in Coexistence section (4 matches, all scoped correctly)
- No AI-slop phrases detected (grep for leverage/seamless/robust/utilize/etc returned no matches)
- No file paths in narrative prose (paths appear only in code blocks, config tables, and the source-of-truth note)
- Quick start uses pi commands: bun install, magic-context setup --harness pi, autodev onboard (old npm/node commands removed)
- Model routing reflected: glm-5.2:cloud for triage/plan/deploy, deepseek-v4-pro for execute/review

## 2026-06-23 — ROADMAP.md (T4) written
- Source: pi-foundation plan "Future waves" section (lines 79-92) lists 11 deferred features. Cross-referenced with the full plan's Must-have scope to confirm what IS built vs what's deferred.
- Deferred features confirmed: hashline edit tool, session notifications, MCP OAuth, CodeGraph bootstrap, caveman text compression, additional CLI commands, think mode per agent, unstable agent babysitter, multi-project routing, installer, single binary. Plus 2 Magic Context future options from task spec: additional embedding providers, desktop app integration.
- Wave mapping per task spec: near-term (hashline, session notifications, additional CLI commands, think mode per agent), medium-term (MCP OAuth, CodeGraph, babysitter, rules injection), long-term (multi-project routing, installer, single binary), Magic Context future (caveman, additional embedding providers, desktop app).
- .omo/rules/ rules injection is noted in the plan as possibly pulled into the initial wave; roadmap treats it as medium-term with that caveat.
- No timelines used. Wave/priority ordering only, per spec.

## 2026-06-23 — STRUCTURE.md (T3) written
- Replaced the old 50-line OpenCode-based STRUCTURE.md with a 213-line pi-based version.
- All 8 required sections present: Project Layout (ASCII tree), Component Map (32-row table with ARCHITECTURE.md section refs), Reference Catalog (4 files + immutability rules), Config Files (9-row table with gitignored status), Agent Definitions (13 agents with shared identity blocks), Skills (4 custom + onboard), Coexistence Model (.pi/ + .opencode/ side-by-side), Search Strategy (8-step pi-aware list).
- Config files table includes .pi/lsp.json (9th file, not in original task spec's 8-row table but listed in the task's MUST DO section). Total: 9 config files.
- Em dashes removed per Category Context anti-slop rule. Used colons and "(none)" instead.
- No .opencode/ files listed as primary config. Coexistence section mentions .opencode/ only as the user's optional parallel setup.
- The .autodev/config/ directory actually has 6 files (guardrails.yaml, dispatch-rules.yaml, debate-protocol.yaml, mcp.json, standing-orders.md, team-spec.json) but only the 3 YAML files are listed as config in the table per task spec. mcp.json, standing-orders.md, and team-spec.json are supporting files, not primary config.
- Model routing note: Ned Land and Oracle/Momus use deepseek-v4-pro; everyone else uses glm-5.2:cloud. Validated against provider API per plan T4.

## T2 — ARCHITECTURE.md (completed)
- Wrote 699-line ARCHITECTURE.md at project root replacing the old 181-line .autodev/ARCHITECTURE.md (which stays as superseded historical reference per T7 of the pi-foundation plan).
- All 32 sections present: System Overview, Process Topology, Crew Dispatch Model, Agent Session Architecture, Extension Architecture, Guardrail Engine, Background Agent Management, Model Fallback Chains, Category System, Loreguard, Docs Query, Custom Tools, Skills System, Heartbeat, Discord Bridge, Debate Protocol, Auto-Merge Pipeline, Boulder State, Continuation Loops, Team Mode, Comment Checker, Notepad System, IntentGate, Built-in MCPs, LSP Integration, Tmux Integration, Rules Injection, Context Injection, Magic Context Integration, CLI Commands, Failure Modes, Data Flow Diagrams.
- ASCII diagram shows pi-based architecture (createAgentSession, in-process sessions, ExtensionAPI, bun:sqlite, pi extension event handlers, setInterval). No OpenCode references except one negation line ("There is no opencode serve").
- All 5 hard stops listed: no-secrets-in-code, evidence-required, follow-the-plan, one-task-at-a-time, ci-is-hard-gate.
- Debate section explicitly says "5 phases across 5 separate pi sessions" and "Five sessions, not three." Names all 5: Aronnax (proposer), Momus (opposer), Nemo (judge-1), Oracle (judge-2), Conseil (judge-3).
- Heartbeat section mentions setInterval and gh CLI (gh issue list --label autodev-request).
- Magic Context section lists all 5 ctx_* tools and all 5 features: git commit indexing, key files pinning, sidekick, user memories, workspaces. Shared DB at ~/.local/share/cortexkit/magic-context/context.db. Historian + dreamer agents mentioned.
- Team mode section describes hyperplan-after-onboarding, mailbox-during-onboarding, always-watching-during-work. 12 team_* tools listed.
- Comment checker section describes AI-slop stripping via tool_call event handler.
- Notepad section describes Loreguard-backed approach (learnings via ctx_memory, decisions via Loreguard, issues via ctx_memory, verification as evidence, problems as research notes).
- IntentGate section describes Harbor Master + Nemo triage application.
- Built-in MCPs: Context7 + Grep.app only. Exa explicitly excluded.
- LSP section lists 6 tools: lsp_diagnostics, lsp_goto_definition, lsp_find_references, lsp_prepare_rename, lsp_rename, lsp_symbols.
- Tmux section describes interactive_bash pi tool + team visualization (each member gets a tmux pane).
- Rules injection from .omo/rules/ directory.
- Failure modes table has 10 scenarios (required: 8+).
- Source of truth note at top.
- No AI-slop phrases. No em dashes. No implementation code (no import/const/async function/export default).
- Every section cross-references the pi-foundation todo that implements it (cross-reference index at end).

## T5 — Cross-Reference Audit (completed 2026-06-22)
- Read all 4 docs + pi-foundation plan + workflow-specification.md + onboarding-protocol.md + techContext.md
- Built cross-reference table: ARCHITECTURE.md 32/32 sections, README 8/8, STRUCTURE 8/8, ROADMAP 5/5
- Verified all 12 specific claims (13 agents, 5 debate sessions, tool_call interception, in-process sessions, Magic Context installed not reimplemented, no OpenCode deps, team mode adapted, notepad Loreguard-backed, IntentGate Harbor Master + Nemo, MCPs Context7 + Grep.app not Exa, 5 Magic Context features, 11 deferred features in ROADMAP)
- 4 discrepancies found and fixed:
  1. ARCHITECTURE.md *: had 5 hard stops, workflow-specification.md * 4.1 has 6. Added never-deploy-directly. Renamed evidence-required→evidence-or-it-didnt-happen, ci-is-hard-gate→ci-is-the-hard-gate to match spec exactly. The task spec itself said "5 hard stops" but the immutable reference has 6 — the reference wins.
  2. README Guardrails: missing one-task-at-a-time hard stop. Added it. Now 6 hard stops matching spec.
  3. STRUCTURE.md *: listed a 5th skill autodev-onboard. Onboarding is a CLI command (T13), not a skill (T12 lists only 4). Removed 5th skill, added clarification.
  4. ROADMAP.md: listed .omo/rules/ rules injection as medium-term deferred. But plan T5 includes it in the initial wave. Plan's "Future waves" section (lines 79-92) does NOT list it. Removed from ROADMAP.
- Evidence: .omo/evidence/task-5-autodev-pi-docs.md (full cross-reference table + discrepancy details + final verification)
- Key learning: the task spec itself can be wrong. The task said "5 hard stops match workflow-specification.md section 4.1" but the spec has 6. Always verify against the immutable source, not the task description.

## T6 — Pi-foundation plan design-specification backlinks (completed 2026-06-23)
- Added a "Design Specification" section to `.omo/plans/autodev-pi-foundation.md` between TL;DR and Scope. A 4-row table maps each design doc (README, ARCHITECTURE, STRUCTURE, ROADMAP) to its key sections. This is the plan's one-stop index into the design.
- Added a `Design refs:` line to the References block of every one of the 16 todos. Mapping was task-specified and confirmed correct: T1->STRUCTURE §1, T2->ARCH §4, T3->ARCH §2+§29, T4->ARCH §4 + STRUCTURE §5, T5->ARCH §5+§28, T6->ARCH §29, T7->ARCH §6, T8->ARCH §7+§8, T9->ARCH §9, T10->ARCH §10, T11->ARCH §11, T12->ARCH §12+§13, T13->ARCH §3+§14+§30, T14->ARCH §15, T15->ARCH §16, T16->ARCH §17+§18+§19.
- T1 was the only todo with no obvious ARCHITECTURE.md section (setup task). Resolved by pointing it at STRUCTURE.md §1 Project Layout, since the fresh-start deletion establishes the directory layout the STRUCTURE.md tree describes.
- Constraint honored: no todo body was rewritten. Each edit matched on the existing `References:` paragraph plus the first line of the `Acceptance criteria:` block and inserted exactly one new line between them. Plan line count went from 339 to 366 (+27 = 11 for the new section + 16 for the refs).
- The prerequisite note at line 5 already matched the task spec's required text exactly, so it was verified intact, not modified.
- Evidence: `.omo/evidence/task-6-autodev-pi-docs.md` (full section text, 16-row refs table, no-rewrite verification).
- Key learning: surgical `edit` anchored on the boundary between References and Acceptance criteria is the safest way to append a single line to a repeating sub-block in a long plan file. Matching on a longer unique anchor (the full References paragraph) avoids ambiguous matches; including the first line of the next block in both old and new strings guarantees the insertion lands in the right place.

## T7 — .autodev/ docs superseded, CONTEXT.md/AGENTS.md crew lists updated (completed 2026-06-22)
- Prepended superseded notes to 3 .autodev/ docs: ARCHITECTURE.md, KNOWLEDGE-ARCHITECTURE.md, SETUP.md. Each note points to the corresponding root-level doc section.
- CONTEXT.md crew table: expanded from 8 to 13 agents. Added Harbor Master, Explore, Boatswain, Navigator, Quartermaster, Watch Officer. Added shared-identity note for the last 4 (they share the Engineer identity). Reordered to match README.md order (Nemo, Harbor Master, Aronnax, Metis, Ned Land, Oracle, Momus, Conseil, Explore, Engineer, Boatswain, Navigator, Quartermaster, Watch Officer).
- AGENTS.md crew list: expanded from 7 to 13 agents. Added Harbor Master, Metis, Explore, Boatswain, Navigator, Quartermaster, Watch Officer. Added shared-identity note. Reordered to match README.md order.
- Verified no OpenCode-as-runtime references (opencode serve, OpenCode.*runtime, OmO) in either CONTEXT.md or AGENTS.md — none found, so no changes needed beyond crew lists.
- .autodev/reference/ files confirmed unchanged via `git diff --stat HEAD -- .autodev/reference/` (empty output).
- Evidence written to .omo/evidence/task-7-autodev-pi-docs.md with full diffs and checklist.

## 2026-06-22 — Final Wave Fixes (F2 + F3 reviewer issues resolved)
- F2 blocker (STRUCTURE.md §5): agent table had scrambled roles for quartermaster/boatswain/navigator. Fixed to match README.md, CONTEXT.md, AGENTS.md: quartermaster=stage-gate label enforcement, boatswain=QA gates/evidence validation, navigator=deployment readiness/health verification.
- F2 blocker (STRUCTURE.md §3 line 112): "5 hard stops" changed to "6 hard stops" to match immutable workflow-specification.md §4.1.
- F3 blocker (ARCHITECTURE.md §6): follow-the-plan hard stop row had "(warns, does not block)" which contradicts the table header "6 hard stops, all non-negotiable." Removed the parenthetical. workflow-specification.md §4.1 says follow-the-plan enforcement is `block_action`.
- STRUCTURE.md §1: added 3 missing directories under `.autodev/` — work-items/ (Heartbeat state), debates/ (Debate transcripts), embeddings/ (Vector store). Referenced by ARCHITECTURE.md §§14, 16, 11.
- README.md Quick Start: "Three commands" changed to "Four steps" to match the 4-step numbered list.
- ARCHITECTURE.md §31 closing sentence: removed partial feature list (7 of 13 ROADMAP features) — now says "Features not in the pi-foundation plan are documented in `ROADMAP.md` as future waves."
