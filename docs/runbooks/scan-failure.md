# Runbook: Scan Failure

| Field | Value |
|---|---|
| Trigger | `scan_failure_rate > 5%` for 10 min |
| Severity | P2 |
| Recipient | On-call |
| Related | `operations.md` §4, `architecture.md` §10, `security.md` §13 |

---

## Symptoms

- Dashboard shows scans stuck in `failed` status beyond the expected rate.
- `scan_failure_rate` ratio exceeds 5% on the platform dashboard or Prometheus.
- Customer tickets report "scan failed" or "my scan never completes."
- BullMQ dead-letter queue depth (`dlq_depth`) increases.
- `job_failure_total{org}` counter rises for one or more orgs.
- Logs contain `scan_status_transition` entries with `status=failed` and an error code.

## Impact

- Affected users cannot obtain scan results; no score or findings are persisted.
- If systemic (GitHub outage, runner image issue), **all** queued and in-progress scans are blocked.
- The scan-execution SLO (99.0%) error budget burns; fast-burn triggers a canary rollback gate (`operations.md` §1).
- **No data exposure risk** — failed scans never produce findings; the zero-retention invariant holds.

## Diagnosis

1. **Identify the failure code.** Check the orchestrator logs for the dominant error code:
   ```bash
   # Find the most common failure reason
   grep -o '"errorCode":"[^"]*"' /var/log/orchestrator/current | sort | uniq -c | sort -rn
   ```
   Common codes:
   - `GITHUB_RATE_LIMITED` — GitHub clone is rate-limited or unreachable. → Proceed to `github-outage.md`.
   - `REPO_NOT_FOUND` — Repository is private or does not exist. User error; not counted against the SLO.
   - `REPO_TOO_LARGE` — Repository exceeds the plan's size cap. User error.
   - `SCANNER_TIMEOUT` — A scanner exceeded its per-scanner deadline.
   - `OOMKILLED` — The scan pod was OOMKilled.
   - `INCOMPLETE_RESULTS` — Runner exited but the findings callback was never received.
   - `JOB_FAILED` — Kubernetes Job failed with a non-zero exit.

2. **Check the queue state.**
   ```bash
   # BullMQ queue metrics (via Redis CLI or BullMQ dashboard)
   redis-cli -h <redis-host> -a <redis-pass> \
     KEYS "dpdpa:scan:*" | head -20
   redis-cli -h <redis-host> -a <redis-pass> \
     GET "dpdpa:scan:depth"
   ```
   - `waiting` jobs > 50 sustained for 10 min indicates backpressure.
   - `failed` jobs accumulating indicates the processor is rejecting work.

3. **Inspect recent scan rows.**
   ```sql
   -- Last 20 failed scans with their error codes
   SELECT id, repository_id, ref, status, failure_reason, updated_at
   FROM scans
   WHERE status = 'failed'
   ORDER BY updated_at DESC
   LIMIT 20;
   ```

4. **Check the scanner node pool.**
   ```bash
   kubectl get nodes -n scanners -l workload=scanner
   kubectl get jobs -n scanners --sort-by=.status.startTime | tail -20
   kubectl describe job -n scanners <scan-job-name> | grep -E "Failed|OOM|BackOff"
   ```

5. **Verify the runner image.**
   ```bash
   kubectl get deployments -n app orchestrator -o=jsonpath='{.spec.template.spec.containers[*].image}'
   # Confirm the scan-runner image digest has not changed unexpectedly
   kubectl get jobs -n scanners -o=jsonpath='{.items[0].spec.template.spec.containers[*].image}'
   ```

6. **Check for a recent deployment.** Correlate `scan_failure_rate` with the last Argo CD sync or image push in the past 2 hours.

## Remediation

### GITHUB_RATE_LIMITED or clone failures
1. Follow `github-outage.md`. Do not scale scan-runner; the issue is external.
2. Scans are held in `queued` up to 10 minutes before failing; the reconciler re-submits after GitHub recovers.

