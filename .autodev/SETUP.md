# AutoDev Setup Guide

Step-by-step instructions to deploy the AutoDev team framework.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [OpenCode](https://opencode.ai) installed (`curl -fsSL https://opencode.ai/install | bash`)
- [gh](https://cli.github.com) CLI authenticated (`gh auth status`)
- Git
- Node.js >= 18 (for Loreguard)
- Ollama Cloud access with models (GLM 5.1, Deepseek V4 Pro, Deepseek V4 Flash recommended)
- VoyageAI API key (for Magic Context embeddings)

## Quick Setup

```bash
cd <autodev-repo-root>
bash .autodev/scripts/setup.sh
```

The setup script will interactively prompt for:
1. **Project name** — the name of the project AutoDev will work on
2. **Project criticality** — what's at stake (e.g., "trades real money", "serves production users")
3. **Project directory path** — absolute path to the target project
4. **GitHub repository** — the `owner/repo` for the project
5. **Git remote name** — what to call the project remote (default: `project`)
6. **Discord/Telegram credentials** — for the communication bridge
7. **API keys** — Ollama Cloud, VoyageAI

It will then:
- Install oh-my-openagent, Magic Context, and Loreguard
- Copy project-level configs into place
- Replace template placeholders with your project configuration
- Set up environment variables
- Configure the project git remote
- Seed the knowledge base

## Manual Setup

If you prefer to set up each component manually:

### 1. Install oh-my-openagent

```bash
bunx oh-my-openagent install --platform=opencode
```

### 2. Configure Ollama Cloud provider (user-level)

Add to `~/.config/opencode/oh-my-openagent.jsonc`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/oh-my-opencode.schema.json",
  "providers": {
    "ollama-cloud": {
      "api": "openai-compat",
      "baseUrl": "https://api.ollama.cloud/v1",
      "apiKey": "<your-api-key>"
    }
  },
  "background_task": {
    "defaultConcurrency": 5,
    "modelConcurrency": {
      "ollama-cloud/glm-5.1": 5,
      "ollama-cloud/deepseek-v4-pro": 5,
      "ollama-cloud/deepseek-v4-flash": 8
    }
  },
  "git_master": { "commit_footer": true, "include_co_authored_by": true },
  "disabled_hooks": ["context-window-monitor", "preemptive-compaction"]
}
```

### 3. Set environment variables

Add to `~/.config/autodev.env`:

```bash
AUTODEV_DISCORD_BOT_TOKEN=<discord-bot-token>
AUTODEV_DISCORD_CHANNEL_ID=<channel-id>
AUTODEV_DISCORD_LIAISON_CHANNEL_ID=<liaison-channel-id>
AUTODEV_HOOK_TOKEN=<webhook-auth-token>
AUTODEV_TELEGRAM_BOT_TOKEN=<optional-telegram-token>
AUTODEV_TELEGRAM_CHAT_ID=<optional-telegram-chat-id>
```

### 4. Copy project-level configs

```bash
# OmO config
cp .autodev/config/oh-my-openagent.jsonc .opencode/oh-my-openagent.jsonc

# OpenCode project config
cp .autodev/config/opencode.json .opencode/opencode.json

# Magic Context config
cp .autodev/config/magic-context.jsonc magic-context.jsonc

# MCP config
cp .autodev/config/mcp.json .mcp.json
```

### 5. Install Magic Context

```bash
npx @cortexkit/magic-context@latest setup --harness opencode
```

Configure the embedding provider at user level (`~/.config/opencode/magic-context.jsonc`):

```jsonc
{
  "embedding": {
    "provider": "openai-compatible",
    "endpoint": "https://api.voyageai.com/v1",
    "apiKey": "<voyageai-api-key>",
    "model": "voyage-3",
    "input_type": "document"
  }
}
```

### 6. Install Loreguard

```bash
npm i -g loreguard-mcp
cd <autodev-repo-root>
loreguard init
```

### 7. Add project git remote

```bash
git remote add project git@github.com:<owner>/<repo>.git
```

### 8. Set up GitHub labels

```bash
bash .autodev/scripts/setup-github-labels.sh <owner/repo>
```

### 9. Seed knowledge base

```bash
bash .autodev/scripts/seed-loreguard.sh
loreguard review
```

### 10. Verify

```bash
# Check Loreguard
loreguard doctor

# Check heartbeat runs in-process: `node dist/cli/autodev.js doctor`
# The heartbeat is an internal timer loop in the AutoDev binary —
# it polls GitHub for new `autodev-request` issues every 5 minutes.
# No systemd timer or external service is required.
```

## Post-Setup: Onboarding

After setup is complete, start opencode and begin the onboarding phase:

```bash
opencode --project <autodev-repo-root>
```

The orientation agent will guide you through establishing the "immutable source of truth" for your project by:
1. Investigating the target project codebase
2. Asking questions about architecture, constraints, and conventions
3. Populating `.autodev/reference/` with project documentation
4. Filling in `.autodev/memory/` with project context
5. Creating initial ADRs for key design decisions

## Running the Team

### In-process runtime

AutoDev runs as a single in-process runtime. The heartbeat is an internal
timer loop that polls GitHub for new `autodev-request` issues every 5 minutes
and runs self-healing checks. No systemd timer or external service is required.

### Trigger work from the project

Create a GitHub issue with `autodev-request` label:

```bash
gh issue create --repo <owner/repo> --title "Fix authentication timeout" --label "autodev-request"
```

Or send a wake signal via webhook or Discord.

### Trigger work manually via Discord

Post a message in the AutoDev Discord channel.

### Check status

```bash
node dist/cli/autodev.js status
node dist/cli/autodev.js doctor
```
