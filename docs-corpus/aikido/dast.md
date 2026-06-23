# Dynamic Application Security Testing (DAST) Tool
**Source:** https://www.aikido.dev/attack/surface-monitoring-dast
**Fetched:** 2026-06-17
**Component:** aikido

## Protect your App & APIs from attackers

Monitor your App & APIs to find vulnerabilities like SQL injection, XSS, and CSRF —
both on the surface and via authenticated DAST.

- Find OWASP top 10 risks
- Automated API Discovery (Rest & GraphQL)
- Scan your Web App and every API endpoint
- Prioritize critical front-end issues

## Your front end is a hacker's playground

Aikido's DAST scanner shows where your app is most vulnerable so you can close
security gaps before attackers find them.

- Check what a hacker could use to exploit
- Scan automatically without breaking your front-end
- Prevent exploits & vulnerabilities before they take place

## Automated API Discovery & Security

Go beyond regular code checks. Automatically discover & scan APIs for
vulnerabilities and flaws. Simulate real-world attacks, and scan every API
endpoint for common security threats.

- Get updated Swagger docs / OpenAPI specs
- Find more vulnerabilities with context-aware DAST
- Reduce manual work

## DAST Features

### Know what's exposed. So you can fix what matters.
Aikido's DAST scans give you a full overview on what's exposed, and shouldn't be.
Protect your REST & GraphQL endpoints.

### Protect self-hosted apps
Nuclei-based scanner checks your self-hosted apps for common vulnerabilities.
Supports: WordPress, Jira, Laravel, GitLab, Magento, Prestashop, Grafana,
Woocommerce, Nginx, Drupal, Joomla.

### Authenticated DAST
Test if logged in users can break your application or access sensitive data. The
scanner logs in as a real user, exposing deeper vulnerabilities and ensuring the
security of your JWT tokens.

### Actionable advice
Translates complex security slang into human-readable language so you can
easily understand the problem and if it affects you.

### Automatic Scans
Once configured, the DAST scans run daily and notify you only when there are new
relevant vulnerabilities. Choose alerts: Email, Slack, Teams.

### Toxic combinations
Toxic combos are vulnerabilities that, combined, create critical threats.
Think of an SQL injection vulnerability combined with a misconfigured admin panel.
Aikido's DAST marks these findings as more critical.

### Dangling Domains
Prevent subdomain takeovers. Scan DNS records to find subdomains pointing to
dead services aka dangling domains.

### Safe to run in production
Aikido tests your front-end for common DAST vulnerabilities but doesn't perform
tests that could break your app, like automated SQL injection attempts.

### AI Pentesting
Get a real pentest in hours, not weeks. Autonomous AI agents run human-level
tests at machine speed - with an audit-ready SOC2/ISO report.

## How Aikido's DAST works

Aikido's DAST (also called Surface Monitoring) doesn't simulate malicious
payloads on your frontend itself, but it does actively test your APIs. For API
scanning, it sends controlled malicious payloads to find weaknesses. It
interacts with your application through HTTP and APIs, injecting test inputs and
observing how your app responds.

## Is it safe to run on a live site?

Yes — Aikido's DAST is designed not to stress or break your production site. The
scanner avoids destructive tests; for example, it does not perform brute-force
SQL injection that could crash your database.

## CI/CD vs Staging

For most teams, recommended to run on staging or production endpoints, rather
than inside CI/CD pipeline. Current DAST is designed to scan live, internet-facing
apps. Local DAST scanning (which could run in CI) is planned for Q4.

## Scan speed

Most complete in about two minutes, and rarely more than four. Results appear
almost immediately.

## API scanning

For API scanning, you can either import an OpenAPI specification (generated from
code or manually) or use Zen for endpoint detection. Once configured, tests
REST and GraphQL endpoints for vulnerabilities.

## Aikido's DAST vs OWASP ZAP or StackHawk

Aikido's DAST uses a subset of safe OWASP ZAP scans, then adds its own
de-noising and de-duplication so you only see relevant results. You get ZAP-level
detection without the noise, manual setup, or config management.

## Vulnerabilities DAST catches

OWASP Top 10 vulnerabilities for APIs: SQL injection, authentication and access
control issues, insecure configurations, and exposure of sensitive endpoints.
Frontend-specific scans are excluded; findings are targeted toward server-side
and API security. Full list: https://app.aikido.dev/domains/checks

## Authentication

Aikido doesn't support login scripts, but you can provide authentication
credentials so we can run additional tests — for example, checking delivered
tokens for common weaknesses. Toggle on "authenticated" rules in settings.