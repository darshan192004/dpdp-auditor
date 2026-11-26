# Local k3s Production Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy DPDPA Auditor as an internal-only production pilot on the local k3s cluster with private TLS, durable state, gVisor-isolated per-scan Jobs, and attributable email/password logins.

**Architecture:** Tasks 1–5 add password identity to the existing Nuxt/Nitro + NestJS orchestrator stack, reusing the current session sealing and org/membership model. Tasks 6–11 add the k3s platform: prepared node and private ingress, PVC-backed Postgres/Redis/MinIO/registry, immutable images with digest-pinned runner Jobs, observability, runbooks, and the sign-off gates. Each numbered task ends in a testable, committable deliverable.

**Tech Stack:** pnpm 9.15.9 / Node >=22, Nuxt 4 + Nitro, NestJS 12 + Fastify, Prisma 7 + PostgreSQL 16, Redis 7 + BullMQ, argon2id, MinIO S3, k3s v1.37.0+k3s1, gVisor `runsc`, cert-manager-free OpenSSL-generated CA, registry:2, Prometheus + Alertmanager, kubectl.

**Spec:** `docs/superpowers/specs/2026-11-26-local-k3s-production-pilot-design.md`

## Global Constraints

- Internal-only deployment: no public DNS, no public exposure, hostname `dpdpa.pride.improwised.dev`.
- Cluster: k3s `v1.37.0+k3s1` at `imperator.pride.improwised.dev`.
- Namespaces: `dpdpa` and `dpdpa-scanners`.
- Deployments at 1 replica: `web`, `orchestrator`, `renderer`, registry. Runner runs only as Jobs.
- TLS: certificate issued from a purpose-generated self-signed CA; CA exported to internal clients.
- PVC sizes: `pg-data` 20 Gi, `pg-backups` 20 Gi, `redis-data` 5 Gi, `minio-data` 50 Gi, `registry-data` 20 Gi; provisioner `local-path`; all stateful pods pinned to the cluster node.
- Image tag `1.0.0-pilot.1`; registry `registry.dpdpa.svc.cluster.local:5000`; runner image digest-pinned.
- Job spec from `kubernetes-scan-executor.ts` stays unchanged: `runtimeClassName: gvisor`, `nodeSelector workload=scanner`, toleration on `workload=scanner:NoSchedule`, 900 s deadline, 300 s TTL, UID 10001, read-only root filesystem, `emptyDir` workspace.
- Password policy: argon2id m=19456 KiB, t=2, p=1, 16-byte salt; minimum 12 characters.
- Rate limits: 5 attempts per email and 20 per IP per 15 minutes.
- Zero source retention (ADR-010): source never leaves a Job's `emptyDir`.
- Rule packs are immutable: any rule-pack change requires a version bump and regenerated manifest.
- Advisory-confidence findings never change scoring semantics.
- Do not commit these untracked files: `.claude/`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`, `opencode.jsonc`, `report-current.png`.
- External pentest stays Pending and is deferred for the internal pilot; correct `docs/launch-readiness.md:40`.

---

### Task 1: Argon2id password utility

**Files:**
- Modify: `apps/orchestrator/package.json` (add `argon2` dependency)
- Create: `apps/orchestrator/src/modules/identity/password.ts`
- Test: `apps/orchestrator/test/password.test.ts`

**Interfaces:**
- Consumes: Node `crypto` randomBytes; `argon2` package.
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(hash: string, plain: string): Promise<boolean>`, `PASSWORD_MIN_LENGTH = 12`. Both functions are imported by Task 3.

- [ ] **Step 1: Install the dependency**

```bash
pnpm --filter @dpdpa/orchestrator add argon2@^0.43.0
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/orchestrator/test/password.test.ts
import { describe, expect, it } from 'vitest';

import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from '../src/modules/identity/password.js';

describe('password hashing', () => {
  it('hashes with argon2id and verifies the same password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  it('produces a different salt for every hash', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).not.toBe(b);
  });

  it('exposes the minimum length contract', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/orchestrator test -- password.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 4: Write the minimal implementation**

```ts
// apps/orchestrator/src/modules/identity/password.ts
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    salt: randomBytes(16),
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @dpdpa/orchestrator test -- password.test.ts
pnpm --filter @dpdpa/orchestrator typecheck
```
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/package.json pnpm-lock.yaml apps/orchestrator/src/modules/identity/password.ts apps/orchestrator/test/password.test.ts
git commit -m "feat(identity): add argon2id password hashing utility"
```

---

### Task 2: User schema and migration for password credentials

**Files:**
- Modify: `apps/orchestrator/prisma/schema.prisma:160-170`
- Create: `apps/orchestrator/prisma/migrations/20261127000000_password_auth/migration.sql`
- Test: `apps/orchestrator/test/identity-password-fields.test.ts`

**Interfaces:**
- Consumes: Prisma `User` model from Task 1's package.
- Produces: `User.passwordHash: string | null`, `User.mustChangePassword: boolean`. Task 3 reads these fields; Task 5 writes them.

- [ ] **Step 1: Write the failing test**

```ts
// apps/orchestrator/test/identity-password-fields.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('password auth migration', () => {
  it('adds both columns with safe defaults', () => {
    const sql = readFileSync(
      new URL('../prisma/migrations/20261127000000_password_auth/migration.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('"password_hash" TEXT');
    expect(sql).toContain('"must_change_password" BOOLEAN NOT NULL DEFAULT false');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/orchestrator test -- identity-password-fields.test.ts
```
Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Change the schema and add the migration**

