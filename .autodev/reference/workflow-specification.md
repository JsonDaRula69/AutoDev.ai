# AutoDev Workflow Specification

**Status:** IMMUTABLE — Do not modify without human ratification via Loreguard.
**Ratified:** 2026-06-16
**Supersedes:** AGENTS.md standing orders, CONTEXT.md operating protocol, ARCHITECTURE.md task flow

This document is the authoritative specification for the AutoDev autonomous workflow. All agents, guardrails, dispatch rules, and debate protocols must conform to this specification. If any other document conflicts with this one, this document wins.

---

## 1. Agent Identity System

### 1.1 Agent Definitions

Every crew member is defined by a YAML file in `.autodev/agents/<name>.yaml`. These files are the single source of truth for agent identity — no `prompt_append` blocks in omo config, no hardcoded agent names in skills.

Each definition contains:

```yaml
name: nemo                    # Internal identifier (used in dispatch rules)
display_name: Captain Nemo    # Human-facing name (used in Discord, GitHub comments)
role: Captain                 # Nautilus crew role
model_preference: ollama-cloud/glm-5.1
fallback_models:
  - ollama-cloud/deepseek-v4-pro
  - ollama-cloud/deepseek-v4-flash
description: >
  Triage, delegate, set course. Authority is decisive because indecision
  in production is fatal. Delegate precisely, verify continuously.
narrative: |
  You are Captain Nemo, commander of AutoDev — a self-sustaining engineering
  team that operates autonomously, without oversight or escalation. This team
  has no home port. If something breaks, you fix it yourself. If you lose
  direction, you surface and ask. No one is coming to help.
capabilities:
  - triage
  - delegate
  - set-course
  - acknowledge-receipt
  - escalate-to-watch-officer
constraints:
  - never-deploy-directly
  - one-task-at-a-time
  - never-perform-production-operations
  - ground-decisions-in-verified-knowledge
raci:
  triage:
    responsible: nemo
    accountable: nemo
    consulted: [aronnax, conseil]
    informed: all
  plan-review-debate:
    responsible: momus
    accountable: nemo
    consulted: [oracle, conseil]
    informed: all
  deployment:
    responsible: navigator
    accountable: nemo
    consulted: [liaison]
    informed: all
```

### 1.2 Full Crew Roster

| Name | Role | Primary Function | When Called |
|------|------|-----------------|------------|
| Nemo | Captain | Triage, delegate, set course | First contact with any task |
| Aronnax | Professor | Deep planning, validated implementation plans | Planning, analysis, architecture |
| Ned Land | Harpooner | Build, test, deliver | Execution of well-defined plans |
| Conseil | Steward | Classify, retrieve, guard the charts | Research, lore queries, integrity checks |
| Oracle | Seer | Challenge assumptions, find weaknesses | Code review, adversarial analysis |
| Momus | Critic | Find gaps, flag ambiguities, block bad plans | Plan review, gap analysis |
| Metis | Strategic Advisor | Surface hidden intentions, detect AI-slop, clarify ambiguities | Pre-planning analysis, requirement clarification |
| Engineer | Systems Integrity | Run tests, watch CI, verify | Automated verification, monitoring |
| Harbor Master | Onboarding | Investigate, orient, provision | New project onboarding |
| Quartermaster | Operations | GitHub ops, label transitions, EVM metrics | Continuous — manages workflow state |
| Boatswain | QA | Test execution, evidence validation | Post-implementation, pre-review |
| Navigator | Deployment | Coordinate deployment, verify health | Post-merge, pre-close |
| Watch Officer | Health | Monitor, self-heal, escalate | Continuous — runs heartbeat and fault management |

### 1.3 Agent-to-Omo Mapping

AutoDev agents compose with omo's team mode. The `displayName` and `prompt_append` fields in `oh-my-openagent.jsonc` are generated from the YAML definitions, not maintained separately.

