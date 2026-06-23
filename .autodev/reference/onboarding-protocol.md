# AutoDev Onboarding Protocol

**Status:** IMMUTABLE — Do not modify without human ratification via Loreguard.
**Ratified:** 2026-06-16

This document defines the Harbor Master's structured discovery process for onboarding new projects. The interview protocol is the most critical phase of onboarding — the quality of information gathered here determines whether the crew operates effectively or spends weeks in design churn.

---

## 1. Why the Interview Matters More Than the Scan

Scanning a codebase is mechanical. Asking the right questions is not.

A missed dependency or undocumented assumption doesn't surface as an error during onboarding — it surfaces three weeks into implementation as a design conflict, a rejected PR, or a deployment that breaks something the crew didn't know existed. The cost of a bad interview compounds over time.

**The interview is a progressive disclosure process.** Each answer opens new questions that are only relevant because of that answer. A trading bot needs risk-control questions that a blog doesn't. A medical system needs compliance questions that a dev tool doesn't. And a senior engineer needs different questions than a non-technical founder. The protocol must adapt on two axes: **project domain** and **user proficiency**.

---

## 2. The Proficiency Axis — Establish It First

Before you ask a single question about the project, you must understand who you're talking to. This is not optional and it is not a separate step — it is the framing that determines how every subsequent question is asked.

**Why this matters:** Ask a non-technical founder "what ORM are you using?" and you'll get confusion instead of information. Ask a principal engineer "how do you deploy?" with a paragraph explaining what deployment means and you'll lose credibility and waste their time. The vocabulary, depth, and framing of every question must match the user's fluency level.

### Proficiency Classification

| Level | Signals | Interview style |
|-------|---------|----------------|
| **Non-technical** | Doesn't write code, describes system in business terms, delegates all engineering | Use plain language. Ask what the system *does* and *why*, not *how*. Translate technical decisions into tradeoff explanations. Validate understanding by paraphrasing back in their terms. |
| **Technical (junior/mid)** | Writes code but doesn't architect systems, familiar with one stack, may not know alternatives | Use their stack's vocabulary. Explain tradeoffs when asking about decisions ("Why X over Y?"). Surface implicit decisions they may not realize they made. Don't assume familiarity with infrastructure, CI, or ops. |
| **Senior/Staff** | Architects systems, evaluates tradeoffs, understands the full stack, has opinions on tooling | Be direct. Ask about tradeoffs and rationale, not basics. Trust their answers but verify against code. Skip explanations of well-known concepts. Challenge assumptions — they expect it. |
| **Expert/Author** | Built the tools you're asking about, deep domain specialist, probably knows more than you about their corner | Ask what they want AutoDev to know, not what you need to discover. They'll tell you the important things directly. Don't explain their own system back to them. Focus on constraints and failure modes. |

### How to Establish Proficiency

Don't ask "what's your experience level?" — people are bad at self-assessment. Instead, infer from how they talk about their system in the first exchange:

- **Non-technical signals:** "My app does X", "the developers handle that", "I'm not sure how it works under the hood"
- **Junior/mid signals:** "I built it with React", "we use AWS", can describe their stack but not the alternatives they didn't choose
- **Senior/staff signals:** "We chose X because Y over Z", "the constraint was...", mentions tradeoffs unprompted, can describe the system at multiple abstraction levels
- **Expert signals:** "I wrote the library that...", "the standard approach doesn't work because...", pushes back on your questions with better framing

**If you can't tell from the first exchange, ask one calibrating question:**

> "Walk me through how a change goes from your local machine to production."

The answer tells you everything:
- "I push and it deploys" → non-technical or junior
- "We use GitHub Actions, it runs tests then deploys to ECS" → mid/senior
- "PR → CI matrix on 3 platforms → canary deploy to 5% → metric gates → full rollout, with manual approval gate for database migrations" → senior/staff

### How Proficiency Changes Every Phase

