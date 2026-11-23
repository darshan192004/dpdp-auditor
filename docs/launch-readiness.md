# DPDPA GitHub Code Auditor — Launch Readiness Checklist

**Document version:** 1.0  
**Date:** 2026-11-18  
**Status:** Open-source launch preparation

---

## Overview

This checklist tracks readiness for launching DPDPA GitHub Code Auditor as an open-source project. The project is free and community-driven; there is no billing, paid tiers, or commercial infrastructure.

---

## Launch Checklist

### Documentation

- [x] `README.md` — Project overview and quickstart
- [x] `CONTRIBUTING.md` — How to contribute
- [x] `CODE_OF_CONDUCT.md` — Community standards
- [x] `SECURITY.md` — Vulnerability reporting policy
- [x] `CHANGELOG.md` — Project changelog
- [x] `LICENSE` — MIT License
- [x] `docs/` — Complete architecture, API, security, and operations documentation
- [ ] `docs/launch-readiness.md` — This file (in progress)

### Code Quality

- [x] TypeScript strict mode enforced across all packages
- [x] ESLint + Prettier + Tailwind class sorting configured
- [x] Husky + lint-staged + Gitleaks pre-commit hooks
- [x] CI pipeline: lint, typecheck, unit, integration, e2e, build, audit
- [x] SAST: semgrep self-scan + gitleaks full history
- [x] Test coverage floors defined in `docs/code_style.md`

### Security

- [x] STRIDE threat model documented (`docs/threat-model.md`)
- [x] External penetration test completed (`docs/security/external-penetration-test-report.md`)
- [x] Dependency audit procedure (`docs/security/dependency-audit-procedure.md`)
- [x] Container images: digest-pinned, distroless base, non-root user
- [x] SBOM generation and cosign signing in CI
- [x] PII redaction in logs and findings
- [x] Tenant isolation via RLS and scoped queries
- [x] HMAC-signed internal callbacks
- [x] OAuth PKCE with signed state parameter
- [x] Session management: sealed cookies, idle timeout
- [x] API key hashing and scoping
- [x] Rate limiting with Redis backend

### Testing

- [x] Unit tests with coverage reporting
- [x] Integration tests with testcontainers (Postgres + Redis)
- [x] E2E tests with Playwright
- [x] Golden repo fixtures (20 repositories)
- [x] Security test suite: SSRF, tenant scoping, API key scope, existence oracle
- [x] Accessibility testing: axe-core, keyboard navigation
- [x] Responsive testing: 320/768/1024/1440 px breakpoints

### Observability

- [x] OpenTelemetry tracing and metrics
- [x] Pino structured logging with request ID, org ID, scan ID
- [x] SLO definitions (`monitoring/slos.yaml`)
- [x] Prometheus alerting rules (`monitoring/prometheus/rules.yml`)
- [x] Grafana burn-rate alerts (`monitoring/grafana/provisioning/alerting/`)
- [x] Alert-to-runbook coverage verified (`docs/observability-alert-coverage.md`)

### Runbooks

- [x] Scan failure (`docs/runbooks/scan-failure.md`)
- [x] GitHub outage (`docs/runbooks/github-outage.md`)
- [x] DB failover (`docs/runbooks/db-failover.md`)
- [x] Report renderer (`docs/runbooks/report-renderer.md`)
- [x] Retention violation (`docs/runbooks/retention-violation.md`)
- [x] Chaos testing (`docs/runbooks/chaos-testing.md`)

### Operations

- [x] SLO review process defined (`docs/operations.md`)
- [x] On-call tooling configuration (`docs/operations/oncall-tooling.md`)
- [x] Backup restore drill procedure (`docs/security/backup-restore-drill.md`)
- [x] Incident tabletop exercise (`docs/security/incident-tabletop-exercise.md`)

### Local Development

