#!/usr/bin/env bash
# ============================================================================
# AutoDev Installer — standalone bootstrap script
#
# Installs Bun (if missing), then installs the autodev package globally,
# and hands off to `autodev doctor` for health checks and configuration.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/JsonDaRula69/AutoDev.ai/main/install.sh | bash
#   # or
#   ./install.sh
# ============================================================================
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ── Helpers ─────────────────────────────────────────────────────────────────
info()  { printf "${GREEN}%s${NC}\n" "$*"; }
warn()  { printf "${YELLOW}%s${NC}\n" "$*"; }
error() { printf "${RED}%s${NC}\n" "$*" >&2; }
bold()  { printf "${BOLD}%s${NC}\n" "$*"; }

# ── Header ──────────────────────────────────────────────────────────────────
bold "╔═══════════════════════════════════════════════════════════════╗"
bold "║                    AutoDev Installer                          ║"
bold "║        Autonomous Engineering Team — DevTeam in a Box         ║"
bold "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Ensure Bun is on PATH ──────────────────────────────────────────
info "🔍 Checking for Bun..."

if ! command -v bun &>/dev/null; then
  warn "⚠️  Bun not found on PATH. Installing Bun via curl..."
  warn "   curl -fsSL https://bun.sh/install | bash"

  # Install Bun (the official install script respects existing shells)
  curl -fsSL https://bun.sh/install | bash

  # Source the new Bun path — the install script adds it to ~/.bashrc / ~/.zshrc
  # but for this session we need it on PATH right now.
  export BUN_DIR="${BUN_DIR:-"$HOME/.bun"}"
  if [ -d "$BUN_DIR/bin" ]; then
    export PATH="$BUN_DIR/bin:$PATH"
  fi

  # Verify Bun is now available
  if ! command -v bun &>/dev/null; then
    error "❌ Bun installation completed but 'bun' is still not on PATH."
    error "   Try running: source ~/.bashrc (or restart your terminal)"
    error "   Then re-run this installer."
    exit 1
  fi

  info "✅ Bun installed successfully: $(bun --version)"
else
  info "✅ Bun found: $(bun --version)"
fi

echo ""

# ── Step 2: Install autodev globally ───────────────────────────────────────
info "📦 Installing autodev globally via Bun..."
info "    bun install -g autodev"

bun install -g autodev

echo ""

# ── Step 3: Verify autodev is on PATH ──────────────────────────────────────
info "🔍 Verifying autodev installation..."

if ! command -v autodev &>/dev/null; then
  error "❌ 'autodev' not found on PATH after installation."
  error "   'bun install -g autodev' may have failed — check errors above."
  error ""
  error "   Possible causes:"
  error "     • Bun's global bin directory is not on your PATH"
  error "     • The install encountered a network or permission error"
  error ""
  error "   Try running: bun install -g autodev"
  error "   Then check:  command -v autodev"
  exit 1
fi

info "✅ autodev found: $(command -v autodev)"

echo ""

# ── Step 4: Hand off to autodev doctor ─────────────────────────────────────
info "🏥 Running autodev doctor to check system health..."
info "    autodev doctor"
echo ""

if autodev doctor; then
  echo ""
  info "✅ AutoDev installation complete!"
  info "   Run 'autodev onboard' to start the onboarding conversation."
else
  echo ""
  warn "⚠️  autodev doctor reported issues that need attention."
  warn "   Run 'autodev doctor' again after fixing the issues above."
  exit 1
fi
