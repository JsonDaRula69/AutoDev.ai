#!/bin/bash
# AutoDev Setup — Interactive project-agnostic installer
# Usage: bash .autodev/scripts/setup.sh
set -euo pipefail

AUTODEV_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "========================================="
echo "  AutoDev Framework Setup"
echo "========================================="
echo ""
echo "AutoDev root: ${AUTODEV_ROOT}"
echo ""

# ── Color helpers ──────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ── Step 0: Prerequisites check ───────────────────────────────────
info "Checking prerequisites..."
MISSING=0

for cmd in git node npm bun gh; do
  if ! command -v "$cmd" &>/dev/null; then
    warn "Missing: $cmd"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  fail "Install missing prerequisites before continuing."
fi
info "Prerequisites OK."
echo ""

# ── Step 1: Project configuration ─────────────────────────────────
info "Step 1: Project Configuration"
echo "─────────────────────────────────"
echo ""

read -rp "Project name (e.g., 'TraderBot', 'MyApp'): " PROJECT_NAME
if [ -z "$PROJECT_NAME" ]; then
  fail "Project name is required."
fi

read -rp "Project criticality (e.g., 'trades real money', 'serves production users'): " PROJECT_CRITICALITY
if [ -z "$PROJECT_CRITICALITY" ]; then
  PROJECT_CRITICALITY="affects production systems"
fi

read -rp "Path to the target project directory (absolute path): " PROJECT_ROOT
if [ -z "$PROJECT_ROOT" ]; then
  fail "Project root path is required."
fi
if [ ! -d "$PROJECT_ROOT" ]; then
  warn "Directory ${PROJECT_ROOT} does not exist yet. It will be used when the project is initialized."
fi

read -rp "GitHub repository for the project (e.g., 'owner/repo'): " PROJECT_REPO
if [ -z "$PROJECT_REPO" ]; then
  warn "No GitHub repo specified. GitHub integration will need manual configuration."
fi

read -rp "Git remote name for the project repo (default: 'project'): " PROJECT_REMOTE
PROJECT_REMOTE="${PROJECT_REMOTE:-project}"

echo ""
info "Project configuration:"
echo "  Name:          ${PROJECT_NAME}"
echo "  Criticality:   ${PROJECT_CRITICALITY}"
echo "  Project root:  ${PROJECT_ROOT}"
echo "  GitHub repo:   ${PROJECT_REPO}"
echo "  Remote name:   ${PROJECT_REMOTE}"
echo ""

read -rp "Continue with these settings? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  fail "Setup cancelled."
fi
echo ""

# ── Step 2: Install dependencies ───────────────────────────────────
info "Step 2: Installing dependencies..."

echo "Installing oh-my-openagent..."
bunx oh-my-openagent install --platform=opencode

echo "Installing Magic Context..."
npx @cortexkit/magic-context@latest setup --harness opencode

echo "Installing Loreguard..."
npm i -g loreguard-mcp

echo ""
info "Dependencies installed."
echo ""

# ── Step 3: Copy project-level configs ─────────────────────────────
info "Step 3: Copying project-level configs..."

mkdir -p "${AUTODEV_ROOT}/.opencode"
cp "${AUTODEV_ROOT}/.autodev/config/oh-my-openagent.jsonc" "${AUTODEV_ROOT}/.opencode/oh-my-openagent.jsonc"
cp "${AUTODEV_ROOT}/.autodev/config/magic-context.jsonc" "${AUTODEV_ROOT}/.magic-context.jsonc" 2>/dev/null || \
  cp "${AUTODEV_ROOT}/magic-context.jsonc" "${AUTODEV_ROOT}/.magic-context.jsonc" 2>/dev/null || true
cp "${AUTODEV_ROOT}/.autodev/config/mcp.json" "${AUTODEV_ROOT}/.mcp.json"

# Initialize Loreguard
cd "${AUTODEV_ROOT}"
loreguard init 2>/dev/null || true

info "Project-level configs copied."
echo ""

# ── Step 4: Apply project configuration to template files ─────────
info "Step 4: Applying project configuration to templates..."

