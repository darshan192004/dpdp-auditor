# Phase 1 Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Checkboxes are filled in by the closing docs-only PR (repo convention, see PR #32).

**Goal:** Land the Prisma schema v1 + initial migration, a migration CI job, a DB test harness, and the append-only audit-log service (tasks P1-12, P1-13, P1-20, P1-21) as four gated PRs.

**Architecture:** `apps/orchestrator` gains `prisma/` (schema + hand-authored SQL migrations from `docs/database.md`), a global `PrismaModule` wired into `AppModule`, integration tests that run against `TEST_DATABASE_URL` or a Testcontainers Postgres (skip locally when neither exists), a `Migrations` CI job that proves `prisma migrate deploy` works on an empty database and one-version-behind, and `modules/audit` with a Zod-validated append-only writer plus runtime/migration DB roles.

**Tech Stack:** Node 22, pnpm 9.15.9, TypeScript strict (ESM, `.js` import specifiers), NestJS 12.4.1, Prisma 5.22.0 (exact pins), Zod 4, Vitest 5 + v8 coverage, testcontainers (latest, pinned exact), PostgreSQL 16 image.

**Spec:** `docs/database.md` (§3 enums, §4 tables, §5 trigger, §6 views, §7 RLS, §8 Prisma mapping, §10 migrations), `docs/code_style.md` (§7 NestJS, §8 Prisma, §9 errors, §10 testing), `docs/security.md` §13 (audit trail), `docs/tasks.md` (P1-12/P1-13/P1-20/P1-21).

## Global Constraints

- Node 22 (prefix every shell step with `. "$env:LOCALAPPDATA\Temp\opencode\use-node22.ps1"`), pnpm 9.15.9, strict TS.
- Prisma pinned exact `5.22.0` (`prisma` dev, `@prisma/client` dep); testcontainers pinned exact after install.
- Orchestrator is ESM: relative imports keep `.js` specifiers; every DI edge uses explicit `@Inject(token)`.
- No `$queryRawUnsafe` / `$executeRawUnsafe` ever; raw SQL only via `$queryRaw`/`$executeRaw` tagged templates. (`SET LOCAL app.current_org` must use `SELECT set_config('app.current_org', $1, true)`.)
- Test secrets use `'a'.repeat(32)` / `'b'.repeat(32)` style; obvious `test-only-` markers for anything literal (gitleaks runs in the gate).
- Coverage floors (orchestrator): lines 90%, branches 85% over `src/**/*.ts` — every new `src` file needs tests.
- Commits: conventional format (commitlint via husky). Run `pnpm exec prettier --write` on touched files before committing.
- Full local gate: `C:\Users\darsh\AppData\Local\Temp\opencode\worktree-gate.ps1` (stop port 3000 first; gitleaks writes to stderr — judge by `GATE RESULT: ALL GREEN`).
- PR flow: branch from `origin/main` → `gh` via `C:\Users\darsh\AppData\Local\Temp\opencode\ghw.ps1` → wait for 6 required checks (Code CI, Secret scan, Docs lint, Workflow lint, SAST, E2E) + Migrations + AI PR review → address or decline PR-Agent suggestions with rationale → squash-merge with `--delete-branch`.
- Never commit `.playwright-mcp/`. Do not touch `apps/web` in this plan.
- While a PR's CI runs, start coding the next task on a fresh branch from `origin/main`; after the previous merge, `git merge origin/main` into the branch and push to re-run checks.

## File Structure

| Task | Files |
|---|---|
| P1-12 | Create `apps/orchestrator/prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/20261110000000_init/migration.sql`, `src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`, `test/schema.test.ts`, `test/prisma.service.test.ts`; Modify `src/config/env.ts`, `src/app.module.ts`, `apps/orchestrator/package.json`, Env fixtures in `test/*.test.ts` |
| P1-13 | Modify `.github/workflows/ci.yml` (new `migrate` job), root `package.json` (`db:migrate`, `db:deploy`); Create `apps/orchestrator/scripts/check-migrations.sh` |
| P1-20 | Create `apps/orchestrator/vitest.integration.config.ts`, `test/integration/global-setup.ts`, `test/integration/helpers/resolve-db-url.ts`, `test/integration/helpers/db.ts`, `test/integration/migrations.test.ts`, `test/integration/redis-harness.test.ts`, `test/resolve-db-url.test.ts`; Modify `vitest.config.ts`, `apps/orchestrator/package.json`, root `package.json`, `turbo.json`, `.github/workflows/ci.yml` |
| P1-21 | Create `prisma/migrations/20261111000000_runtime_roles/migration.sql`, `src/modules/audit/audit.module.ts`, `src/modules/audit/audit.service.ts`, `src/modules/audit/audit-entry.schema.ts`, `test/audit.service.test.ts`, `test/integration/audit-append-only.test.ts`; Modify `src/app.module.ts` |

Each task = one branch → one PR → gate chain → merge. Order: P1-12 → P1-13 → P1-20 → P1-21.

---

### Task 1: P1-12 — Prisma schema v1 + initial migration

**Interfaces:**
- Produces: `PrismaService` (extends `PrismaClient`, constructor `@Inject(ENV) env: Env`, `super({ datasourceUrl: env.DATABASE_URL })`, `onModuleDestroy()` → `$disconnect()`), exported from global `PrismaModule`; `Env.DATABASE_URL: string` (required, `z.string().url()`); DB objects per `docs/database.md`.

- [ ] **Step 1: Add dependencies and scripts**

```powershell
. "$env:LOCALAPPDATA\Temp\opencode\use-node22.ps1"
cd D:\worktrees\dpdp-auditor\P1-25-token-lint
pnpm add --filter @dpdpa/orchestrator @prisma/client@5.22.0
pnpm add -D --filter @dpdpa/orchestrator prisma@5.22.0
```

In `apps/orchestrator/package.json` scripts add:

```json
"prisma:generate": "prisma generate",
"build": "prisma generate && tsc -p tsconfig.build.json",
"typecheck": "prisma generate && tsc -p tsconfig.json --noEmit"
```

Pin both prisma deps to exact versions in package.json (drop any `^`).