In `apps/orchestrator/prisma/schema.prisma`, inside `model User`, add directly after `emailVerifiedAt`:

```prisma
  passwordHash        String?   @map("password_hash")
  mustChangePassword  Boolean   @default(false) @map("must_change_password")
```

Create `apps/orchestrator/prisma/migrations/20261127000000_password_auth/migration.sql`:

```sql
-- Add password credentials for the internal pilot. Nullable so GitHub-derived users remain valid.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Generate the client and run the migration locally**

```bash
pnpm --filter @dpdpa/orchestrator prisma:generate
pnpm db:deploy
pnpm --filter @dpdpa/orchestrator test -- identity-password-fields.test.ts
```
Expected: PASS; migration applies to the local development database.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/prisma/schema.prisma apps/orchestrator/prisma/migrations/20261127000000_password_auth/migration.sql apps/orchestrator/test/identity-password-fields.test.ts
git commit -m "feat(identity): add password credential columns"
```

---

### Task 3: Orchestrator password login endpoint with rate limiting

**Files:**
- Modify: `apps/orchestrator/src/modules/identity/identity.service.ts`
- Modify: `apps/orchestrator/src/modules/identity/internal-identity.controller.ts`
- Modify: `apps/orchestrator/src/modules/identity/identity.schemas.ts`
- Create: `apps/orchestrator/src/modules/identity/password-login.service.ts`
- Test: `apps/orchestrator/test/password-login.service.test.ts`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword` (Task 1), `User.passwordHash` and `mustChangePassword` (Task 2), existing `AuditService.record`, existing Redis client used by `rate-limit` code.
- Produces: `POST /internal/v1/identity/password/login` accepting `{ email: string; password: string; userAgent?: string }` and returning `{ data: { user: UserView; mustChangePassword: boolean; sessionId: string } }`; class `PasswordLoginService` with `login(input): Promise<{ user: UserView; mustChangePassword: boolean }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/orchestrator/test/password-login.service.test.ts
import { describe, expect, it, vi } from 'vitest';

import { PasswordLoginService } from '../src/modules/identity/password-login.service.js';
import { hashPassword } from '../src/modules/identity/password.js';

