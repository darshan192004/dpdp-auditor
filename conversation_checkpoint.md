# Conversation Checkpoint - DPDPA Auditor E2E Fix

## Current State

- **Orchestrator** running on `:3002` with `NODE_ENV=development`, `ORCHESTRATOR_CALLBACK_URL=http://localhost:3002` ✓
- **Postgres** and **Redis** running ✓
- Playwright E2E test in progress - new scan attempt

## What Happened

1. Fixed callback URL from `http://172.17.0.1:3002` → `http://localhost:3002` (host networking makes `localhost` work from container)
2. Restarted infra (postgres, redis) and orchestrator
3. Playwright navigated to `/app/scans?new=1` and filled repo URL `https://github.com/improwised/jovVix`
4. Clicked "Start scan" → returned **409 error**: "A scan is already running for this repository and ref."
5. The old scan `6a3d6fdc` is stuck in "Cloning" status from before the orchestrator restart

## Issues to Address

- Cancel the old stuck scan `6a3d6fdc` before creating a new one
- Verify scan runner Docker image has all fixes (facts.py, dpdpa.yaml, dpdpa.semgrepignore, adapter fixes)
- After scan completes, verify: live status updates, no flicker, repo-relative paths in findings, report PDF, toast behavior, breadcrumb labels

## Next Steps

1. Cancel old scan via UI or API
2. Create fresh scan via Playwright
3. Monitor status: queued→cloning→scanning→mapping→completed
4. Verify all UI/UX requirements post-scan

## Completed Fixes (from this session)

- ✓ Orchestrator callback URL: `http://localhost:3002`
- ✓ `.env` rewritten with dev keys and `NODE_ENV=development`
- ✓ Restarted postgres, redis, orchestrator
