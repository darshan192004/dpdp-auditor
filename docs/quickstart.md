# DPDPA GitHub Code Auditor — Customer Quickstart

| Field             | Value                                          |
| ----------------- | ---------------------------------------------- |
| Document version  | 1.0                                            |
| Status            | Approved for MVP build                         |
| Date              | 2026-11-04                                     |
| Audience          | Customer success, DPO, engineering             |
| Related documents | `PRD.md`, `api.md`, `security.md`, `design.md` |

---

## 1. What you need

- A GitHub account with access to the repository you want to audit.
- An API key from the DPDPA Auditor dashboard (or a session cookie if using the web UI).
- The repository must be public. Private repositories are not supported at MVP.

## 2. First scan (web UI)

1. Sign in at `https://app.dpdpa-auditor.example`.
2. Click **Connect repository**.
3. Paste the repository URL: `https://github.com/<owner>/<repo>`.
4. The auditor resolves the repository, checks the default branch, and confirms the size is within your plan's limit.
5. Click **Scan**. The scan runs in an isolated Kubernetes job.
6. When complete, you receive a DPDPA score, a grade, and a PDF report.

**Typical time to first result:** under two minutes.

## 3. First scan (API)

```bash

# 1. Resolve a repository

curl -X POST https://app.dpdpa-auditor.example/api/v1/repos/resolve \
  -H "Authorization: Bearer $DPDPA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/owner/repo"}'

# 2. Create a scan

curl -X POST https://app.dpdpa-auditor.example/api/v1/scans \
  -H "Authorization: Bearer $DPDPA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"orgId": "<your-org-id>", "repoId": "<repo-id-from-step-1>"}'

# 3. Poll for results

curl https://app.dpdpa-auditor.example/api/v1/scans/<scan-id> \
  -H "Authorization: Bearer $DPDPA_API_KEY"
```

See `api.md` §13 for a complete CI integration example.

## 4. Understanding the report

The PDF report contains:

- **Score** — a 0–100 DPDPA compliance score with a letter grade.
- **Section rollups** — per-DPDPA-section breakdown (Sections 5, 6, 7, 8(4), 8(5), 9, 10, 12, 13, 16).
- **Findings** — each finding links to the DPDPA clause, the scanner rule that triggered it, and a remediation suggestion.
- **Evidence** — the file path, line range, and a fingerprint for each finding.

## 5. What happens to your code

- The repository is cloned into an ephemeral Kubernetes job.
- Semgrep, Checkov, and Gitleaks run against the clone.
- **The clone is deleted when the job completes.** No source code is stored in the database, object store, log, cache, or backup.
- Only metadata (repository name, default branch, size, visibility, language) and findings are persisted.
- Raw SARIF output is retained for 24 hours for debugging, then deleted.

See `security.md` §1 for the full data-handling policy.

## 6. Common issues

| Symptom              | Likely cause                         | Fix                                                      |
| -------------------- | ------------------------------------ | -------------------------------------------------------- |
| `404` on scan create | Foreign org ID or missing repository | Confirm the repo ID belongs to your org                  |
| `422` on resolve     | Invalid URL or private repo          | Use a public `https://github.com/<owner>/<repo>` URL     |
| `429`                | Rate limit exceeded                  | Wait for the `Retry-After` window, then retry            |
| `503`                | Service temporarily unavailable      | Check the status page; retry after 30 seconds            |
| Scan stays `queued`  | Runner capacity or GitHub rate limit | Check `GET /api/v1/scans/<id>` for status and error code |

## 7. Need help?

- Documentation: `https://docs.dpdpa-auditor.example`
- Status page: `https://status.dpdpa-auditor.example`
- Support: `security@dpdp-auditor.example`
- Emergency: follow the incident response runbook in `docs/runbooks/`
