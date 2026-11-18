# DPDPA GitHub Code Auditor — Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Complete project scaffold: monorepo with pnpm workspaces and Turborepo
- `packages/contracts`: shared Zod schemas (IDs, pagination, error envelope, finding, fingerprint, SLO)
- `packages/config`: shared ESLint, TypeScript, and Tailwind presets
- `packages/observability`: OpenTelemetry SDK wiring and PII redaction helpers
- `apps/orchestrator`: NestJS + Fastify backend with Prisma, BullMQ, and testcontainers integration
- `apps/web`: Nuxt 4 frontend with Nuxt UI 3, Tailwind 4, and Playwright E2E
- `apps/renderer`: PDF report renderer (Fastify + Puppeteer)
- `packages/rule-packs`: DPDPA control catalog, scanner mappings, scoring engine, suppression support
- Golden repo test fixtures (20 repositories) with expected-findings manifests
- Complete CI pipeline: lint, typecheck, unit, integration, e2e, build, audit, SAST (semgrep + gitleaks)
- Container image pipeline with Trivy, SBOM, and cosign signing
- Monitoring: Prometheus rules, Grafana burn-rate alerts, SLO definitions
- Runbooks for scan failure, GitHub outage, DB failover, report renderer, retention violation
- Comprehensive documentation: PRD, architecture, database, API, security, rules, design, code style, operations
- 11 Architecture Decision Records (ADR-001 through ADR-011)
- STRIDE threat model
- DPDPA taxonomy and control catalog
- Launch readiness checklist

### Documentation
- `CONTRIBUTING.md` — How to contribute to the project
- `CODE_OF_CONDUCT.md` — Community standards
- `SECURITY.md` — Vulnerability reporting policy
- `CHANGELOG.md` — Project changelog (this file)
