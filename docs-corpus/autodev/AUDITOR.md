# AutoDev Auditor

Knowledge integrity checks that keep the knowledge base trustworthy.

## Run Schedule

- **Quick checks:** Every 5 minutes via the in-process heartbeat timer loop
- **Deep sweep:** During dream cycle (overnight, via Magic Context dreamer)

## Checks

### 1. Bootstrap Size Gate

```bash
total=$(cat AGENTS.md CONTEXT.md .autodev/memory/projectbrief.md .autodev/memory/activeContext.md .autodev/memory/techContext.md ARCHITECTURE.md STRUCTURE.md 2>/dev/null | wc -c)
if [ "$total" -gt 32768 ]; then
  echo "FAIL: Bootstrap files total ${total} bytes (max 32768). Trim before committing."
fi
```

### 2. Lore Draft Queue Depth

```bash
drafts=$(loreguard review --list 2>/dev/null | grep -c "draft" || echo 0)
if [ "$drafts" -gt 20 ]; then
  echo "WARN: ${drafts} unreviewed lore drafts. Review queue is backing up."
fi
```

### 3. Stale Lore Detection

```bash
stale=$(loreguard search --include-stale 2>/dev/null | grep -c "stale.*true" || echo 0)
if [ "$stale" -gt 0 ]; then
  echo "WARN: ${stale} stale lore records need verification."
fi
```

### 4. Conflict Queue

```bash
conflicts=$(loreguard search --include-drafts tag:conflict-report 2>/dev/null | wc -l || echo 0)
if [ "$conflicts" -gt 0 ]; then
  echo "ACTION: ${conflicts} unresolved lore conflicts need human review."
fi
```

### 5. Reference Directory Integrity

```bash
if [ ! -e ".autodev/reference" ]; then
  echo "WARN: No reference directory found. Run onboarding to populate."
fi
```

### 6. Heartbeat Health

```bash
# The heartbeat is an in-process timer loop. Check that the AutoDev binary
# is running and that .autodev/heartbeat-state.json exists and is recent.
if [ ! -f .autodev/heartbeat-state.json ]; then
  echo "WARN: heartbeat-state.json not found. Is the AutoDev binary running?"
fi
```

### 7. Magic Context DB Health

```bash
npx @cortexkit/magic-context@latest doctor --harness opencode 2>&1 | grep -E "FAIL|WARN" || echo "OK"
```

### 8. AGENTS.md Contains Retrieval Rules

```bash
if ! grep -q "search_lore" AGENTS.md; then
  echo "FAIL: AGENTS.md missing the search_lore retrieval rule."
fi
if ! grep -q "ctx_search" AGENTS.md; then
  echo "FAIL: AGENTS.md missing the ctx_search retrieval rule."
fi
```

### 9. Environment Variables Set

```bash
for var in AUTODEV_DISCORD_BOT_TOKEN AUTODEV_DISCORD_CHANNEL_ID; do
  if [ -z "${!var}" ]; then
    echo "FAIL: ${var} is not set. Discord integration will not work."
  fi
done
```

### 10. No Secrets in Tracked Files

```bash
secrets=$(git ls-files | xargs grep -lE '(sk-|api.key|apiKey|token).*=.*["\x27][A-Za-z0-9._-]{20,}' 2>/dev/null || true)
if [ -n "$secrets" ]; then
  echo "FAIL: Potential secrets found in tracked files: ${secrets}"
fi
```
