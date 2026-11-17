# DPDPA GitHub Code Auditor — Security Package

| Field             | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Document version  | 1.0                                                                    |
| Status            | Approved for MVP build                                                 |
| Date              | 2026-11-04                                                             |
| Audience          | Enterprise security reviews, customer success                          |
| Related documents | `security.md`, `architecture.md`, `operations.md`, `privacy-notice.md` |

---

## 1. Overview

DPDPA GitHub Code Auditor is a B2B SaaS that scans public GitHub repositories for exposure under India's Digital Personal Data Protection Act, 2023. The platform runs on a multi-layer architecture: a Nuxt/Nitro public API, a NestJS orchestrator, and ephemeral Kubernetes jobs for scanning.

**Customer source code is never retained.** Not in a database, object store, log, cache, or backup.

## 2. Security controls

### Access Control

| Control                | Implementation                                                       |
| ---------------------- | -------------------------------------------------------------------- |
| Authentication         | Server-side sessions with absolute (30 day) and idle (2 hour) expiry |
| API keys               | Hashed storage (Argon2), scoped to `viewer` or `admin`, revocable    |
| Role-based access      | Admin, editor, viewer roles with endpoint-level enforcement          |
| Cross-tenant isolation | Org-scoped queries at the service layer; foreign org ID returns 404  |

### Data Protection

| Control     | Implementation                                         |
| ----------- | ------------------------------------------------------ |
| In transit  | TLS 1.3 for all API traffic; strict host allowlists    |
| At rest     | PostgreSQL (AES-256), S3 (SSE-KMS)                     |
| Source code | Ephemeral clones deleted on scan completion            |
| Secrets     | No customer credentials stored; anonymous clone at MVP |
| Raw SARIF   | Retained 24 hours for debugging, then deleted          |

### Infrastructure Security

| Control         | Implementation                                                   |
| --------------- | ---------------------------------------------------------------- |
| Network         | Internal services not internet-reachable; one public API surface |
| Isolation       | Kubernetes jobs run in separate namespaces with resource limits  |
| SSRF protection | GitHub URL allowlist; no redirects; protocol and host validation |
| Rate limiting   | Redis-backed fixed-window counters per policy                    |
| Audit logging   | Append-only audit trail for all security-relevant actions        |

### Monitoring

| Control          | Implementation                                                       |
| ---------------- | -------------------------------------------------------------------- |
| Logging          | Structured JSON with request IDs; PII redaction                      |
| Metrics          | SLO dashboards; error-rate and latency tracking                      |
| Alerting         | P1/P2/P3 severity with runbooks                                      |
| Canary retention | Automated test on every release verifying zero source code retention |

## 3. Compliance posture

| Obligation                 | Evidence                                          |
| -------------------------- | ------------------------------------------------- |
| Zero source code retention | Ephemeral clones; canary test; retention policy   |
| Tenant isolation           | Cross-tenant test suite; service-layer scoping    |
| Data minimisation          | Only metadata and findings stored                 |
| Right to erasure           | Repository disconnect deletes all associated data |
| Regional residency         | All data processed in India region                |
| Breach response            | Runbook in `docs/runbooks/`                       |

## 4. Incident response

| Level                              | Response time                             | Contact                         |
| ---------------------------------- | ----------------------------------------- | ------------------------------- |
| P1 (availability or data handling) | 1 hour acknowledgement, 4 hour resolution | `security@dpdp-auditor.example` |
| P2 (degraded performance)          | 4 hour acknowledgement                    | Status page                     |
| P3 (minor issue)                   | Next business day                         | Support email                   |

## 5. Third-party dependencies

- **AWS (India region):** RDS, S3, EKS, ElastiCache — subprocessor DPA in place
- **GitHub API:** Public API only; no customer credentials
- **Semgrep, Checkov, Gitleaks:** Open-source scanners, run in-cluster
- No third-party SaaS receives customer data

## 6. Penetration testing

| Item                      | Status                              |
| ------------------------- | ----------------------------------- |
| DAST baseline (OWASP ZAP) | Planned — P6-05                     |
| External penetration test | Planned — P6-06                     |
| Internal review           | Cross-tenant and SSRF tests passing |

## 7. References

- `security.md` — Full security and hardening specification
- `architecture.md` — System architecture
- `privacy-notice.md` — Customer privacy notice
- `dpa.md` — Data Processing Addendum
- `subprocessors.md` — Subprocessor list
- `docs/runbooks/` — Incident runbooks