### OOMKILLED
1. Check if the affected scans are from larger-than-average repositories:
   ```sql
   SELECT s.repository_id, s.ref, s.size_bytes
   FROM scans s
   JOIN repositories r ON s.repository_id = r.id
   WHERE s.status = 'failed' AND s.failure_reason = 'OOMKILLED'
   ORDER BY s.updated_at DESC
   LIMIT 10;
   ```
2. If pods are consistently OOMKilled, increase the ephemeral-storage and memory limits in the Job template (`security.md` §5.1):
   - Memory: `4Gi` → `6Gi` for the affected plan tier.
   - Ephemeral storage: `6Gi` → `8Gi`.
3. Apply the Job template change via Argo CD and monitor `job_oom_total` for 15 minutes.
4. Re-queue failed scans:
   ```bash
   # In orchestrator admin (or via API if enabled)
   # Re-submitted scans pick up the new resource limits
   ```

### INCOMPLETE_RESULTS (callback lost)
1. Verify the Job completed successfully:
   ```bash
   kubectl get job -n scanners <scan-job-name> -o=jsonpath='{.status.succeeded}'
   ```
2. Check orchestrator logs for the callback:
   ```bash
   grep "findings.callback" /var/log/orchestrator/current | grep "<scanId>"
   ```
3. If the Job succeeded but no callback arrived, the scan cannot be recovered — the runner's `emptyDir` is already destroyed. The scan row remains `failed` with `INCOMPLETE_RESULTS`. Inform the user to re-submit; the scan is idempotent by `(repository_id, ref)`.

### SCANNER_TIMEOUT
1. Check which scanner timed out from the scan's metadata:
   ```sql
   SELECT id, scanner_timed_out, scan_duration_seconds
   FROM scans
   WHERE status = 'failed' AND failure_reason = 'SCANNER_TIMEOUT'
   ORDER BY updated_at DESC
   LIMIT 10;
   ```
2. If Semgrep is timing out on large repos, consider enabling the reduced scanner profile for repos > 250 MB (`architecture.md` §12).
3. A single timed-out scanner marks coverage as `partial` — the scan still completes with other scanners' results. Only mark the scan as fully failed if **all** scanners timed out.

### JOB_FAILED (general runner failure)
1. Check the runner container logs:
   ```bash
   kubectl logs -n scanners job/<scan-job-name> --tail=200
   ```
2. Look for image pull errors, gVisor runtime issues, or dependency failures.
3. If systemic across multiple scans, check the runner image was signed and admitted:
   ```bash
   # Check admission policy rejections
   grep "admission.rejection" /var/log/kube-apiserver/current | tail -20
   ```
4. If the image digest is stale or unsigned, re-build and re-sign the scan-runner image; roll out via Argo CD.

### Dead-letter queue processing
1. If the DLQ has accumulated retriable jobs, inspect them:
   ```bash
   # Via BullMQ dashboard or Redis
   # Check job.attempts and job.failedReason
   ```
2. For retriable failures (transient network, temporary GitHub rate limit), re-enqueue after resolving the root cause.
3. For non-retriable failures (invalid repo, scanner incompatibility), discard and notify the user.

## Escalation

- **Escalate to Platform engineer** if: OOM failures persist after limit increase, runner image admission is failing, or the scanner node pool is under-provisioned.
- **Escalate to Engineering Manager** if: `scan_failure_rate` exceeds 10% for 30 minutes and a deployment correlation is confirmed — initiate rollback per `architecture.md` §11 release flow.
- **Page Security Lead** if: failure pattern suggests a compromised runner image or unexpected egress from the scanners namespace.

## Postmortem

- Record findings in the incident tool within five business days.
- Include: failure rate timeline, root cause, affected orgs and scans, SLO budget consumption, and corrective actions.
- Add a regression test: golden-repo scan for the affected repository size band.
- Update the retry policy in `architecture.md` §10 if the current backoff (`30s, 2m, 10m`) is inadequate.
