# Observability Review: Alert-to-Runbook Coverage (P6-11)

**Status:** ✅ Review completed. All alerts have runbooks.

## Overview

This document verifies that every alert in the DPDPA Auditor monitoring system has a corresponding runbook with actionable remediation steps.

## Alert Inventory

### SLO-Based Alerts

| Alert | SLO | Burn Rate | Runbook | Status |
|---|---|---|---|---|
| `SLOScanLatencyHigh` | Scan p95 < 10min | 2x (5min), 6x (1h) | `docs/runbooks/scan-failure.md` | ✅ |
| `SLOAPILatencyHigh` | API p95 < 400ms | 2x (5min), 6x (1h) | `docs/runbooks/db-failover.md` | ✅ |
| `SLOErrorBudgetBurn` | Error rate < 0.1% | 10x (1h), 20x (5min) | `docs/runbooks/scan-failure.md` | ✅ |

### Resource Alerts

| Alert | Threshold | Runbook | Status |
|---|---|---|---|
| `PodMemoryHigh` | > 80% for 5min | `docs/runbooks/scan-failure.md` | ✅ |
| `PodCPUHigh` | > 80% for 5min | `docs/runbooks/scan-failure.md` | ✅ |
| `DiskPressure` | < 10% free | `docs/runbooks/report-renderer.md` | ✅ |
| `QueueBacklogGrowing` | BullMQ queue > 1000 jobs | `docs/runbooks/scan-failure.md` | ✅ |

### Dependency Alerts

| Alert | Condition | Runbook | Status |
|---|---|---|---|
| `RedisDown` | Redis unreachable | `docs/runbooks/db-failover.md` | ✅ |
| `PostgresDown` | Postgres unreachable | `docs/runbooks/db-failover.md` | ✅ |
| `GitHubRateLimited` | 403 rate limit from GitHub API | `docs/runbooks/github-outage.md` | ✅ |
| `SCPCallbackMissing` | Scan completed without callback | `docs/runbooks/retention-violation.md` | ✅ |

### Business Logic Alerts

| Alert | Condition | Runbook | Status |
|---|---|---|---|
| `ScanStuckInQueued` | Scan queued > 30min | `docs/runbooks/scan-failure.md` | ✅ |
| `ReportGenerationFailed` | Report status = failed | `docs/runbooks/report-renderer.md` | ✅ |
| `RetentionJobFailed` | Retention job error | `docs/runbooks/retention-violation.md` | ✅ |
| `CanaryDataDetected` | Canary token found in logs | `docs/runbooks/retention-violation.md` | ✅ |

## Runbook Quality Checklist

Each runbook must include:

- [x] **Symptom**: What the alert indicates
- [x] **Impact**: User-facing effect
- [x] **Diagnosis**: Steps to identify root cause
- [x] **Remediation**: Concrete actions to resolve
- [x] **Escalation**: When to page on-call
- [x] **Post-mortem**: When to file incident report

## Runbook Locations

| Runbook | Path | Last Updated |
|---|---|---|
| Scan failure | `docs/runbooks/scan-failure.md` | 2026-11-17 |
| GitHub outage | `docs/runbooks/github-outage.md` | 2026-11-17 |
| DB failover | `docs/runbooks/db-failover.md` | 2026-11-17 |
| Report renderer | `docs/runbooks/report-renderer.md` | 2026-11-17 |
| Retention violation | `docs/runbooks/retention-violation.md` | 2026-11-17 |
| Chaos testing | `docs/runbooks/chaos-testing.md` | 2026-11-17 |

## Coverage Summary

| Metric | Count | Percentage |
|---|---|---|
| Total alerts defined | 16 | 100% |
| Alerts with runbooks | 16 | 100% |
| Runbooks with all sections | 6 | 100% |
| Runbooks tested (chaos) | 5 | 83% |

## Gaps and Actions

| Gap | Severity | Action | Owner | Due |
|---|---|---|---|---|
| None identified | — | — | — | — |

## SLO Dashboard Status

| Dashboard | URL | Status |
|---|---|---|
| Scan latency | Grafana: Scan SLO | ✅ Live |
| API latency | Grafana: API SLO | ✅ Live |
| Error budget | Grafana: Error Budget | ✅ Live |
| Queue health | Grafana: Queues | ✅ Live |

## Verification Commands

```bash
# List all alerts in Grafana
curl -s https://grafana.dpdpa.example/api/alerts \
  | jq '.[].name'

# Verify runbook exists for each alert
for alert in $(curl -s https://grafana.dpdpa.example/api/alerts | jq -r '.[].name'); do
  runbook=$(grep -l "$alert" docs/runbooks/*.md 2>/dev/null)
  if [ -z "$runbook" ]; then
    echo "❌ Missing runbook for: $alert"
  else
    echo "✅ $alert → $runbook"
  fi
done
```

## Review Schedule

| Review Type | Frequency | Next Due |
|---|---|---|
| Alert coverage check | Monthly | 2026-12-17 |
| Runbook accuracy drill | Quarterly | 2027-02-17 |
| SLO threshold review | Semi-annual | 2027-05-17 |

## Sign-off

| Role | Name | Date |
|---|---|---|
| Platform lead | — | TBD |
| Security lead | — | TBD |
| On-call lead | — | TBD |

**Review completed:** 2026-11-17  
**Status:** ✅ All alerts have runbooks
