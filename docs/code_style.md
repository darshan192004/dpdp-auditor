# DPDPA GitHub Code Auditor — Coding Standards

| Field | Value |
|---|---|
| Document version | 1.0 |
| Date | 2026-11-04 |
| Applies to | Nuxt 4 web app, NestJS orchestrator, renderer, scan-runner, shared packages |
| Enforcement | ESLint, Prettier, TypeScript, Vitest, Playwright, CI |
| Related documents | `architecture.md`, `design.md`, `api.md`, `security.md`, `tasks.md` |

---

## 1. Stack pins

| Area | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Package manager | pnpm 9, workspaces, committed lockfile |
| Monorepo | Turborepo |
| Language | TypeScript 5.6+, `strict` |
| Frontend | Nuxt 4, Vue 3.5, Nuxt UI 3, Tailwind CSS 4 |
| Client state | `useState`, `useFetch`, Pinia only for client-only state |
| Backend | NestJS 10 + Fastify |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Queue | BullMQ 5 + Redis 7 |
| Validation | Zod 3, shared through `packages/contracts` (the only validation stack) |
| Tests | Vitest (`v8` coverage provider), `@nuxt/test-utils`, Playwright, Testcontainers |
| Lint / format | ESLint 9 flat config (`typescript-eslint` v8, `eslint-plugin-vue`), Prettier + `prettier-plugin-tailwindcss` |
| Commits | Husky hooks + `lint-staged` + `commitlint` with `@commitlint/config-conventional` |
| Logging | Pino, structured JSON |
| Tracing | OpenTelemetry |
| Python (`apps/scan-runner`) | Python 3.12, Ruff, `mypy --strict`, pytest (§13 is a first-class standard, not an appendix — the scan-runner is Python) |

Version upgrades are Renovate PRs, not opportunistic edits. Pin exact versions in `package.json` and the lockfile; use `^` only for internal workspace packages.

---

## 2. Commands

Root `package.json`:

```json
{
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:e2e": "pnpm --filter web test:e2e",
    "test:integration": "turbo run test:integration",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:migrate": "pnpm --filter orchestrator prisma migrate dev",
    "db:deploy": "pnpm --filter orchestrator prisma migrate deploy",
    "db:seed": "pnpm --filter orchestrator prisma db seed",
    "security:audit": "pnpm audit --audit-level=high",
    "security:secrets": "gitleaks detect --no-banner --redact",
    "prepare": "husky"
  }
}
```

Every workspace exposes `lint`, `typecheck`, `test`, and `build`. CI runs them through Turborepo with remote caching disabled for security-sensitive jobs.

---

## 3. TypeScript

### 3.1 Compiler settings

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

`any` is banned by lint. A third-party boundary that cannot be typed uses `unknown` and a schema parse. A justified exception requires:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Stripe SDK returns an untyped event
const event = raw as any
```

The comment must state why. Blanket disables are rejected in review.

### 3.2 Type rules

- Prefer `interface` for object shapes that may be extended; `type` for unions, intersections, and mapped types.
- Use string-literal unions, not `enum`:

```ts
type ScanStatus =
  | 'queued'
  | 'cloning'
  | 'scanning'
  | 'mapping'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'
```

- Brand IDs so a `UserId` cannot be passed where a `ScanId` is expected:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B }
type ScanId = Brand<string, 'ScanId'>
type OrgId = Brand<string, 'OrgId'>
```

- Parse at boundaries; trust inside:

```ts
const body = CreateScanSchema.parse(await readBody(event))
```

- Use `satisfies` to validate a literal without widening:

```ts
const severityRank = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
} satisfies Record<Severity, number>
```

- No non-null assertions (`!`) unless an invariant is documented immediately above. Prefer early returns and narrowing.
- No `@ts-ignore`. Use `@ts-expect-error` with a reason.
- Return types on exported functions; inferred returns on local callbacks.
- Use `readonly` for props, arrays, and maps that must not be mutated.
- Use `import type` for type-only imports (`verbatimModuleSyntax` enforces it).

### 3.3 Date and time

- Store and transport ISO 8601 UTC strings.
- Never use `new Date()` inside scoring or mapping logic; pass a clock or timestamp.
- Use `date-fns` for display formatting; no moment.js.
- Database timestamps are `timestamptz`; the UI renders in the user's locale.

---

## 4. Naming

