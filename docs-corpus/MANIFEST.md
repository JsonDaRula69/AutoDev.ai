# docs-corpus Manifest

**Task:** T5 — Substrate documentation collection (knowledge map for T4 unified source tree)
**Created:** 2026-06-17
**Updated:** 2026-06-17 (T5c — added Aikido Security product documentation, 11 files)
**Total files:** 218

This manifest lists every document collected into `docs-corpus/` with its source path. Each entry preserves source attribution so T4 can trace any doc back to its origin.

---

## Structure

```
docs-corpus/
├── MANIFEST.md                       (this file)
├── opencode/                         OpenCode fork substrate
│   ├── README.md                     Overview + 24-package relevance analysis (all 24 documented)
│   ├── api-types/                    @opencode-ai/sdk .d.ts + openapi.json
│   └── packages/                     24 packages documented (8 KEEP + sdk + 15 others)
├── omo/                              OmO (oh-my-openagent) vendored substrate
│   ├── README-overview.md            AutoDev-context synthesized overview
│   ├── docs/                         Full OmO docs tree
│   ├── packages/                     Per-package AGENTS.md (15)
│   └── plugin/                       omo-codex plugin + 21 SKILL.md
├── magic-context/                    @cortexkit/opencode-magic-context
├── loreguard/                        LoreguardStore + MCP config
├── autodev/                          AutoDev architecture + config + reference
│   ├── config/                       6 config files
│   └── reference/                    4 reference docs
├── skills/                           5 AutoDev skill definitions
├── agents/                           26 agent definition files (13 .md + 13 .yaml)
├── engines/                          4 engine source files + 4 API docs
└── aikido/                           Aikido Security product documentation (11 files)
```

---

## File Inventory (by source)

### Source 1: OpenCode Fork (`/tmp/opencode-unified/`)

Repo: `JsonDaRula69/opencode` (upstream `anomalyco/opencode`). 24 packages analyzed.

