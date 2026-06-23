# Aikido Safe Chain — Open Source Supply Chain Protection
**Source:** https://www.npmjs.com/package/@aikidosec/safe-chain
**Fetched:** 2026-06-17
**Component:** aikido

## Overview

Aikido Safe Chain is an open-source tool that blocks malware on developer laptops
and CI/CD pipelines. Supports npm and PyPI (more package managers coming).

Key capabilities:
- Block malware on developer laptops and CI/CD
- Supports npm and PyPI
- Blocks packages newer than 48 hours without breaking your build
- Tokenless, free, no build data shared

## Need protection beyond npm & PyPI?

Aikido Device Protection builds on Safe Chain, extending package and extension
security across more ecosystems: npm, PyPI, VS Code, Open VSX (Cursor, Windsurf,
Kiro, VS Codium, ...), Maven, NuGet, Chrome extensions, Go, Skills.sh AI skills,
Ruby, Rust, and more.

Get centralized policy management, request-and-approval workflows, and
visibility across every developer workstation in your org. Powered by the same
Aikido Intel feed. Deploy it manually or manage it through your MDM tool
(Jamf, Fleet, or Intune).

## Supported Package Managers

### Node.js / JavaScript
- npm
- npx
- yarn
- pnpm
- pnpx
- rush
- rushx
- bun
- bunx

### Python
- pip
- pip3
- uv
- poetry
- uvx
- pipx
- pdm

## Installation

### Unix/Linux/macOS

```bash
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.8/install-safe-chain.sh | sh
```

### Windows (PowerShell)

```powershell
iex (iwr "https://github.com/AikidoSec/safe-chain/releases/download/1.5.8/install-safe-chain.ps1" -UseBasicParsing)
```

The install commands reference a specific release. To install a different
version, replace `1.5.8` with your desired version number. All available versions
are on the releases page: https://github.com/AikidoSec/safe-chain/releases

### Download integrity

The install scripts are served from a versioned release URL
(`releases/download/1.5.8/...`). GitHub releases are immutable — once an artifact
is published at a versioned URL it cannot be modified or replaced.

### Verify the installation

1. **Restart your terminal** to start using the Aikido Safe Chain.
   This ensures shell aliases for supported package managers are loaded correctly.
2. **Verify the installation** by running:
   ```bash
   npm safe-chain-verify
   pnpm safe-chain-verify
   pip safe-chain-verify
   uv safe-chain-verify
   # Any other supported package manager: {packagemanager} safe-chain-verify
   ```
   The output should display "OK: Safe-chain works!" confirming proper install.
3. **(Optional) Test malware blocking** by attempting to install a test package:
   ```bash
   # For JavaScript/Node.js:
   npm install safe-chain-test
   # For Python:
   pip3 install safe-chain-pi-test
   ```
   Safe Chain should block the installation of these test packages as they are
   flagged as malware.

Check the installed version with:
```bash
safe-chain --version
```

## How it works

### Malware Blocking

