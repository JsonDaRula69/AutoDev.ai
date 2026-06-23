---
name: autodev-onboard
description: "Onboard a new project into AutoDev. The Harbor Master conducts a structured discovery interview with the project owner, scans the codebase, generates the knowledge base, configures guardrails, and verifies system health. This is the most critical skill — interview quality determines crew effectiveness. Triggers: 'autodev onboard', 'onboard project', 'bring project aboard', 'harbor master'."
---

# AutoDev Onboarding — The Harbor Master Protocol

## Objective

Bring a new project aboard the Nautilus by conducting a structured discovery interview, scanning the codebase, generating the knowledge base, configuring domain-specific guardrails, and verifying the system is ready for the crew to operate.

**The interview quality determines everything that follows.** A thorough interview produces good architecture decisions and quick deployment. A shallow interview produces design churn.

## Trigger

This skill fires when:

1. A user runs `autodev onboard` in a project directory
2. A user says "onboard this project", "bring project aboard", or "harbor master"
3. AutoDev is initialized in a directory that doesn't have a completed onboarding

## Pre-conditions

- The project directory exists and contains source code
- `autodev init` has been run (directory structure exists)
- The project owner is available for the interview

## Workflow

### Phase 0: Pre-Interview Codebase Scan (automated)

Before talking to the user, scan what you can see. This makes the interview more targeted — you ask about what you CAN'T see, not what you can.

```bash
# Language detection
find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.rs" -o -name "*.rb" -o -name "*.java" \) | sed 's/.*\.//' | sort | uniq -c | sort -rn

# Package manager detection
ls package.json requirements.txt pyproject.toml go.mod Cargo.toml Gemfile pom.xml 2>/dev/null

# Test runner detection
rg "pytest|jest|mocha|go test|cargo test|rspec" --type-add 'config:*.json,*.yaml,*.toml,*.cfg,*.ini' -l 2>/dev/null

# CI/CD detection
ls .github/workflows/ .gitlab-ci.yml Jenkinsfile .circleci/ 2>/dev/null

# Database detection
rg "sqlite|postgres|mysql|mongodb|redis|dynamodb|prisma|sqlalchemy|typeorm|sequelize" -l 2>/dev/null | head -10

# External API detection
rg "https?://[^[:space:]]+" -o --no-filename | sort | uniq -c | sort -rn | head -20

# Existing docs
ls README.md docs/ ARCHITECTURE.md CONTRIBUTING.md AGENTS.md .autodev/ 2>/dev/null

# Directory structure (top 2 levels)
find . -maxdepth 2 -type d | grep -v node_modules | grep -v .git | sort
```

Record scan results. Compare what you find against what the user tells you — contradictions are the most valuable signals.

### Phase 1: Project Identity Interview

Ask these questions IN ORDER. Each answer determines which follow-up questions are relevant.

**Q1: What does this system do?**
- Listen for: domain vocabulary, core value proposition, scale indicators
- Adaptive: If they mention "trading" or "financial" → add risk-control follow-ups. If "healthcare" → add compliance follow-ups. If "internal tool" → simplify downstream questions.

**Q2: What's at stake if it breaks?**
- Options: real money / user data / safety / uptime SLA / convenience only
- This determines the RISK TIER (Critical/High/Medium/Low) which controls guardrail intensity
- If real money → ask: "What's the maximum acceptable loss from a single bug?"
- If user data → ask: "What compliance requirements apply? (GDPR, HIPAA, SOC2)"
- If safety → ask: "What's the failure mode? (data corruption, physical harm, service outage)"

**Q3: Who depends on this system?**
- Listen for: end users, internal teams, external systems, downstream services
- Determines blast radius and CI strictness

**Q4: Is this greenfield, existing, or a migration?**
- Greenfield → fewer constraints, but more decisions needed
- Existing → more constraints, but more knowledge to discover
- Migration → both, plus version compatibility concerns

**Q5: What's your deployment model?**
- Listen for: cloud provider, containerization, serverless, bare metal, hybrid
- Determines navigator configuration and deployment protocol

**After Phase 1, classify the risk tier and state it explicitly:**
"This project is classified as [Critical/High/Medium/Low] risk because [reason]. This means [guardrail effect]."

### Phase 2: Architecture Reality Interview

**Rule: Ask about specific concrete facts, not abstract architecture.** People describe intentions, not reality. Verify everything against the codebase scan.

**Q6: What language(s) is the codebase written in?**
- Verify against scan. If mismatch → "I see [language] files but you mentioned [other language]. Which is primary?"

**Q7: How do you install dependencies and run tests?**
- Adaptive follow-ups based on answer:
  - Python → "venv, conda, or poetry? What Python version? Do you use type checking (mypy/pyright)?"
  - TypeScript → "strict mode? What bundler? What module system (ESM/CJS)?"
  - Go → "modules? What Go version? Any CGO dependencies?"
  - Multiple → "How are the different language components deployed? Together or separately?"

**Q8: How do you build and deploy?**
- Verify against CI/CD scan. If no CI found → "I don't see CI configuration. Is there an automated pipeline?"
- Ask: "Who has merge access? Who deploys to production?"

**Q9: What database(s) and storage do you use?**
- Verify against codebase scan for ORM configs, migration files, connection strings
- Ask: "Are there any schema migration concerns I should know about?"

**Q10: What external APIs or services does this depend on?**
- Verify against API URL scan
- For each API: "What's the auth method? Is it version-pinned? What happens when it goes down?"
- Listen for: rate limits, deprecation warnings, version pinning, fallback strategies

**Q11: What's NOT in the codebase that should be?**
- This catches missing tests, missing docs, missing config, missing infrastructure code
- Compare against scan for: test directory, CI config, Dockerfile, .env.example