| Corpus Path | Source Path |
|---|---|
| `opencode/AGENTS.md` | `/tmp/opencode-unified/AGENTS.md` |
| `opencode/CONTEXT.md` | `/tmp/opencode-unified/CONTEXT.md` |
| `opencode/CONTRIBUTING.md` | `/tmp/opencode-unified/CONTRIBUTING.md` |
| `opencode/README-fork.md` | `/tmp/opencode-unified/README.md` |
| `opencode/SECURITY.md` | `/tmp/opencode-unified/SECURITY.md` |
| `opencode/STATS.md` | `/tmp/opencode-unified/STATS.md` |
| `opencode/README.md` | SYNTHESIZED — package relevance analysis (see below) |
| `opencode/packages/opencode/README.md` | `/tmp/opencode-unified/packages/opencode/README.md` |
| `opencode/packages/opencode/AGENTS.md` | `/tmp/opencode-unified/packages/opencode/AGENTS.md` |
| `opencode/packages/opencode/package.json` | `/tmp/opencode-unified/packages/opencode/package.json` |
| `opencode/packages/plugin/SOURCE-MAP.md` | GENERATED from `/tmp/opencode-unified/packages/plugin/` |
| `opencode/packages/plugin/package.json` | `/tmp/opencode-unified/packages/plugin/package.json` |
| `opencode/packages/server/SOURCE-MAP.md` | GENERATED from `/tmp/opencode-unified/packages/server/` |
| `opencode/packages/server/package.json` | `/tmp/opencode-unified/packages/server/package.json` |
| `opencode/packages/sdk/SOURCE-MAP.md` | GENERATED from `/tmp/opencode-unified/packages/sdk/` |
| `opencode/packages/cli/SOURCE-MAP.md` | GENERATED from `/tmp/opencode-unified/packages/cli/` |
| `opencode/packages/cli/package.json` | `/tmp/opencode-unified/packages/cli/package.json` |
| `opencode/packages/core/SOURCE-MAP.md` | GENERATED from `/tmp/opencode-unified/packages/core/` |
| `opencode/packages/core/package.json` | `/tmp/opencode-unified/packages/core/package.json` |
| `opencode/packages/tui/SOURCE-MAP.md` | GENERATED from `/tmp/opencode-unified/packages/tui/` |
| `opencode/packages/tui/package.json` | `/tmp/opencode-unified/packages/tui/package.json` |
| `opencode/packages/llm/README.md` | `/tmp/opencode-unified/packages/llm/README.md` |
| `opencode/packages/llm/AGENTS.md` | `/tmp/opencode-unified/packages/llm/AGENTS.md` |
| `opencode/packages/llm/package.json` | `/tmp/opencode-unified/packages/llm/package.json` |
| `opencode/packages/app/README.md` | `/tmp/opencode-unified/packages/app/README.md` (EXCLUDED from KEEP set) |
| `opencode/packages/app/AGENTS.md` | `/tmp/opencode-unified/packages/app/AGENTS.md` (EXCLUDED) |
| `opencode/packages/app/package.json` | `/tmp/opencode-unified/packages/app/package.json` (EXCLUDED) |
| `opencode/packages/web/package.json` | `/tmp/opencode-unified/packages/web/package.json` (KEEP) |
| `opencode/packages/web/README.md` | `/tmp/opencode-unified/packages/web/README.md` (Starlight starter readme) |
| `opencode/packages/web/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/web/` |
| `opencode/packages/ui/package.json` | `/tmp/opencode-unified/packages/ui/package.json` (KEEP) |
| `opencode/packages/ui/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/ui/` |
| `opencode/packages/storybook/package.json` | `/tmp/opencode-unified/packages/storybook/package.json` (EXCLUDED) |
| `opencode/packages/storybook/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/storybook/` |
| `opencode/packages/desktop/package.json` | `/tmp/opencode-unified/packages/desktop/package.json` (EXCLUDED) |
| `opencode/packages/desktop/README.md` | `/tmp/opencode-unified/packages/desktop/README.md` (EXCLUDED) |
| `opencode/packages/desktop/AGENTS.md` | `/tmp/opencode-unified/packages/desktop/AGENTS.md` (EXCLUDED) |
| `opencode/packages/desktop/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/desktop/` |
| `opencode/packages/enterprise/package.json` | `/tmp/opencode-unified/packages/enterprise/package.json` (EXCLUDED) |
| `opencode/packages/enterprise/README.md` | `/tmp/opencode-unified/packages/enterprise/README.md` (EXCLUDED) |
| `opencode/packages/enterprise/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/enterprise/` |
| `opencode/packages/console/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/console/` (6 sub-packages) |
| `opencode/packages/containers/README.md` | `/tmp/opencode-unified/packages/containers/README.md` (EXCLUDED) |
| `opencode/packages/containers/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/containers/` |
| `opencode/packages/docs/README.md` | `/tmp/opencode-unified/packages/docs/README.md` (EXCLUDED) |
| `opencode/packages/docs/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/docs/` |
| `opencode/packages/function/package.json` | `/tmp/opencode-unified/packages/function/package.json` (EXCLUDED) |
| `opencode/packages/function/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/function/` |
| `opencode/packages/http-recorder/package.json` | `/tmp/opencode-unified/packages/http-recorder/package.json` (EXCLUDED) |
| `opencode/packages/http-recorder/README.md` | `/tmp/opencode-unified/packages/http-recorder/README.md` (EXCLUDED) |
| `opencode/packages/http-recorder/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/http-recorder/` |
| `opencode/packages/identity/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/identity/` |
| `opencode/packages/slack/package.json` | `/tmp/opencode-unified/packages/slack/package.json` (EXCLUDED) |
| `opencode/packages/slack/README.md` | `/tmp/opencode-unified/packages/slack/README.md` (EXCLUDED) |
| `opencode/packages/slack/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/slack/` |
| `opencode/packages/stats/README.md` | `/tmp/opencode-unified/packages/stats/README.md` (EXCLUDED) |
| `opencode/packages/stats/AGENTS.md` | `/tmp/opencode-unified/packages/stats/AGENTS.md` (EXCLUDED) |
| `opencode/packages/stats/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/stats/` (3 sub-packages) |
| `opencode/packages/script/package.json` | `/tmp/opencode-unified/packages/script/package.json` (EXCLUDED) |
| `opencode/packages/script/SOURCE-STRUCTURE.md` | GENERATED from `/tmp/opencode-unified/packages/script/` |

**API Types (from AutoDev repo node_modules):**

