# Phase 1 Backend Foundation Implementation Plan

> **Status (2026-11-09):** Not started. Written to unblock the 33 remaining frontend tasks. Four tasks, four gated PRs: P1-11 → P1-15 → P1-26 → P1-27.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the private orchestrator service (NestJS + Fastify) with validated configuration, graceful shutdown and health endpoints; add the HMAC guard for `/internal/v1`; then add the Nitro-side `callOrchestrator` client and the global error handler so the web app can talk to it. This unblocks every remaining Phase 1 frontend task.

**Architecture:** A new pnpm workspace package `apps/orchestrator` (`@dpdpa/orchestrator`) compiled with `tsc` to CommonJS. NestJS modules stay thin: `config` (Zod-validated env), `modules/health`, `modules/internal-auth` (HMAC guard). The web side adds pure server utils under `apps/web/server/utils/` plus a Nitro request-id middleware and a custom Nitro error handler. HMAC is duplicated deliberately (sign in Nitro, verify in Nest) so the client bundle never imports `node:crypto`; a shared fixed test vector in both suites keeps the two implementations honest.

**Tech Stack:** Node 22, pnpm 9.15.9, Turborepo 2, TypeScript 6 (strict base config), NestJS 12 (`@nestjs/core`/`common`/`platform-fastify` 12.4.1), Fastify 5.12.8, Zod 4, Vitest 5 + v8 coverage, Nitro/Nuxt 4.6.4, `h3` + `ofetch`.

**Spec:** `docs/api.md` §1.4 (error envelope), §1.5 (status codes), §10 (internal API, HMAC headers, 300 s skew, `/internal/v1/health`); `docs/code_style.md` §6 (Nitro server utils, `apiError`, `callOrchestrator`), §7 (NestJS structure, Zod config, thin controllers), §10.3 (coverage floors); `docs/tasks.md` §4.2/§4.3 (P1-11, P1-15, P1-26, P1-27); `docs/memory.md` §19 (naming) and §25 (AI build workflow).

## Global Constraints

