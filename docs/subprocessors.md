# DPDPA GitHub Code Auditor — Subprocessor List

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Approved for MVP build |
| Date | 2026-11-04 |
| Audience | Legal, DPO, enterprise customers |
| Related documents | `dpa.md`, `privacy-notice.md`, `security.md` |

---

## Current subprocessors

| Subprocessor | Service | Data processed | Purpose | Location | Contact |
|---|---|---|---|---|---|
| Amazon Web Services | RDS (PostgreSQL) | Repository metadata, findings, audit logs | Primary database | India region | aws.amazon.com |
| Amazon Web Services | S3 (S3 Standard) | PDF reports | Report storage | India region | aws.amazon.com |
| Amazon Web Services | EKS | Ephemeral scan clones | Kubernetes orchestration | India region | aws.amazon.com |
| Amazon Web Services | ElastiCache (Redis) | IP addresses, job IDs | Rate limiting, queue backing store | India region | aws.amazon.com |
| GitHub Inc. | GitHub API | Repository URLs, default branch | Repository resolution and anonymous clone | Global (public API) | github.com |
| Semgrep Inc. | Semgrep (open-source) | Source code (ephemeral) | Static analysis | India region (in-cluster) | semgrep.dev |
| Bridgecrew (Checkov) | Checkov (open-source) | Source code (ephemeral) | Infrastructure scanning | India region (in-cluster) | checkov.cloud |
| Gitleaks (open-source) | Gitleaks | Source code (ephemeral) | Secret scanning | India region (in-cluster) | gitleaks.io |

## Change process

1. Any new subprocessor is reviewed by the security lead and legal.
2. The subprocessor list is updated in this document and in the signed DPA.
3. Customers are notified of material changes at least 30 days in advance.
4. Customers may object to a new subprocessor within 30 days of notification.

## Data flow

```
Customer → DPDPA Auditor (Nitro) → Orchestrator (NestJS)
  ├─ PostgreSQL (AWS RDS) — metadata, findings, audit logs
  ├─ Redis (AWS ElastiCache) — queues, rate limiting
  ├─ Kubernetes Job (AWS EKS) — ephemeral clone
  │   ├─ Semgrep — static analysis
  │   ├─ Checkov — infrastructure scanning
  │   └─ Gitleaks — secret scanning
  └─ S3 (AWS S3) — PDF reports
```

## Regional data residency

All customer data is processed in the **India region**. The only exception is GitHub's public API, which is global by nature.

---
*Last updated: 2026-11-04. This list is part of the signed DPA.*