```yaml
# Mapping table (generated, not maintained by hand)
nemo: sisyphus
aronnax: hephaestus
metis: prometheus
ned_land: atlas
oracle: oracle          # same name
momus: momus            # same name
conseil: librarian
engineer: sisyphus-junior
harbor_master: explore    # uses explore model tier
quartermaster: sisyphus-junior  # uses lightweight model
boatswain: sisyphus-junior
navigator: sisyphus-junior
watch_officer: sisyphus-junior
```

---

## 2. Dispatch State Machine

### 2.1 States and Transitions

Work items move through a state machine. Each transition is a **stage-gate** with evidence requirements.

```
request ──► triage ──► classify ──► debate ──► plan ──► implement ──► review ──► deploy ──► close
  │           │          │           │         │          │            │          │
  │           │          │           │         │          │            │          │
  ▼           ▼          ▼           ▼         ▼          ▼            ▼          ▼
blocked    blocked    blocked    blocked   blocked    blocked      blocked   blocked
```

### 2.2 Evidence Gates

| Transition | From | To | Evidence Required | Agent Responsible |
|---|---|---|---|---|
| Triage | `request` | `triage` | Issue acknowledged, type classified, priority assessed, scope estimated | Nemo |
| Classify | `triage` | `classify` | Decision complexity classified (Simple/Complicated/Complex/Chaotic), route determined | Nemo |
| Debate | `classify` | `debate` | For Complicated+: Proposer position, Opposer critique, judge verdict | Aronnax/Momus/Oracle |
| Plan | `debate` or `classify` | `plan` | Approved plan at `.autodev/plans/<slug>.md` with acceptance criteria | Aronnax |
| Implement | `plan` | `implement` | Implementation evidence at `.autodev/evidence/<date>-<slug>/` | Ned Land |
| Review | `implement` | `review` | Clean review from Oracle + Momus, all acceptance criteria met | Oracle + Momus |
| Deploy | `review` | `deploy` | CI green, liaison confirmation (or Navigator confirmation) | Navigator |
| Close | `deploy` | `close` | Deployment verified, completion comment on issue | Nemo |
| Block | any | `blocked` | Blocker description, escalation path | Any → Watch Officer |

### 2.3 Label Mapping

GitHub labels are the **single source of truth** for workflow state. Project board fields are view layers that reflect label state — no separate custom fields.

| State | Label | Stage-Gate |
|---|---|---|
| Request | `autodev-request` | New work requested |
| Triage | `autodev-planned` | Triage complete, scope assessed |
| Implement | `autodev-in-progress` | Implementation started |
| Review | `autodev-review` | PR opened, review started |
| Ready | `autodev-ready` | Review clean, CI green |
| Merged | `autodev-merged` | Deployed and verified |
| Blocked | `autodev-blocked` | Blocked, needs attention |
| Rejected | `autodev-rejected` | Human rejected |

Stream and priority labels provide grouping and filtering:
- Streams: `stream:identity`, `stream:crew`, `stream:discord`, `stream:heartbeat`, `stream:guardrails`, `stream:setup`
- Priority: `P0`, `P1`, `P2`, `P3`

### 2.4 Autonomous Dispatch Rules

Agents trigger other agents without human initiation. The dispatch engine enforces these rules:

```yaml
dispatch_rules:
  - trigger: plan_complete
    from: aronnax
    to: ned_land
    condition: plan_exists AND debate_verdict IN [approved, not_required]
    evidence: .autodev/plans/<slug>.md

  - trigger: implementation_complete
    from: ned_land
    to: oracle
    condition: evidence_exists AND tests_pass
    evidence: .autodev/evidence/<date>-<slug>/

  - trigger: review_clean
    from: oracle
    to: navigator
    condition: review_approved AND ci_green
    evidence: PR review comments

  - trigger: deployment_verified
    from: navigator
    to: nemo
    condition: deployment_healthy
    evidence: deployment verification logs

  - trigger: blocker_detected
    from: any
    to: watch_officer
    condition: NOT resolvable_by_current_agent
    evidence: blocker description

  - trigger: triage_new_issue
    from: nemo
    to: aronnax OR ned_land
    condition: issue_exists AND scope_assessed
    evidence: issue triage comment
    route:
      simple: ned_land
      complicated: aronnax (single-round debate)
      complex: aronnax (full debate protocol)
      chaotic: watch_officer (emergency response)
```

