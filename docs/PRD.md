# DPDPA GitHub Code Auditor — Product Requirements Document

| Field | Value |
|---|---|
| Product | DPDPA GitHub Code Auditor |
| Document version | 1.0 |
| Status | Approved for MVP build |
| Date | 2026-11-04 |
| Owners | Product (lead), Engineering (lead), Legal/DPO (reviewer) |
| Related documents | `architecture.md`, `database.md`, `api.md`, `security.md`, `design.md`, `rules.md`, `code_style.md`, `tasks.md`, `memory.md` |

---

## 1. Summary

DPDPA GitHub Code Auditor is a B2B SaaS product that audits GitHub repositories for compliance with India's Digital Personal Data Protection Act, 2023 (DPDPA) and its implementing rules. A customer submits a repository URL, the platform clones the repository into an isolated, ephemeral Kubernetes job, runs Semgrep (application SAST), Checkov (infrastructure as code), and Gitleaks (secrets), maps findings to DPDPA obligations, and presents a scored compliance report with file-level remediation guidance.

The product is a **shift-left DSPM** tool: it finds data-protection risk in code and infrastructure definitions before deployment, rather than inspecting live cloud resources. It does not replace a DPIA, legal advice, or a runtime security platform. It produces evidence that engineering and legal teams can act on together.

### One-line positioning

> Find DPDPA exposure in your repositories before it reaches production — with evidence, clause mapping, and fix guidance your engineers can ship.

---

## 2. Problem

Indian and India-facing organisations increasingly process personal data under DPDPA. Engineering teams are asked to prove "security safeguards" and "data minimisation" but have no code-level evidence. Existing tools fail in three ways:

1. **Cloud-only DSPM** tools inspect deployed resources. By then, the unencrypted bucket, public database, or PII logging statement is already live.
2. **Generic SAST** tools produce hundreds of findings with no legal meaning. Legal teams cannot tell which finding maps to which obligation, and engineers cannot prioritise.
3. **Consulting assessments** are point-in-time, expensive, and stale within a sprint.

The result is a gap between the DPO's compliance questionnaire and the engineering backlog. DPDPA GitHub Code Auditor closes that gap by translating code and IaC findings into DPDPA clauses, with a score, evidence, and a fix.

---

## 3. Goals, non-goals, and anti-goals

### 3.1 Goals

- Let a technical user connect a GitHub repository and receive a DPDPA-mapped compliance score in under ten minutes for a typical repository.
- Map every supported scanner finding to a DPDPA obligation with a stated confidence level and a human-readable rationale.
- Give engineers a direct remediation recommendation with file path, line range, and a fix pattern.
- Produce a board-ready PDF report that a DPO or legal team can attach to an internal assessment.
- Guarantee zero retention of customer source code after a scan completes, fails, or is cancelled.
- Operate as a multi-tenant SaaS with organisation-level isolation, role-based access, and an audit trail.

### 3.2 Non-goals for MVP

- Live cloud account scanning (AWS, Azure, GCP) and runtime DSPM.
- Automatic pull-request remediation or auto-merge.
- GitLab, Bitbucket, Azure Repos, or GitHub Enterprise Server support.
- AI chat over findings or natural-language report generation.
- Mobile applications.
- SOC 2 Type II certification at launch (the control set is designed to support the eventual audit).
- Acting as a law firm or issuing legal opinions.

### 3.3 Anti-goals

- **A scanner dashboard with no legal meaning.** If a finding cannot be traced to an obligation, it does not ship.
- **Storing customer code.** Retaining repositories "for debugging" is a breach of the product promise and a DPDPA liability.
- **A perfect score as marketing.** Scores must be reproducible and explainable; no manual inflation.
- **Blocking a scan because one scanner fails.** Partial results are reported with explicit coverage warnings.

---

## 4. Target audience and personas

| Persona | Role | Primary need | Success looks like |
|---|---|---|---|
| **Priya — Application Security Engineer** | Owns SAST, IaC scanning, and secure SDLC | Fewer false positives, clear fixes, CI-friendly output | She connects repos, triages in minutes, and files tickets with clause references |
| **Arjun — DPO / Privacy Lead** | Accountable for DPDPA compliance | Evidence that safeguards exist, mapped to clauses | He downloads a report showing Section 8(4) coverage and open gaps |
| **Meera — Engineering Manager** | Owns delivery and risk | Prioritised backlog, trend over time | She sees the score improve sprint over sprint and knows what to assign |
| **Rahul — Compliance Consultant** | Assesses multiple clients | Repeatable assessments, branded reports | He runs scans per client workspace and exports reports |
| **Dev — Developer** | Fixes findings | Exact file, line, and safe pattern | He resolves a finding without reading a 40-page standard |

### Buying centre

