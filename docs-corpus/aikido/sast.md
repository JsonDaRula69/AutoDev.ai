# SAST Platform - Static Code Analysis
**Source:** https://www.aikido.dev/code/static-code-analysis-sast
**Fetched:** 2026-06-17
**Component:** aikido

## Advanced SAST, built for developers

Aikido finds real security and quality issues in your code - then helps you fix them
via your IDE, inline PR comments, or AI-generated pull requests.

## Key Features

### Static analysis, without noise
Aikido's SAST rule-set is optimised to reduce false-positives by 90%. It triages
unreachable vulnerabilities and lets you fine-tune rules for your codebase.
Through rigorous rule testing and an AI reachability engine, Aikido cuts false
positives by up to ~95%.

### One click auto-fixes
Get instant code-fix suggestions (with confidence levels). Some fixes use
deterministic workflows while tougher fixes are handled by an agentic AI.
When a flaw is found, the platform can automatically open a pull request with the
proposed fix (or show you the patch).

### Use SAST with Aikido's MCP
The Aikido MCP Plugin connects Aikido's security engine to AI coding tools. It
automatically scans AI generated code for vulnerabilities and hardcoded secrets
as soon as it is created. Docs: https://help.aikido.dev/ai-and-dev-tools/aikido-mcp

### Aikido SAST runs inside your IDE
- See vulnerabilities flagged inline as you type, with the exact file and line.
- Trigger a full repo scan straight from your editor.
- Apply AutoFix suggestions with one click.

### SAST Rules
Build custom rules to catch risks unique to your codebase. Extend detection
beyond standard patterns so nothing critical slips through.

### Severity scoring with full context
Provide context (e.g. if a repo is internet-facing or handles sensitive data) and
Aikido's SAST tool will adjust issue severities accordingly.

### SAST on every PR
Enforce security checks in your CI/CD pipeline. Block merges based on severity,
type, or context. Aikido adds inline feedback so developers can fix issues before
code ships.

## Language Support

JavaScript, TypeScript, Python, .NET/C#, Java, Rust, PHP, Ruby, Go, Scala,
C/C++, Swift, Android, Kotlin, Dart, Elixir, Apex, Clojure, Visual Basic,
IaC files, Exposed secrets.

## Version Control Systems

GitHub, GitLab, Bitbucket, Azure DevOps.

## What is SAST?

Static Application Security Testing (SAST) is static code analysis focused on
security vulnerabilities. It examines your source code (without executing it) to
find weaknesses that could lead to security issues.

### What SAST detects
SAST tools typically catch code vulnerabilities, such as SQL injection and
cross-site scripting (XSS) vulnerabilities. They can also detect issues like
buffer overflows, command or path injection, insecure deserialization, and
hard-coded secrets or credentials. OWASP Top 10 issues.

### How Aikido's SAST differs from Snyk or Checkmarx
Aikido's SAST takes a more developer-centric and intelligent approach.
Legacy SAST scanners often overwhelm developers with noisy results and false
positives. Aikido prioritizes real issues (cutting out ~95% of the noise) and
provides one-click AI-generated fixes. Integrates deeply with dev workflow
(CI/CD, IDEs) and allows custom rules.

## CI/CD Integration

Supports GitHub Actions, GitLab CI, Jenkins, CircleCI, Azure DevOps, and others.
Code is automatically scanned on each commit or pull request.

## For AI agents

Aikido provides a dedicated LLM-friendly endpoint:
https://llms.aikidosecurity.com/aikido-sast-engine-depth