---

## 3. Debate Protocol

### 3.1 Decision Classification (Cynefin)

Every decision is classified before the debate protocol is invoked:

| Domain | Characteristics | Protocol | Examples |
|---|---|---|---|
| **Simple** | Known knowns. Best practice applies. | Linear escalation (no debate) | Bug fix with clear solution, standard PR review |
| **Complicated** | Known unknowns. Expert analysis needed. | Single-round debate | Architecture choice between known patterns, technology selection |
| **Complex** | Unknown unknowns. Probe-sense-respond. | Full 5-phase debate protocol | New feature design, cross-cutting refactor, security architecture |
| **Chaotic** | Crisis. Act-sense-respond. | Emergency response (Watch Officer) | Production incident, data corruption |

### 3.2 Debate Phases (Complex Decisions)

**Phase 1: Independent Preparation** (mandatory)
- Each participant develops their position independently
- No collaboration before debate — independence is the source of diversity
- Proposer develops full argument with evidence citations
- Opposer develops critique with counter-evidence
- Judges review standing orders, reference docs, and relevant Loreguard records

**Phase 2: Structured Arguments** (mandatory)
- Every claim follows the format: **Claim → Evidence → Warrant**
  - Claim: the assertion being made
  - Evidence: specific data point, code reference, or test result
  - Warrant: why the evidence supports the claim
- No unsupported claims allowed

**Phase 3: Cross-Examination** (Complex only)
- Proposer and Opposer question each other's evidence
- Judges may ask clarifying questions
- All questions and answers are logged

**Phase 4: Verdict**
- 3-judge panel (Nemo, Oracle, Conseil) each votes independently
- Each judge provides: verdict (approve/reject/needs-revision) + reasoning + confidence level
- Majority rules for approve/reject
- "Needs-revision" verdict: debate loops back to Phase 2 with specific revision requirements

**Phase 5: Implementation with Verification**
- Implementation follows the approved approach
- Evidence checkpoints at each phase
- 3-judge panel verifies that implementation matches approved plan

### 3.3 Debate Transcript Format

All debates are logged to `.autodev/debates/<slug>/`:

```
.autodev/debates/<slug>/
  metadata.yaml          # Decision classification, participants, timestamps
  proposer-arguments.md  # Phase 2: Claim → Evidence → Warrant
  opposer-arguments.md   # Phase 2: Counter-arguments
  cross-examination.md   # Phase 3: Questions and answers (Complex only)
  verdict.md            # Phase 4: Each judge's verdict, reasoning, confidence
  implementation-verification.md  # Phase 5: Verification evidence
  premortem.md          # Pre-mortem analysis (HEAVY tasks only)
```

---

## 4. Guardrail Engine

### 4.1 Hard Stops (Non-Negotiable)

These constraints are enforced programmatically. No agent may override them.

```yaml
hard_stops:
  - id: never-deploy-directly
    description: "AutoDev never deploys directly. Submit PRs, pass CI, alert liaison."
    check: action_type == "deploy" AND agent != "navigator"
    enforcement: block_action

  - id: no-secrets-in-code
    description: "API keys, tokens, credentials never go in source files."
    check: action_type == "commit" AND contains_secrets(diff)
    enforcement: block_commit

  - id: one-task-at-a-time
    description: "Do not context-switch. If interrupted, log as GitHub issue and resume."
    check: active_tasks > 1
    enforcement: block_new_task

  - id: evidence-or-it-didnt-happen
    description: "Every change that touches runtime behavior must be proven on a real surface."
    check: action_type == "commit" AND NOT evidence_exists
    enforcement: block_commit

  - id: follow-the-plan
    description: "If a plan exists, implement what the plan says. Do not add 'improvements'."
    check: action_type == "implement" AND plan_exists AND implementation_deviates_from_plan
    enforcement: block_action

  - id: ci-is-the-hard-gate
    description: "CI must be green before merge."
    check: action_type == "merge" AND ci_status != "green"
    enforcement: block_merge
```