- **Champion:** AppSec engineer or engineering manager.
- **Economic buyer:** CTO, VP Engineering, or Head of Compliance.
- **Blocker:** Legal/DPO and security review. The product must pass a vendor security questionnaire and sign a DPA.

---

## 5. Core user journeys

### J1 — Onboard and scan a public repository

1. User signs in with GitHub OAuth (identity only).
2. User creates an organisation or accepts an invite.
3. User pastes `https://github.com/<owner>/<repo>`; the platform validates the URL against the GitHub host allowlist and detects the default branch by anonymous resolution.
4. User starts the scan; the dashboard lists saved repositories with last-scan status.

**Acceptance criteria**

- A new user submits their first scan **< 60 seconds** from sign-in. No GitHub App install appears anywhere in this journey.
- The GitHub App (private repositories, repository listing) is post-MVP — see §6 and ADR-011.
- A repository that is private or nonexistent returns a clear, non-leaking error (the same error for both, so the API is not an existence oracle).
- Disconnecting a repository revokes future access and schedules deletion of derived scan data per retention policy.

### J2 — Submit a repository URL and run a scan

1. User pastes `https://github.com/acme/payments-service` or selects a connected repository.
2. Platform validates the URL against the GitHub host allowlist, resolves the repository anonymously (`git ls-remote`), and shows the detected default branch.
3. User optionally chooses a branch, commit, or scan profile.
4. User starts the scan. The API returns `202 Accepted` with a scan ID and status URL.
5. The UI shows queued → cloning → scanning → mapping → completed with live progress.
6. On completion, the scorecard and findings are available.

**Acceptance criteria**

- Duplicate submissions with the same `Idempotency-Key` return the same scan, not a second job.
- A scan of a 100 MB repository completes in under ten minutes at p95.
- Cancelling a scan terminates the Kubernetes Job and deletes the workspace.
- A failed scanner does not fail the scan; the report marks that scanner as `partial` with a reason.

### J3 — Review the compliance scorecard

1. User sees overall score, grade, and trend.
2. User sees score by DPDPA section, with failed controls and counts.
3. User filters findings by scanner, severity, section, file, and status.
4. User opens a finding and sees evidence, clause rationale, confidence, and remediation.
5. User marks a finding as `false_positive`, `accepted_risk`, or `fixed`, with a note.

**Acceptance criteria**

- Every score is reproducible from persisted findings and the rule-pack version.
- Each finding shows scanner, rule ID, DPDPA clause, file, line range, and confidence.
- Secret values are never displayed; only rule, file, line, and a redacted fingerprint.
- Filter state is shareable through the URL.

### J4 — Export a PDF report

1. User requests a PDF for a completed scan.
2. The platform renders the report asynchronously and returns a report ID.
3. User downloads from a signed, expiring URL.
4. The report includes organisation, repository, commit, scan date, score, section breakdown, top findings, remediation summary, methodology, and disclaimer.

**Acceptance criteria**

- PDF generation completes within ten seconds at p95 for a scan with 500 findings.
- The PDF matches the dashboard for the same scan and rule-pack version.
- Signed URLs expire within 15 minutes and are not guessable.
- Report metadata is recorded in the audit log.

### J5 — Remediate and rescan

1. User fixes code and pushes to the branch.
2. User starts a rescan from the same repository.
3. The platform compares the new scan to the previous scan and shows resolved, new, and persisting findings.
4. The score trend updates.

**Acceptance criteria**

- Findings are matched across scans by stable fingerprint, not by line number.
- The comparison view labels each finding `new`, `persistent`, `resolved`, or `reopened`.

---

## 6. MVP scope

### In scope

- GitHub.com only; **public repositories submitted by URL** (paste `https://github.com/<owner>/<repo>`). No GitHub App at MVP.
- One repository per scan; branch or commit selection.
- Semgrep, Checkov, and Gitleaks with pinned versions.
- DPDPA mapping for Sections 5, 6, 7, 8(4), 8(5), 9, 10, 12, 13, and 16.
- Organisation workspaces, roles (`owner`, `admin`, `auditor`, `viewer`), invites.
- Dashboard, scan detail, findings table, finding detail, rule explorer.
- PDF export.
- REST API and organisation API keys for CI use.
- Audit log for security-relevant actions.
- Zero-retention code handling and configurable derived-data retention (default 90 days, maximum 365).

### Out of scope

- GitHub App (private repositories, repository listing, webhook-triggered rescans) — post-MVP backlog (ADR-011).
- GitLab, Bitbucket, Azure Repos, Gerrit.
- Monorepo-aware incremental scanning beyond path filters.
- Automatic fix PRs.
- Runtime or cloud-account scanning.
- Custom rule authoring by customers.
- SSO/SAML (post-MVP; SCIM later).
- White-label reports (Growth plan, post-MVP).
- Data residency outside the primary region at launch; India region is the default.

