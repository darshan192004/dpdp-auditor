# DPDPA GitHub Code Auditor — Operations

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Approved for MVP build |
| Date | 2026-11-05 |
| Audience | SRE, on-call, platform engineering, customer support |
| Related documents | `architecture.md` §13, `security.md` §13, `PRD.md` §8, `tasks.md` P6-11/P6-20 |

This document is the single source of truth for service levels, alert routing, recovery objectives, and degraded-mode behaviour. `architecture.md` §13 points here for the complete catalog; `security.md` §13 points here for alert recipients.

---

## 1. Service level objectives

| SLO | Target | Window | Measurement |
|---|---|---|---|
| Availability — web + public API | 99.5% monthly | Calendar month | Successful non-5xx responses / total requests (synthetic + real) |
| Availability — scan execution | 99.0% monthly | Calendar month | Completed (incl. partial) scans / scans started, excluding user error (`REPO_NOT_FOUND`, `VALIDATION_ERROR`) |
| Scan latency | p95 < 10 min (repos ≤ 100 MB) | Rolling 7 days | `scan_duration_seconds` histogram, queue-wait excluded from the slow end once submitted |
| API latency | p95 < 400 ms | Rolling 7 days | `api_request_duration_seconds` |
| Queue wait | p95 < 60 s | Rolling 7 days | Enqueue → job start (`scan_queue_wait_seconds`) |
| PDF render | p95 < 10 s | Rolling 7 days | `report_render_duration_seconds` |

PRD §8 is the authority for these numbers (99.5% / 99.0%, p95 targets, RPO 15 min, RTO 4 h).

### Error budget policy

- Monthly error budget = (1 − SLO) × valid requests/operations.
- **Burn-rate alerts** (fast/slow window multipliers, e.g. 2%/1h fast, 5%/6h slow) page on-call when the budget is projected to exhaust within the window.
- Budget exhaustion on the scan-execution SLO triggers the **canary rollback gate** in `architecture.md` §11: the pending release is held or rolled back until the budget recovers.
- Budget spent ≥ 50% in a week: feature freeze on the affected service until reviewed.

### Exclusions (not counted against the SLO)

- Planned maintenance windows announced ≥ 48 h ahead.
- Failures caused by the customer (bad URL, private/nonexistent repo, plan quota exhaustion).
- Upstream GitHub unavailability longer than 5 minutes **is counted** but annotated for the post-incident review (we hold scans in queue rather than fail them — §5).
- Requests rejected by WAF/rate limits (they never reached the app).

---

## 2. Recovery objectives

| Objective | Value | Mechanism |
|---|---|---|
| RPO (PostgreSQL) | 15 min | Continuous WAL archiving / PITR; `wal_level=replica`, 5-minute archive timeout |
| RTO (PostgreSQL) | 4 h | Point-in-time restore into a clean cluster; runbook `runbooks/db-failover.md` |
| RTO (full service) | 4 h | Helm re-deploy from Git; stateless workloads rebuild from registry |
| Scan state after restore | Re-runnable | Queued/active scans re-submitted by the reconciler (architecture.md §5 outbox) |

**Restore drill:** quarterly, against a production snapshot in the staging cluster, must complete within the 4 h RTO with verification queries (row counts, latest audit row, one report object readable). The drill result is attached to the launch checklist (`security.md` §17: "Backup restore drill passed within RTO") and to each quarterly review. A failed drill is a P2 incident.

---

## 3. Metric catalog

The launch metric set in `architecture.md` §13 is a subset of this catalog; every alert in `security.md` §13 has its metric here.

### Platform / SLO metrics

