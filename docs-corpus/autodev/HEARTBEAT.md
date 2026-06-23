# AutoDev Heartbeat

The heartbeat runs as an **internal timer loop** inside the AutoDev binary.
No systemd timer or external service is required. The loop fires every 5
minutes (configurable), polls GitHub for new work, checks for stalled PRs,
and triggers self-healing actions through the JPL 4-tier fault model.

## Implementation: in-process timer loop

The heartbeat is implemented in `src/core/heartbeat.ts` as the `Heartbeat`
class. It is constructed with a `DispatchEngine`, `AgentRegistry`, and
`GuardrailEngine`, and exposes `start()` / `stop()` lifecycle methods backed
by `setInterval`.

The OpenCode session hooks (`src/integrations/opencode-hooks.ts`) start the
heartbeat when Nemo or the Watch Officer comes online, and stop it on
session shutdown.

### Configuration

| Option | Default | Purpose |
|--------|---------|---------|
| `checkIntervalMs` | `60000` (1 min) | Base health-check interval. The GitHub issue poll runs on a 5-minute cadence inside the same loop. |
| `stallTimeoutMs` | `1800000` (30 min) | How long before a work item is considered stalled. |
| `circuitBreakerThreshold` | `3` | Consecutive failures before the circuit breaker trips. |
| `circuitBreakerResetMs` | `300000` (5 min) | How long the circuit breaker stays open. |

### What the Heartbeat Checks

1. **New `autodev-request` issues** — polls the project repo via `gh issue list --label autodev-request --state open`. New issues are routed to Nemo for triage.
2. **PRs awaiting review** — `gh pr list --label autodev-review --state open`.
3. **Stalled PRs** — `gh pr list --label autodev-ci-running --state open` with a 30-minute stall threshold.
4. **Blocked issues** — `gh issue list --label autodev-blocked --state open`.
5. **Work-item stalls** — inspects the dispatch engine's active work items and flags any that have not been updated within `stallTimeoutMs`.
6. **Engine health** — dispatch engine, guardrail engine, agent registry, and filesystem checks.
7. **Self-healing** — classifies each unhealthy result into a fault tier (1–4) and triggers the appropriate recovery action.

## Heartbeat Summary Format

```
AutoDev Heartbeat — <ISO timestamp>
  New issues:      <count> autodev-request
  Open PRs:        <count> in review, <count> ci-running, <count> ready
  Blocked:         <count> issues, <count> PRs
  Engine health:   <healthy/degraded/down>
  Lore drafts:      <count> pending review
```

If no work items exist and no issues require attention:

```
AutoDev heartbeat: idle. No pending work.
```