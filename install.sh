#!/usr/bin/env bash
# AutoDev Installer — standalone bash bootstrap script.
#
# Detects Bun, auto-installs it if missing, installs autodev globally,
# verifies it is on PATH, and hands off to the doctor health check.
#
# This is a bash script (not POSIX sh) because `set -o pipefail` is a
# bashism. It runs before Bun exists and contains no TypeScript.

set -euo pipefail

# ── Header banner ────────────────────────────────────────────────────────
echo "========================================"
echo "          AutoDev Installer"
echo "========================================"
echo

# ── Step 1: Ensure Bun is available ──────────────────────────────────────
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun not found on PATH. Installing Bun..."

  # curl is required to fetch the Bun installer.
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to install Bun" >&2
    exit 1
  fi

  curl -fsSL https://bun.sh/install | bash

  # Bun's installer modifies shell rc files but does NOT update the current
  # shell's PATH. Export it explicitly so the rest of this script can find bun.
  export PATH="$HOME/.bun/bin:$PATH"
fi

# ── Step 2: Install autodev globally ──────────────────────────────────────
echo "Installing autodev globally..."
bun install -g autodev

# ── Step 3: Verify autodev is on PATH ──────────────────────────────────────
if ! command -v autodev >/dev/null 2>&1; then
  echo "global autodev install failed — check errors above" >&2
  exit 1
fi

# ── Step 4: Hand off to doctor ─────────────────────────────────────────────
echo
echo "Running doctor check..."
if ! autodev doctor; then
  echo "Run the doctor command again after fixing the issues above" >&2
  exit 1
fi

echo
echo "AutoDev is installed and healthy. Run \`autodev onboard\` to begin."