#!/usr/bin/env bash
# AutoDev Installer — standalone bootstrap script.
#
# Installs Bun if missing, installs autodev-ai globally from npm,
# sets up centralized config, and hands off to the doctor health check.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/JsonDaRula69/AutoDev.ai/main/install.sh | bash
#
# Or download and run:
#   bash install.sh

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: Do not run as root (sudo)." >&2
  echo "Bun installs per-user to ~/.bun/. Running as root would install to /root/.bun/," >&2
  echo "which is not accessible to your normal user account." >&2
  exit 1
fi

echo "========================================"
echo "          AutoDev Installer"
echo "========================================"
echo

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun not found on PATH. Installing Bun..."

  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to install Bun" >&2
    exit 1
  fi

  curl -fsSL https://bun.sh/install | bash
fi

export PATH="$HOME/.bun/bin:$PATH"

echo "Installing autodev-ai globally..."
if ! bun install -g autodev-ai 2>&1; then
  if [ -d "$HOME/.bun/install/cache" ]; then
    echo "Bun cache may be stale. Clearing cache and retrying..."
    rm -rf "$HOME/.bun/install/cache"
  fi
  bun install -g autodev-ai
fi

export PI_CODING_AGENT_DIR="$HOME/.AutoDev/agent"

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

if ! command -v autodev >/dev/null 2>&1; then
  echo "autodev install failed — check errors above" >&2
  exit 1
fi

echo
echo "Running doctor check..."
if ! autodev doctor; then
  echo "" >&2
  echo "Doctor could not resolve all issues automatically." >&2
  echo "Run 'autodev config' in an interactive terminal to set up credentials," >&2
  echo "then run 'autodev doctor' again." >&2
  exit 1
fi