| Element | Convention | Example |
|---|---|---|
| Vue component file | PascalCase | `FindingsTable.vue` |
| Page file | kebab-case, dynamic in brackets | `app/pages/app/scans/[scanId].vue` |
| Composable | camelCase, `use` prefix | `useScanPolling.ts` |
| Pinia store | `useXStore` | `useScanWizardStore.ts` |
| Server route | method suffix | `scan.post.ts`, `[scanId].get.ts` |
| Type / interface | PascalCase, no `I` prefix | `ScanDetail` |
| Function / variable | camelCase, verb for functions | `computeSectionScore` |
| Boolean | `is` / `has` / `can` / `should` | `isPartial`, `canExport` |
| Constant | UPPER_SNAKE | `MAX_PAGE_SIZE` |
| Database table / column | snake_case | `scanner_findings`, `org_id` |
| Prisma model / field | PascalCase / camelCase with `@map` | `ScannerFinding`, `orgId` |
| API wire enum | lowercase snake_case | `"false_positive"` |
| CSS token | kebab-case | `--color-risk-critical-text` |
| Environment variable | UPPER_SNAKE | `ORCHESTRATOR_HMAC_KEY` |

UI labels are Title Case for actions ("Start scan") and sentence case for descriptions. API wire values are never Title Case.

---

## 5. Nuxt and Vue

### 5.1 File structure

```
apps/web/
├── app/
│   ├── app.vue
│   ├── error.vue
│   ├── assets/css/main.css
│   ├── components/
│   ├── composables/
│   ├── layouts/
│   ├── middleware/
│   ├── pages/
│   ├── plugins/
│   ├── stores/
│   ├── types/
│   └── utils/
├── server/
│   ├── api/
│   ├── middleware/
│   ├── plugins/
│   └── utils/
├── shared/
└── nuxt.config.ts
```

- `app/` is client-facing code. `server/` is Nitro-only. `shared/` is isomorphic types and pure helpers.
- Never import `server/` code into `app/`; never import `app/` components into `server/`.
- Auto-imports cover Vue and Nuxt APIs (`ref`, `computed`, `useFetch`, `defineEventHandler`). Do not import them manually.
- Import explicit local types with `import type { ScanDetail } from '~/types/scan'`.
- Avoid barrel files that create cycles. Import from the defining module.

### 5.2 Single-file components

```vue
<script setup lang="ts">
interface Props {
  finding: Finding
  selected?: boolean
}

const { finding, selected = false } = defineProps<Props>()

const emit = defineEmits<{
  select: [id: string]
  triage: [id: string, status: FindingStatus]
}>()

const severityLabel = computed(() => SEVERITY_LABELS[finding.severity])
</script>

<template>
  <button
    type="button"
    class="flex w-full items-start gap-3 rounded-[var(--radius-control)] p-3 text-left hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-500"
    :aria-pressed="selected"
    @click="emit('select', finding.id)"
  >
    <SeverityBadge :severity="finding.severity" />
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium text-ink-900">{{ finding.message }}</span>
      <span class="block truncate font-mono text-xs text-ink-500">
        {{ finding.filePath }}:{{ finding.lineStart }}
      </span>
    </span>
  </button>
</template>

<style scoped>
/* Prefer Tailwind utilities. Scoped CSS is for animations or third-party overrides only. */
</style>
```

Rules:

- `<script setup lang="ts">` first, then `<template>`, then `<style>`.
- Props are type-only; use reactive destructuring with defaults (Vue 3.5) or `withDefaults`.
- Emits use the tuple syntax; no string arrays.
- One component per file; file name matches the component name.
- No Options API, no mixins, no `this`.
- No `v-html` with user, scanner, or API content.
- `v-for` always has a stable `:key`; never combine `v-if` and `v-for` on the same element.
- Computed values for derived state; methods only for actions.
- Keep templates declarative. Extract logic longer than one expression into a computed or composable.
- Use `shallowRef` for large immutable objects (report view models, finding arrays over 500 items).
- Use `<ClientOnly>` only for browser-only APIs, with a meaningful fallback.
- Nuxt UI components are preferred over custom primitives: `UButton`, `UCard`, `UTable`, `UBadge`, `USlideover`, `UModal`, `UFormField`, `UInput`, `USelect`, `UAlert`, `USkeleton`.
- Do not wrap every Nuxt UI component in a local wrapper. Wrap only when adding product semantics.
- Tailwind classes are ordered by the project Prettier plugin; no arbitrary values outside the token file.

