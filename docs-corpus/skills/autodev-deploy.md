---
name: autodev-deploy
description: "Coordinate deployment of a merged PR and verify health. Triggers after PR merge. Also used when the user says 'deploy', 'autodev deploy', 'push to production', 'ship it'."
---

# AutoDev Deploy

## Objective

After a PR is merged, coordinate deployment with the liaison and verify it's healthy before signaling completion. AutoDev does NOT deploy directly — the liaison handles deployment.

## Pre-conditions

- PR has been merged to the target branch
- CI was green on the merged commit
- Issue has label `autodev-merged`

## Workflow

### Step 1: Verify merge state

```bash
cd <project-repo>
git pull origin <target-branch>
git log -1 --oneline
```

Confirm the merge commit is on the target branch.

### Step 2: Signal the liaison

Alert the liaison that a PR has been merged and CI is green:

```bash
# Via webhook (configured in oh-my-openagent.jsonc)
curl -X POST <liaison-webhook-url> \
  -H "Content-Type: application/json" \
  -d '{
    "event": "autodev:deployed",
    "instruction": "PR #'"$PR"' merged for issue #'"$ISSUE"'. Ready for deployment.",
    "text": "Issue #'"$ISSUE"' resolved. CI green. Ready for deployment.",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "context": {
      "issueNumber": "'"$ISSUE"'",
      "prNumber": "'"$PR"'",
      "status": "ready-for-deploy"
    }
  }'
```

Or via Discord: post in the liaison channel that the PR is merged and ready for deployment.

### Step 3: Wait for liaison verification

The liaison deploys when conditions allow and verifies the deployment. AutoDev waits for confirmation.

### Step 4: Confirm completion

Once the liaison confirms successful deployment:

1. Post completion comment on the original issue:
```
AutoDev delivery complete. PR #<number> merged and deployed.
Deployment verified by liaison at <timestamp>.
```

2. Update label to `autodev-merged` (if not already).

### Step 5: Handle deployment failure

If the liaison reports deployment failure:

1. Label the issue `autodev-blocked`
2. Comment on the issue with the failure details from the liaison
3. Do NOT attempt to fix deployment yourself — the liaison handles that

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Deploying without liaison coordination | AutoDev doesn't know the project's deployment conditions |
| Skipping verification | A broken deployment defeats the purpose of the entire pipeline |
| Not signaling the liaison | The project team won't know the work is done |
| Attempting to fix deployment yourself | Deployment is the liaison's responsibility, not AutoDev's |
