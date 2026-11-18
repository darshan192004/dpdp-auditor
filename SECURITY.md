# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in DPDPA GitHub Code Auditor, please report it responsibly:

1. **Do NOT open a public issue** — this could expose the vulnerability to bad actors.
2. Email the findings to the project maintainers through a private GitHub Security Advisory.
3. Include:
   - A description of the vulnerability and its impact
   - Steps to reproduce the issue
   - The affected version or commit
   - Any suggested mitigation (optional)

We will acknowledge receipt within 48 hours and work with you to assess the report.

## Vulnerability Handling Process

1. **Triage** — The security team evaluates the report within 5 business days
2. **Remediation** — A fix is developed, tested, and reviewed
3. **Disclosure** — Once fixed, we coordinate a coordinated disclosure timeline
4. **Credit** — Reporters are credited in the release notes (unless they prefer anonymity)

## What to Report

- Authentication bypass or session hijacking
- Cross-site scripting (XSS) or injection vulnerabilities
- Server-side request forgery (SSRF)
- Broken access control (tenant isolation failures)
- Sensitive data exposure (unredacted secrets, PII leaks)
- Dependency vulnerabilities with a clear attack path

## What Not to Report

- Vulnerabilities in third-party services we integrate with (report to that service instead)
- Theoretical vulnerabilities with no practical exploit path
- Issues in repositories we scan (report to that repository instead)

## Security Design Principles

The project follows these security principles (detailed in [docs/security.md](docs/security.md)):

- **Zero source retention** — Scanned repository code is never stored; scan pods are destroyed after execution
- **PII redaction** — All logs, findings, and metrics are redacted of personally identifiable information
- **Tenant isolation** — Row-level security and tenant-scoped queries prevent cross-organization data access
- **Principle of least privilege** — Database roles, service accounts, and API scopes use minimum necessary permissions
- **Supply chain integrity** — Container images are signed (cosign) with SBOMs; dependencies are audited in CI

## Dependency Audit Exceptions

CI runs `pnpm audit --audit-level=high` on every pull request. The following advisory is
temporarily waived via `pnpm.auditConfig.ignoreGhsas` in `package.json` because no fix exists:

- **Advisory:** [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
  (`CVE-2026-112366`), High
- **Package:** `picomatch` <= 4.0.7
- **Rationale:** ReDoS via single-branch repeated extglobs. All published versions are
  affected and the advisory has `patched_versions: <0.0.0`, so upgrading and
  `pnpm audit --fix` cannot resolve it. Every path in this repo is a transitive dev/build
  dependency (Vite, Vitest, tinyglobby, ESLint tooling); attacker-controlled glob patterns
  never reach it from application runtime input.
- **Removal trigger:** Remove the waiver as soon as a patched `picomatch` is published and
  the lockfile is updated, or if the advisory is withdrawn. Re-check during the weekly
  dependency task (P7-14).

Exceptions must stay narrowly scoped: one GHSA ID per entry, with a linked advisory, a
written rationale, and a removal condition. Do not raise the audit level to hide findings.

## Threat Model

A STRIDE threat model is maintained in [docs/threat-model.md](docs/threat-model.md).

## Penetration Testing

The project undergoes annual external penetration testing. Results and remediation plans are documented in [docs/security/external-penetration-test-report.md](docs/security/external-penetration-test-report.md).