# Replace placeholders in key files
for file in \
  "AGENTS.md" \
  ".autodev/config/standing-orders.md" \
  ".autodev/config/team-spec.json" \
  ".autodev/daemon/autodev-heartbeat.service" \
  ".autodev/daemon/remote-opencode.service" \
  ".autodev/HEARTBEAT.md" \
  ".autodev/memory/projectbrief.md" \
  ".autodev/memory/techContext.md" \
  ".autodev/memory/activeContext.md"; do

  FILEPATH="${AUTODEV_ROOT}/${file}"
  if [ -f "$FILEPATH" ]; then
    # Replace template placeholders
    sed -i.bak \
      -e "s|<PROJECT_NAME>|${PROJECT_NAME}|g" \
      -e "s|<PROJECT_CRITICALITY>|${PROJECT_CRITICALITY}|g" \
      -e "s|<AUTODEV_ROOT>|${AUTODEV_ROOT}|g" \
      -e "s|<AUTODEV_PROJECT_ROOT>|${AUTODEV_ROOT}|g" \
      -e "s|<PROJECT_ROOT>|${PROJECT_ROOT}|g" \
      -e "s|<PROJECT_REPO>|${PROJECT_REPO}|g" \
      -e "s|<PROJECT_REMOTE>|${PROJECT_REMOTE}|g" \
      "$FILEPATH"
    rm -f "${FILEPATH}.bak"
  fi
done

# Replace placeholders in MCP config for Loreguard path
LOREGUARD_MCP_PATH="$(which loreguard-mcp 2>/dev/null || echo '/usr/local/lib/node_modules/loreguard-mcp/dist/bin/loreguard-mcp.js')"
sed -i.bak "s|<LOREGUARD_MCP_PATH>|${LOREGUARD_MCP_PATH}|g" "${AUTODEV_ROOT}/.autodev/config/mcp.json" 2>/dev/null || true
rm -f "${AUTODEV_ROOT}/.autodev/config/mcp.json.bak" 2>/dev/null || true

# Also update the copied .mcp.json
cp "${AUTODEV_ROOT}/.autodev/config/mcp.json" "${AUTODEV_ROOT}/.mcp.json"

# Replace daemon service paths
OPENCODE_PATH="$(which opencode 2>/dev/null || echo '/usr/local/bin/opencode')"
NPM_GLOBAL_PATH="$(npm config get prefix 2>/dev/null || echo '/usr/local')"

for svc in "${AUTODEV_ROOT}/.autodev/daemon/autodev-heartbeat.service" "${AUTODEV_ROOT}/.autodev/daemon/remote-opencode.service"; do
  if [ -f "$svc" ]; then
    sed -i.bak \
      -e "s|<PATH_TO_OPENCODE>|${OPENCODE_PATH}|g" \
      -e "s|<PATH_TO_NPM_GLOBAL>|${NPM_GLOBAL_PATH}/bin|g" \
      -e "s|<HOME>|${HOME}|g" \
      "$svc"
    rm -f "${svc}.bak"
  fi
done

info "Project configuration applied."
echo ""

# ── Step 5: Environment variables ──────────────────────────────────
info "Step 5: Configuring environment variables..."

ENV_FILE="${HOME}/.config/autodev.env"
mkdir -p "$(dirname "${ENV_FILE}")"

if [ ! -f "${ENV_FILE}" ]; then
  read -rp "Discord Bot Token (or press Enter to skip): " DISCORD_BOT_TOKEN
  read -rp "Discord Channel ID (or press Enter to skip): " DISCORD_CHANNEL_ID
  read -rp "Discord Liaison Channel ID (or press Enter to skip): " DISCORD_LIAISON_CHANNEL_ID
  read -rp "Webhook Auth Token (or press Enter to skip): " HOOK_TOKEN
  read -rp "Telegram Bot Token (or press Enter to skip): " TELEGRAM_BOT_TOKEN
  read -rp "Telegram Chat ID (or press Enter to skip): " TELEGRAM_CHAT_ID

  cat > "${ENV_FILE}" << ENVFILE