| Metric | Type | Source |
|---|---|---|
| `scan_queue_depth` | gauge | BullMQ |
| `scan_queue_wait_seconds` | histogram | orchestrator |
| `scan_queue_oldest_age_seconds` | gauge | BullMQ |
| `scan_duration_seconds` | histogram | orchestrator |
| `scan_failure_rate` | ratio | orchestrator |
| `scanner_partial_rate` | ratio | orchestrator |
| `api_request_duration_seconds` | histogram | Nitro |
| `api_5xx_rate` | ratio | Nitro |
| `report_render_duration_seconds` | histogram | renderer queue |
| `job_oom_total` | counter | Kubernetes events |
| `job_failure_total{org}` | counter | Job watcher |
| `dlq_depth` | gauge | BullMQ dead-letter queue |
| `git_clone_failure_rate` | ratio | runner callbacks |
| `rate_limit_hits_total{route}` | counter | Nitro/Redis |
| `pdf_export_volume_total{org}` | counter | renderer |
| `cost_per_scan_usd` | gauge | kubecost + S3 metrics |

### Security metrics (alert sources for `security.md` §13)

| Metric | Type | Source |
|---|---|---|
| `source_retention_violation_total` | counter | canary + retention job |
| `cross_tenant_denied_total` | counter | orchestrator auth guard (403/404 with mismatched IDs) |
| `auth_failure_rate` | ratio | Nitro |
| `repo_url_validation_rejected_total` | counter | Nitro Zod/allowlist middleware |
| `scanner_image_admission_rejection_total` | counter | admission policy (cosign) |
| `secret_detected_total` | counter | Gitleaks self-scan (CI + runtime) |
| `unusual_export_volume` | derived | `pdf_export_volume_total` per org/hour |

---

## 4. Alert routing

Severities map to response: **P1** pages the on-call immediately; **P2** pages with 15-minute acknowledgement; **P3** is business-hours ticket; **P4** is a dashboard annotation. Recipients are the primary on-call rotation unless noted; escalations follow §5.

| Alert | Condition | Severity | Recipient | Runbook |
|---|---|---|---|---|
| Retention violation | `source_retention_violation_total > 0` | P1 | On-call + security lead | `runbooks/retention-violation.md` |
| Cross-tenant access attempt | `cross_tenant_denied_total` spike with mismatched IDs | P1 | On-call + security lead | `runbooks/cross-tenant.md` |
| Auth failure spike | `auth_failure_rate > 20%` for 5 min | P2 | On-call | `runbooks/auth-failure.md` |
| Repo-URL validation rejection spike | `repo_url_validation_rejected_total > 10/min` | P2 | On-call | `runbooks/url-validation-spike.md` |
| Scanner image signature failure | any admission rejection | P2 | On-call + security lead | `runbooks/image-signature.md` |
| Secret detected in our repo | CI or runtime | P1 | Security lead + on-call | `runbooks/secret-exposure.md` |
| Unusual export volume | > 50 PDFs/hour/org | P3 | Support + on-call | `runbooks/export-volume.md` |
| Queue depth sustained | `scan_queue_depth > 50` for 10 min | P2 | On-call | `runbooks/queue-backlog.md` |
| Queue job age | `scan_queue_oldest_age_seconds` > 600 (10 min) | P2 | On-call | `runbooks/queue-backlog.md` |
| Report render latency | `report_render_duration_seconds` p95 > 10 s for 15 min | P2 | On-call | `runbooks/report-render-slow.md` |
| Scan p95 breach | `scan_duration_seconds` p95 > 10 min for 15 min | P2 | On-call | `runbooks/scan-slow.md` |
| Scan failure rate | `scan_failure_rate > 5%` for 10 min | P2 | On-call | `runbooks/scan-failure.md` |
| Git-clone failure rate | `git_clone_failure_rate > 10%` for 10 min | P2 | On-call | `runbooks/github-outage.md` |
| Partial coverage rate | `scanner_partial_rate > 10%` for 30 min | P3 | On-call (ticket) | `runbooks/scanner-partial.md` |
| API p95 / 5xx | p95 > 400 ms for 10 min; 5xx > 1% for 5 min | P2 | On-call | `runbooks/api-degraded.md` |
| DLQ non-empty | `dlq_depth > 0` for 5 min | P2 | On-call | `runbooks/dlq.md` |
| Job OOM | any increase in `job_oom_total` | P3 | On-call (ticket) | `runbooks/job-oom.md` |
| Job failures by org | `job_failure_total{org}` > 20%/h for one org | P3 | Support + on-call | `runbooks/scan-failure.md` |
| Rate-limit hit surge | `rate_limit_hits_total` > 3× baseline | P3 | On-call (ticket) | `runbooks/rate-limits.md` |
| Error budget burn | fast/slow burn-rate windows (§1) | P1 (fast) / P2 (slow) | On-call + engineering manager | `runbooks/error-budget.md` |
| Backup/PITR job failure | nightly archive check fails | P2 | On-call | `runbooks/db-failover.md` |