The Aikido Safe Chain works by running a lightweight proxy server that
intercepts package downloads from the npm registry and PyPI. When you run a
supported package manager command, all package downloads are routed through
this local proxy, which verifies packages in real-time against **Aikido Intel —
Open Sources Threat Intelligence** (https://intel.aikido.dev/?tab=malware). If
malware is detected in any package (including deep dependencies), the proxy
blocks the download before the malicious code reaches your machine.

### Minimum package age

Safe Chain applies minimum package age checks to supported ecosystems.
- npm-based package managers: suppresses versions newer than configured minimum
  age from package metadata during normal resolution; blocks direct download
  requests using a cached list of newly released packages.
- Python package managers: suppresses too-young files and releases from PyPI
  metadata responses; blocks direct package download requests.

Default minimum package age is 48 hours. Provides an additional security layer
during the critical period when newly published packages are most vulnerable to
containing undetected threats. Configurable or can be bypassed entirely.

### Shell Integration

The Aikido Safe Chain integrates with your shell to provide a seamless
experience. Sets up aliases for supported commands so they are wrapped by Safe
Chain commands, which manage the proxy server before executing the original
commands.

Supported shells:
- Bash
- Zsh
- Fish
- PowerShell
- PowerShell Core

More info: https://github.com/AikidoSec/safe-chain/blob/main/docs/shell-integration.md

## Uninstallation

### Unix/Linux/macOS

```bash
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.8/uninstall-safe-chain.sh | sh
```

### Windows (PowerShell)

```powershell
iex (iwr "https://github.com/AikidoSec/safe-chain/releases/download/1.5.8/uninstall-safe-chain.ps1" -UseBasicParsing)
```

**Restart your terminal** after uninstalling to ensure all aliases are removed.

## Configuration

### Logging

Control output with `--safe-chain-logging` flag or `SAFE_CHAIN_LOGGING` env var.

Priority order:
1. **CLI Argument** (highest priority)
   - `--safe-chain-logging=silent` — suppresses all output except when malware blocked
   - `--safe-chain-logging=verbose` — detailed diagnostic output
2. **Environment Variable**
   ```bash
   export SAFE_CHAIN_LOGGING=verbose
   ```
   Valid values: `silent`, `normal`, `verbose`

### File Logging

Mirror output to a log file using `--safe-chain-log-file` or
`SAFE_CHAIN_LOG_FILE` env var. File logging is disabled by default.
File format (`--safe-chain-log-file-format`): `json` (default) or `plain`.
File verbosity (`--safe-chain-log-file-verbosity`): `silent`, `normal`,
`verbose` (default). Independent from `--safe-chain-logging`.

Config file: `~/.safe-chain/config.json`

### Minimum Package Age

```bash
npm install express --safe-chain-minimum-package-age-hours=48
# or env var
export SAFE_CHAIN_MINIMUM_PACKAGE_AGE_HOURS=48
# or config file
# { "minimumPackageAgeHours": 48 }
```

#### Excluding Packages

Exclude trusted packages from minimum age filtering via env var or config file
(both are merged). Use `@scope/*` to trust all packages from an org:

```bash
export SAFE_CHAIN_MINIMUM_PACKAGE_AGE_EXCLUSIONS="@aikidosec/*"
```

```json
{
  "npm": { "minimumPackageAgeExclusions": ["@aikidosec/*"] },
  "pip": { "minimumPackageAgeExclusions": ["requests"] }
}
```

### Custom Registries

Configure Safe Chain to scan packages from custom or private registries.
Supported ecosystems: Node.js, Python.

```bash
export SAFE_CHAIN_NPM_CUSTOM_REGISTRIES="npm.company.com,registry.internal.net"
export SAFE_CHAIN_PIP_CUSTOM_REGISTRIES="pip.company.com,registry.internal.net"
```

### Malware List Base URL

Configure Safe Chain to fetch malware databases and new packages lists from a
custom mirror URL. Allows hosting your own copy of the Aikido malware database.

The base URL should point to a server that mirrors the structure of
`https://malware-list.aikido.dev/`, including:
- `/malware_predictions.json` (JavaScript ecosystem malware database)
- `/malware_pypi.json` (Python ecosystem malware database)
- `/releases/npm.json` (JavaScript new packages list)
- `/releases/pypi.json` (Python new packages list)

### Custom Install Directory

By default, Safe Chain installs itself into `~/.safe-chain`. Change with
`--install-dir` flag. Useful for system-wide installations (e.g. inside a Docker
image) or when avoiding conflicts with other tools.

## Usage in CI/CD

Use the `--ci` flag to automatically configure Aikido Safe Chain for CI/CD
environments. This sets up executable shims in the PATH instead of shell aliases.

### Unix/Linux/macOS (GitHub Actions, Azure Pipelines, etc.)

```bash
curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.8/install-safe-chain.sh | sh -s -- --ci
```

### Windows (Azure Pipelines, etc.)

```powershell
iex "& { $(iwr 'https://github.com/AikidoSec/safe-chain/releases/download/1.5.8/install-safe-chain.ps1' -UseBasicParsing) } -ci"
```

### Supported CI Platforms

- GitHub Actions
- Azure Pipelines
- CircleCI
- Jenkins
- Bitbucket Pipelines
- GitLab Pipelines

### GitHub Actions Example

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: "22"
    cache: "npm"

- name: Install safe-chain
  run: curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.8/install-safe-chain.sh | sh -s -- --ci

- name: Install dependencies
  run: npm ci
```

### PYPI Configuration File

If you rely on a `pip.conf` file for pip configuration you must point pip at it
explicitly via the `PIP_CONFIG_FILE` environment variable so Safe Chain can
merge it. Safe Chain runs pip behind its MITM proxy and writes a temporary pip
configuration file to inject its certificate and proxy settings.

## Package Metadata

- **npm package:** `@aikidosec/safe-chain`
- **License:** AGPL-3.0-or-later
- **Repository:** https://github.com/AikidoSec/safe-chain
- **Homepage:** https://github.com/AikidoSec/safe-chain#readme

## Troubleshooting

See the Troubleshooting Guide:
https://github.com/AikidoSec/safe-chain/blob/HEAD/packages/safe-chain/docs/troubleshooting.md

## Report Issues

1. Visit GitHub Issues: https://github.com/AikidoSec/safe-chain/issues
2. Include:
   - Operating system and version
   - Shell type and version
   - `safe-chain --version` output
   - Output from verification commands
   - Verbose logs of the failing command (add `--safe-chain-logging=verbose`)