| Corpus Path | Source Path |
|---|---|
| `opencode/api-types/client.d.ts` | `node_modules/@opencode-ai/sdk/dist/client.d.ts` |
| `opencode/api-types/error-interceptor.d.ts` | `node_modules/@opencode-ai/sdk/dist/error-interceptor.d.ts` |
| `opencode/api-types/index.d.ts` | `node_modules/@opencode-ai/sdk/dist/index.d.ts` |
| `opencode/api-types/process.d.ts` | `node_modules/@opencode-ai/sdk/dist/process.d.ts` |
| `opencode/api-types/server.d.ts` | `node_modules/@opencode-ai/sdk/dist/server.d.ts` |
| `opencode/api-types/openapi.json` | `/tmp/opencode-unified/packages/sdk/openapi.json` |

### Source 2: OmO (`vendor/oh-my-openagent/`)

Vendored unmodified npm install of `oh-my-openagent@4.10.0`.

| Corpus Path | Source Path |
|---|---|
| `omo/AGENTS.md` | `vendor/oh-my-openagent/AGENTS.md` |
| `omo/README.md` | `vendor/oh-my-openagent/README.md` |
| `omo/README-overview.md` | SYNTHESIZED — AutoDev-context overview |
| `omo/CHANGELOG.md` | `vendor/oh-my-openagent/CHANGELOG.md` |
| `omo/ROADMAP.md` | `vendor/oh-my-openagent/ROADMAP.md` |
| `omo/CONTRIBUTING.md` | `vendor/oh-my-openagent/CONTRIBUTING.md` |
| `omo/THIRD-PARTY-NOTICES.md` | `vendor/oh-my-openagent/THIRD-PARTY-NOTICES.md` |
| `omo/docs-AGENTS.md` | `vendor/oh-my-openagent/docs/AGENTS.md` |
| `omo/docs/manifesto.md` | `vendor/oh-my-openagent/docs/manifesto.md` |
| `omo/docs/model-capabilities-maintenance.md` | `vendor/oh-my-openagent/docs/model-capabilities-maintenance.md` |
| `omo/docs/guide/overview.md` | `vendor/oh-my-openagent/docs/guide/overview.md` |
| `omo/docs/guide/orchestration.md` | `vendor/oh-my-openagent/docs/guide/orchestration.md` |
| `omo/docs/guide/agent-model-matching.md` | `vendor/oh-my-openagent/docs/guide/agent-model-matching.md` |
| `omo/docs/guide/team-mode.md` | `vendor/oh-my-openagent/docs/guide/team-mode.md` |
| `omo/docs/guide/installation.md` | `vendor/oh-my-openagent/docs/guide/installation.md` |
| `omo/docs/reference/cli.md` | `vendor/oh-my-openagent/docs/reference/cli.md` |
| `omo/docs/reference/release-process.md` | `vendor/oh-my-openagent/docs/reference/release-process.md` |
| `omo/docs/reference/rules-injection-cross-module-comparison.md` | `vendor/oh-my-openagent/docs/reference/rules-injection-cross-module-comparison.md` |
| `omo/docs/reference/prompt-async-gate-rfc.md` | `vendor/oh-my-openagent/docs/reference/prompt-async-gate-rfc.md` |
| `omo/docs/reference/re-export-shim-inventory.md` | `vendor/oh-my-openagent/docs/reference/re-export-shim-inventory.md` |
| `omo/docs/reference/known-issues.md` | `vendor/oh-my-openagent/docs/reference/known-issues.md` |
| `omo/docs/reference/monitor.md` | `vendor/oh-my-openagent/docs/reference/monitor.md` |
| `omo/docs/reference/lazycodex-npm-reservation.md` | `vendor/oh-my-openagent/docs/reference/lazycodex-npm-reservation.md` |
| `omo/docs/reference/configuration.md` | `vendor/oh-my-openagent/docs/reference/configuration.md` |
| `omo/docs/reference/shared-core-multi-pr.md` | `vendor/oh-my-openagent/docs/reference/shared-core-multi-pr.md` |
| `omo/docs/reference/codex-telemetry.md` | `vendor/oh-my-openagent/docs/reference/codex-telemetry.md` |
| `omo/docs/reference/features.md` | `vendor/oh-my-openagent/docs/reference/features.md` |
| `omo/docs/legal/privacy-policy.md` | `vendor/oh-my-openagent/docs/legal/privacy-policy.md` |
| `omo/docs/legal/terms-of-service.md` | `vendor/oh-my-openagent/docs/legal/terms-of-service.md` |
| `omo/docs/troubleshooting/ollama.md` | `vendor/oh-my-openagent/docs/troubleshooting/ollama.md` |
| `omo/packages/AGENTS.md` | `vendor/oh-my-openagent/packages/AGENTS.md` |
| `omo/packages/claude-code-compat-core-AGENTS.md` | `vendor/oh-my-openagent/packages/claude-code-compat-core/AGENTS.md` |
| `omo/packages/lsp-core-AGENTS.md` | `vendor/oh-my-openagent/packages/lsp-core/AGENTS.md` |
| `omo/packages/lsp-daemon-AGENTS.md` | `vendor/oh-my-openagent/packages/lsp-daemon/AGENTS.md` |
| `omo/packages/lsp-tools-mcp-AGENTS.md` | `vendor/oh-my-openagent/packages/lsp-tools-mcp/AGENTS.md` |
| `omo/packages/mcp-client-core-AGENTS.md` | `vendor/oh-my-openagent/packages/mcp-client-core/AGENTS.md` |
| `omo/packages/model-core-AGENTS.md` | `vendor/oh-my-openagent/packages/model-core/AGENTS.md` |
| `omo/packages/omo-codex-AGENTS.md` | `vendor/oh-my-openagent/packages/omo-codex/AGENTS.md` |
| `omo/packages/omo-opencode-package.json` | `vendor/oh-my-openagent/packages/omo-opencode/package.json` |
| `omo/packages/openclaw-core-AGENTS.md` | `vendor/oh-my-openagent/packages/openclaw-core/AGENTS.md` |
| `omo/packages/rules-engine-AGENTS.md` | `vendor/oh-my-openagent/packages/rules-engine/AGENTS.md` |
| `omo/packages/skills-loader-core-AGENTS.md` | `vendor/oh-my-openagent/packages/skills-loader-core/AGENTS.md` |
| `omo/packages/team-core-AGENTS.md` | `vendor/oh-my-openagent/packages/team-core/AGENTS.md` |
| `omo/packages/tmux-core-AGENTS.md` | `vendor/oh-my-openagent/packages/tmux-core/AGENTS.md` |
| `omo/packages/utils-AGENTS.md` | `vendor/oh-my-openagent/packages/utils/AGENTS.md` |
| `omo/packages/web-AGENTS.md` | `vendor/oh-my-openagent/packages/web/AGENTS.md` |
| `omo/plugin/README.md` | `vendor/oh-my-openagent/packages/omo-codex/README.md` |
| `omo/plugin/MARKETPLACE.md` | `vendor/oh-my-openagent/packages/omo-codex/MARKETPLACE.md` |
| `omo/plugin/plugin-README.md` | `vendor/oh-my-openagent/packages/omo-codex/plugin/README.md` |
| `omo/plugin/skills/{21 SKILL.md files}` | `vendor/oh-my-openagent/packages/omo-codex/plugin/skills/*/SKILL.md` |