---

## 7. Functional requirements

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-01 | GitHub OAuth sign-in with organisation membership | P0 | Identity only; no repo scope requested at sign-in |
| FR-02 | Repository URL validation and anonymous resolution | P0 | Public repositories only at MVP; `git ls-remote` resolves the default branch; GitHub App is post-MVP (ADR-011) |
| FR-03 | Repository URL allowlist enforcement | P0 | Allowlist `github.com`; reject redirects and non-HTTPS |
| FR-04 | Scan submission with idempotency | P0 | `Idempotency-Key` required for API clients, generated by UI |
| FR-05 | Isolated scan execution in Kubernetes Jobs | P0 | One Job per scan; gVisor runtime class; no shared workspace |
| FR-06 | Semgrep, Checkov, Gitleaks execution | P0 | Pinned image digests; per-scanner timeouts |
| FR-07 | Normalisation of scanner output to an internal finding schema | P0 | SARIF and JSON adapters; deduplicate by fingerprint |
| FR-08 | DPDPA rule mapping with confidence | P0 | Rule packs versioned and reviewed by legal |
| FR-09 | Compliance scoring by section and overall | P0 | Deterministic, versioned formula |
| FR-10 | Findings table with filters, sorting, pagination | P0 | Server-side filtering; URL-persisted |
| FR-11 | Finding triage states | P0 | `false_positive`, `accepted_risk`, `fixed`, with audit trail |
| FR-12 | PDF report generation and signed download | P0 | Asynchronous render; 15-minute signed URL |
| FR-13 | Role-based access control | P0 | Org-scoped; least privilege |
| FR-14 | Audit log | P0 | Append-only; exportable by admins |
| FR-15 | API keys for CI | P1 | Scoped to `scan:write`, `scan:read`, `report:read` |
| FR-16 | Rescan comparison | P1 | New/persistent/resolved/reopened |
| FR-17 | Email and webhook notifications | P1 | Post-scan completion and failure |
| FR-18 | Rule explorer | P1 | Explains each DPDPA control and mapped scanner rules |
| FR-19 | Usage metering and plan limits | P1 | Scans per month, seats, retention |
| FR-20 | Organisation deletion and data export | P0 | Hard delete within 30 days; export in JSON |

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Availability | 99.5% monthly for the web app and public API; 99.0% for scan execution |
| Performance | p95 API latency < 400 ms; p95 time-to-first-finding < 10 min for repos ≤ 100 MB; p95 PDF < 10 s |
| Scale (launch) | 200 organisations, 2,000 repositories, 20,000 scans/month, 50 concurrent scans |
| Isolation | One Kubernetes Job per scan; no cross-tenant network or filesystem access |
| Abuse controls (public-repo-only MVP) | Plan scan limits (Free 10/h), per-user rate limits, repo-size caps, DNS-pinned clone egress, cost alarms — architecture.md §12 |
| Retention | Source code deleted on job completion; derived findings per org policy; reports 30 days by default |
| Security | OWASP ASVS L2; no critical/high vulnerabilities at launch; annual pen test |
| Privacy | Data minimisation, purpose limitation, DPA with subprocessors, India region by default |
| Accessibility | WCAG 2.1 AA for the app and the PDF report |
| Observability | OpenTelemetry traces, structured logs, metrics, SLO dashboards, alerting |
| Browser support | Last two versions of Chrome, Edge, Firefox, Safari; 1280 px primary, 320 px minimum |
| Localisation | English at launch; INR and USD pricing display |
| Recovery | RPO 15 min, RTO 4 h for the database; scan jobs are retryable |

---

## 9. Success metrics

### North star

**Weekly repositories with a completed, viewed DPDPA-mapped scan.**

### Product metrics

| Metric | Definition | Target (90 days post-launch) |
|---|---|---|
| Activation | New org connects a repo and completes a scan within 24 h | ≥ 60% |
| Scan success rate | Completed scans / submitted scans | ≥ 97% |
| Time to first finding | Submit → completed | p95 < 10 min |
| Report export rate | Orgs exporting ≥ 1 PDF in first 14 days | ≥ 40% |
| Triage rate | Findings marked resolved/FP/accepted within 14 days | ≥ 50% |
| Remediation adoption | Repos whose score improves after a rescan | ≥ 35% |
| False-positive rate | Findings marked `false_positive` / triaged findings | < 15% |
| Weekly active orgs | Orgs with ≥ 1 scan in 7 days | 25% of paid |
| Retention (logo) | Paid orgs retained after 90 days | ≥ 85% |
| NPS | In-app survey | ≥ 40 |

### Guardrail metrics

