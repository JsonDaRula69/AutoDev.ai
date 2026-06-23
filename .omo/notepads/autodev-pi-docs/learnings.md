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