OmO plugin skills (21 files): ast-grep, comment-checker, debugging, frontend, git-master, init-deep, lcx-contribute-bug-fix, lcx-doctor, lcx-report-bug, lsp-setup, lsp, programming, refactor, remove-ai-slops, review-work, rules, start-work, ultraresearch, ulw-loop, ulw-plan, visual-qa.

### Source 3: Magic Context (`.opencode/node_modules/@cortexkit/opencode-magic-context/`)

Installed package `@cortexkit/opencode-magic-context@0.25.0`.

| Corpus Path | Source Path |
|---|---|
| `magic-context/README.md` | SYNTHESIZED — AutoDev-context overview |
| `magic-context/PACKAGE-README.md` | `.opencode/node_modules/@cortexkit/opencode-magic-context/README.md` |
| `magic-context/package.json` | `.opencode/node_modules/@cortexkit/opencode-magic-context/package.json` |
| `magic-context/config-schema.jsonc` | `.opencode/magic-context.jsonc` (AutoDev config, gitignored) |
| `magic-context/dist/index.d.ts` | `.opencode/node_modules/@cortexkit/opencode-magic-context/dist/index.d.ts` |
| `magic-context/dist/index.js` | `.opencode/node_modules/@cortexkit/opencode-magic-context/dist/index.js` |

