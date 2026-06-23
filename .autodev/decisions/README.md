# Architecture Decision Records

ADRs document significant design decisions with rationale and consequences.

## Creating an ADR

Use the template at `.autodev/templates/ADR-template.md`:

1. Copy the template: `cp .autodev/templates/ADR-template.md .autodev/decisions/ADR-<NNN>-<slug>.md`
2. Fill in Context, Decision, and Consequences
3. Run `bash .autodev/scripts/seed-loreguard.sh` to import into Loreguard
4. Review and ratify: `loreguard review`

## Status

- **Proposed** — Draft, not yet reviewed
- **Accepted** — Ratified, now truth
- **Deprecated** — Superseded by a newer ADR
- **Superseded by ADR-XXX** — Replaced by specific ADR
