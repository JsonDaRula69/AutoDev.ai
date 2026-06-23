# Aikido MCP Plugin — AI Coding Assistants
**Source:** https://help.aikido.dev/ai-and-dev-tools/aikido-mcp
**Fetched:** 2026-06-17
**Component:** aikido

## Overview

The Aikido MCP Plugin connects Aikido's security engine to AI coding tools. It
automatically scans AI generated code for vulnerabilities and hardcoded secrets
as soon as it is created.

AI assistants can review their own output, but that review is not perfect. Aikido
adds a reliable and consistent security layer that checks every generated snippet
with proven scanning rules.

## Why use Aikido MCP

- Deterministic, independent security checks on every AI generated snippet
  before it is committed
- Immediate detection and remediation of vulnerabilities and hardcoded secrets in
  AI assisted workflows
- Real time feedback, making AI driven development safer by default

## Available Tools

### aikido_full_scan
Scans local code files for vulnerabilities (SAST) and hardcoded secrets.

### aikido_issues_list
Fetches security issues from your Aikido feed.
- Filter by one scope: `repo_name`, `cloud_name`, `vm_name`, `domain_name`,
  `container_name`, or `workspace_name`
- Optionally narrow a repo scope to a single branch with `repo_branch_name`
- Pick one or more issue types: `sast`, `leaked_secret`, `iac`, `open_source`,
  `cloud`, `cloud_instance`, `docker_container`, `malware`, `eol`, `mobile`,
  `surface_monitoring`, `scm_security`, `license`, `ai_pentest`
- Page through results with `page` (zero-based)
- Returns each issue with title, type, severity, and remediation steps

### aikido_ignore_issue
Ignores a security issue in the feed. Requires `issue_id` and a `reason`.

### aikido_login
Starts the Aikido sign-in flow; returns region-specific sign-in URLs
(EU / US / ME) or confirms you're already signed in.

> Not all MCP tools are enabled by default. Admins can enable them on the
> permissions page: https://app.aikido.dev/settings/integrations/ide/mcp/permissions

## Example Prompts

### Scanning code
- "Use Aikido to scan this file for security issues"
- "Run an Aikido scan on my staged changes to check for secrets before I commit"
- "Scan the files I just edited with Aikido and link them to the `payments-api` repo"

### Reviewing issues by repo
- "Show me all critical Aikido issues in `payments-api`"
- "List any leaked secrets in `frontend-web` from Aikido"
- "What open source vulnerabilities does Aikido see in `api-gateway`?"
- "Show SAST and IaC issues in `infra-core` from Aikido"

### Reviewing issues by cloud, VM, or container
- "List all Aikido cloud issues in `prod-aws`"
- "Show malware findings on `web-server-01` from Aikido"
- "What end-of-life software is running in the `nginx-proxy` container per Aikido?"
- "Show me surface monitoring issues for `example.com` in Aikido"

### Combined workflows
- "Use Aikido to scan my current changes, then show existing critical issues in the same repo"
- "Check this PR with Aikido and compare against open SAST issues in the repo"

## Installation

### AI Platforms
- Anthropic Claude Code MCP
- Cursor MCP
- OpenAI Codex CLI MCP
- Gemini CLI MCP
- JetBrains AI
- GitHub Copilot
- Mistral Vibe MCP
- **OpenCode MCP** — https://help.aikido.dev/ai-and-dev-tools/aikido-mcp/opencode-mcp.md

### Via Aikido IDE plugins
When the Aikido IDE plugin is installed you can use the Aikido Expansion Packs
to install the Aikido MCP server with one click. Currently available for:
JetBrains IDEs, VS Code and variants (Windsurf, Cursor, Kiro, AntiGravity).

Supported IDEs:
- Cursor IDE
- Google Antigravity IDE
- JetBrains IDE
- Kiro IDE
- VS Code IDE
- Windsurf IDE

### Manual installation for other platforms
For any other AI platform or custom MCP setup, refer to the npm package page for
detailed manual installation instructions: https://www.npmjs.com/package/@aikidosec/mcp

## Rules

Aikido IDE plugins will automatically add rules to every repository you open so
the LLMs are aware of the MCP and use it during generation.
Docs: https://help.aikido.dev/ai-and-dev-tools/aikido-mcp/automatically-handle-mcp-rules-in-ide.md

## Additional Documentation

- Complete documentation index (LLM-friendly): https://help.aikido.dev/llms.txt
- Markdown versions of documentation pages available by appending `.md` to URLs.