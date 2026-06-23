# AutoDev Knowledge Architecture

How the AutoDev team stores, retrieves, and guards the project knowledge base. Design decisions here are ratified — do not modify without human approval.

---

## The Problem

Any project has extensive documentation: design decisions, system architecture, dependency contracts, API specifications, operational runbooks, and incident history. This body of knowledge cannot fit in a single agent context window (or even a large one). It must be:

1. **Preloadable** — existing project knowledge must be seeded into the system before any agent session runs
2. **Accessible on demand** — agents query for what they need, not load everything
3. **Trust-ranked** — ratified decisions are treated as truth; agent guesses are clearly labeled
4. **Modification-guarded** — agents cannot silently change ratified decisions
5. **Conflict-aware** — when implementation contradicts a ratified decision, the conflict surfaces

No single existing tool solves all five. The architecture below combines three systems, each covering the dimension it handles best.

---

## Architecture: Five Tiers, Three Systems

```
┌─────────────────────────────────────────────────────────────────────┐
│ Tier 1: Bootstrap (always in context)                               │
│ AGENTS.md, projectbrief.md, activeContext.md, techContext.md       │
│ ~2-4KB total. Identity and standing orders.                         │
│ Manually maintained. Magic Context auto-injects                     │
│ ARCHITECTURE.md and STRUCTURE.md at session start.                  │
├─────────────────────────────────────────────────────────────────────┤
│ Tier 1.5: Working Memory (Magic Context)                           │
│ Auto-captured session knowledge, dreamer-consolidated,              │
│ semantically recalled. Persists across sessions.                    │
│ Grows organically from active work.                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Tier 2: Ratified Decisions (Loreguard)                              │
│ Design decisions, ADRs, deprecation notices, incident              │
│ lessons, architectural constraints.                                │
│ Human-approved. Agents READ freely, CANNOT modify.                  │
├─────────────────────────────────────────────────────────────────────┤
│ Tier 3: Technical Reference (filesystem + Context7)                │
│ API contracts, system architecture, dependency specs.              │
│ Read on demand. Not loaded unless queried.                          │
├─────────────────────────────────────────────────────────────────────┤
│ Tier 4: Code-level Knowledge (AST grep + LSP)                      │
│ Live queries against the actual codebase.                           │
│ Never stored — always derived from current code.                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Tier 1 vs Tier 1.5: Memory files and Magic Context

| Aspect | `.autodev/memory/` files | Magic Context |
|--------|-------------------------|---------------|
| **Purpose** | Project identity, current phase, key constraints | Working context, session continuity, semantic recall |
| **Who writes** | Human or explicitly by agent after ratification | Historian auto-extracts; agent `ctx_memory write` |
| **How loaded** | Referenced in AGENTS.md; agent reads on demand | Auto-injected as `<project-memory>` block at session start |
| **Trust level** | Human-curated = high trust | Working context = low trust, must not contradict Loreguard |
| **Modification** | Edit the .md files directly | `ctx_memory write` / auto-archive |
| **Size** | ~2-4KB total (size-gated) | Grows organically, managed by dreamer |

**Rule:** `.autodev/memory/` is the human-curated bootstrap. Magic Context is the organic working memory. If they conflict, `.autodev/memory/` overrides Magic Context, and Loreguard overrides both.

---

### Why three systems instead of one

| Dimension | Magic Context | Loreguard | Files + Context7 |
|-----------|--------------|-----------|-------------------|
| **Preloading** | No mechanism — memories only come from session work or agent `ctx_memory write` | `loreguard sync import` from `.loreguard/` markdown | Files are preloaded by definition — they exist in the repo |
| **Retrieval** | Semantic search via embeddings — high recall, fuzzy matching | Exact keyword + tag search — high precision, low recall | `rg` or direct file reads — exact, but you must know what to look for |
| **Trust model** | None — any agent can write any memory | Full — human-ratified, agent-suggested, conflict-flagged | Files are immutable truth (reference/) or editable docs (memory/) |
| **Modification** | `ctx_memory write`, auto-archive, dreamer consolidation | `suggest_lore` → draft → `loreguard review` → ratify | Direct file edit (reference/ is immutable; memory/ is editable) |
| **Persistence** | Across sessions, embedded DB | Across sessions, SQLite DB | Across sessions, git-tracked |

No single system covers all five requirements. Magic Context is best for organic working memory. Loreguard is best for trust-ranked ratified decisions. Files are best for preloaded immutable truth. Together they cover the full surface.

---

## Phase Routing

### Phase 1: Cold start (onboarding)

When AutoDev first connects to a project, all tiers are empty. The orientation agent:

1. **Investigates** the project codebase, README, docs, config
2. **Asks** the user open-ended questions about architecture, constraints, and conventions
3. **Populates** `.autodev/reference/` with project documentation
4. **Writes** `.autodev/memory/` files with project context
5. **Creates** initial ADRs for key design decisions via `suggest_lore`
6. **Lets** Magic Context learn organically from ongoing work

### Phase 2: Routing during implementation

| Knowledge type | Route to | Example |
|---------------|----------|---------|
| A design decision was made | `suggest_lore` (draft) → human ratifies → `search_lore` (truth) | "We chose SQLite over Postgres for per-agent isolation" |
| A dependency spec needs checking | Read `.autodev/reference/<dep>/` | "What does the Kalshi WebSocket V2 auth flow look like?" |
| Past session context | `ctx_search` (clue) → verify against lore | "Did we try using batch endpoints before?" |
| Code-level question | AST grep, LSP, `rg` | "Where is the settlement calculation?" |
| A conflict between code and lore | `report_conflict` → human decides | "Code uses REST but lore says WebSocket-first" |

---

## Guardrails

### Guardrail 1: Reference docs are immutable truth

All contents of `.autodev/reference/` are immutable. Agents can read them but never modify them. If reference docs need updating, a human must do it.

### Guardrail 2: Memory files are curated, not auto-generated

`.autodev/memory/` files (projectbrief, techContext, activeContext) are high-trust. Agents can suggest edits, but a human should verify before committing changes. These files are size-gated at ~4KB total.

### Guardrail 3: Loreguard has a strict trust pipeline

1. Agent calls `suggest_lore` → creates a **draft** (hidden from search)
2. Human reviews via `loreguard review`
3. Only after approval does it become `active` and visible to all agents
4. Conflicts: `report_conflict` → original is NEVER mutated → human decides

### Guardrail 4: Search before deciding

Before making any design decision, the agent MUST:

1. Search Loreguard — ratified decisions
2. Search reference docs — `.autodev/reference/`
3. Search Magic Context — past session knowledge
4. If still uncertain — label `autodev-blocked`, comment with the question, present to human

Agent MUST NOT:
- Make up a decision and implement it
- Assume "the old way is fine" without checking
- Choose between approaches without escalating
- Contradict existing lore without reporting the conflict

### Guardrail 5: New knowledge flows through ratification

When an agent discovers something worth recording as a decision:

1. Use `suggest_lore` — creates a **draft**, hidden from search
2. Human reviews via `loreguard review`
3. Only after approval does it become `active` and visible to all agents

For working context (not decisions), use `ctx_memory write` in Magic Context. This records the observation but without the trust guarantees of Loreguard.

### Guardrail 6: Conflicts are surfaced, not buried

When code contradicts ratified lore:

1. Use `report_conflict` — creates draft counter-record
2. Original is NEVER mutated
3. Human decides: update lore, fix code, or reject conflict

Agent MUST NOT silently "fix" code to match lore, or update lore to match code.

### Guardrail 7: Magic Context memories are clues, not truth

Magic Context has no trust model. Agents can write memories directly. Therefore:

- Magic Context memories are treated as **working context**, not **ratified decisions**
- If a Magic Context memory contradicts a Loreguard record, Loreguard wins
- If a Magic Context memory seems wrong, the agent should verify against code and lore
- Do not archive or update Magic Context memories just because they disagree with your current approach — they may be correct

---

## MCP Configuration

### Loreguard (Tier 2)

Configured in `.mcp.json` at project root. Path placeholders are replaced during setup.

### Magic Context (Tier 1.5)

Installed as an OpenCode plugin via `npx @cortexkit/magic-context@latest setup --harness opencode`. Provides:
- `ctx_memory` tool — write/update/archive/merge memories
- `ctx_search` tool — search memories, session history, git commits
- `ctx_reduce` tool — manage context window
- Auto-injected `<project-memory>` block at session start
- Historian + dreamer agents (hidden subagents)

No MCP configuration needed — it's a plugin, not an MCP server.

Config at project level: `magic-context.jsonc`. Embedding provider at user level: `~/.config/opencode/magic-context.jsonc`.

### Context7 (Tier 3 — third-party docs)

Available as `mcp__context7`. Use for any dependency documentation lookups.

### AST Grep (Tier 4)

Available as `mcp__ast_grep`. Use for structural code search.

---

## Cold Start: Seeding the Knowledge Base

When AutoDev first connects to a project, all tiers are empty. The cold start procedure:

### Step 1: Investigate the project

The orientation agent reads the project and catalogs:
- README, existing docs, ADRs
- Config files (package.json, pyproject.toml, etc.)
- Recent commits (patterns, deprecations)
- Incident history (if documented)
- API documentation and dependency specs

### Step 2: Ask questions

The agent asks open-ended questions to establish:
- Project purpose and criticality
- Architecture and key design decisions
- Technology stack and conventions
- Testing and deployment practices
- Constraints and non-negotiable rules

### Step 3: Route to tiers

Classify each piece of knowledge per the routing table in Phase 2.

### Step 4: Seed Loreguard

For each decision/rule/constraint, use `suggest_lore` with:
- `source` pointing to the original document
- `tags` from the project-specific tag set
- `confidence: "medium"` (agent-suggested, can't be high)

Human ratifies via `loreguard review`.

### Step 5: Seed reference files

Copy or link project documentation into `.autodev/reference/`.

### Step 6: Update bootstrap

Summarize critical constraints into Tier 1 files. Keep under 4KB.

### Step 7: Let Magic Context learn organically

As work happens, Magic Context captures what the agent actually learns. No preloading needed for this tier — it grows from use.

---

## Quality Gates for the Knowledge Base

| Gate | Check | Frequency |
|------|-------|-----------|
| Lore freshness | `loreguard doctor` — check for stale records | Every dream run |
| Reference accuracy | Agent flags code/reference conflicts via `report_conflict` | During implementation |
| Bootstrap size | `wc -c AGENTS.md CONTEXT.md .autodev/memory/*.md ARCHITECTURE.md STRUCTURE.md` — must stay under 32KB total | Before every commit that touches these files |
| Magic Context health | Magic Context doctor — check DB integrity, embedding status | Weekly |
| Draft queue depth | `loreguard review --list` — unreviewed drafts should not accumulate | Daily (heartbeat) |
| Conflict queue | `loreguard search --include-drafts tag:conflict-report` | During any PR review |