| Phase | Non-technical user | Senior engineer |
|-------|--------------------|----------------|
| **Project Identity** | "What does it do? What's at stake?" | "What's the core invariant? What can never happen?" |
| **Architecture** | "What language is it in? Where does the data live?" | "What's the consistency model? What's the failure mode of the stateful layer?" |
| **Constraints** | "What should AutoDev stay away from?" | "What invariants must never be violated? What are the blast radii?" |
| **Knowledge** | "What docs do you have? What's hardest to understand?" | "What design decisions are load-bearing? What would you change if you could?" |
| **Validation** | Read back in plain language, confirm understanding | Read back as constraint map, confirm invariants |

---

## 3. Interview Structure — Six Phases

### Phase 0: Pre-Interview Codebase Scan (automated)

Before talking to the user, scan what you can see. This makes the interview more targeted — you ask about what you CAN'T see, not what you can.

```bash
# Language detection
find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.rs" \) | sed 's/.*\.//' | sort | uniq -c | sort -rn

# Package manager detection
ls package.json requirements.txt pyproject.toml go.mod Cargo.toml 2>/dev/null

# Test runner detection
rg "pytest|jest|mocha|go test|cargo test" -l 2>/dev/null

# CI/CD detection
ls .github/workflows/ .gitlab-ci.yml Jenkinsfile 2>/dev/null

# Database detection
rg "sqlite|postgres|mysql|mongodb|redis|prisma|sqlalchemy|typeorm" -l 2>/dev/null | head -10

# External API detection
rg "https?://[^[:space:]]+" -o --no-filename | sort | uniq -c | sort -rn | head -20

# Existing docs
ls README.md docs/ ARCHITECTURE.md AGENTS.md .autodev/ 2>/dev/null
```

Record scan results. Compare what you find against what the user tells you — contradictions are the most valuable signals.

### Phase 1: User Proficiency (1-2 minutes)

**Goal:** Establish the user's technical fluency so every subsequent question is calibrated.

This is NOT a separate "getting to know you" step. It is the calibration that determines the vocabulary and depth of the entire interview.

| Question | Why it matters | What it determines |
|----------|---------------|-------------------|
| Walk me through how a change goes from local to production. | The level of detail in this answer reveals proficiency more reliably than self-assessment | Vocabulary and depth for all subsequent questions |
| (If still unclear) What's your role in the project? | Distinguishes technical owner from product owner from stakeholder | Whether to explain tradeoffs or just ask for decisions |

**Calibration rules:**
- If the user describes CI pipelines, canary deploys, or testing strategies unprompted → **Senior/Staff**. Be direct. Ask about tradeoffs and invariants.
- If the user names their stack but can't describe alternatives → **Technical (mid)**. Explain tradeoffs when asking about decisions. Surface implicit choices.
- If the user describes what the system does but not how → **Non-technical**. Use plain language. Focus on what and why, not how.
- If the user corrects your framing or pushes back on a question → **Expert**. Listen more than you ask. They're telling you what matters.

### Phase 2: Project Identity (5-7 minutes)

**Goal:** Understand what the system IS, what's at stake, and who cares.

**Questions adapt based on proficiency:**

| For non-technical users | For senior engineers |
|------------------------|-------------------|
| What does this system do? (One sentence) | What's the core invariant this system maintains? |
| What's at stake if it breaks? (money/data/safety/convenience) | What are the failure modes? What's the blast radius of each? |
| Who depends on this system? | What are the upstream/downstream dependencies? What breaks if you go down? |
| Is this greenfield, existing, or a migration? | What's the legacy surface area? What's the migration boundary? |
| What's your deployment model? | What's the infrastructure topology? How is state managed across deploys? |

**Risk tier classification from answers:**

| Risk tier | Criteria | Guardrail effect |
|-----------|----------|-----------------|
| **Critical** | Real money, patient data, safety-critical | Maximum hard stops, all decisions require debate, deployment needs liaison verification |
| **High** | User data, production systems, SLA-backed | Most hard stops, complicated+ decisions require debate |
| **Medium** | Internal tools, staging environments | Standard hard stops, complex decisions require debate |
| **Low** | Personal projects, prototypes | Minimal hard stops, debate optional |

### Phase 3: Architecture Reality (8-12 minutes)

**Goal:** Understand what actually exists, not what the docs say exists.

**Critical rule:** Do NOT ask "what's your architecture?" — people describe what they intended, not what they built. Instead, ask about specific concrete facts, then verify against the codebase.

