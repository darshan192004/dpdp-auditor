# DPDPA GitHub Code Auditor — Data Processing Addendum (DPA)

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Draft for legal review |
| Date | 2026-11-04 |
| Audience | Legal, DPO, enterprise customers |
| Related documents | `privacy-notice.md`, `security.md`, `architecture.md` |

---

## 1. Parties

**Controller:** The customer organisation that engages [Company Name] to audit its GitHub repositories under the DPDPA.

**Processor:** [Company Name], operating the DPDPA GitHub Code Auditor service.

## 2. Purpose

The Processor audits the Controller's GitHub repositories for exposure under India's Digital Personal Data Protection Act, 2023 (DPDPA), and provides findings, scoring, and report exports.

## 3. Personal data processed

The Processor processes:
- Repository metadata (name, owner, default branch, size, visibility, language).
- Finding data (file paths, line ranges, rule identifiers, code snippets).
- Account information (name, email, organisation name) necessary for authentication and billing.

The Processor does **not** process customer end-user personal data at scale. It inspects code that may contain PII but does not store or process that PII beyond the scan.

## 4. Subprocessors

| Subprocessor | Purpose | Data processed | Location |
|---|---|---|---|
| Amazon Web Services (RDS) | PostgreSQL hosting | Repository metadata, findings, audit logs | India region |
| Amazon Web Services (S3) | Report PDF storage | PDF reports | India region |
| Amazon Web Services (EKS) | Kubernetes orchestration | Ephemeral scan clones | India region |
| Redis (ElastiCache) | Rate limiting, queue backing store | IP addresses, job IDs | India region |
| GitHub Inc. | Repository resolution and anonymous clone | Repository URLs, default branch | Global (public) |
| Semgrep Inc. | Open-source scanning engine | Source code (ephemeral) | India region (in-cluster) |
| Checkov (Bridgecrew) | Open-source infrastructure scanning | Source code (ephemeral) | India region (in-cluster) |
| Gitleaks (open-source) | Secret scanning | Source code (ephemeral) | India region (in-cluster) |

A current subprocessor list is maintained at `docs/subprocessors.md`.

## 5. Data retention

| Data | Retention period |
|---|---|
| Source code clone | Deleted on scan completion |
| Raw SARIF output | 24 hours (debugging), then deleted |
| Repository metadata | Retained while connected; deleted on disconnect |
| Findings | Retained while scan active; rolled up into reports |
| Audit logs | Per audit retention policy |

## 6. Security measures

The Processor maintains the security measures described in `security.md`, including:
- Ephemeral clone deletion.
- TLS 1.3 in transit.
- AES-256 at rest.
- RBAC and hashed API keys.
- Append-only audit logging.

## 7. Customer obligations

The Controller warrants that:
- It has the right to submit the repositories for scanning.
- It has complied with its own DPDPA obligations for the personal data in those repositories.
- It will not use the service to process personal data it is not authorised to process.

## 8. Liability

The Processor's liability is limited to the fees paid in the 12 months preceding the claim. The Processor is not liable for compliance determinations, legal interpretations, or downstream consequences of findings.

## 9. Term

This DPA is effective as long as the Controller uses the service. It survives termination for the retention periods above.

---

*This DPA is a template. The signed DPA between your organisation and [Company Name] is the authoritative document.*