Every alert links to a runbook with: detection context, triage steps, mitigation, escalation, and post-incident requirements. The `runbooks/*.md` paths above are targets — those files are not written yet and land with P6-11/P6-20. P6-11 verifies this catalog against live alerts; P6-20 authors the runbooks.

---

## 5. On-call and incident communication

- **Rotation:** weekly, single primary on-call with a named secondary; escalation after 15 minutes unacknowledged (P1/P2) to the secondary, then to the engineering manager.
- **Incident channels:** one channel per incident with the commander, scribe, and comms lead roles; timeline recorded in the incident tool.
- **Customer communication triggers** (`security.md` §15):
  - P1 affecting availability or data handling: acknowledge publicly on the status page within 1 hour; direct customer notification **within 24 hours**; breach analysis follows the DPDPA processor obligations.
  - P2 > 30 minutes: first status-page update, then every 60 minutes until resolved.
  - P3: status-page post-incident note if customers were affected.
- **Status page** (P6-14): fed from the SLO metrics in §1 with three components (Web app, API, Scan execution); incidents are created automatically from P1/P2 alerts and closed manually after review.
- **Post-incident:** blameless review within five business days for every P1/P2; action items get owners and dates and are tracked to closure.

---

## 6. Degraded modes

| Condition | Behaviour | User-visible signal |
|---|---|---|
| GitHub unavailable or abuse-limiting clones | New scans stay `queued` (up to the existing 10-minute hold, then retry per architecture.md §10); no clone attempts during a detected outage | Banner: "Scanning is delayed because GitHub is unreachable. Your scans will start automatically." Status-page component degrades to *degraded* |
| Scanner crash / timeout | Scan continues with remaining scanners; coverage marked `partial` | Coverage warning on the scorecard; **never** a "clean" message (memory.md invariant 7) |
| Renderer down | PDF requests queue; dashboard unaffected | "Report rendering is delayed" on the report status |
| Redis down | Scan submission returns `503 UPSTREAM_UNAVAILABLE` with `Retry-After`; reads still served | Error toast with retry; status page degraded |
| PostgreSQL primary down | Failover to replica (PITR promote if needed); writes pause | Status page degraded; queued scans held — **no scan results are ever guessed or back-filled as clean** |

**Rule:** degraded modes never fabricate results. A held scan shows `queued` with an explanation; it does not show a score.

---

## 7. Log and trace retention

| Data | Hot | Cold | Owner |
|---|---|---|---|
| Application logs (JSON, Pino) | 30 days | 90 days | Platform — log pipeline (Loki/CloudWatch per environment) |
| OpenTelemetry traces | 30 days | 90 days (sampled) | Platform — OTel collector → Tempo/Jaeger |
| Metrics (Prometheus) | 15 days at full resolution | 1 year at 5-minute resolution | Platform |
| Audit logs (`audit_logs`) | In PostgreSQL | 365 days, append-only (`database.md` §9) | Orchestrator / security |
| Incident timelines | — | 1 year | Incident tool |

Retention is enforced by pipeline TTL rules, not by application code; `security.md` §6 zero-retention rules for source code are independent and absolute. Log pipelines never receive repository contents, secret values, or raw scanner output (`security.md` §13 "Never logged").
