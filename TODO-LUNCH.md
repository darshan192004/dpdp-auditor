# Lunch-time autonomous plan

## Root causes identified (Phase 1)
1. **Scan exit 1 / Connection refused**: orchestrator process started 12:35, `docker-driver.js` rebuilt 13:16 (host-network fix). Running process is stale -> container gets `bridge` -> `localhost:3002` refused from container.
2. **Session dropped to /login**: `/api/v1/me` 401, `sessions` table = 0 rows. TTLs: absolute 8h, idle 30min; hourly retention deletes idle>30m.

## Tasks
- [ ] T1 Restart orchestrator with rebuilt dist (host-network fix live)
- [ ] T2 Rebuild scan-runner Docker image (facts.py, dpdpa.yaml, dpdpa.semgrepignore, adapter fixes)
- [ ] T3 Root-cause + fix session drop (dev-appropriate session lifetime)
- [ ] T4 E2E re-test via Playwright: live status queued->cloning->scanning->mapping->completed, no flicker
- [ ] T5 Verify findings (repo-relative paths), remediation, coverage pages
- [ ] T6 Verify report tab renders, Export PDF (18 pages, no blanks)
- [ ] T7 Verify toast top-right + 4s auto-dismiss
- [ ] T8 Fix breadcrumb raw UUID -> readable label
- [ ] T9 Commit on branch, push, open PR (darshan192004/dpdp-auditor)
- [ ] T10 Address PR review agent suggestions
- [ ] T11 Merge only if all checks green
- [ ] T12 Close PR 99 + delete branch feat/dev-limit-overrides
