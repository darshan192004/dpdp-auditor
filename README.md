# dpdpa-auditor

Specification pack for **DPDPA GitHub Code Auditor** — a B2B SaaS that audits GitHub repositories for compliance with India's Digital Personal Data Protection Act, 2023.

> **Status: documentation only.** This repository contains the product, architecture, and delivery specifications. No application code exists yet; `tasks.md` defines the build sequence.

## Documents

| #   | Document                                | What it covers                                                       |
| --- | --------------------------------------- | -------------------------------------------------------------------- |
| 1   | [PRD.md](docs/PRD.md)                   | Problem, personas, user journeys, requirements, metrics, pricing     |
| 2   | [architecture.md](docs/architecture.md) | Service boundaries, scan lifecycle, Kubernetes Job model, ADRs       |
| 3   | [database.md](docs/database.md)         | Full PostgreSQL DDL, enums, indexes, RLS, retention                  |
| 4   | [api.md](docs/api.md)                   | Public and internal endpoints, payloads, errors, Nitro mapping       |
| 5   | [security.md](docs/security.md)         | Threat model, token lifecycle, zero-retention proof, `nuxt-security` |
| 6   | [rules.md](docs/rules.md)               | DPDPA control catalog, scanner mappings, scoring formula             |
| 7   | [design.md](docs/design.md)             | Nuxt UI architecture, routes, components, tokens, accessibility      |
| 8   | [code_style.md](docs/code_style.md)     | TypeScript, Vue, NestJS, Prisma, testing, and git standards          |
| 9   | [tasks.md](docs/tasks.md)               | Phases 0–7, dependencies, definition of done, launch gates           |
| 10  | [memory.md](docs/memory.md)             | Canonical context for AI assistants and new engineers                |
| 11  | [operations.md](docs/operations.md)     | SLOs, alert routing, RTO/RPO, on-call, degraded modes                |

## How it works

1. A user signs in with GitHub OAuth (identity only).
2. They paste a public repository URL (`https://github.com/<owner>/<repo>`); the orchestrator validates it and queues a scan.
3. A hardened, ephemeral Kubernetes Job clones the repo, runs Semgrep, Checkov, and Gitleaks.
4. Findings are normalised, redacted, and mapped to DPDPA obligations.
5. The orchestrator scores the repository and the UI presents evidence with fix guidance.
6. The pod exits and its workspace is destroyed — **source code is never retained**.
7. A PDF report can be exported from a signed, expiring URL.

## Stack

Nuxt 4 / Nitro · NestJS / Fastify · PostgreSQL 16 / Prisma · Redis / BullMQ · Python 3.12 scan-runner (Semgrep / Checkov / Gitleaks) · Kubernetes (gVisor) · Puppeteer · S3

## Disclaimer

This specification describes technical evidence and suggested remediations. It is not legal advice and does not certify compliance with the DPDPA or any other law.
