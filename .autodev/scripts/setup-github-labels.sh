#!/bin/bash
# Create AutoDev GitHub labels on the target project repository.
# Usage: bash .autodev/scripts/setup-github-labels.sh [owner/repo]
# If no repo is specified, uses the git remote 'project' URL.
set -euo pipefail

if [ -n "${1:-}" ]; then
  REPO="$1"
else
  # Try to detect from git remote
  REPO=$(git remote get-url project 2>/dev/null | sed -E 's|.*github.com[:/]([^/]+/[^.]+)(\.git)?|\1|' || echo "")
  if [ -z "$REPO" ]; then
    echo "Usage: bash .autodev/scripts/setup-github-labels.sh owner/repo"
    echo "Or ensure the 'project' git remote is set."
    exit 1
  fi
fi

LABELS=(
  "autodev-request:0D7C3F:New work requested from AutoDev"
  "autodev-planned:1D76DB:Plan written, ready for implementation"
  "autodev-in-progress:FBCA04:Implementation underway"
  "autodev-review:5319E7:PR open, awaiting review"
  "autodev-ci-running:BFD4F2:CI validation in progress"
  "autodev-ready:0E8A16:CI green, review-clean, ready for merge"
  "autodev-merged:6F7C8A:PR merged to target branch"
  "autodev-blocked:E99695:Blocked on human input or external dependency"
  "autodev-rejected:B60205:Human rejected the PR, needs rework"
  "priority:critical:B60205:Critical priority"
  "priority:high:D93E37:High priority"
  "priority:medium:FBCA04:Medium priority"
  "priority:low:0E8A16:Low priority"
  "type:bug:FC5D10:Bug fix"
  "type:feature:0075CA:New feature"
  "type:refactor:5319E7:Code refactor"
  "type:security:B60205:Security-related change"
  "type:docs:0075CA:Documentation change"
)

echo "Creating AutoDev labels on ${REPO}..."
for entry in "${LABELS[@]}"; do
  IFS=':' read -r name color desc <<< "$entry"
  existing=$(gh label list --repo "$REPO" --json name -q ".[] | select(.name==\"$name\") | .name" 2>/dev/null || true)
  if [ -n "$existing" ]; then
    echo "  Label '$name' already exists, updating..."
    gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null || true
  else
    echo "  Creating label '$name'..."
    gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null || true
  fi
done
echo "Done."