**Questions adapt based on proficiency:**

| For non-technical users | For senior engineers |
|------------------------|-------------------|
| What language is it written in? | What's the primary language and what's the rationale for that choice? |
| How do you install things and run tests? | What's the dependency management strategy? How are dependencies pinned? |
| How do you build and deploy? | What's the CI/CD pipeline? What are the gates? What's the rollback strategy? |
| Where does your data live? | What's the persistence layer? What's the consistency model? What's the migration strategy? |
| What external services does it talk to? | What are the external dependencies? What's the auth model for each? What's the circuit breaker strategy? |
| What's missing that should be there? | What's the technical debt you're aware of? What's load-bearing but shouldn't be? |

**Adaptive follow-ups based on domain:**
- If "Python" → ask about virtual env management, version, type checking
- If "TypeScript" → ask about strict mode, module system, bundler
- If "microservices" → ask about service discovery, communication protocol, shared state
- If "real-time" → ask about WebSocket, event sourcing, message queues
- If "third-party API" → ask about auth method, rate limits, version pinning, fallback strategy

**For non-technical users, skip these and instead:**
- Ask "who built it?" to identify the technical contact
- Ask "can I talk to the engineer who set this up?" for a follow-up interview
- Ask "are there any docs that explain how it works?" to find existing knowledge

### Phase 4: Constraint Mapping (5-8 minutes)

**Goal:** Understand what AutoDev CAN'T do and what it MUST NOT do.

**Questions adapt based on proficiency:**

| For non-technical users | For senior engineers |
|------------------------|-------------------|
| What should AutoDev stay away from? | What invariants must never be violated? |
| How does a change actually get to production? | What's the deployment protocol? Who approves? What are the gates? |
| Who reviews changes? | What's the review policy? Are there changes that always require human review? |
| How do you communicate as a team? | What channels should AutoDev use for notifications? What's the escalation path? |
| What happens when something breaks? | What's the incident response? What's the MTTR target? What's the escalation topology? |

**Adaptive questions based on risk tier:**
- If Critical risk → ask about audit requirements, data retention policies, incident SLAs
- If High risk → ask about backup procedures, rollback protocols, monitoring
- If real-money system → ask about position limits, risk controls, compliance checks
- If healthcare → ask about HIPAA, PHI handling, audit trails
- If fintech → ask about SOC2, PCI-DSS, transaction logging

### Phase 5: Knowledge Seeding (5-10 minutes)

**Goal:** Understand what the project already knows and what's missing.

| For non-technical users | For senior engineers |
|------------------------|-------------------|
| Do you have documentation? Is it up to date? | What's the source of truth for the architecture? How confident are you that it's accurate? |
| Are there any important decisions written down? | What design decisions are load-bearing? Which ones would you revisit? |
| What's the most important thing for someone new to understand? | What's the tacit knowledge that isn't written anywhere? What would break if the senior engineer left? |
| What's hardest to learn about this system? | What's the most dangerous assumption someone could make about this system? |
| What does everyone know that isn't written down? | What are the undocumented invariants? What "everybody knows" but nobody wrote down? |
| Are any docs known to be wrong? | What's the technical debt you're aware of? What's documented but no longer true? |

### Phase 6: Validation (3-5 minutes)

**Goal:** Confirm understanding, surface contradictions, get explicit sign-off.

| Step | What to do |
|------|-----------|
| **Read back** | Present a structured summary of everything learned. Vocabulary and depth calibrated to user proficiency. |
| **Contradiction check** | Flag any answers that conflict with what the codebase scan found. "You said X but the repo shows Y." |
| **Gap check** | Flag any areas where no information was gathered. "I don't know anything about your testing strategy." |
| **Assumption surfacing** | State every assumption that will be made if the user doesn't provide information. "If you don't tell me your deployment process, I'll assume CI-driven with manual merge." |
| **Sign-off** | Get explicit confirmation. "Is this correct? What am I missing?" |

**For non-technical users:** Paraphrase back in plain language. "So the system handles customer orders, and if it goes down people can't buy things for [duration] — is that right?"

