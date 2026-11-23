# Runbook: Retention Violation

| Field | Value |
|---|---|
| Trigger | `source_retention_violation_total > 0` (any value is P1) |
| Severity | **P1** — security incident, not a test failure to retry |
| Recipient | On-call + Security lead + Engineering manager |
| Related | `operations.md` §4, `security.md` §6, `security.md` §12, `database.md` §6 |
| Response model | `security.md` §15 Incident response (P1 definition) |

---

## Symptoms

- `source_retention_violation_total` metric increments to any value above zero.
- The canary-retention test (CI or scheduled) fails: a canary string seeded into a fixture repository is found in PostgreSQL, S3, logs, or traces.
- The hourly retention job (`retention` queue) reports an error or exits abnormally.
- A scan or finding row persists beyond the organisation's `retention_days` policy (default 90 days, max 365).
- A session row is not deleted within the 8-hour absolute / 30-minute idle window.
- Audit logs for `retention.updated` actions show a configuration change that should have triggered a deletion sweep that did not run.
- Direct inspection finds source code content in a table, bucket, or log that should only ever contain redacted findings.

## Impact

This is the most severe class of incident for the DPDPA auditor product. The entire value proposition and the DPDPA compliance posture rest on the zero-retention invariant (`security.md` §6, ADR-010):

- **Customer source code is retained somewhere it must not be.** This is a direct violation of the privacy notice, DPA, and the data-minimisation principle (`security.md` §14).
- **Breach notification obligations are triggered.** Under the incident response plan (`security.md` §15), a P1 affecting data handling requires customer notification within 24 hours of confirmation and assessment for regulatory notification within 72 hours.
- **Scope expansion for any future breach.** If source code is retained, a subsequent breach of the store containing it expands the blast radius.
- **Trust and contractual impact.** Enterprise customers with DPDPA audits will treat this as a material breach of the DPA.
- **The scan-execution SLO and availability SLO are not the primary concern here** — the security and compliance impact dominates.

## Diagnosis

Follow the incident-response outline in `security.md` §15: **detect and declare → contain → preserve evidence → assess → eradicate and recover → notify → postmortem → test.**

### 1. Detect and declare

1. Confirm the alert is genuine, not a metric scrape artefact:
   ```bash
   # Inspect the raw counter
   curl -s http://prometheus.internal/api/v1/query?query=source_retention_violation_total | python3 -m json.tool
   ```
2. Open an incident channel with commander, scribe, and comms lead roles (`operations.md` §5).
3. Declare **P1** and page the security lead immediately.

### 2. Contain

1. **Stop the retention job** to prevent further writes if the job itself is leaking:
   ```bash
   # Pause the BullMQ retention queue
   curl -X POST https://orchestrator.internal/internal/admin/queue/pause \
     -H "X-Internal-Key: <key>" \
     -d '{"queue": "retention"}'
   ```
2. **Freeze new scan submissions** if the leak is in the scan pipeline:
   ```bash
   # Enable maintenance mode / feature flag to block new scans
   kubectl scale deployment orchestrator -n app --replicas=0  # or set feature flag
   ```
3. **Block access to the suspected store** (e.g., revoke signed URLs for the affected S3 prefix, rotate DB credentials if the leak is in PostgreSQL).

### 3. Preserve evidence

1. **Snapshot logs and audit rows** before any cleanup:
   ```bash
   # Capture the current audit trail
   psql -h <db-host> -U <user> -d dpdpa \
     -c "\copy (SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000) TO '/tmp/audit_snapshot.csv' CSV"
   # Snapshot relevant logs
   kubectl logs -n app -l app.kubernetes.io/name=orchestrator --since=24h > /tmp/orch_logs.txt
   kubectl logs -n scanners --since=24h --all-containers > /tmp/scanner_logs.txt 2>&1 || true
   ```
2. **Do not delete the Job or Secret** until captured (per `security.md` §15 step 3).

### 4. Assess — where is the canary?

Run the canary query against every store named in `security.md` §6.3:

```sql
-- PostgreSQL: search all text and JSON columns
SELECT 'scans' AS tbl, id FROM scans WHERE CAST(to_jsonb(scans) AS text) LIKE '%<canary>%'
UNION ALL
SELECT 'findings', id FROM findings WHERE CAST(to_jsonb(findings) AS text) LIKE '%<canary>%'
UNION ALL
SELECT 'audit_logs', id FROM audit_logs WHERE CAST(to_jsonb(audit_logs) AS text) LIKE '%<canary>%';
```

```bash
# S3: list and download every object under the raw/ and reports/ prefixes
aws s3 ls s3://dpdpa-reports/raw/ --recursive
aws s3 cp s3://dpdpa-reports/raw/ /tmp/s3_raw/ --recursive
grep -r "<canary>" /tmp/s3_raw/ 2>/dev/null

# Logs: search the log pipeline (Loki / CloudWatch)
# Loki example:
logcli query --limit=1000 '{namespace="app"} |= "<canary>"' --since=24h
# CloudWatch example:
aws logs filter-log-events --log-group-name /dpdpa/orchestrator \
  --filter-pattern '"<canary>"' --start-time $(date -d '24 hours ago' +%s000)

# Traces: search Tempo / Jaeger for the canary in span attributes
# ( OTel collector should have scrubbed it; if present, the redaction pipeline is broken )
```

