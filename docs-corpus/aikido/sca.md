# Software Composition Analysis (SCA)
**Source:** https://aikido.dev/scanners/open-source-dependency-scanning-sca
**Fetched:** 2026-06-17
**Component:** aikido

## Cut 94% of your noise with reachability-based SCA & AutoFix

Secure third-party dependencies with reachability analysis, pre-CVE and malware
intelligence, SBOMs, and AI-assisted fixes.

## Multi-layered reachability analysis with one-click AutoFix

### Fix what's reachable. Ignore what's not.
Aikido traces actual call chains from your code into third-party packages to
determine which vulnerabilities are genuinely reachable at runtime and ignores
the ones you're not using.

### One-click fixes and auto-generated PRs.
Aikido creates PRs with safe, non-breaking version upgrades. For critical CVEs,
auto-merge keeps your exposure window near zero.

## What sets Aikido's SCA apart from other tools

### Intelligence — Aikido Intel pre-CVE protects you before public disclosure
- Pre-CVE detection from Aikido's own malware and vulnerability research
- Cross-referenced with NVD, GitHub Advisory, and 10+ external feeds
- 12k+ known malicious packages across npm, PyPI, GitHub Actions, and Maven

### Full Funnel — SCA integrated across your entire SDLC
- A single tool to scan across IDE, Git, CI, containers, and VMs
- Eliminates duplicate alerts across stages with correlated findings
- Reachability-based analysis so you only see exploitable risk

### SBOMs — Get full visibility into your software
- One-click SBOM generation in SPDX, VEX, CycloneDX, or CSV
- Import external SBOMs to consolidate visibility across teams
- Compliance-ready for EU CRA and US Executive Order requirements

## What is Software Composition Analysis (SCA)?

SCA is a health check for your open-source dependencies. It scans the libraries
and packages you pull into your project and flags known open-source
vulnerabilities, license landmines, and other risks.

## How Aikido's SCA scanner finds vulnerabilities

It identifies all the libraries and versions you're using (your dependency tree)
and cross-references each one against a constantly updated database of known
vulnerabilities (CVEs) and open-source threat intel. Includes direct and
transitive dependencies.

## CI/CD Integration

Hooks up with GitHub Actions, GitLab CI, Jenkins, CircleCI, Azure DevOps, or
whatever you use so dependency scanning runs automatically on every build or
pull request.

## AutoFix for Dependencies

Aikido doesn't just report issues — it helps fix them. For many issues, it
provides one-click AutoFix solutions: suggests the safe version to upgrade to
and can automatically open a pull request to bump the dependency.

## SBOM Generation

Aikido's SCA can generate a Software Bill of Materials (SBOM) with one click.
Exports in CycloneDX, SPDX, or plain CSV.

## Language and Package Manager Support

- JavaScript/TypeScript (npm, Yarn, pnpm)
- Python (pip, Poetry)
- Java/Scala/Kotlin (Maven, Gradle, sbt)
- .NET (NuGet)
- Ruby (Bundler)
- PHP (Composer)
- Go (Go modules)
- Rust (Cargo)
- Swift (CocoaPods and SwiftPM)
- Dart (pub)
- C/C++ projects (scanning for known dependencies without needing lockfiles)

## Comparison vs Snyk and Dependabot

Aikido's SCA offers similar coverage to Snyk's open-source scanning but auto-
prioritizes and shows just the real risks — less noise, more signal. Unlike
Dependabot (which simply automates version bump PRs), Aikido gives full context
on vulnerabilities, scans for malicious packages, checks licenses, and provides
one-click fixes.