- [x] Docker Compose for local services (Postgres, Redis, Mailpit)
- [x] `.nvmrc` for Node version management
- [x] pnpm workspaces and Turborepo for monorepo management
- [ ] Scan-runner local execution guide (documented in `docker-compose.yml`)

### Verified end-to-end evidence (2026-11-18)

A real self-hosted run was completed locally with no managed infrastructure. All IDs and hashes below come from the live APIs and downloaded file, not fixtures:

- Real target: `666ghj/MiroFish` at commit `7657031ac01184afe2cb220f5ee3545573b5e843`.
- Scan `32e29296-d9a7-4b08-9d4d-44f6478f8e7e`: `completed`, score `100`, grade `A`, 12 findings (2 high / 10 medium). Scanners: checkov `3.2.0`, semgrep `1.95.0`, gitleaks `8.21.0`. Rule pack `dpdpa-2026.10.1`, scoring `1.0.0`.
- Timeline verified: `queued` → `findings_batch` (`accepted: 12`, `duplicates: 0`) → per-scanner completions → mapping → `score_computed`. Findings carry `sha256:` evidence hashes only; no raw evidence is sent in callbacks.
- Report `ade5a67e-d3fd-4e63-8605-04aacfca1feb`: `ready`, 17,485 bytes, SHA-256 `48923417436141b8822b6850a352af9001f91889db6c8555a4fa8a9a1d27c1ee`. Decoded PDF text contains the repository, commit prefix, `SCORE 100.0`, `GRADE A`, `FINDINGS 12`, and the rule-pack version.
- Download endpoint verified in local mode with a fresh authenticated session: `200 application/pdf`, `attachment` disposition, 17,485 bytes, matching SHA-256, no external redirect. Evidence: `.playwright-mcp/download-verification.txt`, `.playwright-mcp/pdf-verification.txt`, `.playwright-mcp/runner-final.log`.
- Fresh regression on this branch: orchestrator 654/654 tests (70 files), web suite, scan-runner pytest + ruff check + ruff format + mypy, and Docker smoke (daemon 29.6.2, Postgres/Redis/Mailpit healthy, runner image present) all exit 0.

Deferred (not claimed as verified): managed infrastructure rollout, real OAuth signup, canary/rollback drills, and status-page degradation drill.

### Community Readiness

- [x] Issue templates: bug report, feature request
- [x] Pull request template
- [x] CODEOWNERS for review assignments
- [x] Dependabot configuration for dependency updates
- [ ] Public discussion forum or Discord server (future)
- [ ] Contributor onboarding guide (future)

### Launch Communications

- [ ] Launch announcement blog post
- [ ] Social media posts (Twitter/X, LinkedIn, Mastodon)
- [ ] GitHub release notes
- [ ] Design partner testimonials (if applicable)

---

## Exit Criteria

The project is ready for open-source launch when:

- [x] All documentation is complete and accurate
- [x] All security gates have passed
- [x] All tests pass in CI
- [x] At least 20 golden repos have been scanned with expected findings matched
- [x] Runbooks cover all defined alerts
- [x] Local development setup works end-to-end
- [ ] Launch announcement materials are prepared

---

## Post-Launch Operations

### Weekly

- [ ] Review error budgets and SLO burn rates
- [ ] Triage false positives and adjust mappings
- [ ] Review and merge Renovate dependency updates

### Monthly

- [ ] Rule-pack review and release (with legal sign-off for mapping changes)
- [ ] Cost review: scan duration, resource usage per scan
- [ ] Community feedback triage

### Quarterly

- [ ] Backup restore drill
- [ ] Access review (GitHub repo permissions)

### Annual

- [ ] External penetration test
- [ ] Incident tabletop exercise

---

## Open Questions

1. **Hosting**: Will the project offer a hosted instance, or is it self-hosted only?
2. **Governance**: How will project maintainership be structured long-term?
3. **Funding**: Are there plans for grants, sponsorships, or other funding mechanisms?
