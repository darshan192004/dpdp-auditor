# DPDPA GitHub Code Auditor — Privacy Notice

| Field             | Value                                             |
| ----------------- | ------------------------------------------------- |
| Document version  | 1.0                                               |
| Status            | Approved for MVP build                            |
| Date              | 2026-11-04                                        |
| Audience          | Customers, DPO, legal                             |
| Related documents | `security.md`, `quickstart.md`, `architecture.md` |

---

## 1. Who we are

DPDPA GitHub Code Auditor is a SaaS service operated by **[Company Name]** that audits GitHub repositories for exposure under India's Digital Personal Data Protection Act, 2023 (DPDPA). We act as a **data processor** under the DPDPA for the personal data we process on your behalf.

## 2. What data we collect

### From you

- Account information (name, email, organisation name).
- API keys and session tokens.
- Repository URLs you submit for scanning.

### From your repositories

- **Metadata only:** repository name, owner, default branch, size, visibility, language.
- **Findings:** file paths, line ranges, rule identifiers, and code snippets that match our scanning rules.
- **No source code is stored.** The clone is deleted after the scan job completes.

## 3. What we do not do

- We do not store your source code.
- We do not share your findings with third parties.
- We do not use your data to train any model.
- We do not retain raw scan output beyond 24 hours for debugging.

## 4. How we protect your data

| Control               | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| Ephemeral clones      | Scans run in isolated Kubernetes jobs; clones are deleted on completion. |
| Encryption in transit | All API traffic uses TLS 1.3.                                            |
| Encryption at rest    | PostgreSQL (AES-256), Redis (in-memory only), S3 (SSE-KMS).              |
| Access control        | Role-based access; API keys are hashed and revocable.                    |
| Audit logging         | Every security-relevant action is logged with a request ID.              |
| Zero retention        | No source code, no PII, no secrets in any persistent store.              |

See `security.md` for the full control set.

## 5. Data retention

| Data                | Retention                                                         |
| ------------------- | ----------------------------------------------------------------- |
| Source code clone   | Deleted on scan completion (ephemeral)                            |
| Raw SARIF output    | 24 hours (opt-in debugging), then deleted                         |
| Repository metadata | Retained while the repository is connected; deleted on disconnect |
| Findings            | Retained while the scan is active; rolled up into reports         |
| Audit logs          | Retained per the audit retention policy in `operations.md`        |
| API keys            | Revoked on demand; hashed storage means we cannot read them       |

## 6. Your rights

Under the DPDPA, you have the right to:

- Access the personal data we hold about you.
- Correct inaccurate personal data.
- Erase your personal data (account deletion removes all your data).
- Submit a grievance.

To exercise these rights, contact `privacy@dpdp-auditor.example`.

## 7. Data processing locations

All processing occurs in the **India region**. No customer data leaves the India region.

## 8. Changes to this notice

We will update this notice when our data practices change. The current version date is shown at the top.

---

_This notice is not legal advice. For the authoritative text, see the DPA signed between your organisation and [Company Name]._