### 5.3 Pages and layouts

- Pages fetch data and compose containers. They do not contain table rendering logic.
- Use `definePageMeta` for layout, middleware, and page title.
- Route middleware checks authentication and org membership; role checks happen server-side and are reflected in the UI.
- Layouts: `default` (marketing), `auth`, `app`, `print`.
- Page titles follow `"<Page> · <Org> · DPDPA Auditor"`.

### 5.4 Composables

```ts
export function useScanPolling(scanId: MaybeRefOrGetter<string>) {
  const id = computed(() => toValue(scanId))
  // ...
  return { data, status, refresh, isTerminal } as const
}
```

- Name with `use`; one responsibility per composable.
- Accept `MaybeRefOrGetter<T>` when the input can change; resolve with `toValue`.
- Return a named object, not a positional array.
- Clean up timers and listeners in `onUnmounted`.
- Guard browser APIs with `import.meta.client`.
- No module-level side effects.
- No `$fetch` at module scope; fetch inside `useAsyncData`, `useFetch`, or an action.

### 5.5 State

- `useFetch` for route data; `useAsyncData` for parallel page data; `$fetch` for user-triggered mutations.
- Always pass a stable `key` to `useFetch` when the URL depends on a parameter.
- Forward cookies during SSR: `headers: useRequestHeaders(['cookie'])`.
- Server data never enters Pinia.
- URL query is the source of truth for filters, pagination, and sort.
- Use `useState` for SSR-safe shared state (org context, feature flags).
- Use Pinia for client-only cross-page state (scan wizard, bulk selection, preferences).
- Optimistic updates require a rollback in `onError` and a toast on failure.

---

## 6. Nitro server routes

### 6.1 Handler shape

```ts
// server/api/v1/scan.post.ts
import { CreateScanSchema } from '@dpdpa/contracts'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readValidatedBody(event, CreateScanSchema.parse)
  const orgId = session.user.activeOrgId

  await requireRole(orgId, session.user.id, 'auditor')

  const result = await callOrchestrator<CreateScanResponse>(event, {
    method: 'POST',
    path: '/internal/v1/scans',
    body: { ...body, orgId, requestedBy: session.user.id },
    idempotencyKey: getHeader(event, 'idempotency-key'),
  })

  setResponseStatus(event, 202)
  setHeader(event, 'Location', `/api/v1/scan/${result.scanId}`)
  return { data: result, meta: { requestId: event.context.requestId } }
})
```

Rules:

- A handler does five things: authenticate, authorise, validate, call the orchestrator, shape the response. Nothing else.
- Use `readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams` with Zod schemas from `packages/contracts`.
- Never access PostgreSQL from Nitro.
- Never trust `X-Org-Id` or `X-User-Id` from the browser; derive them from the session or API key.
- Set explicit status codes and `Location` for `202`.
- Use `AbortSignal.timeout(15_000)` on internal fetches.
- Map upstream errors through `apiError`; never leak upstream URLs or stack traces.
- Validate the `Idempotency-Key` format and forward it; do not regenerate it.
- Response shapes follow `{ data, meta? }` or `{ data, pagination }`; errors follow `{ error }`.
- Server utils live in `server/utils/` and are auto-imported; they must be pure or explicitly request-scoped.
- Never log request bodies for scan, triage, or auth endpoints.

### 6.2 Error helper

```ts
// server/utils/api-error.ts
export function apiError(
  event: H3Event,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): never {
  throw createError({
    statusCode: status,
    statusMessage: message,
    data: {
      error: {
        code,
        message,
        details,
        requestId: event.context.requestId,
      },
    },
  })
}
```

A global Nitro error handler converts unhandled errors into `INTERNAL_ERROR` with a request ID and reports to Sentry.

### 6.3 Internal calls

```ts
export async function callOrchestrator<T>(
  event: H3Event,
  options: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; idempotencyKey?: string },
): Promise<T> {
  const body = options.body ? JSON.stringify(options.body) : ''
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = signHmac(`${timestamp}.${body}`, useRuntimeConfig().orchestratorHmacKey)

  return await $fetch<T>(`${useRuntimeConfig().orchestratorUrl}${options.path}`, {
    method: options.method,
    body: options.body,
    headers: {
      'content-type': 'application/json',
      'x-internal-key': useRuntimeConfig().orchestratorInternalKey,
      'x-internal-timestamp': timestamp,
      'x-internal-signature': signature,
      'x-request-id': event.context.requestId,
      'x-org-id': event.context.orgId,
      'x-user-id': event.context.userId,
      ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
}
```

