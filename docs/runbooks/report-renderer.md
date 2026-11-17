# Runbook: Report Renderer Failure

| Field | Value |
|---|---|
| Trigger | `report_render_duration_seconds` p95 > 10 s for 15 min or `renderer` pod crash |
| Severity | P2 |
| Recipient | On‑call |
| Related | `operations.md` §4, `architecture.md` §8, `security.md` §18 |

---

## Symptoms

- Users receive a *"Report generation failed"* error when downloading a PDF.
- The dashboard shows the **Report render latency** alert (`report_render_duration_seconds` p95 > 10 s).
- `renderer` pod restarts repeatedly (`CrashLoopBackOff`) or shows *OOMKilled* in the pod status.
- S3 bucket does **not** contain a new PDF object for the affected `reportId`.
- Orchestrator logs contain `renderer.callback.timeout` or `renderer.upload.error` entries.
- The **renderer health endpoint** (`/internal/health`) returns `status: degraded`.

## Impact

- Affected users cannot obtain the PDF audit report; they must wait for a retry or fallback to the HTML view.
- Scan‑to‑PDF SLO (p95 < 10 s) error budget burns, possibly triggering a canary rollback if the fast‑burn window is exceeded.
- No data loss: the intermediate findings remain persisted in PostgreSQL, and the HTML view model is still available.
- **Compliance impact:** PDF is the formal artifact for audit customers; prolonged unavailability may affect contractual SLA.

## Diagnosis

1. **Check renderer health endpoint**
   ```bash
   curl -s http://renderer.internal/internal/health | python3 -m json.tool
   ```
   - Look for `status: degraded` or `error: <message>`.

2. **Inspect renderer pod status**
   ```bash
   kubectl get pods -n app -l app.kubernetes.io/name=renderer
   kubectl describe pod -n app $(kubectl get pods -n app -l app.kubernetes.io/name=renderer -o jsonpath='{.items[0].metadata.name}')
   ```
   - Verify if the pod is *CrashLoopBackOff*, *OOMKilled*, or *ImagePullBackOff*.

3. **View recent renderer logs**
   ```bash
   kubectl logs -n app -l app.kubernetes.io/name=renderer --tail=200
   ```
   - Look for `PuppeteerError`, `TemplateRenderError`, `S3UploadFailed`, or `SIGKILL` messages.

4. **Validate the HTML view model**
   ```bash
   # Request the view model for a known reportId
   curl -s http://orchestrator.internal/internal/v1/reports/<reportId>/view-model | python3 -m json.tool
   ```
   - Ensure the JSON is well‑formed and contains required fields (`scanId`, `orgId`, `findings`).

5. **Check S3 upload permissions**
   ```bash
   # Attempt a test upload with the service account used by the renderer
   aws s3 cp /dev/null s3://reports-test/<timestamp>.tmp --endpoint-url https://s3.example.com
   ```
   - Verify IAM role / bucket policy allows `PutObject` for the `reports/<orgId>/` prefix.

6. **Inspect resource utilization**
   ```bash
   kubectl top pod -n app -l app.kubernetes.io/name=renderer
   ```
   - Check CPU/memory usage; high memory may indicate a rendering‑heavy template or a memory leak.

7. **Confirm the retry/back‑off state**
   - The orchestrator enqueues a `report.render` job with a 3‑attempt exponential back‑off (`30 s, 2 m, 10 m`). Verify the job’s `attemptsMade` field via the BullMQ dashboard or Redis:
   ```bash
   redis-cli -h <redis-host> -a <redis-pass> HGET "dpdpa:report:job:<reportId>" "attemptsMade"
   ```

## Remediation

### Transient Failure (rate limit, temporary S3 glitch)
1. **Allow back‑off to complete.** No manual action required; the job will retry automatically up to three times.
2. **If the job is stuck in `failed` state**, manually re‑queue:
   ```bash
   curl -X POST http://orchestrator.internal/internal/admin/queue/retry \
     -H "X-Internal-Key: <key>" \
     -H "X-Signature: <hmac>" \
     -d '{"reportId": "<reportId>", "reason": "manual_retry"}'
   ```

### Renderer Pod Crash or OOM
1. **Increase memory limits** in the renderer Deployment (default 2 Gi memory, 4 Gi limit). Edit the Helm chart or manifest:
   ```yaml
   resources:
     requests:
       cpu: "500m"
       memory: "3Gi"
     limits:
       cpu: "1"
       memory: "6Gi"
   ```
2. **Roll out the updated Deployment**:
   ```bash
   helm upgrade --install auditor ./infra/helm/renderer -n app
   ```
3. **Validate that the pod stabilises** (`kubectl get pods -w`).
4. **Clear any stuck jobs** by resetting the BullMQ queue for that report:
   ```bash
   redis-cli -h <redis-host> -a <redis-pass> DEL "dpdpa:report:job:<reportId>"
   ```
5. **Re‑trigger rendering** (same manual retry as above).

### Template or Data Errors
1. **Identify the problematic scan/template** from the logs (e.g., *TemplateRenderError* mentions a missing field).
2. **Fix the template** in `apps/renderer/templates/` and redeploy the renderer.
3. **Run a sanity test** on a small repo:
   ```bash
   curl -X POST https://app.example.com/api/v1/report/render \
     -H "Authorization: Bearer <api-key>" \
     -d '{"scanId": "<test-scan-id>"}'
   ```
   - Verify the PDF appears in S3 and the response returns a signed URL.

### S3 Permission Issues
1. **Update bucket policy** to allow the renderer’s IAM role `s3:PutObject` on `reports/<orgId>/*`.
2. **Rotate the renderer’s service‑account credentials** if they were revoked.
3. **Restart the renderer pods** to pick up the new credentials.

## Escalation

- **Escalate to Platform Engineer** if the renderer pods continue crashing after memory limit adjustments or if the S3 bucket policy cannot be updated promptly.
- **Escalate to Engineering Manager** if the report‑render latency remains above the SLO for > 30 min, indicating a potential systemic issue.
- **Page Security Lead** if logs show unexpected data being written to the PDF (possible data‑leak pathway).

## Postmortem

- Record the incident in the incident‑tracking tool within five business days.
- Include: timeline of alerts, root cause (e.g., OOM, template bug, S3 permission), number of affected reports, actions taken, and verification steps.
- Add regression tests: render a PDF for a medium‑size scan (≈ 5 MB) and verify it succeeds under load.
- Update the **renderer health check** (`architecture.md` §10) to surface template rendering errors more clearly.
- Review the **retry policy** for `report.render` jobs; consider increasing back‑off if external dependencies (S3) are flaky.


## Browser connection and queued-job recovery

The orchestrator connects to a separately operated Chromium instance using
`REPORTS_BROWSER_WS_ENDPOINT` (a private `ws://` or `wss://` DevTools browser
WebSocket URL). The distroless API image does not launch a local browser. Restrict
that endpoint to the orchestrator network and treat credentials in its URL as
secrets. If it is absent or rendering fails, the job retries and eventually marks
the report failed; an empty placeholder is never published as a ready PDF.

Report creation persists a tenant-scoped idempotency key and reserves monthly
quota under a database lock. If Redis accepts a job but the response is lost,
retain the queued report row. A recovery sweep every 30 seconds re-enqueues its
same report ID, which BullMQ deduplicates. Do not delete these rows to clear an
ambiguous queue failure. Apply the report-idempotency migration before deploying.