**For senior engineers:** Present the constraint map and invariant list. "These are the hard stops I'll enforce. Are these correct? Am I missing any?"

---

## 4. The Interview Is Not Linear

The phases above are in order, but the conversation isn't. A good interview flows based on what's being revealed:

1. **If the user mentions a constraint in Phase 2**, capture it immediately and add it to the constraint map. Don't wait for Phase 4.
2. **If a codebase scan contradicts a Phase 3 answer**, surface it in the moment, not at the end.
3. **If Phase 5 reveals a critical undocumented decision**, go back to Phase 3 and ask about its architectural implications.
4. **If the user's proficiency signals shift** (someone who started vague starts using precise technical language), recalibrate. Ask if they want to go deeper.

The Harbor Master maintains a running model of both the project AND the user that gets refined with each answer. Contradictions and gaps are surfaced as they're discovered, not batched for the end.

---

## 5. Common Failure Modes

| Failure mode | How it happens | What it causes |
|-------------|---------------|---------------|
| **The Happy Path Interview** | Only asking about what works, not what fails | No failure-mode guardrails, crew breaks production on first error |
| **The Shallow Architecture** | Accepting "we use microservices" without asking how they communicate | Service boundary assumptions wrong, PRs touch wrong services |
| **The Missing Constraint** | Not asking "what must never happen?" | Crew violates a business rule nobody told it about |
| **The Stale Knowledge** | Ingesting docs without verifying against code | Crew builds against architecture that no longer exists |
| **The Assumed Process** | Assuming deployment/review process based on industry norms | Crew conflicts with existing CI/CD or manual gates |
| **The Tacit Knowledge Gap** | Not asking "what does everyone here know that isn't written down?" | Crew makes decisions that violate unwritten team conventions |
| **The Risk Mismatch** | Treating a critical system like a low-risk project | Insufficient guardrails, debate skipped when it was needed |
| **The Proficiency Mismatch** | Asking a founder about their ORM config, or explaining CI to a principal engineer | User frustration, bad information, lost credibility — and from that point forward, the user tunes out |
| **The One-Size Interview** | Using the same questions for every user regardless of background | Non-technical users can't answer technical questions; technical users get impatient with basic ones |

---

## 6. Output Artifacts

The interview produces these artifacts, which become the project's initial knowledge base:

| Artifact | Location | Purpose |
|----------|----------|---------|
| Project charter | `.autodev/reference/project-charter.md` | Identity, risk tier, constraints — the immutable foundation |
| Architecture snapshot | `.autodev/reference/architecture-snapshot.md` | What actually exists (verified against code) |
| Constraint map | `.autodev/config/project-constraints.yaml` | Domain-specific hard/soft stops beyond the standard set |
| Guardrail customization | `.autodev/config/guardrails.yaml` | Standard guardrails + project-specific additions |
| Agent customization | `.autodev/agents/*.yaml` | Standard agents with project-specific narratives and RACI |
| Knowledge gaps | `.autodev/reference/knowledge-gaps.md` | What we don't know yet — priority list for Conseil |
| User profile | `.autodev/reference/user-profile.md` | Proficiency level, communication preferences, follow-up contacts |
| Interview transcript | `.autodev/evidence/<date>-onboarding/interview.md` | Full record of Q&A for audit |
| Onboarding summary | `.autodev/evidence/<date>-onboarding/summary.md` | Phase 6 validation output with sign-off |

---

## 7. Integration with Existing Crew Process

The onboarding interview is NOT a separate workflow. It feeds directly into the standing crew process:

1. **Harbor Master conducts interview** → Produces project charter and constraint map
2. **Nemo reviews and ratifies** → Approves risk tier, validates constraint map, assigns RACI
3. **Metis challenges assumptions** → Surfaces hidden intentions, detects interview gaps
4. **Aronnax designs phased onboarding** → Plans reference doc generation, label setup, CI configuration
5. **Ned Land executes** → Creates directory structure, generates config files, sets up labels
6. **Conseil seeds knowledge base** → Populates reference docs from interview + codebase scan
7. **Quartermaster sets up GitHub** → Creates labels, configures project board, sets up CI hooks

The interview is the first domino. Everything else follows from the quality of what it produces.
