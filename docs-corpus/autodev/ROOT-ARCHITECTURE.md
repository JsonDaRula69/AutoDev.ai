# AutoDev Architecture

Autonomous engineering team framework. Runs on OpenCode + oh-my-openagent (OmO) in headless serve mode, coordinated with the target project through a liaison agent and GitHub. Discord communication is handled in-process by the AutoDev binary; the heartbeat runs as an internal timer loop (no external service required).

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                   Host Machine (SSH)                                  │
│                                                                      │
│  ┌─────────────────────────┐       ┌────────────────────────────────┐│
│  │  Project Gateway        │       │  AutoDev Runtime               ││
│  │  (Liaison / bridge)     │       │  (single in-process binary)    ││
│  │                         │       │                                ││
│  │  • Receives task signals│ web  │  ┌──────────────────────────┐  ││
│  │  • Deploys updates      │◄────►│  │ opencode serve           │  ││
│  │  • Validates changes    │ hook │  │ + OmO (team mode)        │  ││
│  │                         │      │  │ + Magic Context          │  ││
│  └──────┬──────────────────┘      │  │ + Loreguard MCP          │  ││
│         │                          │  │ + Discord bridge (T2)   │  ││
│         │                          │  │ + Heartbeat (timer loop) │  ││
│         │                          │  └──────────────────────────┘  ││
│         │                          └────────────────────────────────┘│
└─────────┼──────────────────────────────────────────────────────────┘
          │
          │         ┌─────────────┐
          └────────►│   GitHub     │
                    │              │
                    │  Issues ────│─── Task board
                    │  PRs ───────│─── Review gate
                    │  Labels ────│─── Status signals
                    │  Comments ──│─── Communication
                    │  CI ──────── │─── Validation gate
                    │  Branches ──│─── Work isolation
                    └─────────────┘