- Spec pins win: Node 22, pnpm 9.15.9, NestJS 12, Fastify 5, Zod 4, Nuxt 4.6.4, Vitest 5.
- Root `tsconfig.base.json` strict flags apply to every new package (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`). The orchestrator adds `experimentalDecorators`, `emitDecoratorMetadata`, `strictPropertyInitialization: false` — never weaken the base.
- **Zod is the only validation stack.** No `class-validator`, no decorator DTO validation.
- Config is validated at boot and the process exits on failure. No `process.env` reads outside `src/config/`.
- Errors always use the envelope from `packages/contracts/src/envelope.ts`. Never leak stack traces, SQL, upstream URLs or secrets.
- HMAC contract (api.md §10.1): `HMAC-SHA256(secret, timestamp + "." + rawBody)` as lowercase hex; reject when `|now - timestamp| > 300`; constant-time compares only.
- Nitro never opens a database connection; it calls the orchestrator with `AbortSignal.timeout(15_000)`.
- One branch → one PR → all 6 required checks green (`Code CI`, `Secret scan`, `Docs lint`, `Workflow lint`, `SAST`, `E2E`) + PR-Agent applied/rejected-with-reason + five-axis review → merge (`--merge --delete-branch`). Never waive a gate.
- Local gate: stop anything on port 3000 before running `worktree-gate.ps1` (it fails with `EBUSY` on `apps/web/.output`).

## Review Focus

1. **HMAC implementation drift** — signing lives in `apps/web/server/utils/orchestrator.ts`, verification in `apps/orchestrator/src/common/hmac.ts`. Both tests assert the same fixed vector (`secret = 'a'.repeat(32)`, `timestamp = 1762245120`): body `{"orgId":"org_test"}` → `5b0e36c0aeaa047bde4c0db1c4e256fc56a7f0d8a6bf30481ae8fb1a6effbb0a`; empty body → `dd01d99f9b90fba783626aa0bb7b2e6127fa67be9796449cb88a6f758af8e51b`. Low-entropy values are deliberate: they are test-only and must not trip the secret scanner. (Owning tasks: 2, 3.)
2. **`emitDecoratorMetadata` vs. Vitest** — Vitest transpiles with esbuild, which ignores `emitDecoratorMetadata`. Every DI edge in the orchestrator uses an explicit `@Inject(token)` so tests do not need SWC. `tsc` still emits metadata for the real build. (Owning task: 1.)
3. **Raw body capture** — Nest's `{ rawBody: true }` is required for `req.rawBody`; Fastify's parser must see the bytes the client signed. Task 2's e2e test signs and injects through the real Fastify adapter, so a broken capture fails the test. (Owning task: 2.)
4. **Error envelope leakage** — the global handler must never return an upstream message or stack for 5xx. Task 4 asserts the generic `INTERNAL_ERROR` message and that the upstream URL never appears in the body. (Owning task: 4.)
5. **Nitro error-handler path resolution** — `nitro.errorHandler` is resolved relative to Nitro's `srcDir` (`apps/web/server/`). The plan uses `'~/error-handler'` + `server/error-handler.ts`; Task 4's e2e test proves it, and the fallback is the default `server/error.ts` with no config. (Owning task: 4.)

---

### Task 1: P1-11 — NestJS + Fastify bootstrap, Zod config, graceful shutdown, health endpoints

**Branch:** `feat/P1-11-orchestrator-bootstrap`

**Files:**
- Create: `apps/orchestrator/package.json`, `apps/orchestrator/tsconfig.json`, `apps/orchestrator/tsconfig.build.json`, `apps/orchestrator/vitest.config.ts`
- Create: `apps/orchestrator/src/main.ts`, `src/bootstrap.ts`, `src/app.module.ts`, `src/version.ts`
- Create: `apps/orchestrator/src/config/env.ts`, `src/config/config.module.ts`
- Create: `apps/orchestrator/src/modules/health/health.module.ts`, `health.controller.ts`, `health.service.ts`
- Create: `apps/orchestrator/test/env.test.ts`, `test/health.e2e.test.ts`, `test/bootstrap.test.ts`
- Modify: `pnpm-lock.yaml` (new deps), `.env.example` (document `ORCHESTRATOR_HMAC_KEY`, `ORCHESTRATOR_INTERNAL_KEY`, `ORCHESTRATOR_PORT` if the file exists)

**Interfaces:**
- Consumes: workspace globs (`pnpm-workspace.yaml` already includes `apps/*`), root `tsconfig.base.json`, root lint config.
- Produces: package `@dpdpa/orchestrator` with scripts `build`, `start`, `typecheck`, `lint`, `test`, `test:coverage`; `createApp(env)` (exported from `src/bootstrap.ts`) used by every later test; env token `ENV` and type `Env`; `GET /health`, `GET /ready`, `GET /internal/v1/health`; `HealthService` (extended in Task 2, given a DB check in P1-12).

- [ ] **Step 1: Scaffold the package and wire the workspace**

`apps/orchestrator/package.json`:

```json
{
  "name": "@dpdpa/orchestrator",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js",
    "dev": "tsc -p tsconfig.build.json --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --config ../../eslint.config.js && prettier --check .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@nestjs/common": "12.4.1",
    "@nestjs/core": "12.4.1",
    "@nestjs/platform-fastify": "12.4.1",
    "fastify": "5.12.8",
    "reflect-metadata": "0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@nestjs/testing": "12.4.1",
    "@types/node": "^26.6.6",
    "@vitest/coverage-v8": "^5.1.0",
    "eslint": "^10.14.0",
    "prettier": "^3.9.10",
    "typescript": "~6.0",
    "vitest": "^5.1.0"
  }
}
```

`apps/orchestrator/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strictPropertyInitialization": false
  },
  "include": ["src", "test"]
}
```

`apps/orchestrator/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src"],
  "exclude": ["test"],
  "compilerOptions": { "outDir": "dist", "rootDir": "src" }
}
```

`apps/orchestrator/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entrypoint: exercised by the e2e smoke in CI, not unit tests.
      exclude: ['src/main.ts'],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
```

Run `. "$env:LOCALAPPDATA\Temp\opencode\use-node22.ps1"` then `pnpm install` from the repo root. Commit the updated `pnpm-lock.yaml`.

- [ ] **Step 2: Write the failing config test**

`apps/orchestrator/test/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3001 });
  });

  it('coerces PORT', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects an invalid PORT with the field path in the message', () => {
    expect(() => loadEnv({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
```

- [ ] **Step 3: Implement the Zod config**

`apps/orchestrator/src/config/env.ts`:

```ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid orchestrator configuration: ${fields.join('; ')}`);
  }
  return result.data;
}
```

`apps/orchestrator/src/config/config.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv, type Env } from './env';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env = loadEnv()) {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
```

Run `pnpm --filter @dpdpa/orchestrator test` — the config tests pass.

- [ ] **Step 4: Write the failing health/bootstrap tests**

`apps/orchestrator/test/health.e2e.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/bootstrap';
import type { Env } from '../src/config/env';

const ENV_FIXTURE: Env = { NODE_ENV: 'test', PORT: 3001 };
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp(ENV_FIXTURE);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe('health endpoints', () => {
  it('GET /health returns the liveness contract', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['status', 'timestamp', 'uptimeSeconds', 'version'].sort(),
    );
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.timestamp).toBe(new Date(body.timestamp).toISOString());
  });

  it('GET /ready returns readiness', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: { config: 'ok' } });
  });

  it('GET /internal/v1/health returns the same liveness payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});
```

`apps/orchestrator/test/bootstrap.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/bootstrap';
import { SERVICE_VERSION } from '../src/version';
import type { Env } from '../src/config/env';

const ENV_FIXTURE: Env = { NODE_ENV: 'test', PORT: 3001 };

describe('bootstrap', () => {
  it('keeps SERVICE_VERSION in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(SERVICE_VERSION).toBe(pkg.version);
  });

  it('enables shutdown hooks and closes cleanly', async () => {
    const app = await createApp(ENV_FIXTURE);
    const spy = vi.spyOn(app, 'enableShutdownHooks');
    // enableShutdownHooks is called inside createApp; assert the observable
    // contract instead: close() resolves and no handle keeps the process alive.
    await expect(app.close()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
```

> The shutdown-hook assertion is intentionally weak at this layer; Task 2's guard e2e reuses `createApp` and `app.close()`, and the `HealthService.onApplicationShutdown` flip is asserted there once the guard suite owns a second app instance. Do not add process signal tests that kill the test runner.

- [ ] **Step 5: Implement version, health module, app module, bootstrap, main**

`apps/orchestrator/src/version.ts`:

```ts
export const SERVICE_VERSION = '0.1.0';
```

`apps/orchestrator/src/modules/health/health.service.ts`:

```ts
import { Injectable, ServiceUnavailableException, type OnApplicationShutdown } from '@nestjs/common';
import { SERVICE_VERSION } from '../../version';

export interface LivenessPayload {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private readonly startedAt = Date.now();
  private shuttingDown = false;

  onApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  liveness(now: Date = new Date()): LivenessPayload {
    return {
      status: 'ok',
      version: SERVICE_VERSION,
      uptimeSeconds: Math.round((now.getTime() - this.startedAt) / 1000),
      timestamp: now.toISOString(),
    };
  }

  readiness(): { status: 'ok'; checks: { config: 'ok' } } {
    // P1-12 adds the database probe here. Until then readiness proves the
    // process booted with valid configuration.
    if (this.shuttingDown) {
      throw new ServiceUnavailableException('Shutting down');
    }
    return { status: 'ok', checks: { config: 'ok' } };
  }
}
```

`apps/orchestrator/src/modules/health/health.controller.ts`:

```ts
import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('health')
  liveness() {
    return this.health.liveness();
  }

  @Get('ready')
  readiness() {
    return this.health.readiness();
  }

  @Get('internal/v1/health')
  internalHealth() {
    return this.health.liveness();
  }
}
```

`apps/orchestrator/src/modules/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
```

`apps/orchestrator/src/app.module.ts`:

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { loadEnv, type Env } from './config/env';
import { HealthModule } from './modules/health/health.module';

@Module({})
export class AppModule {
  static forRoot(env: Env = loadEnv()): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(env), HealthModule],
    };
  }
}
```

`apps/orchestrator/src/bootstrap.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { loadEnv, type Env } from './config/env';

export async function createApp(env: Env = loadEnv()): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter({ bodyLimit: 1_048_576 }),
    // Required so InternalHmacGuard can verify the exact bytes signed by Nitro.
    { rawBody: true },
  );
  app.enableShutdownHooks();
  return app;
}
```

`apps/orchestrator/src/main.ts`:

```ts
import { createApp } from './bootstrap';
import { loadEnv } from './config/env';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await createApp(env);
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('orchestrator failed to start', error);
    process.exit(1);
  });
}
```

Run:

```powershell
. "$env:LOCALAPPDATA\Temp\opencode\use-node22.ps1"
pnpm --filter @dpdpa/orchestrator test
pnpm --filter @dpdpa/orchestrator typecheck
pnpm --filter @dpdpa/orchestrator build
pnpm lint
```

- [ ] **Step 6: Verify the compiled server boots and answers**

```powershell
. "$env:LOCALAPPDATA\Temp\opencode\use-node22.ps1"
$env:NODE_ENV = 'test'; $env:PORT = '3099'
Start-Process -FilePath node -ArgumentList 'apps/orchestrator/dist/main.js' -PassThru | Tee-Object -Variable proc
Start-Sleep -Seconds 2
try {
  (Invoke-WebRequest -Uri 'http://127.0.0.1:3099/health' -UseBasicParsing).Content
  (Invoke-WebRequest -Uri 'http://127.0.0.1:3099/ready' -UseBasicParsing).Content
} finally {
  Stop-Process -Id $proc.Id -Force
}
```

Expected: two JSON payloads, `status: "ok"`.

- [ ] **Step 7: Local gate, commit, PR, review, merge**

```powershell
. "$env:LOCALAPPDATA\Temp\opencode\use-node22.ps1"
# Free port 3000 first (the gate deletes apps/web/.output).
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
powershell -ExecutionPolicy Bypass -File C:\Users\darsh\AppData\Local\Temp\opencode\worktree-gate.ps1
git add -A
git commit -m "feat(orchestrator): bootstrap NestJS + Fastify with Zod config and health endpoints (P1-11)"
git push -u origin HEAD
```

Create the PR with `C:\Users\darsh\AppData\Local\Temp\opencode\ghw.ps1` (pass args as an array; no `--jq`). Body: goal, files, verification evidence (test counts, coverage, boot output), and the review-focus note about explicit `@Inject`. Wait for all 6 checks + PR-Agent. Apply worthwhile suggestions; decline Low suggestions with a comment and rationale. Merge `--merge --delete-branch`.

---

### Task 2: P1-15 — HMAC guard for `/internal/v1` with timestamp skew and constant-time compare

**Branch:** `feat/P1-15-internal-hmac-guard`

**Files:**
- Create: `apps/orchestrator/src/common/hmac.ts`, `src/common/request-id.ts`, `src/common/api-error.ts`
- Create: `apps/orchestrator/src/modules/internal-auth/internal-auth.module.ts`, `internal-hmac.guard.ts`
- Modify: `apps/orchestrator/src/config/env.ts` (require `ORCHESTRATOR_HMAC_KEY`, `ORCHESTRATOR_INTERNAL_KEY`)
- Modify: `apps/orchestrator/src/modules/health/health.module.ts` (import `InternalAuthModule`, guard `/internal/v1/health`)
- Modify: `apps/orchestrator/src/modules/health/health.controller.ts` (`@UseGuards(InternalHmacGuard)` on the internal route only)
- Modify: `apps/orchestrator/test/env.test.ts`, `test/health.e2e.test.ts` (fixtures gain the two keys; internal health now needs a signature)
- Create: `apps/orchestrator/test/hmac.test.ts`, `test/internal-hmac-guard.e2e.test.ts`
- Modify: `apps/orchestrator/package.json` (add `"@dpdpa/contracts": "workspace:*"` for the `ErrorCode` type)
- Modify: `apps/orchestrator/vitest.config.ts` (raise thresholds once the guard lands: lines 90, branches 85)

**Interfaces:**
- Consumes: `ENV` token/`Env` from Task 1; `errorEnvelopeSchema` from `@dpdpa/contracts`.
- Produces: `computeSignature(secret, timestamp, rawBody)`, `verifyInternalRequest(input): VerifyResult`, `InternalHmacGuard` (exported by `InternalAuthModule` for every future `/internal/v1` controller), `internalErrorBody(code, message, requestId)`, `resolveRequestId(headers)`.

- [ ] **Step 1: Extend the config test, then the schema**

Add to `test/env.test.ts`:

```ts
const KEYS = {
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
};

it('requires the HMAC and internal keys', () => {
  expect(() => loadEnv({})).toThrow(/ORCHESTRATOR_HMAC_KEY/);
  expect(loadEnv(KEYS)).toMatchObject(KEYS);
});

it('rejects short keys', () => {
  expect(() => loadEnv({ ...KEYS, ORCHESTRATOR_HMAC_KEY: 'short' })).toThrow(/ORCHESTRATOR_HMAC_KEY/);
});
```

Update `envSchema`:

```ts
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ORCHESTRATOR_HMAC_KEY: z.string().min(32),
  ORCHESTRATOR_INTERNAL_KEY: z.string().min(32),
});
```

Update both test fixtures to `{ NODE_ENV: 'test', PORT: 3001, ...KEYS }`.

- [ ] **Step 2: Write the failing pure-HMAC tests**

`apps/orchestrator/test/hmac.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeSignature, verifyInternalRequest } from '../src/common/hmac';

const SECRET = 'a'.repeat(32);
const INTERNAL_KEY = 'b'.repeat(32);
const NOW = 1_762_245_120;

function input(overrides: Partial<Parameters<typeof verifyInternalRequest>[0]> = {}) {
  const timestamp = String(NOW);
  const rawBody = '{"orgId":"org_test"}';
  return {
    secret: SECRET,
    internalKey: INTERNAL_KEY,
    providedInternalKey: INTERNAL_KEY,
    timestamp,
    signature: computeSignature(SECRET, timestamp, rawBody),
    rawBody,
    nowSeconds: NOW,
    maxSkewSeconds: 300,
    ...overrides,
  };
}

describe('computeSignature', () => {
  it('matches the cross-package vector for a JSON body', () => {
    expect(computeSignature(SECRET, '1762245120', '{"orgId":"org_test"}')).toBe(
      '5b0e36c0aeaa047bde4c0db1c4e256fc56a7f0d8a6bf30481ae8fb1a6effbb0a',
    );
  });

  it('matches the cross-package vector for an empty body', () => {
    expect(computeSignature(SECRET, '1762245120', '')).toBe(
      'dd01d99f9b90fba783626aa0bb7b2e6127fa67be9796449cb88a6f758af8e51b',
    );
  });
});

describe('verifyInternalRequest', () => {
  it('accepts a valid request', () => {
    expect(verifyInternalRequest(input())).toEqual({ ok: true });
  });

  it('accepts exactly 300 seconds of skew', () => {
    expect(verifyInternalRequest(input({ nowSeconds: NOW + 300 }))).toEqual({ ok: true });
    expect(verifyInternalRequest(input({ nowSeconds: NOW - 300 }))).toEqual({ ok: true });
  });

  it('rejects missing headers', () => {
    expect(verifyInternalRequest(input({ providedInternalKey: undefined })).ok).toBe(false);
    expect(verifyInternalRequest(input({ timestamp: undefined })).ok).toBe(false);
    expect(verifyInternalRequest(input({ signature: undefined })).ok).toBe(false);
  });

  it('rejects a wrong internal key', () => {
    expect(verifyInternalRequest(input({ providedInternalKey: 'x'.repeat(INTERNAL_KEY.length) }))).toEqual(
      { ok: false, reason: 'invalid_internal_key' },
    );
  });

  it('rejects non-numeric timestamps', () => {
    expect(verifyInternalRequest(input({ timestamp: 'soon' }))).toEqual({
      ok: false,
      reason: 'invalid_timestamp',
    });
  });

  it('rejects skew beyond 300 seconds in both directions', () => {
    expect(verifyInternalRequest(input({ nowSeconds: NOW + 301 }))).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
    expect(verifyInternalRequest(input({ nowSeconds: NOW - 301 }))).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('rejects a tampered body and a wrong-length signature without throwing', () => {
    expect(verifyInternalRequest(input({ rawBody: '{"orgId":"org_evil"}' }))).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
    expect(verifyInternalRequest(input({ signature: 'abc' }))).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('accepts uppercase hex signatures', () => {
    expect(
      verifyInternalRequest(input({ signature: input().signature.toUpperCase() })),
    ).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: Implement the pure HMAC verifier**

`apps/orchestrator/src/common/hmac.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyFailure =
  | 'missing_headers'
  | 'invalid_internal_key'
  | 'invalid_timestamp'
  | 'stale_timestamp'
  | 'invalid_signature';

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

export interface VerifyInput {
  secret: string;
  internalKey: string;
  providedInternalKey: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  nowSeconds: number;
  maxSkewSeconds: number;
}

export function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyInternalRequest(input: VerifyInput): VerifyResult {
  if (!input.providedInternalKey || !input.timestamp || !input.signature) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (!constantTimeEqual(input.internalKey, input.providedInternalKey)) {
    return { ok: false, reason: 'invalid_internal_key' };
  }
  if (!/^\d+$/.test(input.timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(input.nowSeconds - timestamp) > input.maxSkewSeconds) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  const expected = computeSignature(input.secret, input.timestamp, input.rawBody);
  if (!constantTimeEqual(expected, input.signature.toLowerCase())) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Implement request-id and envelope helpers, then the guard**

`apps/orchestrator/src/common/request-id.ts`:

```ts
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

export function resolveRequestId(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['x-request-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && REQUEST_ID_PATTERN.test(value) ? value : generateRequestId();
}
```

`apps/orchestrator/src/common/api-error.ts`:

```ts
import type { ErrorCode } from '@dpdpa/contracts';

export interface ErrorEnvelopeBody {
  error: { code: ErrorCode; message: string; requestId: string };
}

export function internalErrorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
): ErrorEnvelopeBody {
  return { error: { code, message, requestId } };
}
```

`apps/orchestrator/src/modules/internal-auth/internal-hmac.guard.ts`:

```ts
import {
  HttpException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  type RawBodyRequest,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { internalErrorBody } from '../../common/api-error';
import { verifyInternalRequest } from '../../common/hmac';
import { resolveRequestId } from '../../common/request-id';
import { ENV, type Env } from '../../config/env';

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class InternalHmacGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<FastifyRequest>>();
    const headers = request.headers;
    const result = verifyInternalRequest({
      secret: this.env.ORCHESTRATOR_HMAC_KEY,
      internalKey: this.env.ORCHESTRATOR_INTERNAL_KEY,
      providedInternalKey: header(headers['x-internal-key']),
      timestamp: header(headers['x-internal-timestamp']),
      signature: header(headers['x-internal-signature']),
      rawBody: request.rawBody ? request.rawBody.toString('utf8') : '',
      nowSeconds: Math.floor(Date.now() / 1000),
      maxSkewSeconds: 300,
    });
    if (!result.ok) {
      // P1-14 replaces this with the global exception filter; the body is
      // already the contract envelope so clients are unaffected.
      throw new HttpException(
        internalErrorBody('UNAUTHENTICATED', 'The internal request could not be authenticated.', resolveRequestId(headers)),
        401,
      );
    }
    return true;
  }
}
```

`apps/orchestrator/src/modules/internal-auth/internal-auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { InternalHmacGuard } from './internal-hmac.guard';

@Module({ providers: [InternalHmacGuard], exports: [InternalHmacGuard] })
export class InternalAuthModule {}
```

Update `health.module.ts` to import `InternalAuthModule`; add `@UseGuards(InternalHmacGuard)` and `@Inject`-free decorator to the `internalHealth` route only:

```ts
@Get('internal/v1/health')
@UseGuards(InternalHmacGuard)
internalHealth() { return this.health.liveness(); }
```

- [ ] **Step 5: Write and run the e2e guard test**

`apps/orchestrator/test/internal-hmac-guard.e2e.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { createApp } from '../src/bootstrap';
import { HealthService } from '../src/modules/health/health.service';
import type { Env } from '../src/config/env';

const ENV_FIXTURE: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
};
let app: NestFastifyApplication;

function signedHeaders(timestamp = Math.floor(Date.now() / 1000).toString(), body = '') {
  return {
    'x-internal-key': ENV_FIXTURE.ORCHESTRATOR_INTERNAL_KEY,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': createHmac('sha256', ENV_FIXTURE.ORCHESTRATOR_HMAC_KEY)
      .update(`${timestamp}.${body}`)
      .digest('hex'),
    'x-request-id': 'req_test_1234',
  };
}

beforeAll(async () => {
  app = await createApp(ENV_FIXTURE);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe('InternalHmacGuard', () => {
  it('allows a correctly signed GET', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health', headers: signedHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('leaves the probe routes unauthenticated', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
  });

  it('rejects a missing signature with the contract envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health' });
    expect(res.statusCode).toBe(401);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body.error.message).not.toMatch(/signature|timestamp|internal key/i);
  });

  it('rejects a stale timestamp', async () => {
    const old = String(Math.floor(Date.now() / 1000) - 301);
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health', headers: signedHeaders(old) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a tampered body signature', async () => {
    const headers = signedHeaders();
    headers['x-internal-signature'] = 'f'.repeat(64);
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health', headers });
    expect(res.statusCode).toBe(401);
  });

  it('flips readiness to 503 while shutting down', async () => {
    const health = app.get(HealthService);
    health.onApplicationShutdown();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
  });
});
```

Run `pnpm --filter @dpdpa/orchestrator test:coverage` and `typecheck`. If Fastify's `req.rawBody` is `undefined` for GET, confirm `{ rawBody: true }` reached the adapter; for POST coverage add a POST test route in a future task (no POST routes exist yet).

- [ ] **Step 6: Local gate, commit, PR, review, merge**

Same procedure as Task 1. PR title: `feat(orchestrator): HMAC guard for /internal/v1 with skew and constant-time compare (P1-15)`. Body must state: 300 s boundary tested at exactly ±300 (accepted) and ±301 (rejected), uppercase hex accepted, all failure bodies match `errorEnvelopeSchema`, and the deliberate duplication of the HMAC algorithm with the cross-package vector.

---

### Task 3: P1-26 — `callOrchestrator` server util with HMAC signing and timeout

**Branch:** `feat/P1-26-call-orchestrator`

**Files:**
- Create: `apps/web/server/utils/request-id.ts`, `apps/web/server/middleware/request-id.ts`
- Create: `apps/web/server/utils/api-error.ts`, `apps/web/server/utils/orchestrator.ts`
- Modify: `apps/web/nuxt.config.ts` (`runtimeConfig.orchestratorInternalKey`)
- Modify: `apps/web/package.json` (add `@dpdpa/contracts` workspace dep, `h3`, `ofetch`)
- Create: `apps/web/test/request-id.test.ts`, `test/api-error.test.ts`, `test/orchestrator.test.ts`
- Modify: `.env.example` (document `ORCHESTRATOR_INTERNAL_KEY`)

**Interfaces:**
- Consumes: `runtimeConfig` keys `orchestratorUrl`, `orchestratorHmacKey`, `orchestratorInternalKey`; `ErrorCode`/`errorEnvelopeSchema` from `@dpdpa/contracts`.
- Produces: `callOrchestrator<T>(event, options, deps?)`, `buildInternalRequest(...)`, `signHmac(payload, secret)`, `apiError(event, status, code, message, details?)`, `getRequestId(event)`, `resolveRequestId(incoming)`, and the `request-id` middleware that sets `event.context.requestId` + the `x-request-id` response header.

> **Note on task boundary:** `apiError` lands here because `callOrchestrator` must map upstream failures through it (code_style §6.1). Task 4 (P1-27) adds the global Nitro error handler and proves `apiError` reaches the wire.

- [ ] **Step 1: Write the failing request-id and api-error tests**

`apps/web/test/request-id.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REQUEST_ID_PATTERN, generateRequestId, getRequestId, resolveRequestId } from '../server/utils/request-id';

describe('request ids', () => {
  it('generates ids that satisfy the envelope pattern', () => {
    const id = generateRequestId();
    expect(id).toMatch(REQUEST_ID_PATTERN);
    expect(generateRequestId()).not.toBe(id);
  });

  it('reuses a valid incoming id and replaces an invalid one', () => {
    expect(resolveRequestId('req_abcdef12')).toBe('req_abcdef12');
    expect(resolveRequestId('bad id!')).toMatch(REQUEST_ID_PATTERN);
    expect(resolveRequestId(undefined)).toMatch(REQUEST_ID_PATTERN);
  });

  it('caches the id on the event context', () => {
    const event = { context: {} as { requestId?: string } };
    const first = getRequestId(event);
    expect(getRequestId(event)).toBe(first);
  });
});
```

`apps/web/test/api-error.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { apiError } from '../server/utils/api-error';

function capture(fn: () => never): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected apiError to throw');
}

describe('apiError', () => {
  it('throws an H3 error carrying the contract envelope', () => {
    const event = { context: { requestId: 'req_test_1234' } } as never;
    const error = capture(() => apiError(event, 404, 'NOT_FOUND', 'Not found.')) as {
      statusCode: number;
      data: unknown;
    };
    expect(error.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(error.data)).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req_test_1234' },
    });
  });

  it('includes details only when provided', () => {
    const event = { context: { requestId: 'req_test_1234' } } as never;
    const error = capture(() =>
      apiError(event, 422, 'VALIDATION_ERROR', 'Invalid.', [{ path: 'ref', message: 'Required.' }]),
    ) as { data: { error: Record<string, unknown> } };
    expect(error.data.error.details).toEqual([{ path: 'ref', message: 'Required.' }]);

    const bare = capture(() => apiError(event, 401, 'UNAUTHENTICATED', 'Sign in.')) as {
      data: { error: Record<string, unknown> };
    };
    expect('details' in bare.data.error).toBe(false);
  });
});
```

- [ ] **Step 2: Implement request-id, middleware and apiError**

`apps/web/server/utils/request-id.ts`:

```ts
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

export function resolveRequestId(incoming: string | undefined): string {
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : generateRequestId();
}

export function getRequestId(event: { context: { requestId?: string } }): string {
  const current = event.context.requestId;
  if (typeof current === 'string' && REQUEST_ID_PATTERN.test(current)) return current;
  const generated = generateRequestId();
  event.context.requestId = generated;
  return generated;
}
```

`apps/web/server/middleware/request-id.ts`:

```ts
import { resolveRequestId } from '../utils/request-id';

export default defineEventHandler((event) => {
  event.context.requestId = resolveRequestId(getHeader(event, 'x-request-id'));
  setHeader(event, 'x-request-id', event.context.requestId);
});
```

`apps/web/server/utils/api-error.ts`:

```ts
import { createError } from 'h3';
import type { ErrorCode } from '@dpdpa/contracts';
import { getRequestId } from './request-id';

export interface ErrorDetail {
  path: string;
  message: string;
}

export function apiError(
  event: { context: { requestId?: string } },
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): never {
  const error: Record<string, unknown> = { code, message, requestId: getRequestId(event) };
  if (details !== undefined) error.details = details;
  throw createError({ statusCode: status, statusMessage: message, data: { error } });
}
```

Add to `apps/web/package.json` dependencies: `"@dpdpa/contracts": "workspace:*"`, `"h3": "^1.15.4"`, `"ofetch": "^1.4.1"` (versions must match what Nuxt 4.6.4 already resolved in the lockfile — check `pnpm why h3` and pin the resolved ranges).

- [ ] **Step 3: Write the failing orchestrator-client tests**

`apps/web/test/orchestrator.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildInternalRequest, callOrchestrator, signHmac } from '../server/utils/orchestrator';

const SECRET = 'a'.repeat(32);
const INTERNAL_KEY = 'b'.repeat(32);
const CONFIG = { url: 'http://orchestrator.test', hmacKey: SECRET, internalKey: INTERNAL_KEY };
const EVENT = { context: { requestId: 'req_test_1234', orgId: 'org_test', userId: 'usr_test' } } as never;

describe('signHmac', () => {
  it('matches the cross-package vectors', () => {
    expect(signHmac('1762245120.{"orgId":"org_test"}', SECRET)).toBe(
      '5b0e36c0aeaa047bde4c0db1c4e256fc56a7f0d8a6bf30481ae8fb1a6effbb0a',
    );
    expect(signHmac('1762245120.', SECRET)).toBe(
      'dd01d99f9b90fba783626aa0bb7b2e6127fa67be9796449cb88a6f758af8e51b',
    );
  });
});

describe('buildInternalRequest', () => {
  it('serialises the body once and signs exactly those bytes', () => {
    const request = buildInternalRequest(
      EVENT,
      { method: 'POST', path: '/internal/v1/scans', body: { orgId: 'org_test' }, idempotencyKey: 'idem_1' },
      CONFIG,
      () => 1_762_245_120_000,
    );
    expect(request.body).toBe('{"orgId":"org_test"}');
    expect(request.headers['x-internal-timestamp']).toBe('1762245120');
    expect(request.headers['x-internal-signature']).toBe(
      '5b0e36c0aeaa047bde4c0db1c4e256fc56a7f0d8a6bf30481ae8fb1a6effbb0a',
    );
    expect(request.headers['x-internal-key']).toBe(INTERNAL_KEY);
    expect(request.headers['x-request-id']).toBe('req_test_1234');
    expect(request.headers['x-org-id']).toBe('org_test');
    expect(request.headers['x-user-id']).toBe('usr_test');
    expect(request.headers['idempotency-key']).toBe('idem_1');
  });

  it('signs an empty body for GET', () => {
    const request = buildInternalRequest(EVENT, { method: 'GET', path: '/internal/v1/health' }, CONFIG, () => 1_762_245_120_000);
    expect(request.body).toBeUndefined();
    expect(request.headers['x-internal-signature']).toBe(
      'dd01d99f9b90fba783626aa0bb7b2e6127fa67be9796449cb88a6f758af8e51b',
    );
  });
});

describe('callOrchestrator', () => {
  it('calls the orchestrator with a timeout signal and returns the payload', async () => {
    const fetch = vi.fn().mockResolvedValue({ data: { scanId: 'scn_1' } });
    const result = await callOrchestrator<{ data: { scanId: string } }>(
      EVENT,
      { method: 'GET', path: '/internal/v1/scans/scn_1' },
      { fetch, config: CONFIG, now: () => 1_762_245_120_000 },
    );
    expect(result.data.scanId).toBe('scn_1');
    const [, init] = fetch.mock.calls[0] as [string, { headers: Record<string, string>; signal: AbortSignal }];
    expect(fetch.mock.calls[0]?.[0]).toBe('http://orchestrator.test/internal/v1/scans/scn_1');
    expect(init.headers['x-internal-signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps an upstream failure to 503 UPSTREAM_UNAVAILABLE without leaking the URL', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED http://orchestrator.test'));
    await expect(
      callOrchestrator(EVENT, { method: 'GET', path: '/internal/v1/health' }, { fetch, config: CONFIG, now: () => 1_762_245_120_000 }),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { error: { code: 'UPSTREAM_UNAVAILABLE', requestId: 'req_test_1234' } },
    });
    try {
      await callOrchestrator(EVENT, { method: 'GET', path: '/internal/v1/health' }, { fetch, config: CONFIG, now: () => 1_762_245_120_000 });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('orchestrator.test');
    }
  });

  it('fails fast with INTERNAL_ERROR when configuration is missing', async () => {
    const fetch = vi.fn();
    await expect(
      callOrchestrator(EVENT, { method: 'GET', path: '/internal/v1/health' }, {
        fetch,
        config: { url: '', hmacKey: '', internalKey: '' },
        now: () => 0,
      }),
    ).rejects.toMatchObject({ statusCode: 500, data: { error: { code: 'INTERNAL_ERROR' } } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Implement the orchestrator client**

`apps/web/server/utils/orchestrator.ts`:

```ts
import { createHmac } from 'node:crypto';
import { $fetch } from 'ofetch';
import { apiError } from './api-error';
import { getRequestId } from './request-id';

export interface OrchestratorCallOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

export interface OrchestratorConfig {
  url: string;
  hmacKey: string;
  internalKey: string;
}

export interface OrchestratorDeps {
  fetch: typeof $fetch;
  config: OrchestratorConfig;
  now: () => number;
}

export interface InternalRequest {
  body: string | undefined;
  headers: Record<string, string>;
}

export function signHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function buildInternalRequest(
  event: { context: { requestId?: string; orgId?: string; userId?: string } },
  options: OrchestratorCallOptions,
  config: OrchestratorConfig,
  now: () => number = Date.now,
): InternalRequest {
  const body = options.body === undefined ? '' : JSON.stringify(options.body);
  const timestamp = Math.floor(now() / 1000).toString();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-internal-key': config.internalKey,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signHmac(`${timestamp}.${body}`, config.hmacKey),
    'x-request-id': getRequestId(event),
  };
  if (typeof event.context.orgId === 'string') headers['x-org-id'] = event.context.orgId;
  if (typeof event.context.userId === 'string') headers['x-user-id'] = event.context.userId;
  if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
  return { body: body === '' ? undefined : body, headers };
}

function readConfig(event: { context: { requestId?: string } }): OrchestratorConfig {
  const runtime = useRuntimeConfig();
  const config = {
    url: runtime.orchestratorUrl,
    hmacKey: runtime.orchestratorHmacKey,
    internalKey: runtime.orchestratorInternalKey,
  };
  if (!config.url || !config.hmacKey || !config.internalKey) {
    apiError(event, 500, 'INTERNAL_ERROR', 'The audit service is not configured.');
  }
  return config;
}

export async function callOrchestrator<T>(
  event: { context: { requestId?: string; orgId?: string; userId?: string } },
  options: OrchestratorCallOptions,
  deps: Partial<OrchestratorDeps> = {},
): Promise<T> {
  const config = deps.config ?? readConfig(event);
  if (!config.url || !config.hmacKey || !config.internalKey) {
    apiError(event, 500, 'INTERNAL_ERROR', 'The audit service is not configured.');
  }
  const fetch = deps.fetch ?? $fetch;
  const now = deps.now ?? Date.now;
  const request = buildInternalRequest(event, options, config, now);
  try {
    return await fetch<T>(`${config.url}${options.path}`, {
      method: options.method,
      ...(request.body === undefined ? {} : { body: request.body }),
      headers: request.headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Never surface the upstream URL, status text or stack (api.md §1.4).
    apiError(event, 503, 'UPSTREAM_UNAVAILABLE', 'The audit service is unavailable. Try again shortly.');
  }
}
```

Update `apps/web/nuxt.config.ts` runtimeConfig:

```ts
    orchestratorInternalKey: process.env.ORCHESTRATOR_INTERNAL_KEY ?? '',
```

Run `pnpm --filter @dpdpa/web test`, `pnpm --filter @dpdpa/web typecheck`.

- [ ] **Step 5: Local gate, commit, PR, review, merge**

Same procedure. PR title: `feat(web): callOrchestrator server util with HMAC signing and timeout (P1-26)`. Body must include the cross-package vector proof and note that `apiError` lands here so Task 4 can consume it.

---

### Task 4: P1-27 — Global Nitro error handler and `apiError` helper

**Branch:** `feat/P1-27-nitro-error-handler`

**Files:**
- Create: `apps/web/server/utils/error-envelope.ts`, `apps/web/server/error-handler.ts`
- Create: `apps/web/test/error-envelope.test.ts`, `apps/web/test/error-handler.e2e.test.ts`
- Modify: `apps/web/nuxt.config.ts` (`nitro.errorHandler: '~/error-handler'`)
- Modify: `apps/web/vitest.config.ts` (add the new e2e file to the `e2e` project include)

**Interfaces:**
- Consumes: `getRequestId`/`REQUEST_ID_PATTERN`, `apiError` (Task 3), `ERROR_CODES` type from `@dpdpa/contracts`.
- Produces: `toErrorEnvelope(error, requestId): { status, body }`, the default-exported Nitro error handler, and a global guarantee that every non-2xx response is `{ error: { code, message, requestId, details? } }`.

- [ ] **Step 1: Write the failing mapper tests**

`apps/web/test/error-envelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { toErrorEnvelope } from '../server/utils/error-envelope';

const REQUEST_ID = 'req_test_1234';

describe('toErrorEnvelope', () => {
  it('preserves an apiError envelope', () => {
    const result = toErrorEnvelope(
      {
        statusCode: 422,
        data: { error: { code: 'VALIDATION_ERROR', message: 'Invalid.', requestId: 'req_original_1', details: [{ path: 'ref', message: 'Required.' }] } },
      },
      REQUEST_ID,
    );
    expect(result.status).toBe(422);
    expect(errorEnvelopeSchema.parse(result.body)).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid.', requestId: REQUEST_ID },
    });
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [410, 'REPORT_EXPIRED'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [422, 'VALIDATION_ERROR'],
    [429, 'RATE_LIMITED'],
    [503, 'UPSTREAM_UNAVAILABLE'],
  ])('maps HTTP %i to %s', (statusCode, code) => {
    const result = toErrorEnvelope({ statusCode }, REQUEST_ID);
    expect(result.status).toBe(statusCode);
    expect(result.body.error.code).toBe(code);
  });

  it('hides internals for unknown and 5xx errors', () => {
    const result = toErrorEnvelope(new Error('connect ECONNREFUSED postgres://secret'), REQUEST_ID);
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(result.body)).not.toContain('postgres');
  });

  it('never returns a stack trace', () => {
    const result = toErrorEnvelope(Object.assign(new Error('boom'), { stack: 'at secret.ts:1' }), REQUEST_ID);
    expect(JSON.stringify(result.body)).not.toContain('secret.ts');
  });
});
```

- [ ] **Step 2: Implement the mapper and handler**

`apps/web/server/utils/error-envelope.ts`:

```ts
import type { ErrorCode } from '@dpdpa/contracts';

export interface EnvelopeBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: { path: string; message: string }[];
  };
}

export interface EnvelopeResult {
  status: number;
  body: EnvelopeBody;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'REPORT_EXPIRED',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  503: 'UPSTREAM_UNAVAILABLE',
};

const GENERIC_5XX = 'An unexpected error occurred.';

interface ErrorLike {
  statusCode?: number;
  statusMessage?: string;
  data?: unknown;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function passthroughEnvelope(data: unknown): EnvelopeBody['error'] | undefined {
  if (!isRecord(data) || !isRecord(data.error)) return undefined;
  const { code, message, details } = data.error;
  if (typeof code !== 'string' || typeof message !== 'string') return undefined;
  const error: EnvelopeBody['error'] = { code: code as ErrorCode, message, requestId: '' };
  if (Array.isArray(details)) {
    error.details = details
      .filter((detail): detail is { path: string; message: string } =>
        isRecord(detail) && typeof detail.path === 'string' && typeof detail.message === 'string',
      )
      .map(({ path, message }) => ({ path, message }));
  }
  return error;
}

export function toErrorEnvelope(error: unknown, requestId: string): EnvelopeResult {
  const err: ErrorLike = isRecord(error) ? (error as ErrorLike) : {};
  const passthrough = passthroughEnvelope(err.data);
  if (passthrough) {
    return { status: err.statusCode ?? 500, body: { error: { ...passthrough, requestId } } };
  }
  const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
  const code = STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
  const safeStatus = code === 'INTERNAL_ERROR' ? 500 : status;
  const message = safeStatus >= 500 ? GENERIC_5XX : (err.statusMessage ?? 'The request could not be completed.');
  return { status: safeStatus, body: { error: { code, message, requestId } } };
}
```

`apps/web/server/error-handler.ts`:

```ts
import { toErrorEnvelope } from './utils/error-envelope';
import { getRequestId } from './utils/request-id';

// Nitro custom error handler (nitro.errorHandler = '~/error-handler').
// Every non-2xx response leaves the server in the api.md §1.4 envelope.
export default function errorHandler(error: unknown, event: H3Event): unknown {
  const { status, body } = toErrorEnvelope(error, getRequestId(event));
  setResponseStatus(event, status);
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8');
  setResponseHeader(event, 'cache-control', 'no-store');
  if (status === 503) setResponseHeader(event, 'retry-after', '5');
  return body;
}
```

Update `nuxt.config.ts`:

```ts
  nitro: {
    errorHandler: '~/error-handler',
    routeRules: { /* unchanged */ },
  },