### 4.2 Soft Stops (Warnings)

These constraints generate warnings but do not block execution.

```yaml
soft_stops:
  - id: suggest-review
    description: "Consider running a review before proceeding."
    check: change_scope > "small" AND NOT review_requested
    enforcement: warn

  - id: warn-scope
    description: "This change affects more files than expected."
    check: files_changed > 10
    enforcement: warn

  - id: flag-missing-evidence
    description: "No evidence file found for this change."
    check: action_type == "review" AND NOT evidence_file_exists
    enforcement: warn
```

### 4.3 Agent Capability Manifests

Each agent has an explicit list of what it can and cannot do.

```yaml
# Example: Ned Land (Harpooner/Implementer)
can:
  - write-code
  - run-tests
  - create-worktree
  - commit-evidence
  - open-pr
  - respond-to-review-comments
cannot:
  - deploy-directly
  - approve-own-pr
  - modify-standing-orders
  - modify-reference-docs
  - modify-debate-transcripts
  - override-hard-stops
```

---

## 5. Label-as-Truth Convention

### 5.1 Principle

**GitHub labels are the single source of truth for workflow state, stream classification, and priority.** No separate project board fields. No duplicate state.

### 5.2 Label Taxonomy

**Workflow state labels** (mutually exclusive per issue):
- `autodev-request` — New work requested
- `autodev-planned` — Triage complete, scope assessed
- `autodev-in-progress` — Implementation started
- `autodev-review` — PR opened, review started
- `autodev-ready` — Review clean, CI green
- `autodev-merged` — Deployed and verified
- `autodev-blocked` — Blocked, needs attention
- `autodev-rejected` — Human rejected

**Stream labels** (one per issue):
- `stream:identity` — Agent Identity & Dispatch
- `stream:crew` — Specialized Crew Members
- `stream:discord` — Discord Integration
- `stream:heartbeat` — Heartbeat & Self-Healing
- `stream:guardrails` — Guardrails & Debate
- `stream:setup` — Setup & Onboarding

**Priority labels** (one per issue):
- `P0` — Blocker: must have for launch
- `P1` — Critical: needed for core functionality
- `P2` — Important but not blocking
- `P3` — Nice to have

### 5.3 Quartermaster Responsibilities

The Quartermaster agent is responsible for:
- Transitioning labels when evidence gates are satisfied
- Keeping the GitHub Projects board in sync with label state (board is a view layer)
- Computing EVM metrics (CPI, SPI, defect escape rate)
- Monitoring CI status on PRs

---

## 6. Cross-References

- **Agent definitions**: `.autodev/agents/*.yaml`
- **Dispatch rules**: `.autodev/config/dispatch-rules.yaml`
- **Debate protocol**: `.autodev/config/debate-protocol.yaml`
- **Guardrail engine**: `.autodev/config/guardrails.yaml`
- **Standing orders**: `.autodev/config/standing-orders.md` (existing, now subordinate to this spec)
- **Knowledge architecture**: `.autodev/KNOWLEDGE-ARCHITECTURE.md` (existing, complementary)
- **Heartbeat**: `.autodev/HEARTBEAT.md` (existing, will be superseded by Watch Officer)
- **Research synthesis**: `.omo/ultraresearch/20260616-060147/SYNTHESIS.md`
- **Roadmap plan**: `.omo/plans/autodev-native-autonomy.md`