The orchestrator verifies the signature against the raw body, timestamp, and a 5-minute skew window.

---

## 7. NestJS orchestrator

### 7.1 Module structure

```
src/
├── modules/
│   ├── auth/
│   ├── orgs/
│   ├── members/
│   ├── repos/
│   ├── scans/
│   ├── findings/
│   ├── rules/
│   ├── scoring/
│   ├── reports/
│   ├── audit/
│   └── health/
├── queue/
│   ├── queue.module.ts
│   └── processors/
├── common/
│   ├── filters/
│   ├── interceptors/
│   ├── guards/
│   └── logging/
├── config/
└── main.ts
```

Each module has `*.module.ts`, `*.controller.ts`, `*.service.ts`, and `dto/`. Prisma access lives in a repository class or the service for small modules; controllers never touch Prisma.

### 7.2 Controllers

```ts
@Controller('internal/v1/scans')
@UseGuards(InternalHmacGuard)
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  @HttpCode(202)
  async create(@Body() dto: CreateScanDto, @Headers('idempotency-key') key?: string) {
    return this.scans.createOrReplay(dto, key)
  }
}
```

- Controllers are thin: parse, delegate, return.
- DTOs use Zod via `nestjs-zod` (`createZodDto`) with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Zod is the single validation stack end to end (§1); no decorator-based DTO validator is used anywhere in the product.
- Internal routes are prefixed `/internal/v1` and guarded by HMAC.
- Public routes do not exist in this service.
- Set `@HttpCode` explicitly; defaults are easy to get wrong.

### 7.3 Services

- Own business rules and transactions.
- Accept primitives/DTOs, not Express/Fastify request objects.
- Throw typed domain errors (`NotFoundError`, `ConflictError`, `PlanLimitError`); a global filter maps them to the API envelope.
- Use `prisma.$transaction` for multi-table writes (scan + events + audit; triage + remediation log + audit).
- Idempotency is enforced by a unique constraint, not a read-then-write check.
- Queue processors call the same service methods as HTTP handlers; no duplicated logic.
- Scoring and mapping are pure functions in `modules/scoring/` and `modules/rules/`; they take data and return data.

### 7.4 Configuration

```ts
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  GITHUB_APP_ID: z.string().regex(/^\d+$/),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  ORCHESTRATOR_HMAC_KEY: z.string().min(32),
  SCANNER_NAMESPACE: z.string().default('scanners'),
})

export type Env = z.infer<typeof EnvSchema>
```

Config is validated at boot; the process exits on failure. No `process.env` reads outside `config/`.

### 7.5 Logging

- Pino with JSON output.
- Every log includes `requestId`, `orgId` (when known), `scanId` (when known), and `route`.
- Log levels: `error` for actionable failures, `warn` for degraded behaviour, `info` for lifecycle, `debug` for development only.
- Never log tokens, cookies, repository contents, secret values, or full request bodies.
- Use the logger, never `console.log`.

---

## 8. Prisma and database access

- `schema.prisma` is the source of truth; SQL migrations are reviewed and committed.
- `prisma migrate dev` locally; `prisma migrate deploy` in CI/production. Never `db push` outside a throwaway local database.
- Model fields use camelCase with `@map("snake_case")`; models use `@@map`.
- Every tenant query filters by `org_id`. A repository method that omits it is a review blocker.
- Select only needed columns; avoid `include: { findings: true }` on a scan list.
- Paginate every list query; maximum `take: 100`.
- Avoid N+1: use `include`/`select` deliberately, or a single aggregate query.
- Raw SQL only with `$queryRaw` tagged templates and bound parameters. `$queryRawUnsafe` and `$executeRawUnsafe` are banned.
- Migrations that add an index on a large table use `CREATE INDEX CONCURRENTLY` and are authored manually.
- Never store source code or secret values. If a field could contain code, it does not belong in the schema.
- Tests use Testcontainers with the real PostgreSQL image, not SQLite.

---

## 9. Error handling

