# Implementation Plan: Phase 6 Completion

## Overview

Complete all remaining Phase 6 (Hardening and closed beta) tasks with real, verifiable implementations. Replace stubs with genuine tests, add missing golden repos, and close the documentation gaps.

## Architecture Decisions

- **Real over stub**: every placeholder test gets a genuine implementation that exercises real code paths
- **CI-integrable**: all new tests must run in CI without external dependencies (no ZAP binary, no pen-test vendor)
- **Document what cannot be automated**: external pen test and design partners are vendor/human activities; document the plan and track them, don't fake them
- **20 golden repos**: add the 8 missing fixtures to reach the P6-15 target

## Task List

### Phase A: Replace stubs with real tests

- [ ] Task A1: P6-17 Performance benchmarks — real measurements, not hardcoded arrays
- [ ] Task A2: P6-05 DAST baseline — real ZAP config validation + documented baseline
- [ ] Task A3: P6-08 Chaos testing — real scenarios using testcontainers + mock injection

### Phase B: Add missing test suites

- [ ] Task B1: P6-07 Load test — concurrent scan submissions with p95 assertions
- [ ] Task B2: P6-18 False-positive review — sample-based FP rate calculation
- [ ] Task B3: P6-10 Dependency/image audit — SBOM diff + cosign verification in CI

### Phase C: Complete golden repo suite

- [ ] Task C1: P6-15 — add 8 missing golden repos to reach 20

### Phase D: Documentation and operational readiness

- [ ] Task D1: P6-09 Backup restore drill — documented procedure + automated test
- [ ] Task D2: P6-11 Observability review — alert-to-runbook coverage check
- [ ] Task D3: P6-12 Incident tabletop — documented exercise
- [ ] Task D4: P6-14 On-call tooling — rotation config + status page pipeline
- [ ] Task D5: P6-19 Legal copy review — checklist against rules.md §15
- [ ] Task D6: P6-06 External pen test — scoped plan + internal pre-test

### Phase E: Mark complete

- [ ] Task E1: Update docs/tasks.md — mark all P6 tasks done
- [ ] Task E2: Verify CI passes

## Checkpoint: All Phase 6 tasks done
- [ ] All P6 tasks marked done in docs/tasks.md
- [ ] CI green on the Phase 6 branch
- [ ] Review with human before merging to main

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Chaos tests may be flaky in CI | High | Use testcontainers with health checks; mark as integration tests, not unit |
| Load test may be slow | Medium | Use small concurrency (10 not 50) for CI; full 50-scan load is a staging activity |
| External pen test cannot be automated | Medium | Document scope, timeline, and acceptance criteria; track as a human task |
| Golden repos need real content | Low | Each fixture is a small file with a manifest; easy to add |

## Open Questions
- [ ] Has the human approved the external pen test vendor and timeline?
- [ ] Has the human approved the design partner onboarding plan?