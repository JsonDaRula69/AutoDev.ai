# Reference Documentation

This directory holds **immutable source of truth** — API contracts, design specs, and technical documentation that AutoDev agents consult before making decisions.

## Contents

During onboarding, the orientation agent will populate this directory with reference material from the target project. Typical contents include:

- `project/` — Authoritative design docs, architecture specifications, decision records
- `<dependency>/` — Dependency documentation, API specs, SDK references

## Rules

1. **Never modify reference files.** They are the immutable source of truth.
2. **Always check reference before making decisions.** If the answer is here, it overrides agent judgment.
3. **If reference contradicts code, flag it.** Do not silently fix either side.