- Expected failures are values or typed errors, not exceptions with string matching.
- At the boundary, map to the API envelope with a stable code.
- User-facing messages are generic and actionable; internal detail goes to logs with the request ID.
- Never swallow an error. If recovery is intentional, log it at `warn` with context.
- Retries only for idempotent operations, with a bounded count and jitter.
- Circuit breakers for GitHub and object storage; fail fast with `503` and `Retry-After`.
- Queue jobs: 3 attempts, exponential backoff, then DLQ with an alert. Processors must be idempotent by `scanId`/`reportId`.

---

## 10. Testing

### 10.1 Layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure functions: scoring, mapping, validation, formatters |
| Component | Vitest + `@nuxt/test-utils` + Testing Library | Props, emits, states, accessibility |
| API contract | Vitest | Zod schemas accept/reject fixtures; response shapes; OpenAPI conformance (spec diff against the document generated from `packages/contracts`, gate in CI — api.md §12) |
| Integration | Vitest + Testcontainers | Repositories, transactions, RLS, queues |
| Scanner integration | Vitest + real scanners | Golden repos produce expected findings |
| E2E | Playwright | Sign in → connect repo → scan → triage → export |
| Load | k6 | Scan submission and polling under peak |
| Security | Vitest + Playwright | Cross-tenant, SSRF, canary retention, rate limits |

### 10.2 Conventions

- Test files are colocated: `ScoreCard.test.ts` beside `ScoreCard.vue`; integration tests under `tests/integration/`.
- Describe the behaviour, not the implementation: `it('withholds the grade when a scanner times out')`.
- One assertion family per test; multiple `expect` calls are fine when they describe one outcome.
- Use builders for fixtures (`aScan({ status: 'completed' })`), not 40-line literals.
- Freeze time with `vi.setSystemTime`; seed IDs; no random data in snapshots.
- Mock only at the network boundary (`msw` for HTTP, a fake queue for BullMQ). Do not mock the module under test.
- No snapshot tests for scoring logic; use explicit expected values.
- Every bug fix includes a regression test that fails before the fix.
- Accessibility: run `axe` on every page-level component test.

### 10.3 Coverage

| Package | Lines | Branches |
|---|---|---|
| `orchestrator/src/modules/scoring` | 95% | 90% |
| `orchestrator/src/modules/rules` | 90% | 85% |
| `orchestrator/src/modules/scans` | 85% | 80% |
| `web/app/components` | 80% | 70% |
| `packages/contracts` | 95% | 90% |

Coverage is a floor, not a goal. A file excluded from coverage needs a comment explaining why.

### 10.4 Test commands

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm --filter orchestrator test -- --coverage
pnpm --filter web exec playwright test --project=chromium
```

CI blocks merge on any failing test. Flaky tests are fixed or quarantined with an owner and a date; never retried into green.

---

## 11. Security rules in code

- No secrets in source, tests, fixtures, or comments. Use fake values with an obvious marker (`test-only-not-a-real-key`).
- No `eval`, `new Function`, or dynamic `require` of user input.
- No `v-html` with untrusted content; no `innerHTML`.
- Parameterised queries only; no string concatenation into SQL, shell, or HTML.
- Validate every external input at the boundary; treat GitHub responses as untrusted.
- Do not log PII, tokens, or code. Use the redaction helper.
- Authorisation is checked on the server for every resource, not only in the UI.
- Use `crypto.randomUUID()` for idempotency keys and `crypto.timingSafeEqual` for signatures.
- Never disable TLS verification, CSP, or rate limits to make a test pass.
- New dependencies require a review of maintainer, release age, install scripts, and transitive size.

---

## 12. Git and review

- Trunk-based development; `main` is always deployable.
- Branches: `feat/<short>`, `fix/<short>`, `chore/<short>`, `docs/<short>`.
- Conventional Commits: `feat(scans): add cancel endpoint`, `fix(rules): correct CKV_AWS_19 mapping`.
- Squash merge; the PR title becomes the commit subject.
- PR size target: under 400 changed lines excluding generated files. Split larger work.
- Required checks: lint, typecheck, unit, integration, `test:coverage` (enforces the §10.3 floors), `test:e2e` (Playwright), build, secrets, audit.
- CODEOWNERS review for `security/`, `infra/`, `prisma/migrations/`, and `packages/rule-packs/`.
- No direct pushes to `main`; no force-push to shared branches.
- A change that alters scoring or rule mapping requires a rule-pack version bump and a legal note.

### Definition of done for a code change

- [ ] Tests added or updated, and failing before the fix where applicable.
- [ ] Lint, typecheck, and tests pass locally.
- [ ] No new `any`, `@ts-ignore`, or disabled lint rule without a reason.
- [ ] Security implications reviewed (input, auth, logging, secrets).
- [ ] Observability added for new failure modes.
- [ ] Docs updated when behaviour or contracts change.
- [ ] No unrelated refactoring in the same PR.

---

## 13. Python scan-runner standards (scanner adapters)

The `scan-runner` (`apps/scan-runner/`) is a Python 3.12 application; these are its standards. Python 3.12, `ruff`, `mypy --strict`, `pytest`. Package layout: `pyproject.toml` at the package root, code under `src/`, tests under `tests/` (src layout — nothing importable from the package root).

### 13.1 Rules

- Type hints on every function; no untyped `dict` where a `TypedDict` or dataclass is clearer.
- `ruff check` and `ruff format` replace flake8/black/isort.
- `pathlib.Path` for filesystem work; never string concatenation.
- `subprocess.run([...], check=True, timeout=...)` with a list of arguments; `shell=True` is banned.
- No bare `except:`; catch specific exceptions and log with context.
- No `print`; use `structlog` or the standard logger.
- No secrets in code or command-line arguments visible in `ps`; pass via a file descriptor or environment with care.
- Validate scanner output with Pydantic before sending it to the orchestrator.
- Every adapter has fixture tests for a valid result, an empty result, a malformed result, and a timeout.

### 13.2 Example

```python
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