function makeService() {
  const users = {
    findByEmail: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.test', passwordHash: 'stored-hash', deletedAt: null, mustChangePassword: true }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const limits = { check: vi.fn().mockResolvedValue(true), bump: vi.fn().mockResolvedValue(undefined) };
  const verify = vi.fn().mockResolvedValue(true);
  return {
    service: new PasswordLoginService(users as never, audit as never, limits as never, verify),
    users, audit, limits, verify,
  };
}

describe('PasswordLoginService', () => {
  it('returns the user and rotation flag for valid credentials', async () => {
    const { service, audit } = makeService();
    const result = await service.login({ email: 'a@b.test', password: 'correct horse battery staple' });
    expect(result.user.id).toBe('u1');
    expect(result.mustChangePassword).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login', metadata: { method: 'password' } }));
  });

  it('rejects a user without a password hash', async () => {
    const { service, users } = makeService();
    users.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.test', passwordHash: null, deletedAt: null });
    await expect(service.login({ email: 'a@b.test', password: 'correct horse battery staple' })).rejects.toThrow('Invalid email or password.');
  });

  it('refuses a login that exceeds the rate limit', async () => {
    const { service, limits } = makeService();
    limits.check.mockResolvedValue(false);
    await expect(service.login({ email: 'a@b.test', password: 'correct horse battery staple' })).rejects.toThrow('Invalid email or password.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/orchestrator test -- password-login.service.test.ts
```
Expected: FAIL because `PasswordLoginService` does not exist.

- [ ] **Step 3: Add the Zod schema**

In `apps/orchestrator/src/modules/identity/identity.schemas.ts`, append:

```ts
export const passwordLoginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;
```

- [ ] **Step 4: Implement the service**

```ts
// apps/orchestrator/src/modules/identity/password-login.service.ts
import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { UsersRepository } from './users.repository.js';
import { passwordLoginSchema, type PasswordLoginInput } from './identity.schemas.js';
import { hashPassword, verifyPassword } from './password.js';

export interface RateLimitGate {
  check(key: string, limit: number, windowSeconds: number): Promise<boolean>;
  bump(key: string, windowSeconds: number): Promise<void>;
}

const INVALID = 'Invalid email or password.';

// A real argon2id hash generated once at module load, used only to keep the
// unknown-user failure path constant-time. Never committed as a literal.
const DUMMY_HASH = await hashPassword(randomBytes(32).toString('hex'));

@Injectable()
export class PasswordLoginService {
  constructor(
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
    private readonly limits: RateLimitGate,
    private readonly verify: (hash: string, plain: string) => Promise<boolean> = verifyPassword,
  ) {}

  async login(raw: PasswordLoginInput): Promise<{ user: { id: string; email: string; name: string | null }; mustChangePassword: boolean }> {
    const input = passwordLoginSchema.parse(raw);
    const emailKey = `pw-login:email:${input.email.toLowerCase()}`;
    if (!(await this.limits.check(emailKey, 5, 900))) throw new ApiError('UNAUTHENTICATED', INVALID);

    const user = await this.users.findByEmail(input.email);
    const storedHash = user?.passwordHash ?? null;
    // Always verify against a real argon2id hash so unknown users take the same path.
    const ok = await this.verify(storedHash ?? DUMMY_HASH, input.password);
    await this.limits.bump(emailKey, 900);
    if (!user || user.deletedAt || !storedHash || !ok) throw new ApiError('UNAUTHENTICATED', INVALID);

    await this.audit.record({
      orgId: null,
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { method: 'password' },
    });
    return { user: { id: user.id, email: user.email, name: user.name }, mustChangePassword: user.mustChangePassword };
  }
}
```

- [ ] **Step 5: Wire the internal route**

In `internal-identity.controller.ts`, inject `PasswordLoginService` and add before `upsertUser`:

```ts
  /** Email/password login for the internal pilot (Nitro mints the session). */
  @Post('password/login')
  @HttpCode(200)
  async passwordLogin(@Body() body: unknown) {
    const input = passwordLoginSchema.parse(body);
    const result = await this.passwords.login(input);
    const session = await this.sessions.create({
      userId: result.user.id,
      activeOrgId: null,
      userAgent: input.userAgent ?? 'password-login',
    });
    return { data: { ...result, sessionId: session.id } };
  }
```

- [ ] **Step 6: Run tests and typecheck**

```bash
pnpm --filter @dpdpa/orchestrator test -- password-login.service.test.ts
pnpm --filter @dpdpa/orchestrator typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/orchestrator/src/modules/identity apps/orchestrator/test/password-login.service.test.ts
git commit -m "feat(identity): add password login with rate limiting"
```

---

### Task 4: Web password login route and login form

**Files:**
- Create: `apps/web/server/api/auth/password/login.post.ts`
- Modify: `apps/web/app/pages/login.vue`
- Modify: `apps/web/nuxt.config.ts`
- Test: `apps/web/test/password-login.test.ts`

**Interfaces:**
- Consumes: `POST /internal/v1/identity/password/login` (Task 3), existing `callOrchestrator`, `replaceUserSession`, `fetchResolvedSession`, `clearUserSession` from `dev-session.post.ts`.
- Produces: `POST /api/auth/password/login`; public config `passwordLoginEnabled` controlling UI visibility.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/password-login.test.ts
import { describe, expect, it } from 'vitest';

import { passwordLoginError } from '../app/utils/password-login';

describe('password login copy', () => {
  it('uses one generic error for every failure', () => {
    expect(passwordLoginError('UNAUTHENTICATED')).toBe('Invalid email or password.');
    expect(passwordLoginError('RATE_LIMITED')).toBe('Invalid email or password.');
    expect(passwordLoginError('UNKNOWN')).toBe('Invalid email or password.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/web test -- password-login.test.ts
```
Expected: FAIL because the util does not exist.

- [ ] **Step 3: Implement the shared copy util and the API route**

```ts
// apps/web/app/utils/password-login.ts
export function passwordLoginError(_code: string): string {
  return 'Invalid email or password.';
}
```

```ts
// apps/web/server/api/auth/password/login.post.ts
import { createError, readBody } from 'h3';
import { z } from 'zod';

import { callOrchestrator } from '../../utils/orchestrator';
import { fetchResolvedSession } from '../../utils/session';

const schema = z.object({ email: z.email(), password: z.string().min(1).max(200) });

export default defineEventHandler(async (event) => {
  const { email, password } = schema.parse(await readBody(event));
  let data: { user: { id: string; email: string; name: string | null }; sessionId: string };
  try {
    const result = await callOrchestrator<{
      data: { user: { id: string; email: string; name: string | null }; sessionId: string };
    }>(event, {
      method: 'POST',
      path: '/internal/v1/identity/password/login',
      body: { email, password, userAgent: getHeader(event, 'user-agent') ?? 'password-login' },
    });
    data = result.data;
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' });
  }

  await replaceUserSession(event, {
    sessionId: data.sessionId,
    user: { id: data.user.id, name: data.user.name, email: data.user.email, avatarUrl: null },
  });
  if ((await fetchResolvedSession(event, data.sessionId)) === null) {
    await clearUserSession(event);
    throw createError({ statusCode: 503, statusMessage: 'The audit service is unavailable. Try again shortly.' });
  }
  return { ok: true };
});
```

- [ ] **Step 4: Add the flag and the form**

In `apps/web/nuxt.config.ts`, inside `runtimeConfig.public`, add:

```ts
      passwordLoginEnabled: process.env.NUXT_PUBLIC_PASSWORD_LOGIN_ENABLED === 'true',
```

In `apps/web/app/pages/login.vue`, add a form before the GitHub anchor, guarded by the flag:

```vue
    <form
      v-if="config.public.passwordLoginEnabled"
      class="space-y-3"
      @submit.prevent="submitPassword"
    >
      <label class="block text-sm" for="email">Email</label>
      <input id="email" v-model="email" type="email" required autocomplete="username"
        class="border-ink-200 w-full rounded-[var(--radius-control)] border px-3 py-2" />
      <label class="block text-sm" for="password">Password</label>
      <input id="password" v-model="password" type="password" required autocomplete="current-password"
        class="border-ink-200 w-full rounded-[var(--radius-control)] border px-3 py-2" />
      <p v-if="formError" role="alert" class="text-risk-critical-text text-sm">{{ formError }}</p>
      <button type="submit"
        class="bg-brand-500 text-ink-50 w-full rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-medium">
        Sign in
      </button>
    </form>
```

Add the script state and handler:

```ts
const config = useRuntimeConfig();
const email = ref('');
const password = ref('');
const formError = ref<string | null>(null);

async function submitPassword() {
  formError.value = null;
  try {
    await $fetch('/api/auth/password/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });
    await navigateTo(redirect.value, { replace: true });
  } catch {
    formError.value = passwordLoginError('UNAUTHENTICATED');
  }
}
```

Hide the GitHub anchor with `v-if="!config.public.passwordLoginEnabled"`.

- [ ] **Step 5: Run tests, typecheck, lint**

```bash
pnpm --filter @dpdpa/web test -- password-login.test.ts
pnpm typecheck
pnpm --filter @dpdpa/web lint
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/server/api/auth/password/login.post.ts apps/web/app/utils/password-login.ts apps/web/app/pages/login.vue apps/web/nuxt.config.ts apps/web/test/password-login.test.ts
git commit -m "feat(web): add password login form and route"
```

---

### Task 5: Seed-account Job and first-login rotation

**Files:**
- Create: `apps/orchestrator/src/modules/identity/seed-users.ts`
- Create: `apps/orchestrator/src/commands/seed-users.ts`
- Create: `infra/k8s/dpdpa/jobs/seed-users.yaml`
- Test: `apps/orchestrator/test/seed-users.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 1), `User.passwordHash` (Task 2), `IdentityService.addMember`, `PasswordLoginService` result flag.
- Produces: CLI `node dist/commands/seed-users.js` reading `SEED_USERS_JSON`; Kubernetes Job `seed-users`. Seed JSON shape: `[{ "email": string, "name": string, "password": string, "orgSlug": string, "role": "owner" | "admin" | "auditor" }]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/orchestrator/test/seed-users.test.ts
import { describe, expect, it, vi } from 'vitest';

import { parseSeedUsers } from '../src/modules/identity/seed-users.js';

describe('seed user parsing', () => {
  it('accepts valid seed entries', () => {
    const parsed = parseSeedUsers(JSON.stringify([
      { email: 'a@b.test', name: 'A', password: 'correct horse battery staple', orgSlug: 'internal', role: 'owner' },
    ]));
    expect(parsed[0].role).toBe('owner');
  });

  it('rejects a short temporary password', () => {
    expect(() => parseSeedUsers(JSON.stringify([
      { email: 'a@b.test', name: 'A', password: 'short', orgSlug: 'internal', role: 'owner' },
    ]))).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/orchestrator test -- seed-users.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement parsing and import**

```ts
// apps/orchestrator/src/modules/identity/seed-users.ts
import { z } from 'zod';

export const seedUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  password: z.string().min(12),
  orgSlug: z.string().min(1),
  role: z.enum(['owner', 'admin', 'auditor']),
});

export function parseSeedUsers(json: string) {
  return z.array(seedUserSchema).parse(JSON.parse(json));
}
```

In `apps/orchestrator/src/commands/seed-users.ts`, read `process.env.SEED_USERS_JSON`, call `parseSeedUsers`, and for each entry `hashPassword`, upsert the user by email, set `passwordHash` and `mustChangePassword: true`, ensure the organisation exists, and call `IdentityService.addMember(orgId, userId, role)`. Exit non-zero on any failure so the Job retries.

- [ ] **Step 4: Define the Job manifest**

`infra/k8s/dpdpa/jobs/seed-users.yaml` must: run in namespace `dpdpa`; mount Secret `dpdpa-seed-users` as env `SEED_USERS_JSON`; use image `registry.dpdpa.svc.cluster.local:5000/dpdpa/orchestrator:1.0.0-pilot.1`; `restartPolicy: Never`; `backoffLimit: 0`. The deploy runbook documents deleting the Secret only after the Job succeeds.

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter @dpdpa/orchestrator test -- seed-users.test.ts
pnpm --filter @dpdpa/orchestrator typecheck
kubectl apply --dry-run=client -f infra/k8s/dpdpa/jobs/seed-users.yaml
```
Expected: PASS; manifest validates.

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/src/modules/identity/seed-users.ts apps/orchestrator/src/commands/seed-users.ts apps/orchestrator/test/seed-users.test.ts infra/k8s/dpdpa/jobs/seed-users.yaml
git commit -m "feat(identity): add seed-account import Job"
```

---

### Task 6: k3s node preparation, namespaces, CA and TLS

**Files:**
- Create: `infra/k8s/dpdpa/namespaces.yaml`
- Create: `infra/scripts/generate-ca.sh`
- Create: `infra/scripts/prepare-scanner-node.sh`
- Test: shell validation commands below.

**Interfaces:**
- Consumes: k3s cluster access via `kubectl`.
- Produces: namespaces `dpdpa`, `dpdpa-scanners`; `RuntimeClass gvisor`; node label `workload=scanner` and taint `workload=scanner:NoSchedule`; Secret `dpdpa-tls` of type `kubernetes.io/tls`; CA cert file for client distribution.

- [ ] **Step 1: Write the validation script**

```bash
# infra/scripts/validate-cluster-prep.sh
#!/usr/bin/env bash
set -euo pipefail
kubectl get ns dpdpa dpdpa-scanners >/dev/null
kubectl get runtimeclass gvisor >/dev/null
kubectl get nodes -l workload=scanner | grep -q .
kubectl -n dpdpa get secret dpdpa-tls -o jsonpath='{.type}' | grep -q 'kubernetes.io/tls'
echo 'cluster preparation verified'
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash infra/scripts/validate-cluster-prep.sh
```
Expected: FAIL because namespaces do not exist.

- [ ] **Step 3: Create namespaces and RuntimeClass**

`infra/k8s/dpdpa/namespaces.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: dpdpa
---
apiVersion: v1
kind: Namespace
metadata:
  name: dpdpa-scanners
---
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
```

```bash
kubectl apply -f infra/k8s/dpdpa/namespaces.yaml
```

- [ ] **Step 4: Prepare the node**

`infra/scripts/prepare-scanner-node.sh` installs `runsc` from the containerd `runsc` release matching the cluster runtime, registers it as a containerd runtime handler named `runsc`, restarts containerd, then runs:

```bash
kubectl label node imperator.pride.improwised.dev workload=scanner --overwrite
kubectl taint node imperator.pride.improwised.dev workload=scanner:NoSchedule --overwrite
```

- [ ] **Step 5: Generate the CA and TLS secret**

`infra/scripts/generate-ca.sh`: create `ca.key`/`ca.crt` (RSA 4096, 10 years, CN `DPDPA Internal Pilot CA`), issue `dpdpa.pride.improwised.dev` cert with SAN DNS `dpdpa.pride.improwised.dev`, then:

```bash
kubectl -n dpdpa create secret tls dpdpa-tls --cert=certs/dpdpa.crt --key=certs/dpdpa.key --dry-run=client -o yaml | kubectl apply -f -
```

Export `ca.crt` to internal clients and record its SHA-256 in the runbook. Never commit `ca.key` or `dpdpa.key`.

- [ ] **Step 6: Validate**

```bash
kubectl --dry-run=client apply -f infra/k8s/dpdpa/namespaces.yaml
bash infra/scripts/validate-cluster-prep.sh
```
Expected: prints `cluster preparation verified`.

- [ ] **Step 7: Commit**

```bash
git add infra/k8s/dpdpa/namespaces.yaml infra/scripts/generate-ca.sh infra/scripts/prepare-scanner-node.sh infra/scripts/validate-cluster-prep.sh
git commit -m "infra(k3s): prepare namespaces, gVisor runtime and private TLS"
```

---

### Task 7: Durable state workloads

**Files:**
- Create: `infra/k8s/dpdpa/state/postgres.yaml`
- Create: `infra/k8s/dpdpa/state/redis.yaml`
- Create: `infra/k8s/dpdpa/state/minio.yaml`
- Create: `infra/k8s/dpdpa/state/registry.yaml`
- Create: `infra/k8s/dpdpa/state/postgres-backup.yaml`
- Create: `infra/k8s/dpdpa/secrets-template.yaml`
- Test: `infra/scripts/validate-state.sh`

**Interfaces:**
- Consumes: namespace `dpdpa` (Task 6), node label `workload=scanner` (Task 6; use the same node name for all stateful pods).
- Produces: Services `postgres`, `redis`, `minio`, `registry`; PVCs `pg-data`, `pg-backups`, `redis-data`, `minio-data`, `registry-data`; Secret template with keys `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`.

- [ ] **Step 1: Write the validation script**

```bash
# infra/scripts/validate-state.sh
#!/usr/bin/env bash
set -euo pipefail
for pvc in pg-data pg-backups redis-data minio-data registry-data; do
  kubectl -n dpdpa get pvc "$pvc" >/dev/null
done
for deploy in postgres redis minio registry; do
  kubectl -n dpdpa get deployment "$deploy" >/dev/null
done
echo 'state workloads verified'
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash infra/scripts/validate-state.sh
```
Expected: FAIL because PVCs do not exist.

- [ ] **Step 3: Write the manifests**

Each manifest sets `spec.template.spec.nodeSelector.workload: scanner`. Exact values:

- `postgres.yaml`: Deployment `postgres`, image `postgres:16-alpine`, env `POSTGRES_DB=dpdpa_auditor`, `POSTGRES_USER=dpdpa`, `POSTGRES_PASSWORD` from Secret, PVC `pg-data` 20Gi mounted at `/var/lib/postgresql/data`, Service `postgres` port 5432, readiness probe `pg_isready -U dpdpa -d dpdpa_auditor`.
- `redis.yaml`: Deployment `redis`, image `redis:7-alpine`, command `redis-server --appendonly yes --requirepass $(REDIS_PASSWORD)`, PVC `redis-data` 5Gi at `/data`, Service `redis` port 6379.
- `minio.yaml`: Deployment `minio`, image `minio/minio:latest`, command `server /data --console-address :9001`, PVC `minio-data` 50Gi, Service `minio` ports 9000/9001; an init Container or Job creates bucket `dpdpa-reports` with object-lock disabled and no anonymous access.
- `registry.yaml`: Deployment `registry`, image `registry:2`, PVC `registry-data` 20Gi at `/var/lib/registry`, Service `registry` port 5000.
- `postgres-backup.yaml`: CronJob `pg-backup`, schedule `0 2 * * *`, image `postgres:16-alpine`, runs `pg_dump -h postgres -U dpdpa dpdpa_auditor | gzip > /backups/dpdpa-$(date +%F).sql.gz`, mounts PVC `pg-backups` 20Gi, keeps last 30 files via `find ... -mtime +30 -delete`.
- `secrets-template.yaml`: Secret `dpdpa-secrets` with `stringData` keys `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` whose values are the literal token `REPLACE_AT_DEPLOY` — filled by the deploy script, never committed with real values.

```bash
kubectl apply -f infra/k8s/dpdpa/state/
```

- [ ] **Step 4: Validate**

```bash
bash infra/scripts/validate-state.sh
kubectl -n dpdpa rollout status deployment/postgres --timeout=180s
kubectl -n dpdpa rollout status deployment/redis --timeout=180s
kubectl -n dpdpa rollout status deployment/minio --timeout=180s
kubectl -n dpdpa rollout status deployment/registry --timeout=180s
```
Expected: all `verified` and rollouts succeeded.

- [ ] **Step 5: Commit**

```bash
git add infra/k8s/dpdpa/state infra/scripts/validate-state.sh
git commit -m "infra(k3s): add PVC-backed Postgres, Redis, MinIO and registry"
```

---

### Task 8: Application workloads, ingress and NetworkPolicies

**Files:**
- Create: `infra/k8s/dpdpa/apps/web.yaml`
- Create: `infra/k8s/dpdpa/apps/orchestrator.yaml`
- Create: `infra/k8s/dpdpa/apps/renderer.yaml`
- Create: `infra/k8s/dpdpa/apps/ingress.yaml`
- Create: `infra/k8s/dpdpa/apps/network-policies.yaml`
- Create: `infra/k8s/dpdpa/apps/config.yaml`
- Test: `infra/scripts/validate-apps.sh`

**Interfaces:**
- Consumes: services from Task 7, TLS Secret `dpdpa-tls` (Task 6), image tag `1.0.0-pilot.1`, digest-pinned runner image from Task 9.
- Produces: Services `web`, `orchestrator`, `renderer`; Ingress `dpdpa-ingress`; default-deny plus allow-list NetworkPolicies in `dpdpa` and `dpdpa-scanners`.

- [ ] **Step 1: Write the validation script**

```bash
# infra/scripts/validate-apps.sh
#!/usr/bin/env bash
set -euo pipefail
for deploy in web orchestrator renderer; do
  kubectl -n dpdpa get deployment "$deploy" >/dev/null
done
kubectl -n dpdpa get ingress dpdpa-ingress -o jsonpath='{.spec.tls[0].secretName}' | grep -q dpdpa-tls
kubectl -n dpdpa get networkpolicy default-deny >/dev/null
kubectl -n dpdpa-scanners get networkpolicy default-deny >/dev/null
echo 'application workloads verified'
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash infra/scripts/validate-apps.sh
```
Expected: FAIL because Deployments do not exist.

- [ ] **Step 3: Write the Deployment manifests**

All three Deployments: `replicas: 1`, `nodeSelector.workload: scanner`, image `registry.dpdpa.svc.cluster.local:5000/dpdpa/<name>:1.0.0-pilot.1`, readiness/liveness probes on their HTTP ports, resource requests `cpu: 250m, memory: 512Mi` and limits `cpu: '1', memory: 1Gi`.

- `web.yaml`: Service `web` port 3000; env `ORCHESTRATOR_URL=http://orchestrator:3001`, `ORCHESTRATOR_HMAC_KEY` and `ORCHESTRATOR_INTERNAL_KEY` from Secret, `REDIS_URL=redis://:$(REDIS_PASSWORD)@redis:6379`, `NUXT_PUBLIC_APP_URL=https://dpdpa.pride.improwised.dev`, `NUXT_PUBLIC_PASSWORD_LOGIN_ENABLED=true`, `NUXT_APP_SECRET` from Secret.
- `orchestrator.yaml`: Service `orchestrator` port 3001; env `DATABASE_URL=postgresql://dpdpa:$(POSTGRES_PASSWORD)@postgres:5432/dpdpa_auditor`, `REDIS_URL`, `RUNNER_DRIVER=kubernetes`, `SCANNERS_NAMESPACE=dpdpa-scanners`, `RUNNER_IMAGE` set by Task 9, `ORCHESTRATOR_CALLBACK_URL=https://dpdpa.pride.improwised.dev`, `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=dpdpa-reports`, S3 credentials from Secret. ServiceAccount `orchestrator-runner` with Role/RoleBinding in `dpdpa-scanners` limited to `jobs` and `secrets` verbs `create,get,list,delete`.
- `renderer.yaml`: a dedicated headless Chromium pod exposing a WebSocket endpoint on port 3000, with a readiness probe and a ClusterIP Service `renderer`. There is no `apps/renderer` source tree — the render worker is `apps/orchestrator/src/modules/reports/report-render.worker.ts`, which connects to a browser over `REPORTS_BROWSER_WS_ENDPOINT`. Set `REPORTS_BROWSER_WS_ENDPOINT=ws://renderer:3000` on the orchestrator. This isolates the memory-hungry Chromium process per ADR-008 without inventing a non-existent application service. If the endpoint is unset the worker falls back to in-process PDFKit rendering, which is not the desired production path.

- [ ] **Step 4: Write the Ingress and NetworkPolicies**

`ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dpdpa-ingress
  namespace: dpdpa
spec:
  ingressClassName: nginx
  tls:
    - hosts: [dpdpa.pride.improwised.dev]
      secretName: dpdpa-tls
  rules:
    - host: dpdpa.pride.improwised.dev
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 3000
```

`network-policies.yaml`: in both namespaces a `default-deny` policy selecting all pods with no `policyTypes` allow entries; then allow rules for ingress-controller→web:3000, web→orchestrator:3001, orchestrator→renderer:3000, orchestrator→postgres:5432, orchestrator→redis:6379, orchestrator→minio:9000, orchestrator→registry:5000, scanner Jobs→orchestrator:3001, and scanner Jobs egress to `github.com` via the existing runner allowlist. Use namespace/pod selectors matching the labels in the manifests above.

```bash
kubectl apply -f infra/k8s/dpdpa/apps/
```

- [ ] **Step 5: Validate**

```bash
bash infra/scripts/validate-apps.sh
kubectl -n dpdpa rollout status deployment/web --timeout=180s
kubectl -n dpdpa rollout status deployment/orchestrator --timeout=180s
kubectl -n dpdpa rollout status deployment/renderer --timeout=180s
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/k8s/dpdpa/apps infra/scripts/validate-apps.sh
git commit -m "infra(k3s): deploy web, orchestrator, renderer and private ingress"
```

---

### Task 9: Immutable image build and digest pinning

**Files:**
- Create: `infra/scripts/build-and-push.sh`
- Create: `infra/scripts/resolve-digest.sh`
- Test: `infra/scripts/validate-images.sh`

**Interfaces:**
- Consumes: Dockerfiles `docker/web.Dockerfile`, `docker/orchestrator.Dockerfile`, `docker/scan-runner.Dockerfile`, plus a pinned third-party headless Chromium image for the renderer pod (no `apps/renderer` source tree exists; the render worker runs in the orchestrator).
- Produces: four images at tag `1.0.0-pilot.1` (`web`, `orchestrator`, `scan-runner`, `chromium`); `RUNNER_IMAGE` digest reference printed for insertion into `orchestrator.yaml` and browser digest pinned into `renderer.yaml`; `/dpdpa.yaml` SHA-256 matching `packages/rule-packs/manifest.yaml`.

- [ ] **Step 1: Write the validation script**

```bash
# infra/scripts/validate-images.sh
#!/usr/bin/env bash
set -euo pipefail
for name in web orchestrator chromium scan-runner; do
  digest=$(skopeo inspect "docker://registry.dpdpa.svc.cluster.local:5000/dpdpa/$name:1.0.0-pilot.1" --tls-verify=false | jq -r .Digest)
  [[ "$digest" == sha256:* ]] || { echo "$name digest is not sha256"; exit 1; }
  echo "$name $digest"
done
grep -q 'chromium@sha256:' infra/k8s/dpdpa/apps/renderer.yaml
expected=$(grep -A1 'semgrep/dpdpa.yaml' packages/rule-packs/manifest.yaml | awk '/sha256/{print $2}')
actual=$(docker run --rm "registry.dpdpa.svc.cluster.local:5000/dpdpa/scan-runner:1.0.0-pilot.1" sha256sum /dpdpa.yaml | awk '{print $1}')
test "$expected" = "$actual" || { echo 'rule pack hash mismatch'; exit 1; }
echo 'images verified'
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash infra/scripts/validate-images.sh
```
Expected: FAIL because images are not pushed.

- [ ] **Step 3: Build and push**

`infra/scripts/build-and-push.sh` builds `web`, `orchestrator`, and `scan-runner` with `docker build -f docker/$name.Dockerfile -t registry.dpdpa.svc.cluster.local:5000/dpdpa/$name:1.0.0-pilot.1 .`, pulls the headless Chromium image pinned by upstream digest, retags it as `dpdpa/chromium:1.0.0-pilot.1`, pushes all four, then calls `resolve-digest.sh`. `resolve-digest.sh` writes `registry.dpdpa.svc.cluster.local:5000/dpdpa/scan-runner@sha256:<digest>` into `infra/k8s/dpdpa/apps/orchestrator.yaml` as `RUNNER_IMAGE`, and the chromium digest into `renderer.yaml`. The upstream browser image and its digest are recorded in the runbook so the base can be audited and re-pinned deliberately.

```bash
bash infra/scripts/build-and-push.sh
kubectl apply -f infra/k8s/dpdpa/apps/orchestrator.yaml
```

- [ ] **Step 4: Validate**

```bash
bash infra/scripts/validate-images.sh
```
Expected: all four digests printed and `images verified`.

- [ ] **Step 5: Commit**

```bash
git add infra/scripts/build-and-push.sh infra/scripts/resolve-digest.sh infra/scripts/validate-images.sh infra/k8s/dpdpa/apps/orchestrator.yaml
git commit -m "infra(k3s): pin immutable image digests for the pilot"
```

---

### Task 10: Observability, runbook and pentest attestation correction

**Files:**
- Create: `infra/k8s/dpdpa/observability/prometheus.yaml`
- Create: `infra/k8s/dpdpa/observability/alertmanager.yaml`
- Create: `docs/runbooks/k3s-pilot-deployment.md`
- Modify: `docs/launch-readiness.md:40`
- Modify: `docs/security/external-penetration-test-report.md`
- Test: documentation and manifest checks below.

**Interfaces:**
- Consumes: existing `monitoring/prometheus/rules.yml` and alert catalog from `docs/observability-alert-coverage.md`.
- Produces: Prometheus and Alertmanager Deployments in `dpdpa`; corrected launch-readiness line.

- [ ] **Step 1: Write the validation script**

```bash
#!/usr/bin/env bash
set -euo pipefail
kubectl -n dpdpa get deployment prometheus >/dev/null
kubectl -n dpdpa get deployment alertmanager >/dev/null
grep -q 'Pending — deferred for internal pilot' docs/launch-readiness.md
grep -q 'internal pilot' docs/security/external-penetration-test-report.md
echo 'operations docs verified'
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash infra/scripts/validate-operations.sh
```
Expected: FAIL.

- [ ] **Step 3: Deploy observability**

`prometheus.yaml`: Deployment `prometheus` with image `prom/prometheus:v3.6.0`, ConfigMap from `monitoring/prometheus/rules.yml` plus scrape configs for `web:3000/metrics`, `orchestrator:3001/metrics`, and node metrics; PVC `prometheus-data` 20Gi; Service `prometheus` port 9090. The Chromium renderer pod exposes no application metrics and is not scraped.

`alertmanager.yaml`: Deployment `alertmanager` with image `prom/alertmanager:v0.28.1`, ConfigMap with one internal receiver (email or webhook chosen at deploy time) and the existing runbook annotations, Service `alertmanager` port 9093.

- [ ] **Step 4: Correct the documentation**

In `docs/launch-readiness.md`, replace line 40 with:

```markdown
- [ ] External penetration test completed — Pending, deferred for the internal pilot (`docs/security/external-penetration-test-report.md`); repository owner `darshan192004` accountable, due before any non-internal exposure.
```

In `docs/security/external-penetration-test-report.md`, add after line 3:

```markdown
**Deferral:** Deferred for the internal-only pilot per `docs/superpowers/specs/2026-11-26-local-k3s-production-pilot-design.md`. Not a substitute for an independent test before public exposure.
```

Write `docs/runbooks/k3s-pilot-deployment.md` covering image promotion by digest, CA/cert renewal, Postgres restore from the `pg-backups` PVC, stuck Job/Secret cleanup, seed-Secret rotation, and rollback by redeploying the prior manifest and image. State explicitly that Prisma migrations are forward-only.

- [ ] **Step 5: Validate and commit**

```bash
bash infra/scripts/validate-operations.sh
node apps/web/scripts/lint-tokens.mjs
git add infra/k8s/dpdpa/observability infra/scripts/validate-operations.sh docs/runbooks/k3s-pilot-deployment.md docs/launch-readiness.md docs/security/external-penetration-test-report.md
git commit -m "docs(k3s): add pilot runbook and correct pentest attestation"
```
Expected: `operations docs verified`.

---

### Task 11: Launch verification and sign-off

**Files:**
- Create: `infra/scripts/signoff-check.sh`
- Test: the script itself plus real data.

**Interfaces:**
- Consumes: deployed pilot, the real jovVix repository, report ID from the pilot instance.
- Produces: a recorded sign-off result with scan ID, report ID, PDF SHA-256, and checked gates.

- [ ] **Step 1: Write the sign-off script**

`infra/scripts/signoff-check.sh` must check, using `kubectl` and `curl` against the deployed instance:

1. `kubectl -n dpdpa-scanners get jobs` shows a completed scan Job whose pod used RuntimeClass `gvisor`.
2. A fresh scan of `https://github.com/Improwised/jovVix.git` with Standard profile and blank ref reaches `completed` with `rulePackVersion=dpdpa-2026.10.6`, 0 unmapped findings, 0 `mapping_miss` events, and all three scanners `completed`.
3. The report view contains the heading `improwised/jovVix — DPDPA Audit Report`, an `Export PDF` control, `by DPDPA Auditor.`, and `Not assessed`.
4. The downloaded PDF is A4, has no blank pages, contains explicit DPDPA control codes and the rule-pack version, and its SHA-256 matches the report API.
5. Password login succeeds for a seeded account, `mustChangePassword` forces rotation, and the audit log shows `auth.login` with `method: password` for that user.
6. A Postgres restore drill from `pg-backups` into a scratch database passes `SELECT 1` on restored tables.

- [ ] **Step 2: Run it to verify it fails before deployment**

```bash
bash infra/scripts/signoff-check.sh
```
Expected: FAIL because the deployment is not live.

- [ ] **Step 3: Execute the deployment and verification**

Follow `docs/runbooks/k3s-pilot-deployment.md` in order, then run the sign-off script. Record the scan ID, report ID, and PDF SHA-256 in the runbook's sign-off section. Use real repository data only; fixture repositories are not acceptable evidence.

- [ ] **Step 4: Final checks**

```bash
pnpm test
pnpm typecheck
pnpm lint
bash infra/scripts/signoff-check.sh
```
Expected: all PASS; all six sign-off gates recorded.

- [ ] **Step 5: Commit the sign-off record**

```bash
git add docs/runbooks/k3s-pilot-deployment.md infra/scripts/signoff-check.sh
git commit -m "docs(k3s): record internal pilot launch sign-off"
```

---

## Self-Review Notes

- Spec coverage: §1 goal in Task 11; §2 decisions in Tasks 1–9; §3 topology/TLS in Tasks 6 and 8; §4 storage in Task 7; §5 runner/images in Tasks 6 and 9; §6 auth in Tasks 1–5; §7 observability in Task 10; §8 verification in Task 11; §9 testing in every task; §10 risks in Tasks 6, 7, and 10.
- Placeholder scan: no code placeholders. `REPLACE_AT_DEPLOY` in `secrets-template.yaml` is an intentional deploy-time token documented in the runbook; the dummy verification hash is generated at module load via `hashPassword`, not hardcoded.
- Type consistency: `hashPassword`/`verifyPassword`, `PasswordLoginService.login`, `parseSeedUsers`, and `RUNNER_IMAGE` use the same names and shapes in every task that references them.