### Source 4: Loreguard

`loreguard-mcp@0.1.0` NOT installed. AutoDev uses in-process wrapper `LoreguardStore`.

| Corpus Path | Source Path |
|---|---|
| `loreguard/README.md` | SYNTHESIZED — overview |
| `loreguard/mcp-config.json` | `.autodev/config/mcp.json` |
| `loreguard/loreguard-store.ts` | `src/plugin/engines/loreguard-store.ts` (full source) |

### Source 5: AutoDev Architecture Docs

| Corpus Path | Source Path |
|---|---|
| `autodev/ARCHITECTURE.md` | `.autodev/ARCHITECTURE.md` |
| `autodev/KNOWLEDGE-ARCHITECTURE.md` | `.autodev/KNOWLEDGE-ARCHITECTURE.md` |
| `autodev/AUDITOR.md` | `.autodev/AUDITOR.md` |
| `autodev/HEARTBEAT.md` | `.autodev/HEARTBEAT.md` |
| `autodev/SETUP.md` | `.autodev/SETUP.md` |
| `autodev/nautilus-charter.md` | `.autodev/nautilus-charter.md` |
| `autodev/ROOT-ARCHITECTURE.md` | `ARCHITECTURE.md` (repo root) |
| `autodev/STRUCTURE.md` | `STRUCTURE.md` (repo root) |
| `autodev/CONTEXT.md` | `CONTEXT.md` (repo root) |
| `autodev/AGENTS.md` | `AGENTS.md` (repo root) |
| `autodev/README.md` | `README.md` (repo root) |

### Source 5b: AutoDev Config Files

| Corpus Path | Source Path |
|---|---|
| `autodev/config/standing-orders.md` | `.autodev/config/standing-orders.md` |
| `autodev/config/guardrails.yaml` | `.autodev/config/guardrails.yaml` |
| `autodev/config/dispatch-rules.yaml` | `.autodev/config/dispatch-rules.yaml` |
| `autodev/config/debate-protocol.yaml` | `.autodev/config/debate-protocol.yaml` |
| `autodev/config/mcp.json` | `.autodev/config/mcp.json` |
| `autodev/config/team-spec.json` | `.autodev/config/team-spec.json` |

### Source 5c: AutoDev Reference Docs

| Corpus Path | Source Path |
|---|---|
| `autodev/reference/workflow-specification.md` | `.autodev/reference/workflow-specification.md` |
| `autodev/reference/onboarding-protocol.md` | `.autodev/reference/onboarding-protocol.md` |
| `autodev/reference/discord-setup.md` | `.autodev/reference/discord-setup.md` |
| `autodev/reference/README.md` | `.autodev/reference/README.md` |

### Source 6: Skills Documentation

| Corpus Path | Source Path |
|---|---|
| `skills/autodev-triage.md` | `.autodev/skills/autodev-triage/SKILL.md` |
| `skills/autodev-implement.md` | `.autodev/skills/autodev-implement/SKILL.md` |
| `skills/autodev-review.md` | `.autodev/skills/autodev-review/SKILL.md` |
| `skills/autodev-deploy.md` | `.autodev/skills/autodev-deploy/SKILL.md` |
| `skills/autodev-onboard.md` | `.autodev/skills/autodev-onboard/SKILL.md` |

### Source 7: Agent Definitions

13 agents, each with `.md` + `.yaml` (26 files total).

| Corpus Path | Source Path |
|---|---|
| `agents/{agent}.md` | `src/agents/{agent}.md` |
| `agents/{agent}.yaml` | `src/agents/{agent}.yaml` |

Agents: aronnax, boatswain, conseil, engineer, harbor-master, metis, momus, navigator, ned-land, nemo, oracle, quartermaster, watch-officer.

### Source 8: AutoDev Source Engine APIs