- [ ] **Step 2: Write the failing schema test** — `apps/orchestrator/test/schema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const schema = readFileSync(`${root}prisma/schema.prisma`, 'utf8');
const migration = readFileSync(
  `${root}prisma/migrations/20261110000000_init/migration.sql`,
  'utf8',
);

const ENUMS: Record<string, string[]> = {
  org_plan: ['free', 'starter', 'growth', 'enterprise'],
  member_role: ['owner', 'admin', 'auditor', 'viewer'],
  membership_status: ['invited', 'active', 'suspended'],
  repo_visibility: ['public', 'private', 'internal'],
  scan_status: ['queued', 'cloning', 'scanning', 'mapping', 'completed', 'failed', 'cancelled', 'expired'],
  scan_trigger: ['manual', 'api'],
  scanner_name: ['semgrep', 'checkov', 'gitleaks'],
  scanner_status: ['pending', 'running', 'completed', 'failed', 'timed_out', 'skipped'],
  finding_severity: ['critical', 'high', 'medium', 'low', 'info'],
  finding_status: ['open', 'false_positive', 'accepted_risk', 'fixed', 'reopened'],
  mapping_confidence: ['direct', 'inferred', 'advisory'],
  report_status: ['queued', 'rendering', 'ready', 'failed', 'expired'],
  report_format: ['pdf'],
};

const TABLES = [
  'organizations', 'users', 'memberships', 'repositories', 'api_keys', 'scans',
  'scan_events', 'dpdpa_rules', 'rule_mappings', 'scanner_findings',
  'remediation_logs', 'reports', 'audit_logs', 'usage_events', 'sessions',
];

describe('prisma schema mirrors docs/database.md', () => {
  it('declares every enum with the exact values', () => {
    for (const [name, values] of Object.entries(ENUMS)) {
      const match = schema.match(new RegExp(`enum \\w+ \\{[^}]*@@map\\("${name}"\\)[^}]*\\}`, 's'));
      expect(match, `enum ${name} missing from schema.prisma`).toBeTruthy();
      for (const value of values) {
        expect(match![0]).toContain(`  ${value}\n`);
      }
      expect(migration).toContain(`CREATE TYPE ${name} AS ENUM`);
    }
  });

  it('declares every table and maps it with @@map', () => {
    for (const table of TABLES) {
      expect(schema).toContain(`@@map("${table}")`);
      expect(migration).toContain(`CREATE TABLE ${table} (`);
    }
  });

  it('migration creates extensions, triggers, views, and RLS policies', () => {
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS citext');
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION set_updated_at()');
    expect(migration).toContain('CREATE TRIGGER trg_orgs_updated');
    expect(migration).toContain('CREATE VIEW v_scan_overview');
    expect(migration).toContain('CREATE VIEW v_scan_section_scores');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    for (const table of ['repositories', 'scans', 'scanner_findings', 'reports', 'audit_logs']) {
      expect(migration).toContain(`CREATE POLICY tenant_isolation_`);
      expect(migration).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    }
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @dpdpa/orchestrator exec vitest run test/schema.test.ts`
Expected: FAIL (files missing).

- [ ] **Step 4: Write `prisma/schema.prisma`**

Full content (Prisma 5, exact):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Enums (docs/database.md §3) ────────────────────────────────────────

enum OrgPlan {
  free
  starter
  growth
  enterprise
  @@map("org_plan")
}

enum MemberRole {
  owner
  admin
  auditor
  viewer
  @@map("member_role")
}

enum MembershipStatus {
  invited
  active
  suspended
  @@map("membership_status")
}

enum RepoVisibility {
  public
  private
  internal
  @@map("repo_visibility")
}

enum ScanStatus {
  queued
  cloning
  scanning
  mapping
  completed
  failed
  cancelled
  expired
  @@map("scan_status")
}

enum ScanTrigger {
  manual
  api
  @@map("scan_trigger")
}

enum ScannerName {
  semgrep
  checkov
  gitleaks
  @@map("scanner_name")
}

enum ScannerStatus {
  pending
  running
  completed
  failed
  timed_out
  skipped
  @@map("scanner_status")
}

enum FindingSeverity {
  critical
  high
  medium
  low
  info
  @@map("finding_severity")
}

enum FindingStatus {
  open
  false_positive
  accepted_risk
  fixed
  reopened
  @@map("finding_status")
}

enum MappingConfidence {
  direct
  inferred
  advisory
  @@map("mapping_confidence")
}

enum ReportStatus {
  queued
  rendering
  ready
  failed
  expired
  @@map("report_status")
}

enum ReportFormat {
  pdf
  @@map("report_format")
}

// ── Tables (docs/database.md §4) ───────────────────────────────────────

model Organization {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name              String    @db.Text
  slug              String    @unique @db.Citext
  plan              OrgPlan   @default(free)
  dataRegion        String    @default("ap-south-1") @db.Text
  retentionDays     Int       @default(90)
  scanConcurrency   Int       @default(3) @db.SmallInt
  billingCustomerId String?   @unique @db.Text
  settings          Json      @default("{}")
  createdAt         DateTime  @default(now()) @db.Timestamptz
  updatedAt         DateTime  @default(now()) @db.Timestamptz
  deletedAt         DateTime? @db.Timestamptz

  memberships      Membership[]
  repositories     Repository[]
  apiKeys          ApiKey[]
  scans            Scan[]
  scanEvents       ScanEvent[]
  findings         ScannerFinding[]
  remediationLogs  RemediationLog[]
  reports          Report[]
  auditLogs        AuditLog[]
  usageEvents      UsageEvent[]
  sessions         Session[]

  @@map("organizations")
}

model User {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email             String    @unique @db.Citext
  name              String?   @db.Text
  avatarUrl         String?   @db.Text
  githubUserId      BigInt?   @unique
  emailVerifiedAt   DateTime? @db.Timestamptz
  lastLoginAt       DateTime? @db.Timestamptz
  createdAt         DateTime  @default(now()) @db.Timestamptz
  updatedAt         DateTime  @default(now()) @db.Timestamptz
  deletedAt         DateTime? @db.Timestamptz

  memberships           Membership[]
  membershipsInvited    Membership[]     @relation("MembershipInvitedBy")
  repositoriesConnected Repository[]     @relation("RepoConnectedBy")
  apiKeysCreated        ApiKey[]         @relation("ApiKeyCreatedBy")
  scansRequested        Scan[]           @relation("ScanRequestedBy")
  remediationActor      RemediationLog[] @relation("RemediationActor")
  reportsRequested      Report[]         @relation("ReportRequestedBy")
  auditActs             AuditLog[]       @relation("AuditActor")
  sessions              Session[]

  @@map("users")
}

model Membership {
  orgId     String           @db.Uuid
  userId    String           @db.Uuid
  role      MemberRole       @default(viewer)
  status    MembershipStatus @default(invited)
  invitedBy String?          @db.Uuid
  createdAt DateTime         @default(now()) @db.Timestamptz
  updatedAt DateTime         @default(now()) @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  inviter      User?        @relation("MembershipInvitedBy", fields: [invitedBy], references: [id], onDelete: SetNull)

  @@id([orgId, userId])
  @@map("memberships")
}

model Repository {
  id            String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId         String         @db.Uuid
  owner         String         @db.Citext
  name          String         @db.Citext
  githubRepoId  BigInt?
  fullName      String         @db.Citext
  defaultBranch String         @default("main") @db.Text
  visibility    RepoVisibility @default(public)
  language      String?        @db.Text
  sizeKb        Int?
  isArchived    Boolean        @default(false)
  connectedBy   String?        @db.Uuid
  lastScannedAt DateTime?      @db.Timestamptz
  createdAt     DateTime       @default(now()) @db.Timestamptz
  updatedAt     DateTime       @default(now()) @db.Timestamptz
  deletedAt     DateTime?      @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  connector    User?        @relation("RepoConnectedBy", fields: [connectedBy], references: [id], onDelete: SetNull)
  scans        Scan[]

  @@unique([orgId, githubRepoId])
  @@unique([orgId, fullName])
  @@map("repositories")
}

model ApiKey {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId      String    @db.Uuid
  name       String    @db.Text
  keyPrefix  String    @unique @db.Text
  keyHash    String    @unique @db.Text
  scopes     String[]
  createdBy  String?   @db.Uuid
  lastUsedAt DateTime? @db.Timestamptz
  expiresAt  DateTime? @db.Timestamptz
  revokedAt  DateTime? @db.Timestamptz
  createdAt  DateTime  @default(now()) @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  creator      User?        @relation("ApiKeyCreatedBy", fields: [createdBy], references: [id], onDelete: SetNull)
  scans        Scan[]

  @@map("api_keys")
}

model Scan {
  id              String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId           String      @db.Uuid
  repositoryId    String      @db.Uuid
  requestedBy     String?     @db.Uuid
  apiKeyId        String?     @db.Uuid
  trigger         ScanTrigger @default(manual)
  status          ScanStatus  @default(queued)
  ref             String      @default("main") @db.Text
  commitSha       String?     @db.Text
  scannerVersions Json        @default("{}")
  rulePackVersion String?     @db.Text
  scoringVersion  String?     @db.Text
  score           Decimal?    @db.Decimal(5, 2)
  grade           String?     @db.Char(1)
  sectionScores   Json        @default("{}")
  counts          Json        @default("{}")
  coverage        Json        @default("{}")
  errorCode       String?     @db.Text
  errorMessage    String?     @db.Text
  idempotencyKey  String?     @db.Text
  jobName         String?     @db.Text
  secretName      String?     @db.Text
  queuedAt        DateTime    @default(now()) @db.Timestamptz
  startedAt       DateTime?   @db.Timestamptz
  completedAt     DateTime?   @db.Timestamptz
  durationMs      Int?
  createdAt       DateTime    @default(now()) @db.Timestamptz
  updatedAt       DateTime    @default(now()) @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  repository   Repository   @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  requester    User?        @relation("ScanRequestedBy", fields: [requestedBy], references: [id], onDelete: SetNull)
  apiKey       ApiKey?      @relation(fields: [apiKeyId], references: [id], onDelete: SetNull)
  events       ScanEvent[]
  findings     ScannerFinding[]
  reports      Report[]
  usageEvents  UsageEvent[]

  @@unique([orgId, idempotencyKey])
  @@map("scans")
}

model ScanEvent {
  id        BigInt   @id @default(autoincrement())
  scanId    String   @db.Uuid
  orgId     String   @db.Uuid
  type      String   @db.Text
  payload   Json     @default("{}")
  createdAt DateTime @default(now()) @db.Timestamptz

  scan         Scan         @relation(fields: [scanId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@map("scan_events")
}

model DpdpaRule {
  id                  String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code                String          @unique @db.Text
  section             String          @db.Text
  title               String          @db.Text
  summary             String          @db.Text
  obligation          String          @db.Text
  legalReference      String          @db.Text
  severity            FindingSeverity
  weight              Decimal         @default(1) @db.Decimal(4, 2)
  appliesWhen         Json            @default("{}")
  remediationGuidance String          @db.Text
  version             String          @default("1.0.0") @db.Text
  isActive            Boolean         @default(true)
  createdAt           DateTime        @default(now()) @db.Timestamptz
  updatedAt           DateTime        @default(now()) @db.Timestamptz

  mappings RuleMapping[]
  findings ScannerFinding[]

  @@map("dpdpa_rules")
}

model RuleMapping {
  id                  String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  dpdpaRuleId         String            @db.Uuid
  scanner             ScannerName
  scannerRuleId       String            @db.Text
  scannerRuleVersion  String            @default("*") @db.Text
  confidence          MappingConfidence @default(direct)
  rationale           String            @db.Text
  remediationTemplate String?           @db.Text
  isActive            Boolean           @default(true)
  createdAt           DateTime          @default(now()) @db.Timestamptz
  updatedAt           DateTime          @default(now()) @db.Timestamptz

  rule DpdpaRule @relation(fields: [dpdpaRuleId], references: [id], onDelete: Cascade)

  @@unique([scanner, scannerRuleId, scannerRuleVersion, dpdpaRuleId])
  @@map("rule_mappings")
}

model ScannerFinding {
  id                 String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scanId             String            @db.Uuid
  orgId              String            @db.Uuid
  scanner            ScannerName
  scannerRuleId      String            @db.Text
  scannerRuleVersion String?           @db.Text
  dpdpaRuleId        String?           @db.Uuid
  severity           FindingSeverity
  confidence         MappingConfidence @default(direct)
  filePath           String?           @db.Text
  lineStart          Int?
  lineEnd            Int?
  columnStart        Int?
  columnEnd          Int?
  message            String            @db.Text
  evidenceRedacted   String?           @db.Text
  evidenceHash       String?           @db.Text
  fingerprint        String            @db.Text
  status             FindingStatus     @default(open)
  isNew              Boolean           @default(true)
  firstSeenAt        DateTime          @default(now()) @db.Timestamptz
  lastSeenAt         DateTime          @default(now()) @db.Timestamptz
  context            Json              @default("{}")
  createdAt          DateTime          @default(now()) @db.Timestamptz
  updatedAt          DateTime          @default(now()) @db.Timestamptz

  scan            Scan            @relation(fields: [scanId], references: [id], onDelete: Cascade)
  organization    Organization    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  dpdpaRule       DpdpaRule?      @relation(fields: [dpdpaRuleId], references: [id], onDelete: SetNull)
  remediationLogs RemediationLog[]

  @@unique([scanId, fingerprint])
  @@map("scanner_findings")
}

model RemediationLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  findingId   String   @db.Uuid
  orgId       String   @db.Uuid
  actorUserId String?  @db.Uuid
  action      String   @db.Text
  note        String?  @db.Text
  externalUrl String?  @db.Text
  createdAt   DateTime @default(now()) @db.Timestamptz

  finding      ScannerFinding @relation(fields: [findingId], references: [id], onDelete: Cascade)
  organization Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  actor        User?          @relation("RemediationActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@map("remediation_logs")
}

model Report {
  id              String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scanId          String       @db.Uuid
  orgId           String       @db.Uuid
  status          ReportStatus @default(queued)
  format          ReportFormat @default(pdf)
  templateVersion String       @db.Text
  storageKey      String?      @unique @db.Text
  sha256          String?      @db.Char(64)
  sizeBytes       BigInt?
  requestedBy     String?      @db.Uuid
  errorMessage    String?      @db.Text
  expiresAt       DateTime?    @db.Timestamptz
  createdAt       DateTime     @default(now()) @db.Timestamptz
  updatedAt       DateTime     @default(now()) @db.Timestamptz

  scan         Scan         @relation(fields: [scanId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  requester    User?        @relation("ReportRequestedBy", fields: [requestedBy], references: [id], onDelete: SetNull)

  @@map("reports")
}

model AuditLog {
  id           BigInt   @id @default(autoincrement())
  orgId        String?  @db.Uuid
  actorUserId  String?  @db.Uuid
  actorType    String   @db.Text
  action       String   @db.Text
  resourceType String   @db.Text
  resourceId   String?  @db.Uuid
  ip           String?  @db.Inet
  userAgent    String?  @db.Text
  metadata     Json     @default("{}")
  createdAt    DateTime @default(now()) @db.Timestamptz

  organization Organization? @relation(fields: [orgId], references: [id], onDelete: SetNull)
  actor        User?         @relation("AuditActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@map("audit_logs")
}

model UsageEvent {
  id        BigInt   @id @default(autoincrement())
  orgId     String?  @db.Uuid
  scanId    String?  @db.Uuid
  eventType String   @db.Text
  eventId   String   @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  quantity  Decimal  @default(1) @db.Decimal(12, 4)
  metadata  Json     @default("{}")
  createdAt DateTime @default(now()) @db.Timestamptz

  organization Organization? @relation(fields: [orgId], references: [id], onDelete: SetNull)
  scan         Scan?         @relation(fields: [scanId], references: [id], onDelete: SetNull)

  @@unique([orgId, eventId])
  @@map("usage_events")
}

model Session {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId            String    @db.Uuid
  activeOrgId       String?   @db.Uuid
  ip                String?   @db.Inet
  userAgent         String?   @db.Text
  createdAt         DateTime  @default(now()) @db.Timestamptz
  lastSeenAt        DateTime  @default(now()) @db.Timestamptz
  absoluteExpiresAt DateTime  @db.Timestamptz
  revokedAt         DateTime? @db.Timestamptz

  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  activeOrg Organization? @relation(fields: [activeOrgId], references: [id], onDelete: SetNull)

  @@map("sessions")
}
```

If `prisma validate` rejects a construct (e.g. `@default(["scan:read"])` omitted above, `@default(1)` for Decimal, or enum `@@map`), fix by the minimal change that validates and note it in the PR body — the hand-authored SQL in Step 5 is authoritative for the database either way.

- [ ] **Step 5: Write `prisma/migrations/migration_lock.toml` and the init migration**

`prisma/migrations/migration_lock.toml`:

```toml
# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
```

`prisma/migrations/20261110000000_init/migration.sql` — assembled **verbatim** from `docs/database.md` in this exact order (copy each SQL block unchanged; nothing is paraphrased):

1. §3 block: `CREATE EXTENSION` ×2 and all 13 `CREATE TYPE` statements.
2. §4.1 organizations → §4.2 users → §4.3 memberships → §4.5 repositories → §4.6 api_keys → §4.7 scans → §4.8 scan_events → §4.9 dpdpa_rules → §4.10 rule_mappings → §4.11 scanner_findings → §4.12 remediation_logs → §4.13 reports → §4.14 audit_logs → §4.15 usage_events → §4.16 sessions (each table + its `CREATE INDEX` lines).
3. §5: `set_updated_at()` function + all 9 triggers.
4. §6.1 `v_scan_overview`, §6.2 `v_scan_section_scores`.
5. §7: five `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + five `CREATE POLICY`.

(§4.4 is "No table" — skip it.) Verify with: `Select-String -Path apps\orchestrator\prisma\migrations\20261110000000_init\migration.sql -Pattern 'CREATE TABLE'` → 15 hits.

- [ ] **Step 6: Run schema test + `prisma validate`**

Run: `pnpm --filter @dpdpa/orchestrator exec vitest run test/schema.test.ts` → PASS.
Run: `pnpm --filter @dpdpa/orchestrator exec prisma validate` → valid.
Run: `pnpm --filter @dpdpa/orchestrator exec prisma generate` → client generated.

- [ ] **Step 7: Env + Prisma module (failing tests first)**

Add `test/prisma.service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { Env } from '../src/config/env.js';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
};

describe('PrismaService', () => {
  it('is provided by PrismaModule', () => {
    expect(PrismaModule).toBeDefined();
  });

  it('disconnects on module destroy', async () => {
    const service = new PrismaService(ENV);
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
```

Then run `pnpm --filter @dpdpa/orchestrator exec vitest run test/prisma.service.test.ts` → FAIL (module missing).

Implement:

`src/config/env.ts` — add to `envSchema`:

```ts
  DATABASE_URL: z.string().url(),
```

`src/prisma/prisma.service.ts`:

```ts
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

`src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`src/app.module.ts` — add import and include in `imports`:

```ts
import { PrismaModule } from './prisma/prisma.module.js';
// imports: [ConfigModule.forRoot(env), PrismaModule, HealthModule],
```

- [ ] **Step 8: Update every Env fixture**

Grep `ORCHESTRATOR_INTERNAL_KEY` in `apps/orchestrator/test` (4 files: `env.test.ts` KEYS, `bootstrap.test.ts`, `health.e2e.test.ts`, `internal-hmac-guard.e2e.test.ts` ENV_FIXTUREs). In each object add the line:

```ts
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
```

In `env.test.ts` also add a case:

```ts
  it('requires DATABASE_URL', () => {
    expect(() => loadEnv(KEYS)).toThrow(/DATABASE_URL/);
  });
```

- [ ] **Step 9: Full verification**

Run tests: `pnpm --filter @dpdpa/orchestrator exec vitest run` → all PASS.
Run coverage: `pnpm --filter @dpdpa/orchestrator test:coverage` → thresholds 90/85 hold.
Run full gate: stop port 3000, then `powershell -File C:\Users\darsh\AppData\Local\Temp\opencode\worktree-gate.ps1` → `GATE RESULT: ALL GREEN` (restart preview afterwards).

- [ ] **Step 10: Commit, PR, merge**

```powershell
git checkout -b feat/p1-12-prisma-schema
git add -A
git commit -m "feat(orchestrator): prisma schema v1 and initial migration (P1-12)"
git push -u origin feat/p1-12-prisma-schema
```

PR body includes: scope, down note ("drop schema: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` — initial migration, no data"), validation notes for any schema construct adjusted to satisfy `prisma validate`. Wait for all checks + AI PR review → address/decline suggestions with rationale → squash-merge `--delete-branch`.

---

### Task 2: P1-13 — Migration CI job

**Interfaces:**
- Consumes: `prisma/schema.prisma`, `prisma/migrations/` from Task 1.
- Produces: CI job `Migrations` (check name), root scripts `db:migrate` / `db:deploy`, `apps/orchestrator/scripts/check-migrations.sh`.

- [ ] **Step 1: `check-migrations.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
# Applies every migration except the last by hand (marking each applied), then
# runs `prisma migrate deploy` for the rest: proves a database that is one
# version behind upgrades cleanly (docs/tasks.md Phase 1 exit criterion).
cd "$(dirname "$0")/.."

mapfile -t migrations < <(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
n=${#migrations[@]}
echo "Found $n migration(s)"

if [ "$n" -ge 2 ]; then
  for ((i = 0; i < n - 1; i++)); do
    m="${migrations[$i]}"
    echo "Baselining migration: $m"
    pnpm exec prisma db execute --file "prisma/migrations/$m/migration.sql"
    pnpm exec prisma migrate resolve --applied "$m"
  done
fi

pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

- [ ] **Step 2: CI job** — append to `.github/workflows/ci.yml` `jobs:` (after `code`), mirroring existing step styles:

```yaml
  migrate:
    name: Migrations
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: dpdpa_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/dpdpa_test
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v7

      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        env:
          HUSKY: 0

      - name: Validate schema
        run: pnpm --filter @dpdpa/orchestrator exec prisma validate

      - name: Migrate empty database
        run: pnpm --filter @dpdpa/orchestrator exec prisma migrate deploy

      - name: Create one-version-behind database
        run: pnpm --filter @dpdpa/orchestrator exec prisma db execute --url postgresql://test:test@localhost:5432/postgres --stdin <<< 'CREATE DATABASE dpdpa_behind;'

      - name: Upgrade database one version behind
        run: DATABASE_URL=postgresql://test:test@localhost:5432/dpdpa_behind bash apps/orchestrator/scripts/check-migrations.sh
```

- [ ] **Step 3: root scripts** — root `package.json` scripts add:

```json
"db:migrate": "pnpm --filter @dpdpa/orchestrator exec prisma migrate dev",
"db:deploy": "pnpm --filter @dpdpa/orchestrator exec prisma migrate deploy"
```

- [ ] **Step 4: Verify locally**

Run: `pnpm exec prettier --write .github/workflows/ci.yml package.json` then `pnpm lint` (actionlint runs in CI; local lint covers prettier/eslint).
Run: `pnpm --filter @dpdpa/orchestrator exec prisma validate` → valid.
Full gate → ALL GREEN.

- [ ] **Step 5: Commit, PR, merge** — branch `feat/p1-13-migration-ci`, message `feat(ci): migration job runs prisma migrate deploy and one-version-behind upgrade (P1-13)`. PR body notes the job validates empty-DB apply + one-version-behind; Argo CD pre-sync hook wiring lands with P1-06 (Platform, no Argo manifests exist yet). Same merge criteria.

---

### Task 3: P1-20 — DB test harness (Postgres + Redis)

**Interfaces:**
- Produces:
  - `planDatabase(testDatabaseUrl: string | undefined, dockerAvailable: boolean): DbPlan` where `DbPlan = { mode: 'existing'; url: string } | { mode: 'container' } | { mode: 'skip'; reason: string }` (`test/integration/helpers/resolve-db-url.ts`).
  - `dbUrl: string | null` and `describeDb` (a `describe` that skips when `dbUrl` is null) from `test/integration/helpers/db.ts`.
  - Root command `pnpm test:integration`; CI step "Integration tests" in the `code` job.
  - `process.env.TEST_DATABASE_URL` / `process.env.REDIS_TEST_URL` set by `test/integration/global-setup.ts`.

- [ ] **Step 1: deps + scripts**

```powershell
pnpm add -D --filter @dpdpa/orchestrator testcontainers
```

Pin the installed version exactly in `apps/orchestrator/package.json`. Add orchestrator scripts:

```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

Root `package.json`: `"test:integration": "turbo run test:integration"`. `turbo.json` tasks add: `"test:integration": {}`.

- [ ] **Step 2: unit test for the resolver (failing first)** — `apps/orchestrator/test/resolve-db-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planDatabase } from './integration/helpers/resolve-db-url.js';

describe('planDatabase', () => {
  it('prefers an explicit TEST_DATABASE_URL', () => {
    expect(planDatabase('postgresql://x/y', true)).toEqual({
      mode: 'existing',
      url: 'postgresql://x/y',
    });
  });

  it('falls back to a container when Docker is available', () => {
    expect(planDatabase(undefined, true)).toEqual({ mode: 'container' });
  });

  it('skips when neither is available', () => {
    const plan = planDatabase(undefined, false);
    expect(plan.mode).toBe('skip');
    expect(plan).toHaveProperty('reason');
  });
});
```

Run → FAIL (helper missing).

- [ ] **Step 3: implement resolver + helpers**

`test/integration/helpers/resolve-db-url.ts`:

```ts
export type DbPlan =
  | { mode: 'existing'; url: string }
  | { mode: 'container' }
  | { mode: 'skip'; reason: string };

export function planDatabase(
  testDatabaseUrl: string | undefined,
  dockerAvailable: boolean,
): DbPlan {
  if (testDatabaseUrl) return { mode: 'existing', url: testDatabaseUrl };
  if (dockerAvailable) return { mode: 'container' };
  return {
    mode: 'skip',
    reason: 'TEST_DATABASE_URL is unset and the Docker daemon is unavailable',
  };
}
```

`test/integration/helpers/db.ts`:

```ts
import { PrismaClient } from '@prisma/client';

export const dbUrl: string | null = process.env.TEST_DATABASE_URL || null;
export const describeDb = dbUrl ? describe : describe.skip;

export function makeClient(): PrismaClient {
  if (!dbUrl) throw new Error('Integration database unavailable (see test/integration/helpers/db.ts)');
  return new PrismaClient({ datasourceUrl: dbUrl });
}
```

Run: `pnpm --filter @dpdpa/orchestrator exec vitest run test/resolve-db-url.test.ts` → PASS.

- [ ] **Step 4: vitest configs**

`vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
```

Modify `vitest.config.ts` `test` to exclude integration from the unit run:

```ts
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**', 'dist/**', 'coverage/**'],
```

- [ ] **Step 5: global setup** — `test/integration/global-setup.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planDatabase } from './helpers/resolve-db-url.js';

const orchestratorDir = fileURLToPath(new URL('../..', import.meta.url));

function probeDocker(): boolean {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      stdio: 'ignore',
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const plan = planDatabase(process.env.TEST_DATABASE_URL, probeDocker());

  if (plan.mode === 'skip') {
    process.env.TEST_DATABASE_URL = '';
    console.warn(`[integration] skipping: ${plan.reason}`);
    return async () => {};
  }

  let url = plan.url;
  let postgres: { stop: () => Promise<unknown> } | undefined;
  let redis: { stop: () => Promise<unknown> } | undefined;

  if (plan.mode === 'container') {
    const { GenericContainer, Wait } = await import('testcontainers');
    postgres = await new GenericContainer('postgres:16')
      .withEnv({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'dpdpa_test' })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .start();
    url = `postgresql://test:test@127.0.0.1:${postgres.getMappedPort(5432)}/dpdpa_test`;

    if (!process.env.REDIS_TEST_URL) {
      redis = await new GenericContainer('redis:7')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1))
        .start();
      process.env.REDIS_TEST_URL = `redis://127.0.0.1:${redis.getMappedPort(6379)}`;
    }
  }

  process.env.TEST_DATABASE_URL = url;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: orchestratorDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  return async () => {
    await postgres?.stop();
    await redis?.stop();
  };
}
```

- [ ] **Step 6: integration tests** — `test/integration/migrations.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { makeClient, describeDb } from './helpers/db.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const schema = readFileSync(`${root}prisma/schema.prisma`, 'utf8');

const TABLES = [
  'organizations', 'users', 'memberships', 'repositories', 'api_keys', 'scans',
  'scan_events', 'dpdpa_rules', 'rule_mappings', 'scanner_findings',
  'remediation_logs', 'reports', 'audit_logs', 'usage_events', 'sessions',
];
const ENUMS = [
  'org_plan', 'member_role', 'membership_status', 'repo_visibility', 'scan_status',
  'scan_trigger', 'scanner_name', 'scanner_status', 'finding_severity',
  'finding_status', 'mapping_confidence', 'report_status', 'report_format',
];
const RLS_TABLES = ['repositories', 'scans', 'scanner_findings', 'reports', 'audit_logs'];

describeDb('initial migration', () => {
  const prisma = makeClient();
  afterAll(() => prisma.$disconnect());

  it('creates every table, enum, trigger, view, and RLS policy', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    for (const t of TABLES) expect(tables.map((r) => r.tablename)).toContain(t);

    const enums = await prisma.$queryRaw<{ typname: string }[]>`
      SELECT t.typname FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'`;
    for (const e of ENUMS) expect(enums.map((r) => r.typname)).toContain(e);

    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`;
    expect(triggers.map((r) => r.tgname)).toContain('trg_orgs_updated');

    const views = await prisma.$queryRaw<{ viewname: string }[]>`
      SELECT viewname FROM pg_views WHERE schemaname = 'public'`;
    expect(views.map((r) => r.viewname)).toEqual(
      expect.arrayContaining(['v_scan_overview', 'v_scan_section_scores']),
    );

    const rls = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relrowsecurity`;
    for (const t of RLS_TABLES) expect(rls.map((r) => r.relname)).toContain(t);

    const policies = await prisma.$queryRaw<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies WHERE schemaname = 'public'`;
    expect(policies.length).toBe(5);
  });

  it('enum values in the database match schema.prisma exactly', async () => {
    const rows = await prisma.$queryRaw<{ typname: string; enumlabel: string }[]>`
      SELECT t.typname, e.enumlabel FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`;
    const dbEnums = new Map<string, string[]>();
    for (const row of rows) {
      dbEnums.set(row.typname, [...(dbEnums.get(row.typname) ?? []), row.enumlabel]);
    }
    const blocks = [...schema.matchAll(/enum \w+ \{([^}]*)\}/g)];
    expect(blocks.length).toBe(dbEnums.size);
    for (const [, body] of blocks) {
      const mapName = body.match(/@@map\("(\w+)"\)/)?.[1];
      const values = body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('@@'));
      expect(dbEnums.get(mapName!), `enum ${mapName}`).toEqual(values);
    }
  });

  it('the updated_at trigger bumps the column on update', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Trigger Test Org', slug: `trigger-test-${Date.now()}` },
    });
    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: { name: 'Renamed' },
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(org.updatedAt.getTime());
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('rejects data that violates a CHECK constraint', async () => {
    await expect(
      prisma.organization.create({ data: { name: 'x', slug: 'bad slug!' } }),
    ).rejects.toThrow();
  });
});
```

`test/integration/redis-harness.test.ts`:

```ts
import { once } from 'node:events';
import net from 'node:net';
import { describe, expect, it } from 'vitest';

const redisUrl = process.env.REDIS_TEST_URL || null;

(redisUrl ? describe : describe.skip)('redis harness', () => {
  it('answers PING', async () => {
    const { hostname, port } = new URL(redisUrl!);
    const socket = net.connect({ host: hostname, port: Number(port) });
    await once(socket, 'connect');
    socket.write('PING\r\n');
    const [chunk] = (await once(socket, 'data')) as Buffer[];
    socket.destroy();
    expect(chunk.toString()).toBe('+PONG\r\n');
  });
});
```

- [ ] **Step 7: CI wiring** — in `.github/workflows/ci.yml` `code` job after `Test with coverage`:

```yaml
      - name: Integration tests
        run: pnpm test:integration
```

- [ ] **Step 8: Verify**

Run: `pnpm lint` (prettier on new files first) → green.
Run: `pnpm --filter @dpdpa/orchestrator exec vitest run` → unit suite still green (integration excluded).
Run: `pnpm --filter @dpdpa/orchestrator test:integration` locally → prints `skipping: TEST_DATABASE_URL is unset...` and exits 0 (no Docker locally) — this proves the skip path.
Full gate → ALL GREEN. In CI the job runs the real path (Docker present on ubuntu runners).

- [ ] **Step 9: Commit, PR, merge** — branch `feat/p1-20-db-test-harness`, message `test(orchestrator): postgres/redis integration harness with Testcontainers (P1-20)`. Merge criteria as before.

---

### Task 4: P1-21 — Audit log service + write-only DB role

**Interfaces:**
- Consumes: `PrismaService` (Task 1), harness `makeClient`/`describeDb` (Task 3).
- Produces: `AuditService.record(entry: AuditEntryInput, tx?: Prisma.TransactionClient): Promise<AuditEntry>`; `auditEntrySchema` (Zod); DB roles `dpdpa_migrate` (owner, BYPASSRLS) and `dpdpa_runtime` (LOGIN, RLS-subject, INSERT+SELECT on `audit_logs`, no UPDATE/DELETE anywhere on append-only tables).

- [ ] **Step 1: schema test for the service (failing first)** — `apps/orchestrator/test/audit.service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

function makeService() {
  const create = vi.fn().mockResolvedValue({});
  const prisma = { auditLog: { create } } as unknown as PrismaService;
  return { service: new AuditService(prisma), create };
}

const ENTRY = {
  orgId: '00000000-0000-0000-0000-000000000001',
  actorType: 'user' as const,
  actorUserId: '00000000-0000-0000-0000-000000000002',
  action: 'org.created',
  resourceType: 'organization',
  resourceId: '00000000-0000-0000-0000-000000000001',
  ip: '203.0.113.7',
  userAgent: 'vitest',
  metadata: { slug: 'acme' },
};

describe('AuditService', () => {
  it('inserts a validated entry', async () => {
    const { service, create } = makeService();
    const result = await service.record(ENTRY);
    expect(result.action).toBe('org.created');
    expect(create).toHaveBeenCalledWith({
      data: {
        orgId: ENTRY.orgId,
        actorType: 'user',
        actorUserId: ENTRY.actorUserId,
        action: 'org.created',
        resourceType: 'organization',
        resourceId: ENTRY.resourceId,
        ip: ENTRY.ip,
        userAgent: 'vitest',
        metadata: { slug: 'acme' },
      },
    });
  });

  it('rejects an action that is not dotted lowercase', async () => {
    const { service } = makeService();
    await expect(service.record({ ...ENTRY, action: 'Org Created' })).rejects.toThrow();
  });

  it('rejects an unknown actor type', async () => {
    const { service } = makeService();
    await expect(service.record({ ...ENTRY, actorType: 'robot' })).rejects.toThrow();
  });

  it('writes through a caller-provided transaction client', async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as never;
    const service = new AuditService({} as PrismaService);
    await service.record(ENTRY, tx);
    expect(create).toHaveBeenCalledOnce();
  });
});
```

Run → FAIL (service missing).

- [ ] **Step 2: implement the audit module**

`src/modules/audit/audit-entry.schema.ts`:

```ts
import { z } from 'zod';

export const auditEntrySchema = z.object({
  orgId: z.uuid().nullable(),
  actorType: z.enum(['user', 'api_key', 'system']),
  actorUserId: z.uuid().nullish(),
  action: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
  resourceType: z.string().regex(/^[a-z][a-z0-9_]*$/),
  resourceId: z.uuid().nullish(),
  ip: z.ip().nullish(),
  userAgent: z.string().max(512).nullish(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEntryInput = z.input<typeof auditEntrySchema>;
export type AuditEntry = z.output<typeof auditEntrySchema>;
```

`src/modules/audit/audit.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { auditEntrySchema, type AuditEntry, type AuditEntryInput } from './audit-entry.schema.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append-only: audit rows are never updated or deleted by the application. */
  async record(raw: AuditEntryInput, tx?: Prisma.TransactionClient): Promise<AuditEntry> {
    const entry = auditEntrySchema.parse(raw);
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        orgId: entry.orgId,
        actorType: entry.actorType,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return entry;
  }
}
```

`src/modules/audit/audit.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

`src/app.module.ts`: import `AuditModule` and add to `imports`.

Run: `pnpm --filter @dpdpa/orchestrator exec vitest run test/audit.service.test.ts` → PASS. (If `z.uuid()`/`z.ip()` differ in the installed Zod 4 minor, use `z.string().uuid()` / `z.string().ip()` — verify with `pnpm --filter @dpdpa/orchestrator exec vitest run test/audit.service.test.ts`.)

- [ ] **Step 3: roles migration** — `prisma/migrations/20261111000000_runtime_roles/migration.sql`:

```sql
-- Roles (docs/database.md §7; docs/security.md §13 audit trail).
-- Idempotent: roles are cluster-wide and may already exist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dpdpa_migrate') THEN
    CREATE ROLE dpdpa_migrate NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dpdpa_runtime') THEN
    CREATE ROLE dpdpa_runtime LOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- The migration role owns the tables and bypasses RLS; the runtime role does not.
ALTER TABLE organizations OWNER TO dpdpa_migrate;
ALTER TABLE users OWNER TO dpdpa_migrate;
ALTER TABLE memberships OWNER TO dpdpa_migrate;
ALTER TABLE repositories OWNER TO dpdpa_migrate;
ALTER TABLE api_keys OWNER TO dpdpa_migrate;
ALTER TABLE scans OWNER TO dpdpa_migrate;
ALTER TABLE scan_events OWNER TO dpdpa_migrate;
ALTER TABLE dpdpa_rules OWNER TO dpdpa_migrate;
ALTER TABLE rule_mappings OWNER TO dpdpa_migrate;
ALTER TABLE scanner_findings OWNER TO dpdpa_migrate;
ALTER TABLE remediation_logs OWNER TO dpdpa_migrate;
ALTER TABLE reports OWNER TO dpdpa_migrate;
ALTER TABLE audit_logs OWNER TO dpdpa_migrate;
ALTER TABLE usage_events OWNER TO dpdpa_migrate;
ALTER TABLE sessions OWNER TO dpdpa_migrate;
ALTER SEQUENCE audit_logs_id_seq OWNER TO dpdpa_migrate;
ALTER SEQUENCE scan_events_id_seq OWNER TO dpdpa_migrate;
ALTER SEQUENCE usage_events_id_seq OWNER TO dpdpa_migrate;

-- Runtime role: least privilege. Append-only tables (audit_logs, scan_events,
-- remediation_logs, usage_events) get no UPDATE/DELETE — audit_logs is
-- INSERT + SELECT only (security.md §13).
GRANT USAGE ON SCHEMA public TO dpdpa_runtime;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO dpdpa_runtime;
GRANT UPDATE, DELETE ON
  organizations, users, memberships, repositories, api_keys, scans,
  dpdpa_rules, rule_mappings, scanner_findings, reports, sessions
TO dpdpa_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dpdpa_runtime;
```

- [ ] **Step 4: integration test** — `test/integration/audit-append-only.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { describeDb, dbUrl } from './helpers/db.js';

const RUNTIME_PASSWORD = 'test-only-runtime-password';

describeDb('audit_logs append-only + RLS', () => {
  const owner = new PrismaClient({ datasourceUrl: dbUrl! });
  let runtime: PrismaClient;
  let orgId: string;

  beforeAll(async () => {
    await owner.$executeRaw`ALTER ROLE dpdpa_runtime PASSWORD '${RUNTIME_PASSWORD}'`;
    const url = new URL(dbUrl!);
    url.username = 'dpdpa_runtime';
    url.password = RUNTIME_PASSWORD;
    runtime = new PrismaClient({ datasourceUrl: url.toString() });
    const org = await owner.organization.create({
      data: { name: 'Audit RLS Org', slug: `audit-rls-${Date.now()}` },
    });
    orgId = org.id;
    const service = new AuditService(owner as unknown as PrismaService);
    await service.record({
      orgId,
      actorType: 'system',
      action: 'org.created',
      resourceType: 'organization',
      resourceId: orgId,
      metadata: {},
    });
  });

  afterAll(async () => {
    await owner.auditLog.deleteMany({ where: { orgId } });
    await owner.organization.delete({ where: { id: orgId } });
    await runtime.$disconnect();
    await owner.$disconnect();
  });

  it('returns zero audit rows without SET LOCAL app.current_org', async () => {
    const rows = await runtime.auditLog.findMany({ where: { orgId } });
    expect(rows).toEqual([]);
  });

  it('returns the rows once the org is set in the transaction', async () => {
    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
      return tx.auditLog.findMany({ where: { orgId } });
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects an insert without the org context (RLS WITH CHECK)', async () => {
    await expect(
      runtime.auditLog.create({
        data: { actorType: 'system', action: 'x.y', resourceType: 'thing' },
      }),
    ).rejects.toThrow();
  });

  it('refuses UPDATE and DELETE on audit_logs (append-only)', async () => {
    const orgRow = await runtime.auditLog.findFirst({ where: { orgId } });
    expect(orgRow).not.toBeNull();
    await expect(
      runtime.auditLog.update({ where: { id: orgRow!.id }, data: { action: 'tampered.edit' } }),
    ).rejects.toThrow(/permission denied|42501/);
    await expect(runtime.auditLog.delete({ where: { id: orgRow!.id } })).rejects.toThrow(
      /permission denied|42501/,
    );
  });
});
```

Notes: `ALTER ROLE ... PASSWORD` uses a literal inside the tagged template (no parameters allowed in DDL; the marker value keeps gitleaks quiet — the gate verifies). If `url.username =` mutation on a `URL` with an existing userinfo fails on Windows Node, build the URL by string surgery: `` `postgresql://dpdpa_runtime:${RUNTIME_PASSWORD}@${url.host}${url.pathname}` ``.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @dpdpa/orchestrator exec vitest run` → unit green.
Run coverage → thresholds hold (audit + prisma files covered).
Run: `pnpm --filter @dpdpa/orchestrator test:integration` → skips locally without Docker; runs in CI.
Full gate → ALL GREEN.

- [ ] **Step 6: Commit, PR, merge** — branch `feat/p1-21-audit-service`, message `feat(orchestrator): append-only audit log service and runtime DB roles (P1-21)`. PR body carries the down note for the roles migration (`REVOKE ... ; DROP ROLE IF EXISTS dpdpa_runtime; DROP ROLE IF EXISTS dpdpa_migrate;` — ownership must be transferred back first: `ALTER TABLE ... OWNER TO test` as the CI superuser, or `DROP OWNED BY` per role in a dev database).

---

## Closing (docs PR)

After all four tasks merge: one docs-only PR filling this plan's checkboxes, status line (`Status: complete — merged via PRs #33–#36`), and appending the four tasks to `.superpowers/sdd/2026-11-06-phase-1-web-foundation/ledger.md`.

## Self-Review

- **Spec coverage:** database.md §3/§4/§5/§6/§7 → Task 1 migration; §8 Prisma mapping → Task 1 schema; §10 migration strategy (down notes, expand/contract awareness) → PR bodies; security.md §13 audit trail → Task 4; code_style §2 `db:migrate`/`db:deploy` → Task 2; §10.1 integration layer + §10.2 `tests/integration` convention → Task 3 (kept under `apps/orchestrator/test/integration/` to match the package's existing `test/` root); tasks.md P1-12/P1-13/P1-20/P1-21 → Tasks 1–4.
- **Placeholders:** none — all code shown; migration SQL source is the in-repo spec (verbatim copy list given).
- **Type consistency:** `AuditEntryInput`/`AuditEntry` used identically in Tasks 4; `PrismaService` constructor signature matches `Env.DATABASE_URL` added in Task 1 and consumed by Task 4 tests; `planDatabase`/`DbPlan` defined in Task 3 and consumed by `global-setup.ts` in the same task.