### 5. Determine root cause

Common root causes, in order of likelihood:

| Root cause | How to confirm |
|---|---|
| **Redaction gap in a scanner adapter.** A new scanner or rule emits a field that the normaliser does not redact. | Diff the adapter's output schema against the `NormalizedFinding` schema; check `apps/scan-runner/src/adapters/`. |
| **A new code path writes repo contents.** A developer added a debug log, a temporary S3 upload, or a cache write that bypasses the emptyDir. | Search for `writeFile`, `upload`, `console.log`, `logger.info` in the scan-runner and orchestrator; check for new S3 prefixes. |
| **Retention job bug.** The hourly job's batch query misses rows (e.g., a new `scan_status` enum value not in the `WHERE` clause). | Inspect `apps/orchestrator/src/queue/retention.processor.ts`; check the enum coverage. |
| **Audit log metadata leak.** An audit entry's `metadata` JSONB contains repository content or a secret value. | Query `audit_logs` for `metadata` fields that look like file contents. |
| **Session store leak.** Session rows contain source code (should only contain session metadata). | Inspect `sessions` table schema and the `nuxt-auth-utils` session payload. |
| **Log pipeline misconfiguration.** A log line accidentally includes raw scanner output or repo file content. | Check the Pino logger redaction allowlist (`security.md` §13 "Never logged"). |

### 6. Scope the incident

Answer these questions and record them in the incident channel:

- **Which tenants are affected?** (org IDs, count)
- **What data categories are involved?** (source code, secrets, PII)
- **How long has the leak been occurring?** (check the earliest log entry or audit row showing the leak)
- **Which stores are affected?** (PostgreSQL, S3, logs, traces)
- **Is the leak ongoing or was it a one-time event?** (check if the retention job is still running and producing new hits)

## Remediation

### Immediate (containment)

1. **Stop the leaking process** (retention job, scan pipeline, or log pipeline as identified).
2. **Purge the leaked data** from the affected store:
   ```sql
   -- PostgreSQL: delete the affected rows (after capturing evidence)
   DELETE FROM findings WHERE id IN (<affected ids>);
   DELETE FROM scans WHERE id IN (<affected ids>);
   ```
   ```bash
   # S3: delete the affected objects
   aws s3 rm s3://dpdpa-reports/raw/<orgId>/<scanId>/ --recursive
   ```
3. **Rotate any exposed credentials.** If a secret value was found in a log or S3 object, rotate the corresponding credential immediately (`security.md` §10).
4. **Verify the leak is closed** by re-running the canary query (see Diagnosis step 4).

### Root-cause fix

1. **Fix the code path.** Patch the redaction gap, retention job bug, or logging misconfiguration.
2. **Add a regression test.** The canary-retention test (`security.md` §6.3) must pass before the fix is merged.
3. **Redeploy** the affected service.
4. **Re-run the full canary test suite** against the fixed pipeline:
   - Seed the fixture repository.
   - Run a full scan.
   - Query all stores for the canary.
   - Attach the signed test artifact to the release (`security.md` §6.3 step 7).

### Customer and regulatory notification

This is mandatory for P1 (`security.md` §15):

1. **Assess within 72 hours** whether the incident constitutes a reportable breach under the DPDPA.
2. **Notify affected customers without undue delay**, with facts known at the time and a follow-up cadence. Legal approves the wording.
3. **Support the customer's DPO** with the technical evidence they need for their Board notification.
4. **No speculation** about cause or scope in external communications.
5. Update the **status page** and send a direct customer notification within 24 hours of confirmation (`operations.md` §5).

## Escalation

- **Security lead** is paged immediately — this runbook's first recipient.
- **Engineering manager** is paged for resource allocation and customer-communication decisions.
- **DPO** is engaged within 1 hour to assess breach-notification obligations.
- **External pen-test firm or legal counsel** is engaged if the scope is unclear or if regulatory notification may be required.

## Postmortem

- Blameless review within **five business days** (`security.md` §15).
- Record in the incident tool:
  - Timeline from detection to containment to recovery.
  - Root cause and the specific code path that leaked.
  - Stores affected and data categories involved.
  - Tenants notified and the notification timeline.
  - SLO and compliance impact.
- **Action items with owners and dates**, tracked to closure:
  - Add or strengthen the regression test that would have caught this.
  - Add a CI check that fails the build if a new field is added to `NormalizedFinding` without a redaction rule.
  - Review the log-pipeline redaction allowlist and add a canary probe to the log-pipeline CI.
- **Update `security.md` §6** if the canary test procedure changes.
- **Tabletop exercise** within 30 days: simulate a retention violation and walk through this runbook.