# Runbook: Report Renderer Failure

| Field | Value |
|---|---|
| Trigger | `report_render_duration_seconds` p95 > 10 s for 15 min, failed PDF requests, or report worker crashes |
| Severity | P2 |
| Recipient | On-call |
| Related | `operations.md` §4, `architecture.md` §8, `security.md` §18 |

## Runtime and impact

The orchestrator consumes BullMQ's `report.render` queue, builds the HTML with
`apps/orchestrator/src/modules/reports/report-template.ts`, and connects to a
separately operated Chromium browser. The distroless API image does not launch a
local browser. Render failures propagate to BullMQ; an empty placeholder is never
published as a ready PDF.

PDF bytes are stored on a filesystem, not in S3. `REPORTS_STORAGE_DIR` defaults to
`/tmp/dpdpa-reports`; production must use a durable volume shared by every API and
worker replica. A report's file is `<REPORTS_STORAGE_DIR>/<reportId>/report.pdf`;
its database storage key is `reports/<reportId>.pdf`. A missing or inaccessible
volume can break downloads even when rendering succeeded. Findings remain in
PostgreSQL, but lost PDF files must be regenerated.

## Diagnosis

1. **Identify the report and its state.** With the affected tenant's authenticated
   session, inspect `GET /api/v1/report/pdf/<reportId>` and the failed
   request in the browser network panel. Distinguish `queued`, `rendering`,
   `failed`, `ready`, and expired downloads. Fresh download grants last 15 minutes;
   PDF retention is 30 days. Do not put session cookies or download tokens in an
   incident ticket.

2. **Inspect the orchestrator and browser deployment.** Substitute the actual
   namespace and pod names used by your deployment:

   ```bash
   kubectl describe pod -n <namespace> <orchestrator-pod>
   kubectl logs -n <namespace> <orchestrator-pod> --tail=200
   kubectl top pod -n <namespace> <orchestrator-pod>
   ```

   Check pod restarts, `OOMKilled`, volume mounts, and the separately operated
   browser's health/logs. Orchestrator `/health` and `/ready` endpoints do not prove
   that Chromium or report storage is healthy. Look for `report.render worker
   error`, `queued report recovery failed`, and queue connection errors; inspect
   the BullMQ job's `failedReason`, `attemptsMade`, and state using approved queue
   tooling. Rendering errors include missing browser configuration, failed
   WebSocket handshakes, and page/PDF errors. Filesystem errors such as `EACCES`,
   `ENOENT`, `EROFS`, or `ENOSPC` indicate a storage problem.

3. **Verify the browser connection.** `REPORTS_BROWSER_WS_ENDPOINT` must be a
   reachable DevTools **browser** WebSocket URL. Remote connections require
   `wss://` through a bridge that explicitly authenticates and authorizes each
   worker. Chromium DevTools has no built-in client authentication; network
   placement or adding credentials to a URL does not provide authorization.
   Treat bridge credentials in the URL as secrets. A loopback-only sidecar may use
   `ws://localhost`, `ws://127.0.0.1`, or `ws://[::1]` within the same isolated
   pod/network namespace. Remote cleartext WebSocket URLs are rejected; browser
   connection handshakes time out after 15 seconds.

4. **Check the shared report volume.** Confirm the same `REPORTS_STORAGE_DIR`
   value and persistent volume are mounted in API and worker replicas. Verify the
   non-root orchestrator UID can create directories and write/read files there;
   check free bytes, inodes, read-only mounts, and mount events. For a ready
   report, inspect `<REPORTS_STORAGE_DIR>/<reportId>/report.pdf` and compare its
   SHA-256 and byte length with the report row. Use approved storage/debug tooling
   with the same mount and UID; the distroless application container has no shell.
   Do not upload a test object to S3 or change IAM policies: this implementation
   has no S3 client. Avoid deleting or overwriting an existing ready PDF.

5. **Inspect the retry state.** Jobs use the report ID as their BullMQ job ID and
   have three total attempts, with 30-second and 2-minute waits before the second
   and third attempts. The worker marks the report failed when BullMQ reports a terminal `failed` state,
   including unrecoverable stall failures below the processor-attempt limit.
   Retrying jobs in `delayed` or `waiting` remain eligible to render.
   Queued database rows are reconciled every 30 seconds, including retrying a
   retained failed queue job when its durable report row is still queued. A
   retained job alone does not mean the report is eligible for recovery.

## Remediation

- **Browser outage or configuration failure:** restore the authenticated bridge
  or isolated sidecar and validate its browser WebSocket endpoint. Restart or
  redeploy the affected service through the deployment's normal process after
  configuration changes. Never log the endpoint's credentials.
- **Storage failure:** restore the shared writable durable mount, correct volume
  ownership/permissions for the non-root service UID, and resolve capacity or
  filesystem errors. All replicas must see the same files. An ephemeral `/tmp`
  directory in separate containers is not shared storage.
- **OOM or browser crash:** inspect actual resource utilization and adjust the
  affected orchestrator/browser deployment's limits. Redeploy through the
  deployment's normal process; this repository does not provide a renderer Helm
  chart. Do not delete BullMQ Redis keys to force a retry.
- **Template/data failure:** inspect the report's tenant-scoped view model via
  the authenticated internal API and fix the template or source data. Internal
  endpoints require the documented HMAC and tenant headers; do not use an
  unsigned curl request as a health test.

Allow active jobs to finish their normal retry policy. Preserve durable queued
rows during ambiguous Redis failures: the recovery sweep reuses the same report
ID. Do not reset ready/failed/expired rows or invoke an undocumented admin retry
endpoint. After fixing the dependency, an auditor or higher role can request a
new PDF for the completed scan through the application (a failed report requires
a new idempotency key). Confirm the new report reaches `ready`, its PDF downloads
through the authenticated same-origin URL, and the file's hash/size match stored
metadata. Repeated completion of a ready report must preserve its original file
and meter usage once.

## Escalation and follow-up

Escalate persistent browser, volume, or pod failures to the deployment owner. Page
Security if a browser endpoint is exposed or PDF content crosses tenant scope.
Record the affected report IDs, redacted errors, root cause, recovery, and download
verification in the incident report. Add regression coverage for a verified
application defect; do not copy secrets, report contents, or signed URLs into it.
