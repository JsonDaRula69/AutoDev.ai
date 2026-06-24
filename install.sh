#!/usr/bin/env bash
# AutoDev Installer — standalone bash bootstrap script.
#
# Detects Bun, auto-installs it if missing, installs autodev globally,
# verifies it is on PATH, and hands off to the doctor health check.
#
# This is a bash script (not POSIX sh) because `set -o pipefail` is a
# bashism. It runs before Bun exists and contains no TypeScript.

set -euo pipefail

# ── Guard against running as root (sudo) ───────────────────────────────────
# Bun installs to $HOME/.bun/ — running as root would install to /root/.bun/,
# which is not the user's home. The user should run this script without sudo.
if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: Do not run install.sh as root (sudo)." >&2
  echo "Bun installs per-user to ~/.bun/. Running as root would install to /root/.bun/," >&2
  echo "which is not accessible to your normal user account." >&2
  echo "" >&2
  echo "If you see permission errors without sudo, clear the Bun cache:" >&2
  echo "  sudo rm -rf ~/.bun/install/cache" >&2
  echo "then re-run: bash install.sh" >&2
  exit 1
fi

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
fi

# Bun's installer (and a prior manual install) writes to shell rc files but
# does NOT update the current session's PATH. Export unconditionally so both
# `bun` and the globally-installed `autodev` bin are visible to this script
# regardless of whether Bun was just installed or was already present.
export PATH="$HOME/.bun/bin:$PATH"

# ── Step 2: Install autodev globally ──────────────────────────────────────
# If a stale/root-owned cache causes EACCES, clear it and retry once.
echo "Installing autodev globally..."
if ! bun install -g autodev 2>&1; then
  if [ -d "$HOME/.bun/install/cache" ]; then
    echo "Bun cache may be stale or have wrong permissions. Clearing cache and retrying..."
    rm -rf "$HOME/.bun/install/cache"
  fi
  bun install -g autodev
fi

# ── Step 2.5: Install ollama-cloud provider ───────────────────────────────
# The provider is installed programmatically by `autodev doctor` as part of
# the install flow (runInstallToolsAndConfig → runProviderPhase). No separate
# `pi install` shell-out needed — the SDK's DefaultPackageManager handles it.
# This line is kept as a fallback for cases where doctor is skipped.
echo "Installing ollama-cloud provider..."
if ! autodev install-provider pi-ollama-cloud 2>/dev/null; then
  echo "  (will be installed during doctor check instead)"
fi

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

# ── Step 4: Copy docs-sources.yaml to central config path ──────────────────
echo "Setting up central documentation config..."
mkdir -p "$HOME/.AutoDev/config"
cp config/docs-sources.yaml "$HOME/.AutoDev/config/docs-sources.yaml"

# ── Step 5: Trigger initial doc seeding ────────────────────────────────────
echo "Seeding central documentation..."
autodev docs rebuild central

# ── Step 7: Verify autodev is on PATH ──────────────────────────────────────
if ! command -v autodev >/dev/null 2>&1; then
  echo "global autodev install failed — check errors above" >&2
  exit 1
fi

# ── Step 8: Hand off to doctor ─────────────────────────────────────────────
echo
echo "Running doctor check..."
if ! autodev doctor; then
  echo "Doctor could not resolve all issues automatically. Follow the prompts above before re-running." >&2
  exit 1
fi