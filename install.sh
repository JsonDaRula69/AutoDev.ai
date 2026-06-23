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

# ── Step 3: Set PI_CODING_AGENT_DIR for centralized ~/.AutoDev/ config ──────
# Export for current session so the install flow works without a terminal restart.
export PI_CODING_AGENT_DIR="$HOME/.AutoDev/agent"

# Persist to the user's shell rc file so future sessions inherit it.
# Bash vs zsh detection: $BASH_VERSION is set in bash, $ZSH_VERSION in zsh.
# POSIX sh and others fall back to ~/.profile.
SHELL_RC="$HOME/.profile"
if [ -n "$BASH_VERSION" ]; then
  SHELL_RC="$HOME/.bashrc"
elif [ -n "$ZSH_VERSION" ]; then
  SHELL_RC="$HOME/.zshrc"
fi

PI_ENV_LINE='export PI_CODING_AGENT_DIR="$HOME/.AutoDev/agent"'
if [ -f "$SHELL_RC" ]; then
  grep -q 'PI_CODING_AGENT_DIR' "$SHELL_RC" 2>/dev/null || printf '%s\n' "$PI_ENV_LINE" >> "$SHELL_RC"
else
  printf '%s\n' "$PI_ENV_LINE" >> "$SHELL_RC"
fi

# Fish support: add `set -gx` to ~/.config/fish/config.fish if fish is installed.
FISH_CONFIG_DIR="$HOME/.config/fish"
if command -v fish >/dev/null 2>&1; then
  mkdir -p "$FISH_CONFIG_DIR"
  FISH_CONFIG="$FISH_CONFIG_DIR/config.fish"
  FISH_LINE='set -gx PI_CODING_AGENT_DIR $HOME/.AutoDev/agent'
  if [ -f "$FISH_CONFIG" ]; then
    grep -q 'PI_CODING_AGENT_DIR' "$FISH_CONFIG" 2>/dev/null || printf '%s\n' "$FISH_LINE" >> "$FISH_CONFIG"
  else
    printf '%s\n' "$FISH_LINE" >> "$FISH_CONFIG"
  fi
fi

# ── Step 4: Verify autodev is on PATH ──────────────────────────────────────
if ! command -v autodev >/dev/null 2>&1; then
  echo "global autodev install failed — check errors above" >&2
  exit 1
fi

# ── Step 5: Hand off to doctor ─────────────────────────────────────────────
echo
echo "Running doctor check..."
if ! autodev doctor; then
  echo "Run the doctor command again after fixing the issues above" >&2
  exit 1
fi

echo
echo "AutoDev is installed and healthy. Run \`autodev onboard\` to begin."