- Zero source-code residue incidents.
- Zero cross-tenant data exposure incidents.
- Scan cost per repository ≤ US$0.40 at p50.
- Queue wait p95 < 60 s.
- No P1 incident longer than 60 minutes without customer communication.

### Instrumentation

- Product analytics: PostHog Cloud (EU or India region as available) with PII scrubbing.
- Application metrics: OpenTelemetry → Prometheus → Grafana.
- Errors: Sentry with `sendDefaultPii: false`.
- Billing: usage events emitted from the orchestrator, reconciled nightly.

---

## 10. Packaging and pricing assumptions

| Plan | Target | Included | Limits |
|---|---|---|---|
| **Free** | Evaluation | 2 repos, 5 scans/month, 7-day history | Community support |
| **Starter** | Small teams | 10 repos, 50 scans/month, 90-day history, PDF | Email support |
| **Growth** | Scaling teams | 50 repos, 300 scans/month, 365-day history, API keys, webhooks | Priority support |
| **Enterprise** | Regulated orgs | Unlimited repos, custom retention, SSO, DPA, audit export, onboarding | SLA + named contact |

Pricing is usage-aware but seat-based at launch. Exact price points are an open question; the billing model must support per-scan overage and seat counts without a schema change.

---

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| False positives erode trust | High | High | Confidence labels, legal review, triage feedback loop, suppression rules, conservative mapping |
| Legal overreach — product implies legal advice | Medium | High | Prominent disclaimer, "evidence not opinion" framing, DPO review workflow, no "certified compliant" claims |
| Malicious repository attacks the scanner | Medium | High | Isolated Jobs, no network egress except allowlist, resource caps, gVisor, non-root, read-only rootfs |
| GitHub availability or abuse limits (git smart-HTTP) | Medium | Medium | Anonymous clone has no API quota; exponential backoff, degraded-mode messaging, repo-size and concurrency caps |
| Any signed-up user can scan any public repo (cost/abuse) | High | Medium | Plan limits (Free 10 scans/h), per-user rate limits, repo-size caps, cost alarms (architecture.md §12) |
| Large monorepos exceed time budget | High | Medium | Size caps, path filters, scanner timeouts, partial results, async UX |
| Scanner supply-chain compromise | Low | High | Pin image digests, SBOM, cosign verification, Trivy scan, no floating tags |
| DPDPA rules or interpretations change | Medium | Medium | Versioned rule packs, legal review cadence, changelog, re-score on pack upgrade |
| Scan cost exceeds margin | Medium | Medium | Per-scan resource quotas, queue concurrency caps, cost dashboards, plan limits |
| Customer security review blocks sale | Medium | High | Pre-built security package, pen test summary, DPA, subprocessor list, architecture docs |

---

## 12. Release milestones

| Milestone | Scope | Gate |
|---|---|---|
| M0 — Foundations | Repo, CI, ADRs, threat model, rule taxonomy | Architecture and legal taxonomy approved |
| M1 — Private alpha | Auth, repo connect, scan, dashboard, fixtures | 5 design partners complete scans |
| M2 — Closed beta | Real scanners, DPDPA mapping, PDF | 20 golden repos pass; legal sample review |
| M3 — Public launch | Billing, docs, status page, support | Launch readiness review signed |
| M4 — Growth | API keys, webhooks, rescan diff, SSO | Retention and usage targets met |

Detailed tasks and gates are in `tasks.md`.

---

## 13. Open questions

1. Final price points and whether overage is per scan or per repository.
2. Default derived-data retention: 90 days vs. 180 days for Starter.
3. Whether the India region is mandatory for all plans or Enterprise-only.
4. GitHub Enterprise Server demand and timeline.
5. Depth of legal review required for each rule-pack release (internal counsel vs. external).
6. Whether to expose raw SARIF to customers or only normalised findings.
7. Support for customer-supplied custom Semgrep rules in Growth.

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **DPDPA** | Digital Personal Data Protection Act, 2023 (India) |
| **Data Fiduciary** | Entity that determines the purpose and means of processing personal data |
| **Data Principal** | The individual to whom personal data relates |
| **DSPM** | Data Security Posture Management |
| **SAST** | Static Application Security Testing |
| **IaC** | Infrastructure as Code |
| **SARIF** | Static Analysis Results Interchange Format |
| **Shift-left** | Finding and fixing risk earlier in the software lifecycle |
| **Ephemeral scan** | A scan whose workspace and container are destroyed after completion |
| **Rule pack** | Versioned set of DPDPA controls and scanner-to-clause mappings |

## Appendix B — Legal disclaimer (product copy)

> DPDPA GitHub Code Auditor provides technical evidence and suggested remediations. It is not legal advice and does not certify compliance with the Digital Personal Data Protection Act, 2023 or any other law. Organisations remain responsible for their own compliance posture and should consult qualified counsel.