| Corpus Path | Source Path |
|---|---|
| `engines/embedding-layer.ts` | `src/plugin/engines/embedding-layer.ts` (full source) |
| `engines/embedding-layer-api.md` | SYNTHESIZED — API doc from source |
| `engines/vector-store.ts` | `src/plugin/engines/vector-store.ts` (full source) |
| `engines/vector-store-api.md` | SYNTHESIZED — API doc from source |
| `engines/loreguard-store.ts` | `src/plugin/engines/loreguard-store.ts` (full source) |
| `engines/loreguard-store-api.md` | SYNTHESIZED — API doc from source |
| `engines/openclaw-config.ts` | `src/plugin/config/schema/openclaw.ts` (full source) |
| `engines/openclaw-config-api.md` | SYNTHESIZED — API doc from source |
| `engines/index.ts` | `src/plugin/engines/index.ts` (engine barrel export) |

---

## OpenCode Package Relevance Analysis

See `opencode/README.md` for the full 24-package decision table (all 24 now have per-package `SOURCE-STRUCTURE.md` or `SOURCE-MAP.md` docs with real evidence). Summary:

| Decision | Count | Packages |
|---|---|---|
| **KEEP** | 10 | opencode, core, server, plugin, cli, tui, llm, sdk, web, ui |
| **KEEP (transitive)** | 2 | effect-drizzle-sqlite, effect-sqlite-node (verify core imports) |
| **EXCLUDE** | 13 | app, console, containers, desktop, docs, enterprise, function, http-recorder, identity, slack, stats, storybook, script |

---

## File Counts by Section

| Section | Files |
|---|---|
| opencode/ | 66 |
| omo/ | 70 |
| magic-context/ | 6 |
| loreguard/ | 3 |
| autodev/ | 21 |
| skills/ | 5 |
| agents/ | 26 |
| engines/ | 9 |
| aikido/ | 11 |
| MANIFEST.md | 1 |
| **TOTAL** | **218** |

(Well exceeds the >30 doc minimum requirement. opencode/ grew from 30 → 66 files with the addition of docs for all 15 previously-undocumented packages: web, ui, storybook, desktop, enterprise, console, containers, docs, function, http-recorder, identity, slack, stats, script — plus `app` which was already documented. `effect-drizzle-sqlite` and `effect-sqlite-node` (transitive KEEP candidates) are covered in the README decision table but do not have per-package dirs since they are transitive deps to verify via `core` imports during T4.)

---

## Source: Aikido Security Product Documentation

**Vendor:** Aikido Security (https://www.aikido.dev)
**Purpose:** AppSec platform documentation corpus — SAST, SCA, DAST, malware detection, threat intel, MCP plugin, AutoFix, Safe Chain, pricing.
**Fetched:** 2026-06-17 via `webfetch` (format=markdown), then condensed to clean markdown with source attribution headers.

| Corpus Path | Source URL |
|---|---|
| `aikido/platform-overview.md` | https://www.aikido.dev/platform |
| `aikido/sast.md` | https://www.aikido.dev/code/static-code-analysis-sast |
| `aikido/sca.md` | https://aikido.dev/scanners/open-source-dependency-scanning-sca |
| `aikido/dast.md` | https://www.aikido.dev/attack/surface-monitoring-dast |
| `aikido/malware-detection.md` | https://www.aikido.dev/code/malware-detection-in-dependencies |
| `aikido/threat-intel.md` | https://intel.aikido.dev/ |
| `aikido/sast-vs-dast.md` | https://www.aikido.dev/blog/sast-vs-dast-what-you-need-to-now |
| `aikido/mcp-plugin.md` | https://help.aikido.dev/ai-and-dev-tools/aikido-mcp |
| `aikido/autofix.md` | https://www.aikido.dev/code/autofix |
| `aikido/pricing.md` | https://www.aikido.dev/pricing |
| `aikido/safe-chain.md` | https://www.npmjs.com/package/@aikidosec/safe-chain |

Each file begins with a source-attribution header (title, Source URL, Fetched date, Component: aikido). Content covers Aikido's unified AppSec platform: SAST with AI reachability and AutoFix, SCA with reachability analysis and SBOMs, DAST with API discovery and authenticated scanning, supply-chain malware detection via Aikido Intel, the open-source Safe Chain package-manager wrapper, the MCP plugin for AI coding tools (including OpenCode MCP support), AI AutoFix for SAST/IaC/SCA/containers, and transparent flat-fee pricing.