# AutoDev environment variables — fill in the values
AUTODEV_DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
AUTODEV_DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID}
AUTODEV_DISCORD_LIAISON_CHANNEL_ID=${DISCORD_LIAISON_CHANNEL_ID}
AUTODEV_HOOK_TOKEN=${HOOK_TOKEN}
AUTODEV_TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
AUTODEV_TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
ENVFILE
  info "Environment file created at ${ENV_FILE}"
else
  info "Environment file already exists at ${ENV_FILE} — skipping."
fi
echo ""

# ── Step 6: GitHub configuration ───────────────────────────────────
info "Step 6: Configuring GitHub..."

if [ -n "$PROJECT_REPO" ]; then
  # Add project repo as a git remote
  if git -C "${AUTODEV_ROOT}" remote | grep -q "^${PROJECT_REMOTE}$"; then
    warn "Remote '${PROJECT_REMOTE}' already exists. Skipping."
  else
    REPO_URL="git@github.com:${PROJECT_REPO}.git"
    git -C "${AUTODEV_ROOT}" remote add "${PROJECT_REMOTE}" "${REPO_URL}" 2>/dev/null || \
      warn "Could not add remote '${PROJECT_REMOTE}'. Add manually: git remote add ${PROJECT_REMOTE} ${REPO_URL}"
    info "Added remote '${PROJECT_REMOTE}' → ${REPO_URL}"
  fi

  # Set up GitHub labels
  read -rp "Set up AutoDev labels on ${PROJECT_REPO}? [y/N] " SETUP_LABELS
  if [[ "$SETUP_LABELS" =~ ^[Yy]$ ]]; then
    bash "${AUTODEV_ROOT}/.autodev/scripts/setup-github-labels.sh" "${PROJECT_REPO}"
  fi
else
  warn "No GitHub repo specified. Add it manually: git remote add project <url>"
fi
echo ""

# ── Step 7: Seed Loreguard ─────────────────────────────────────────
info "Step 7: Seeding knowledge base..."

bash "${AUTODEV_ROOT}/.autodev/scripts/seed-loreguard.sh"
info "Loreguard seeded (if ADRs exist)."
echo ""

# ── Step 8: Install systemd services (Linux only) ──────────────────
info "Step 8: Systemd services..."

if [[ "$(uname)" == "Linux" ]]; then
  mkdir -p "${HOME}/.config/systemd/user/"
  cp "${AUTODEV_ROOT}/.autodev/daemon/remote-opencode.service" "${HOME}/.config/systemd/user/"
  cp "${AUTODEV_ROOT}/.autodev/daemon/autodev-heartbeat.service" "${HOME}/.config/systemd/user/"
  cp "${AUTODEV_ROOT}/.autodev/daemon/autodev-heartbeat.timer" "${HOME}/.config/systemd/user/"
  systemctl --user daemon-reload 2>/dev/null || true
  info "Systemd services installed."
else
  warn "Not on Linux. Skip systemd service installation or configure manually."
fi
echo ""

# ── Step 9: User-level config reminders ─────────────────────────────
info "Step 9: User-level configuration reminders"
echo "─────────────────────────────────────────"
echo ""
echo "The following user-level configs need manual setup:"
echo ""
echo "  1. Ollama Cloud API key:"
echo "     Edit ~/.config/opencode/oh-my-openagent.jsonc"
echo "     Add your provider config with API key."
echo ""
echo "  2. VoyageAI API key (for Magic Context embeddings):"
echo "     Edit ~/.config/opencode/magic-context.jsonc"
echo "     Add your embedding provider config with API key."
echo ""
echo "  3. remote-opencode config:"
echo "     Edit ~/.remote-opencode/config.json"
echo "     Add Discord bot credentials and project path."
echo ""
echo "  4. Start services:"
echo "     systemctl --user enable --now remote-opencode"
echo "     systemctl --user enable --now autodev-heartbeat.timer"
echo ""

# ── Done ────────────────────────────────────────────────────────────
echo "========================================="
echo -e "${GREEN}  AutoDev Setup Complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Complete the user-level configs listed above"
echo "  2. Run: loreguard review"
echo "  3. Start opencode and begin onboarding:"
echo "     opencode --project ${AUTODEV_ROOT}"
echo ""
echo "The orientation agent will guide you through building"
echo "the immutable source of truth for ${PROJECT_NAME}."
echo ""
