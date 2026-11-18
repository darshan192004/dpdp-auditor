# Contributing to DPDPA GitHub Code Auditor

Thank you for your interest in contributing! This project audits GitHub repositories for compliance with India's Digital Personal Data Protection Act (DPDPA), 2023.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Security

If you discover a security vulnerability, please review our [Security Policy](SECURITY.md) before opening an issue.

## Development Setup

### Prerequisites

- **Node.js 22** (managed by `.nvmrc`)
- **pnpm 9.x** (`corepack enable`)
- **Docker** — for integration tests (Postgres, Redis)

### First Time Setup

```bash
# Install dependencies
pnpm install

# Run the full check
pnpm lint && pnpm typecheck && pnpm test
```

### Workspace Layout

```
apps/
  orchestrator/    # NestJS + Fastify backend
  web/             # Nuxt 4 frontend
  renderer/        # PDF report renderer (Fastify + Puppeteer)
packages/
  contracts/       # Shared TypeScript types and Zod schemas
  config/          # ESLint, TypeScript, Tailwind presets
  observability/   # OpenTelemetry wiring and PII redaction
  rule-packs/      # DPDPA control mappings and scoring config
docker/            # Container images
docs/              # Architecture, security, operations docs
monitoring/        # Prometheus rules, Grafana dashboards
tests/             # Golden repo fixtures, E2E tests
```

### Running Locally

```bash
# Start local services (Postgres, Redis, MinIO, Mailpit)
docker compose up -d

# Run the orchestrator
pnpm --filter @dpdpa/orchestrator dev

# Run the web app
pnpm --filter @dpdpa/web dev

# Run all apps with Turborepo
pnpm dev
```

## Making Changes

### Branch Convention

- Feature branches: `feat/<task-id>` (e.g., `feat/p4-17-findings-api`)
- Bug fixes: `fix/<task-id>`
- Documentation: `docs/<topic>`

### Pull Requests

1. Fork the repository and create a branch from `main`
2. Make your changes following the [code style guide](docs/code_style.md)
3. Ensure all checks pass:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test:coverage
   ```
4. Submit a PR with:
   - Clear description of what changed and why
   - Link to the relevant task ID or issue
   - Evidence of testing (screenshots for UI, test output for logic)

### Code Style

- TypeScript strict mode is enforced
- No `any`, `@ts-ignore`, or disabled lint rules without documented justification
- Vue components follow the [Composition API](https://vuejs.org/guide/extras/composition-api-faq) style
- See [docs/code_style.md](docs/code_style.md) for the full standard

### Testing

| Layer       | Command                 | Coverage Target                       |
| ----------- | ----------------------- | ------------------------------------- |
| Unit        | `pnpm test`             | ≥ 80% lines, ≥ 70% branches           |
| Integration | `pnpm test:integration` | Required for cross-service boundaries |
| E2E         | `pnpm test:e2e`         | Playwright, critical user flows       |

Tests that verify scoring logic must use explicit golden fixtures, not snapshots.

### Rule Pack Changes

Changes to rule mappings, scoring weights, or suppressions require:

1. A version bump in `packages/rule-packs/CHANGELOG.md`
2. A legal note explaining the rationale
3. Updated golden fixtures if expected output changes

## Architecture Decisions

Major decisions are recorded as [ADRs](docs/adr/). Before making a significant change, review the relevant ADR and propose a new one if the decision differs from the recorded rationale.

## Reporting Issues

- **Bugs**: Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml)
- **Features**: Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml)
- **Security**: See [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the project's license. See [LICENSE](LICENSE).