class SemgrepResult(BaseModel):
    check_id: str
    path: str
    start: int
    end: int
    message: str


def run_semgrep(workspace: Path, timeout_s: int = 180) -> list[SemgrepResult]:
    """Run Semgrep with a fixed config and return validated results."""
    try:
        completed = subprocess.run(
            [
                "semgrep",
                "--config", "/opt/dpdpa/semgrep.yml",
                "--sarif",
                "--quiet",
                "--timeout", str(timeout_s),
                str(workspace),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout_s + 30,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("semgrep timed out") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"semgrep failed with exit {exc.returncode}") from exc

    payload = json.loads(completed.stdout)
    results: list[SemgrepResult] = []
    malformed = 0
    for run in payload.get("runs", []):
        for item in run.get("results", []):
            try:
                results.append(SemgrepResult.model_validate(item))
            except ValidationError:
                malformed += 1
    if malformed:
        # Never silently drop scanner output (§9 "Never swallow"): the
        # dropped count is surfaced so partial coverage is visible.
        logger.warning("semgrep results rejected by schema", dropped=malformed)
    return results
```

### 13.3 Python commands

```bash
ruff check .
ruff format --check .
mypy --strict .
pytest -q
```

---

## 14. Enforcement

### Pre-commit

Hook files live under `.husky/`:

- `.husky/pre-commit` — `lint-staged` (ESLint + Prettier on staged files) + `gitleaks protect --staged`.
- `.husky/pre-push` — typecheck (too slow for pre-commit; CI also runs it).
- `.husky/commit-msg` — `commitlint` with `@commitlint/config-conventional`.

### CI

```yaml
- pnpm install --frozen-lockfile
- pnpm lint
- pnpm typecheck
- pnpm test:unit
- pnpm test:coverage        # vitest --coverage, thresholds per §10.3
- pnpm test:integration
- pnpm test:e2e             # Playwright, chromium project
- pnpm build
- pnpm security:audit
- pnpm security:secrets
```

CI fails on warnings for TypeScript and ESLint. Warnings that are acceptable require an explicit rule configuration with a comment, not an inline suppression.

### Review checklist

- [ ] Names match the conventions in §4.
- [ ] No server data in Pinia; no database access from Nitro.
- [ ] Tenant scoping present on every query.
- [ ] Errors mapped to stable codes; no internal detail exposed.
- [ ] Accessibility states covered for new UI.
- [ ] Tests prove the behaviour, including the unhappy path.
- [ ] No secret, PII, or code in logs.
- [ ] Bundle and query budgets respected. Bundle budgets (enforced by the bundle-analysis CI gate, design.md P5-16): `/app` route JS ≤ 180 KB gzipped; any initial-load chunk ≤ 120 KB gzipped.