```

## Process Topology

AutoDev runs as a single in-process binary. There are no external
systemd-managed services to install or monitor.

| Component | What it does |
|-----------|--------------|
| AutoDev binary | Runs `opencode serve` + OmO + Magic Context + Loreguard + Discord bridge + Heartbeat in one process |
| Heartbeat timer loop | Internal `setInterval` (default every 5 minutes) that polls GitHub for new `autodev-request` issues, checks for stalled PRs, and triggers self-healing. Startable/stoppable via the CLI. |

Communication channels:

1. **Discord via the in-process bridge (T2)** — human and liaison messages are forwarded as prompts to `opencode serve`
2. **HTTP webhooks** — liaison sends POST to OmO's gateway dispatcher; OmO sends POST to project gateway webhook endpoint
3. **GitHub** — Shared coordination platform (issues, PRs, labels, CI)

---

## The Liaison Bridge

The liaison is a named agent that bridges the target project and AutoDev. Its job is narrow: translate project needs into AutoDev signals and relay AutoDev results back.

### Liaison responsibilities

- **Inbound (Project → AutoDev):** When the project needs development work, the liaison creates a GitHub issue with the `autodev-request` label and sends a webhook wake signal or posts on the shared Discord channel.
- **Outbound (AutoDev → Project):** When AutoDev submits a PR and CI passes, the liaison deploys the update when conditions allow, verifies the changes, and reports back.

### Liaison is NOT an engineer

The liaison does not write code, review PRs, or run tests. It is a router and a validator. It trusts AutoDev's engineering output but independently verifies that deployments succeed and systems remain healthy.

---

## Task Flow

```
1. ISSUE filed with autodev-request label
2. NEMO triages: classify, assess scope, route
3. If plan needed → ARONNAX plans (with Metis pre-analysis)
4. MOMUS reviews plan for gaps and executability
5. NED LAND implements in worktree, writes evidence
6. NED LAND opens PR, updates label: autodev-review
7. ORACLE reviews PR (code review skill)
8. CI runs (GitHub Actions)
9. If CI green + review clean → label: autodev-ready
10. NED LAND auto-merges PR (evidence + CI + Oracle all green)
11. LIAISON deploys update when conditions allow
12. LIAISON verifies deployment is healthy
13. LIAISON reports success back to AutoDev
14. NED LAND posts completion comment, label: autodev-merged
```

### Merge policy

- **Auto-merge on green gates.** When evidence, CI, and Oracle review all pass, AutoDev merges the PR automatically. No human approval step blocks the pipeline.
- **Human veto, not human gate.** `@autodev hold` on a PR freezes it until explicitly released with `@autodev proceed`. Humans intervene to stop things, not to permit them.

---

## Context Injection

OpenCode loads context from multiple sources at session start:

1. **AGENTS.md** — Always loaded by OpenCode (standing orders, process rules)
2. **OpenCode `instructions`** — Files listed in `.opencode/opencode.json` loaded as additional instructions:
   - `CONTEXT.md` — Operating protocol, drift prevention, knowledge retrieval sequence
   - `.autodev/memory/projectbrief.md` — Project identity
   - `.autodev/memory/techContext.md` — Technologies, model routing
   - `.autodev/memory/activeContext.md` — Current phase, open questions
3. **Magic Context** — Auto-injected `<project-memory>` block from session history
4. **OmO hooks** — `rules-injector`, `agents-md-injector`, other lifecycle hooks
5. **Loreguard MCP** — On-demand ratified decision retrieval via `search_lore`
6. **Reference docs** — On-demand via `rg` or direct file reads from `.autodev/reference/`

---

## Discord Communication (in-process bridge)

The AutoDev binary embeds a Discord bridge (the T2 module). When a message arrives on Discord:

1. The bridge forwards the Discord message as a prompt to the in-process `opencode serve` instance
2. Responses are posted back to Discord

Channel IDs are read from environment variables (`DISCORD_CHANNEL_ID`, `DISCORD_LIAISON_CHANNEL_ID`).

---

## Custom Skills

### `autodev-triage`
Triggered when Sisyphus receives an `autodev:wake` event or the heartbeat finds a new `autodev-request` issue. Reads the GitHub issue, classifies it, and routes to the appropriate agent for planning.

### `autodev-implement`
Extends OmO's `work-with-pr` skill with project-specific validation. Runs the project test suite as CI gate and validates against project-specific contracts.

### `autodev-deploy`
Post-merge coordination skill. Alerts the liaison that a PR has been merged and CI is green. The liaison deploys when conditions allow and verifies the deployment. Does NOT deploy directly.

### `autodev-review`
Automated PR review skill. Runs Oracle (architecture review), security checks, and code review. Serves as a verification gate — when Oracle passes, the PR is ready for auto-merge.

---

## State Management

All AutoDev state lives in the repo under `.autodev/`:

```
.autodev/
├── ARCHITECTURE.md          # This document
├── KNOWLEDGE-ARCHITECTURE.md # Memory/lore design
├── AUDITOR.md               # Knowledge integrity checks
├── HEARTBEAT.md             # Periodic wake-up checks
├── SETUP.md                 # Setup guide
├── plans/                   # Implementation plans
├── evidence/                # QA evidence per change
├── memory/                  # Bootstrap context (Tier 1)
├── skills/                  # Custom skill definitions
├── config/                  # Team and agent configuration templates
├── decisions/               # ADR source files
├── reference/               # Immutable technical docs
└── research/                # Research notes
```

Runtime state:
- `opencode serve` runs in-process inside the AutoDev binary
- Discord bridge config is read from environment variables
- `.loreguard/` holds Loreguard DB (gitignored)

---

## Failure Modes and Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| opencode serve dies | In-process supervisor detects exit | Supervisor restarts the instance |
| AutoDev binary dies | Process manager (systemd/pm2/manual) | Restart the binary; all subsystems come back online |
| Liaison goes down | No new `autodev-request` issues | AutoDev heartbeat polls GitHub directly |
| CI is down | `autodev-ci-running` label stuck > 30 min | AutoDev comments on PR, labels `autodev-blocked` |
| Human rejects PR | `autodev-rejected` label | Prometheus re-plans, Atlas re-implements |
| Model API outage | Agent session error, fallback triggers | OmO's model fallback chains (per-agent) |
| Merge conflict | `gh pr view` shows mergeable: false | Atlas rebases, re-pushes, re-enters verification loop |