```

If Nitro cannot resolve `~/error-handler`, the fallback is to move the file to `apps/web/server/error.ts` and delete the `errorHandler` key (Nitro's default is `~/error`).

- [ ] **Step 3: Write the failing e2e test**

`apps/web/test/error-handler.e2e.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { $fetch, setup } from '@nuxt/test-utils/e2e';
import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '@dpdpa/contracts';

await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)) });

describe('global Nitro error handler', () => {
  it('returns the contract envelope for an unknown API route', async () => {
    try {
      await $fetch('/api/definitely-not-a-route');
      throw new Error('expected a 404');
    } catch (error) {
      const err = error as { statusCode?: number; data?: unknown };
      expect(err.statusCode).toBe(404);
      const envelope = errorEnvelopeSchema.parse(err.data);
      expect(envelope.error.code).toBe('NOT_FOUND');
      expect(envelope.error.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    }
  });
});
```

Update `apps/web/vitest.config.ts`:

```ts
          include: ['test/security-headers.test.ts', 'test/error-handler.e2e.test.ts'],
```

Run `pnpm --filter @dpdpa/web test` (the e2e project builds Nitro once) and `pnpm --filter @dpdpa/web typecheck`.

- [ ] **Step 4: Local gate, commit, PR, review, merge**

Same procedure. PR title: `feat(web): global Nitro error handler and apiError helper (P1-27)`. Body must show the unknown-route e2e output and confirm no upstream URL/stack appears in a 5xx.

---

## Final Verification

- [ ] `pnpm lint` green at root.
- [ ] `pnpm typecheck` green (turbo builds contracts first).
- [ ] `pnpm test:coverage` green; orchestrator ≥ 80/70 in Task 1 and ≥ 90/85 after Task 2; web unchanged floors.
- [ ] `pnpm build` green (orchestrator emits `dist/main.js`, web emits `.output/`).
- [ ] All four PRs merged; `origin/main` contains `apps/orchestrator`, `server/utils/orchestrator.ts`, `server/utils/api-error.ts`, `server/error-handler.ts`.
- [ ] Update `docs/superpowers/plans/2026-11-06-phase-1-web-foundation.md` status line: P1-26/P1-27 are no longer blocked.
- [ ] Append evidence to `.superpowers/sdd/2026-11-06-phase-1-web-foundation/ledger.md` (or a new ledger for this plan) and `docs/memory.md` if a pin changed.

## Execution Log

- [ ] Task 1 (P1-11) — branch, PR #, checks, merge SHA
- [ ] Task 2 (P1-15) — branch, PR #, checks, merge SHA
- [ ] Task 3 (P1-26) — branch, PR #, checks, merge SHA
- [ ] Task 4 (P1-27) — branch, PR #, checks, merge SHA