### Phase 3: Constraint Mapping Interview

**This phase generates guardrail hard stops.** Missing a constraint here means the crew violates it later.

**Q12: What must AutoDev never touch?**
- Listen for: production databases, user data, trading engines, payment processors, secrets
- Each answer becomes a hard stop in the guardrail config
- If trading/financial: "What position limits or risk controls must never be bypassed?"
- If healthcare: "What PHI handling rules must be followed?"

**Q13: How does deployment actually happen in practice?**
- Not "how should it work" — "what do you actually do when you deploy"
- Determines: who approves, who clicks merge, what's the verification step
- If manual steps exist → document them as deployment protocol requirements

**Q14: What's your review process?**
- Listen for: required reviewers, automated checks, human approval gates
- Ask: "Are there any changes that always require human review?" (security, money, data)

**Q15: What communication channels should AutoDev use?**
- Discord channels, Slack channels, email, GitHub notifications
- Determines: liaison routing, bot-to-bot coordination channels

**Q16: What happens when something goes wrong?**
- Listen for: incident process, on-call rotation, escalation path
- Determines: Watch Officer configuration, escalation routing (agent-to-agent, NOT human)

### Phase 4: Knowledge Seeding Interview

**Q17: Do you have existing architecture documentation?**
- If yes → "Where is it? Is it current? What parts might be out of date?"
- Verify against codebase. Flag docs that don't match reality.

**Q18: Are there design decisions recorded anywhere?**
- ADRs, RFCs, decision logs, Slack threads
- If yes → ingest them as reference docs with appropriate confidence levels

**Q19: What's the most important thing for a new team member to understand?**
- This reveals priority ordering for the knowledge base
- The answer often surfaces tacit knowledge that isn't written anywhere

**Q20: What's the thing that's hardest to learn about this system?**
- Deep complexity that needs dedicated reference docs
- Often reveals hidden coupling or undocumented protocols

**Q21: What "everybody knows" assumptions aren't written down?**
- Tacit knowledge is the most dangerous kind in an autonomous system
- Every answer becomes an explicit reference doc

**Q22: Are there any docs that are known to be wrong or out of date?**
- Mark as suspect, flag for review rather than ingestion as truth

### Phase 5: Validation

**Step 1: Read back structured summary**

Present everything learned organized by:
- Identity: name, domain, risk tier, criticality
- Architecture: languages, dependencies, databases, APIs
- Constraints: hard stops, deployment protocol, review requirements
- Knowledge: existing docs, gaps, tacit assumptions
- Risk assessment: what could go wrong, what's the blast radius

**Step 2: Surface contradictions**

"I noticed these discrepancies between what you told me and what I found in the codebase:"
- List every mismatch
- Ask for clarification on each

**Step 3: Surface gaps**

"I don't have information about these areas that seem important:"
- List uncovered areas
- State what assumptions will be made if not clarified

**Step 4: State assumptions**

"If you don't provide additional information, I'll assume:"
- List default assumptions for each gap
- Make defaults conservative (more restrictive, not less)

**Step 5: Get explicit sign-off**

"Is this summary correct? What am I missing? What would you change?"

## Post-Interview Execution

### Generate Artifacts

After the interview is confirmed:

1. **Project charter** → `.autodev/reference/project-charter.md`
   - System identity, risk tier, constraints, deployment model
   - This becomes immutable truth after ratification

2. **Architecture snapshot** → `.autodev/reference/architecture-snapshot.md`
   - Verified against codebase scan, not just interview answers
   - Flag any areas where docs don't match reality

3. **Constraint map** → `.autodev/config/project-constraints.yaml`
   - Domain-specific hard/soft stops beyond the standard AutoDev set
   - Format matches guardrails.yaml for direct loading

4. **Agent customization** → `.autodev/agents/*.yaml`
   - Standard agents with project-specific narratives
   - Additional capabilities and constraints from interview

5. **Knowledge gaps** → `.autodev/reference/knowledge-gaps.md`
   - Priority-ordered list of what we don't know yet
   - Action items for Conseil (search and retrieve)

6. **Guardrail customization** → `.autodev/config/guardrails.yaml`
   - Merge standard guardrails with project-specific ones
   - Ensure no conflicts between standard and custom rules

7. **GitHub setup** → Labels, project board, CI hooks
   - Create standard label taxonomy
   - Configure branch protection if applicable
   - Set up CI integration

8. **Interview transcript** → `.autodev/evidence/<date>-onboarding/interview.md`
   - Full Q&A record for audit

9. **Onboarding summary** → `.autodev/evidence/<date>-onboarding/summary.md`
   - Phase 5 validation output with sign-off

### Verify System Health

Run `autodev doctor` and confirm all checks pass.

### Hand Off to Crew

1. Brief Nemo with the project charter
2. Brief Conseil with the knowledge gaps
3. Brief Metis with the constraint map for challenge
4. First task: Metis reviews the onboarding for gaps and hidden assumptions
5. If Metis finds issues → conduct follow-up interview to resolve

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Skipping the interview and just scanning the codebase | Misses tacit knowledge, constraints, and business rules that aren't in code |
| Only asking "what's your architecture?" | People describe intentions, not reality. Verify against code. |
| Not surfacing contradictions | "You said X, code shows Y" is the most valuable signal in the interview |
| Treating all projects the same risk tier | A trading bot needs different guardrails than a blog |
| Not asking "what must never happen?" | Each answer is a hard stop. Missing one means the crew violates it later. |
| Accepting docs without verifying against code | Stale docs are worse than no docs — they create false confidence |
| Not asking about tacit knowledge | "Everyone knows" things are the most dangerous assumptions in an autonomous system |
| Skipping Phase 5 validation | Unchecked assumptions compound into design churn |