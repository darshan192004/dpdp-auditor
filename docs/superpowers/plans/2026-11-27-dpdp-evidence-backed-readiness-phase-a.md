# Evidence-backed DPDPA Readiness Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove implicit pass-by-absence by adding version-dispatched scoring v2, persisted control verdicts, evidence-coverage UI, and a pro-motion frontend refactor while keeping legacy scans byte-stable.

**Architecture:** Add canonical readiness contracts and a pure `ControlEvaluator` between mapping and scoring. New scans are scored with `scoring-2.0.0`, persist one `control_results` row per applicable control, and expose an `assessment` summary to the Nuxt UI; legacy scans continue through the unchanged v1 engine. The UI is rebuilt as a curated Nuxt/Vue port of public motion patterns from Animmaster Lib, Skiper UI, Vengeance UI, Motion Primitives, and Motion, using `motion-v` and strict reduced-motion/a11y gates.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Zod, Vue 3.5.45, Nuxt 4.6.4, @nuxt/ui 3.3.7, Tailwind, Vitest, Playwright MCP, `motion-v` (Motion for Vue).

**Spec:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md`  
**ADR:** `docs/decisions/0001-evidence-backed-dpdp-readiness.md`

Phase A implements the Phase A row of the approved spec: verdict enum, `control_results`, evaluator, scoring v2, coverage tiles, and legacy label. Rule pack `dpdpa-2026.11.0`, the `inventory-1.0.0` analyzer, absence rules, attestations, new assessment pages, and v2 report layout are deliberately Phase B–F. Phase A uses the existing `dpdpa-2026.10.6` pack as evaluator input and stores a new scan-level `scoringVersion` of `scoring-2.0.0` behind the `dpdpa_readiness_v2` flag.

## Global Constraints

- Readiness only. No compliance verdict, certificate, badge, or legal conclusion.
- Forbidden in product UI/report/export strings outside quoted disclaimers: “compliant”, “non-compliant”, “violation of the Act”, “certified”.
- Tests first. At every task boundary, run the task's focused tests **and** `pnpm lint && pnpm typecheck && pnpm test`; do not commit unless all are green.
- A CI language lint must cover UI strings, report/export strings, and rule messages. CSS token names such as `status-compliant-bg` and quoted disclaimers are exempt; user-facing copy is not.
- Never retain, transmit, persist, log, or trace source code or file contents. Evidence references carry hashes, paths, lines, detector IDs, and fingerprints only.
- Never turn missing evidence into `PASS`; `UNKNOWN` is excluded from the score and shown prominently.
- Legacy scans keep `scoringVersion: "1.0.0"` and exact historical scores. New v2 scans carry `"scoring-2.0.0"`.
- Do not change `packages/rule-packs/scoring.yaml`; its numeric `scoringVersion: 1.0.0` stays valid for legacy pack loading in Phase A.
- Do not merge PR #103, push, deploy, merge any PR, change image pins, or touch `infra/` or `infra/certs/*` without explicit user approval.
- Implementation base chosen by the user: `origin/main`. Work on `feat/dpdp-readiness-phase-a`, opened as its own PR. Do not merge PR #103 as part of Phase A.
- Fixtures are test inputs only and must never be presented as pilot evidence or sign-off data. WebGoat and Juice-Shop-like repos are manual smoke tests only, not CI gates.
- k3s deployment and the gVisor RuntimeClass sign-off gate remain paused pending explicit user approval.
- External pentest remains `Pending — deferred for internal pilot`.
- UI verification must use Playwright MCP so the user can watch live.
- UI motion policy: use only free/public patterns from the five named sources; do not download or commit paid React/shadcn packs. Recreate premium-looking effects as original Nuxt/Vue components.
- UI motion policy: every animation must collapse to an instant, non-animated state under `prefers-reduced-motion: reduce`; keyboard focus must remain visible and in DOM order.
- Detected versions from `apps/web/package.json`: Nuxt 4.6.4, Vue 3.5.45, @nuxt/ui 3.3.7. Motion for Vue must be installed with `motion-v`; official docs: https://motion.dev/docs/vue, https://motion.dev/docs/vue-motion-component, https://motion.dev/docs/vue-scroll-animations, https://motion.dev/docs/vue-use-reduced-motion, https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion.
- Motion Primitives is MIT-licensed and React/Tailwind-based: https://github.com/ibelick/motion-primitives and https://motion-primitives.com/docs/text-effect. Phase A ports the documented pattern, not the React source, into Vue.

---

## File Structure

- `packages/contracts/src/readiness.ts` — canonical verdict, finding-kind, detector-status, evidence-reference, control-result, and assessment-summary schemas.
- `apps/orchestrator/prisma/schema.prisma` — Prisma models/enums for `control_results`, finding kind/detector, and scan assessment summary columns.
- `apps/orchestrator/prisma/migrations/20261127000000_readiness_phase_a/migration.sql` — SQL migration with RLS, indexes, and trigger.
- `apps/orchestrator/src/modules/scoring/control-evaluator.ts` — pure verdict evaluator.
- `apps/orchestrator/src/modules/scoring/scoring.v2.ts` — deterministic v2 scoring math and grade caps.
- `apps/orchestrator/src/modules/scoring/scoring.engine.ts` — existing v1 engine plus version dispatcher.
- `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts` — builds evidence, evaluates controls, persists `control_results`, dispatches scoring.
- `apps/orchestrator/src/modules/scans/scans.service.ts` — stores assessment summary on completion and returns it in scan detail.
- `apps/web/shared/scan.ts` — wire contract, readiness-safe section labels, evidence helpers.
- `apps/web/app/components/motion/` — original Vue motion primitives.
- `apps/web/app/components/new/NewScanDetail.vue` — composed assessment view with pro motion and legacy badge.
- `tests/golden-repos/fx-silent-app/` — silent-repository fixture; never pilot evidence.
- `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-a.md` — this plan.

---

### Task 1: Commit approved design docs and add readiness contracts

**Files:**
- Create: `packages/contracts/src/readiness.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/readiness.test.ts`
- Modify: `packages/contracts/test/index.test.ts`
- Modify: `docs/decisions/0001-evidence-backed-dpdp-readiness.md` (status `Accepted`, dated 2026-11-27)
- Commit: the approved spec, the accepted ADR, and this plan file

**Interfaces:**
- Consumes: `CONTROL_CODE_PATTERN` from `packages/contracts/src/fingerprint.ts`.
- Produces: `READINESS_VERDICTS`, `ReadinessVerdict`, `FINDING_KINDS`, `FindingKind`, `DETECTOR_STATUSES`, `DetectorStatus`, `READINESS_CONFIDENCES`, `ReadinessConfidence`, `controlResultSchema`, `ControlResult`, `assessmentSummarySchema`, `AssessmentSummary`.

- [x] **Step 1: Write the failing contract test**

```ts
// packages/contracts/test/readiness.test.ts
import { describe, expect, it } from 'vitest';
import {
  assessmentSummarySchema,
  controlResultSchema,
  DETECTOR_STATUSES,
  FINDING_KINDS,
  READINESS_VERDICTS,
} from '../src/readiness';

describe('readiness contracts', () => {
  it('exposes the eight canonical verdicts', () => {
    expect(READINESS_VERDICTS).toEqual([
      'PASS',
      'FAIL',
      'PARTIAL',
      'UNKNOWN',
      'NOT_APPLICABLE',
      'MANUAL',
      'ATTESTED_PASS',
      'ATTESTED_FAIL',
    ]);
  });

  it('exposes the five finding kinds and four detector states', () => {
    expect(FINDING_KINDS).toEqual([
      'violation',
      'missing_control',
      'weak_control',
      'positive',
      'unverified',
    ]);
    expect(DETECTOR_STATUSES).toEqual(['completed', 'failed', 'timed_out', 'skipped']);
  });

  it('accepts a control result with hash-only evidence', () => {
    const result = controlResultSchema.parse({
      controlCode: 'DPDPA-8.4-SECRET-01',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      confidence: 'direct',
      evidence: [
        {
          kind: 'violation',
          scanner: 'gitleaks',
          scannerRuleId: 'generic-api-key',
          evidenceHash: 'sha256:2389c7fb2b3b53c985eba440fc8f23bc38c62d4abe0b6f857dc698dd8468f876',
          filePath: 'src/DOMInjection.java',
          lineStart: 63,
          lineEnd: 63,
          fingerprint: 'fp:webgoat:secret',
        },
      ],
      rulePackVersion: 'dpdpa-2026.10.6',
      scoringVersion: 'scoring-2.0.0',
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('rejects evidence carrying file contents', () => {
    const parsed = controlResultSchema.safeParse({
      controlCode: 'DPDPA-8.4-SECRET-01',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      confidence: 'direct',
      evidence: [
        {
          kind: 'violation',
          scanner: 'gitleaks',
          scannerRuleId: 'generic-api-key',
          snippet: 'token = "secret"',
        },
      ],
      rulePackVersion: 'dpdpa-2026.10.6',
      scoringVersion: 'scoring-2.0.0',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts the assessment summary shape', () => {
    const summary = assessmentSummarySchema.parse({
      score: null,
      evidenceCoverage: 0,
      openGaps: 0,
      verdictCounts: { UNKNOWN: 12 },
      unknownControls: [],
      detectorStatuses: { gitleaks: 'completed' },
      gradeWithheldReason: 'insufficient_evidence',
      consentGatingRatio: null,
    });
    expect(summary.gradeWithheldReason).toBe('insufficient_evidence');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpdpa/contracts test -- readiness.test.ts`  
Expected: FAIL — `Cannot find module '../src/readiness'`.

- [x] **Step 3: Implement the schemas**

```ts
// packages/contracts/src/readiness.ts
import { z } from 'zod';
import { CONTROL_CODE_PATTERN } from './fingerprint';

export const READINESS_CONFIDENCES = ['direct', 'inferred', 'advisory'] as const;
export const readinessConfidenceSchema = z.enum(READINESS_CONFIDENCES);
export type ReadinessConfidence = z.infer<typeof readinessConfidenceSchema>;

export const READINESS_VERDICTS = [
  'PASS',
  'FAIL',
  'PARTIAL',
  'UNKNOWN',
  'NOT_APPLICABLE',
  'MANUAL',
  'ATTESTED_PASS',
  'ATTESTED_FAIL',
] as const;
export const readinessVerdictSchema = z.enum(READINESS_VERDICTS);
export type ReadinessVerdict = z.infer<typeof readinessVerdictSchema>;

export const FINDING_KINDS = [
  'violation',
  'missing_control',
  'weak_control',
  'positive',
  'unverified',
] as const;
export const findingKindSchema = z.enum(FINDING_KINDS);
export type FindingKind = z.infer<typeof findingKindSchema>;

export const DETECTOR_STATUSES = ['completed', 'failed', 'timed_out', 'skipped'] as const;
export const detectorStatusSchema = z.enum(DETECTOR_STATUSES);
export type DetectorStatus = z.infer<typeof detectorStatusSchema>;

export const evidenceReferenceSchema = z
  .object({
    kind: findingKindSchema,
    scanner: z.enum(['semgrep', 'checkov', 'gitleaks', 'inventory']).optional(),
    scannerRuleId: z.string().min(1).optional(),
    evidenceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/).nullable().optional(),
    filePath: z.string().min(1).nullable().optional(),
    lineStart: z.number().int().positive().nullable().optional(),
    lineEnd: z.number().int().positive().nullable().optional(),
    fingerprint: z.string().min(1).optional(),
  })
  .strict();
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const controlResultSchema = z
  .object({
    controlCode: z.string().regex(CONTROL_CODE_PATTERN),
    verdict: readinessVerdictSchema,
    reasonCode: z.string().min(1),
    confidence: readinessConfidenceSchema.nullable(),
    evidence: z.array(evidenceReferenceSchema),
    rulePackVersion: z.string().min(1),
    scoringVersion: z.string().min(1),
  })
  .strict();
export type ControlResult = z.infer<typeof controlResultSchema>;

export const GRADE_WITHHELD_REASONS = ['partial_coverage', 'insufficient_evidence'] as const;
export const gradeWithheldReasonSchema = z.enum(GRADE_WITHHELD_REASONS);
export type GradeWithheldReason = z.infer<typeof gradeWithheldReasonSchema>;

export const assessmentSummarySchema = z
  .object({
    score: z.number().min(0).max(100).nullable(),
    evidenceCoverage: z.number().min(0).max(1).nullable(),
    openGaps: z.number().int().nonnegative(),
    verdictCounts: z.partialRecord(readinessVerdictSchema, z.number().int().nonnegative()),
    unknownControls: z.array(z.string().regex(CONTROL_CODE_PATTERN)),
    detectorStatuses: z.record(z.string().min(1), detectorStatusSchema),
    gradeWithheldReason: gradeWithheldReasonSchema.nullable(),
    consentGatingRatio: z.number().min(0).max(1).nullable(),
  })
  .strict();
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;
```

Add to `packages/contracts/src/index.ts`:

```ts
export * from './readiness';
```

Add to `packages/contracts/test/index.test.ts` inside the entry-export test:

```ts
    expect(srcIndex.READINESS_VERDICTS).toHaveLength(8);
    expect(srcIndex.FINDING_KINDS).toHaveLength(5);
    expect(srcIndex.READINESS_CONFIDENCES).toEqual(['direct', 'inferred', 'advisory']);
    expect(typeof srcIndex.controlResultSchema.parse).toBe('function');
    expect(typeof srcIndex.assessmentSummarySchema.parse).toBe('function');
```

- [x] **Step 4: Run the focused tests**

Run: `pnpm --filter @dpdpa/contracts test -- readiness.test.ts index.test.ts`  
Expected: PASS.

- [x] **Step 5: Mark the ADR accepted**

In `docs/decisions/0001-evidence-backed-dpdp-readiness.md`, change:

```md
**Status:** Proposed for user review
```

to:

```md
**Status:** Accepted
**Accepted on:** 2026-11-27
```

- [x] **Step 6: Commit**

```bash
git add packages/contracts/src/readiness.ts packages/contracts/src/index.ts packages/contracts/test/readiness.test.ts packages/contracts/test/index.test.ts docs/decisions/0001-evidence-backed-dpdp-readiness.md docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-a.md
git commit -m "feat(contracts): add readiness verdict contracts"
```

---

### Task 2: Add Phase A persistence schema and migration

**Files:**
- Modify: `apps/orchestrator/prisma/schema.prisma`
- Create: `apps/orchestrator/prisma/migrations/20261127000000_readiness_phase_a/migration.sql`
- Modify: `apps/orchestrator/test/schema.test.ts`

**Interfaces:**
- Consumes: existing enum/table patterns in `20261110000000_init/migration.sql`.
- Produces: `Prisma.ControlResult`, `Prisma.FindingKind`, `Prisma.ControlVerdict`; `scan.evidenceCoverage`, `scan.verdictCounts`, `scan.unknownControls`, `scan.gradeWithheldReason`. `control_results` uses `control_id` (FK to `dpdpa_rules.id`) as its canonical key and stores `control_code` for display; evidence JSON is in `evidence_json`.

- [x] **Step 1: Write the failing schema test additions**

In `apps/orchestrator/test/schema.test.ts`, join both migrations so the existing enum/table loops also cover Phase A:

```ts
const migration = [
  readFileSync(`${root}prisma/migrations/20261110000000_init/migration.sql`, 'utf8'),
  readFileSync(`${root}prisma/migrations/20261127000000_readiness_phase_a/migration.sql`, 'utf8'),
].join('\n');
```

The readiness migration file must exist before the test can load; create it as an empty placeholder if needed, then replace it with the full SQL in Step 4.

Add to `ENUMS` in `apps/orchestrator/test/schema.test.ts`:

```ts
  finding_kind: ['violation', 'missing_control', 'weak_control', 'positive', 'unverified'],
  control_verdict: [
    'PASS',
    'FAIL',
    'PARTIAL',
    'UNKNOWN',
    'NOT_APPLICABLE',
    'MANUAL',
    'ATTESTED_PASS',
    'ATTESTED_FAIL',
  ],
```

Add `'control_results'` to `TABLES`.

Add this assertion inside the migration test:

```ts
    expect(migration).toContain('ALTER TABLE control_results ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY tenant_isolation_control_results');
    expect(migration).toContain('CREATE TRIGGER trg_control_results_updated');
    expect(migration).toContain('control_id uuid NOT NULL REFERENCES dpdpa_rules(id)');
    expect(migration).toContain('control_code text NOT NULL');
    expect(migration).toContain('evidence_json jsonb');
    expect(migration).toContain('UNIQUE (scan_id, control_id)');
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpdpa/orchestrator test -- schema.test.ts`  
Expected: FAIL — enum/table/policy assertions missing.

- [x] **Step 3: Modify `schema.prisma`**

Add these enums after `enum FindingStatus`:

```prisma
enum FindingKind {
  violation
  missing_control
  weak_control
  positive
  unverified

  @@map("finding_kind")
}

enum ControlVerdict {
  PASS
  FAIL
  PARTIAL
  UNKNOWN
  NOT_APPLICABLE
  MANUAL
  ATTESTED_PASS
  ATTESTED_FAIL

  @@map("control_verdict")
}
```

Add these fields to `model Organization`:

```prisma
  controlResults ControlResult[]
```

Add this field to `model DpdpaRule`:

```prisma
  controlResults ControlResult[]
```

Add these fields to `model Scan`:

```prisma
  evidenceCoverage    Decimal?      @map("evidence_coverage") @db.Decimal(5, 4)
  verdictCounts       Json          @default("{}") @map("verdict_counts")
  unknownControls     Json          @default("[]") @map("unknown_controls")
  gradeWithheldReason String?       @map("grade_withheld_reason") @db.Text
  controlResults      ControlResult[]
```

Add these fields to `model ScannerFinding`:

```prisma
  kind     FindingKind       @default(violation) @map("finding_kind")
  detector String?          @db.Text
```

Add this model before `model Report`:

```prisma
model ControlResult {
  id              String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId           String            @map("org_id") @db.Uuid
  scanId          String            @map("scan_id") @db.Uuid
  controlId       String            @map("control_id") @db.Uuid
  controlCode     String            @map("control_code") @db.Text
  verdict         ControlVerdict
  reasonCode      String            @map("reason_code") @db.Text
  confidence      MappingConfidence?
  evidence        Json              @default("[]") @map("evidence_json")
  rulePackVersion String            @map("rule_pack_version") @db.Text
  scoringVersion  String            @map("scoring_version") @db.Text
  createdAt       DateTime          @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime          @default(now()) @map("updated_at") @db.Timestamptz

  scan         Scan        @relation(fields: [scanId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  rule         DpdpaRule   @relation(fields: [controlId], references: [id], onDelete: Restrict)

  @@unique([scanId, controlId])
  @@index([scanId, verdict])
  @@index([orgId, controlId])
  @@index([orgId, controlCode])
  @@map("control_results")
}
```

- [x] **Step 4: Create the migration**

```sql
-- apps/orchestrator/prisma/migrations/20261127000000_readiness_phase_a/migration.sql
CREATE TYPE finding_kind AS ENUM (
  'violation',
  'missing_control',
  'weak_control',
  'positive',
  'unverified'
);

CREATE TYPE control_verdict AS ENUM (
  'PASS',
  'FAIL',
  'PARTIAL',
  'UNKNOWN',
  'NOT_APPLICABLE',
  'MANUAL',
  'ATTESTED_PASS',
  'ATTESTED_FAIL'
);

ALTER TABLE scanner_findings
  ADD COLUMN finding_kind finding_kind NOT NULL DEFAULT 'violation',
  ADD COLUMN detector text;

ALTER TABLE scans
  ADD COLUMN evidence_coverage numeric(5,4),
  ADD COLUMN verdict_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN unknown_controls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN grade_withheld_reason text;

CREATE TABLE control_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id           uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  control_id        uuid NOT NULL REFERENCES dpdpa_rules(id) ON DELETE RESTRICT,
  control_code      text NOT NULL,
  verdict           control_verdict NOT NULL,
  reason_code       text NOT NULL,
  confidence        mapping_confidence,
  evidence_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_pack_version text NOT NULL,
  scoring_version   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, control_id)
);

CREATE INDEX idx_control_results_scan_verdict ON control_results (scan_id, verdict);
CREATE INDEX idx_control_results_org_control ON control_results (org_id, control_id);
CREATE INDEX idx_control_results_org_code ON control_results (org_id, control_code);

CREATE TRIGGER trg_control_results_updated
  BEFORE UPDATE ON control_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE control_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_control_results ON control_results
  USING (org_id = current_setting('app.current_org', true)::uuid);
```

Prisma needs `@map("finding_kind")` because its default column name for the `kind` field would otherwise be `kind`; the SQL column is `finding_kind` to match the enum type. `confidence` reuses the existing `mapping_confidence` enum so no parallel confidence type is introduced.

- [x] **Step 5: Run focused tests and Prisma validation**

Run: `pnpm --filter @dpdpa/orchestrator test -- schema.test.ts && pnpm --filter @dpdpa/orchestrator exec prisma validate`  
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/orchestrator/prisma/schema.prisma apps/orchestrator/prisma/migrations/20261127000000_readiness_phase_a/migration.sql apps/orchestrator/test/schema.test.ts
git commit -m "feat(db): persist readiness control results"
```

---

### Task 3: Implement the pure ControlEvaluator

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/control-evaluator.ts`
- Create: `apps/orchestrator/test/control-evaluator.test.ts`

**Interfaces:**
- Consumes: `Control`, `Mapping`, `Confidence`, `Severity`, `Scanner` from `../rule-pack/rule-pack.schemas.js`; `RepoFacts`, `isApplicable` from `./applicability.js`; `FindingStatus` from `./mapping.resolver.js`.
- Produces: `evaluateControls(input: ControlEvaluatorInput): ControlEvaluation`; `ControlResultLike`; `EvidenceLike`; `ControlEvidence = EvidenceLike`; `EvidenceReferenceLike`; `DetectorStatus`; `buildDetectorStatuses(coverage: Record<string,string>)`.

- [x] **Step 1: Write the failing evaluator tests**

```ts
// apps/orchestrator/test/control-evaluator.test.ts
import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import {
  buildDetectorStatuses,
  evaluateControls,
  type ControlEvaluatorInput,
  type EvidenceLike,
} from '../src/modules/scoring/control-evaluator.js';

const secret: Control = {
  code: 'DPDPA-8.4-SECRET-01',
  section: '8(4)',
  title: 'Secrets are not in source',
  summary: 'No service credential should be stored in source.',
  obligation: 'Use managed secret storage.',
  legalReference: 'DPDPA 8(4)',
  severity: 'critical',
  weight: 4,
  evidenceStrength: 'direct',
  scored: true,
  appliesWhen: {},
  remediation: 'Rotate the key and store it in a secret manager.',
  tags: [],
};

const input = (overrides: Partial<ControlEvaluatorInput> = {}): ControlEvaluatorInput => ({
  controls: [secret],
  facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
  mappings: [{ scanner: 'gitleaks', controlCode: secret.code }],
  detectorStatuses: { gitleaks: 'completed' },
  findings: [],
  rulePackVersion: 'dpdpa-2026.10.6',
  scoringVersion: 'scoring-2.0.0',
  ...overrides,
});

const directFinding = (): EvidenceLike => ({
  controlCode: secret.code,
  kind: 'violation',
  scanner: 'gitleaks',
  scannerRuleId: 'generic-api-key',
  evidenceHash: 'sha256:2389c7fb2b3b53c985eba440fc8f23bc38c62d4abe0b6f857dc698dd8468f876',
  filePath: 'src/DOMInjection.java',
  lineStart: 63,
  lineEnd: 63,
  fingerprint: 'fp:webgoat:secret',
  severity: 'critical',
  confidence: 'direct',
  status: 'open',
});

describe('evaluateControls', () => {
  it('returns UNKNOWN with no determinable evidence', () => {
    const result = evaluateControls(input()).results[0];
    expect(result).toMatchObject({
      controlCode: secret.code,
      verdict: 'UNKNOWN',
      reasonCode: 'no_determinable_evidence',
      evidence: [],
    });
  });

  it('returns FAIL with cited evidence for a direct violation', () => {
    const result = evaluateControls(input({ findings: [directFinding()] })).results[0];
    expect(result?.verdict).toBe('FAIL');
    expect(result?.reasonCode).toBe('cited_gap');
    expect(result?.evidence[0]?.evidenceHash).toBe(directFinding().evidenceHash);
  });

  it('returns PARTIAL for a single inferred finding and excludes it from FAIL counts', () => {
    const result = evaluateControls(
      input({ findings: [{ ...directFinding(), confidence: 'inferred' }] }),
    );
    expect(result.results[0]?.verdict).toBe('PARTIAL');
    expect(result.openGaps).toBe(0);
  });

  it('returns UNKNOWN detector_unavailable when a required detector failed', () => {
    const result = evaluateControls(
      input({ detectorStatuses: { gitleaks: 'failed' } }),
    ).results[0];
    expect(result?.verdict).toBe('UNKNOWN');
    expect(result?.reasonCode).toBe('detector_unavailable');
  });

  it('stays UNKNOWN when only inferred positive evidence exists and a required detector failed', () => {
    const result = evaluateControls(
      input({
        detectorStatuses: { gitleaks: 'failed', semgrep: 'completed' },
        findings: [
          {
            ...directFinding(),
            scanner: 'semgrep',
            kind: 'positive',
            confidence: 'inferred',
          },
        ],
      }),
    ).results[0];
    expect(result?.verdict).toBe('UNKNOWN');
    expect(result?.reasonCode).toBe('detector_unavailable');
  });

  it('still returns FAIL when a detector failed but another completed detector cited a gap', () => {
    const result = evaluateControls(
      input({
        detectorStatuses: { gitleaks: 'failed', semgrep: 'completed' },
        findings: [{ ...directFinding(), scanner: 'semgrep' }],
      }),
    ).results[0];
    expect(result?.verdict).toBe('FAIL');
  });

  it('returns NOT_APPLICABLE when appliesWhen is false', () => {
    const result = evaluateControls(
      input({ controls: [{ ...secret, appliesWhen: { language: 'ruby' } }] }),
    ).results[0];
    expect(result?.verdict).toBe('NOT_APPLICABLE');
  });

  it('returns UNKNOWN applicability_unavailable when facts are absent', () => {
    const result = evaluateControls(input({ facts: {} })).results[0];
    expect(result?.reasonCode).toBe('applicability_unavailable');
  });

  it('builds detector statuses from scan coverage', () => {
    expect(
      buildDetectorStatuses({ semgrep: 'completed', checkov: 'failed', gitleaks: 'timed_out' }),
    ).toEqual({ semgrep: 'completed', checkov: 'failed', gitleaks: 'timed_out' });
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpdpa/orchestrator test -- control-evaluator.test.ts`  
Expected: FAIL — module missing.

- [x] **Step 3: Implement the evaluator**

```ts
// apps/orchestrator/src/modules/scoring/control-evaluator.ts
import type {
  Confidence,
  Control,
  Mapping,
  Scanner,
  Severity,
} from '../rule-pack/rule-pack.schemas.js';
import { isApplicable, type RepoFacts } from './applicability.js';
import type { FindingStatus } from './mapping.resolver.js';

export type DetectorStatus = 'completed' | 'failed' | 'timed_out' | 'skipped';

export interface EvidenceLike {
  controlCode: string | null;
  kind: 'violation' | 'missing_control' | 'weak_control' | 'positive' | 'unverified';
  scanner?: Scanner | 'inventory';
  scannerRuleId?: string;
  evidenceHash?: string | null;
  filePath?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  fingerprint?: string;
  severity: Severity;
  confidence: Confidence;
  status?: FindingStatus;
}

export type ControlEvidence = EvidenceLike;

export interface EvidenceReferenceLike {
  kind: EvidenceLike['kind'];
  scanner?: EvidenceLike['scanner'];
  scannerRuleId?: string;
  evidenceHash?: string | null;
  filePath?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  fingerprint?: string;
}

export interface ControlResultLike {
  controlCode: string;
  verdict:
    | 'PASS'
    | 'FAIL'
    | 'PARTIAL'
    | 'UNKNOWN'
    | 'NOT_APPLICABLE'
    | 'MANUAL'
    | 'ATTESTED_PASS'
    | 'ATTESTED_FAIL';
  reasonCode: string;
  confidence: Confidence | null;
  evidence: EvidenceReferenceLike[];
  rulePackVersion: string;
  scoringVersion: string;
}

export interface ControlEvaluatorInput {
  controls: readonly Control[];
  facts: RepoFacts;
  mappings: readonly Pick<Mapping, 'scanner' | 'controlCode'>[];
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
  findings: readonly EvidenceLike[];
  rulePackVersion: string;
  scoringVersion: string;
}

export interface ControlEvaluation {
  results: ControlResultLike[];
  byControl: Map<string, ControlResultLike>;
  verdictCounts: Record<ControlResultLike['verdict'], number>;
  unknownControls: string[];
  openGaps: number;
}

interface GroupedEvidence {
  active: EvidenceLike[];
  scanners: Set<string>;
  hasDirect: boolean;
  corroborated: boolean;
}

export function buildDetectorStatuses(
  coverage: Readonly<Record<string, string>>,
): Record<string, DetectorStatus> {
  const statuses: Record<string, DetectorStatus> = {};
  for (const [name, value] of Object.entries(coverage)) {
    if (
      value === 'completed' ||
      value === 'failed' ||
      value === 'timed_out' ||
      value === 'skipped'
    ) {
      statuses[name] = value;
    } else if (value === 'running' || value === 'pending') {
      statuses[name] = 'skipped';
    }
  }
  return statuses;
}

export function evaluateControls(input: ControlEvaluatorInput): ControlEvaluation {
  const results = input.controls.map((control) => evaluateOne(control, input));
  const byControl = new Map(results.map((result) => [result.controlCode, result]));
  const verdictCounts: ControlEvaluation['verdictCounts'] = {
    PASS: 0,
    FAIL: 0,
    PARTIAL: 0,
    UNKNOWN: 0,
    NOT_APPLICABLE: 0,
    MANUAL: 0,
    ATTESTED_PASS: 0,
    ATTESTED_FAIL: 0,
  };
  for (const result of results) verdictCounts[result.verdict] += 1;

  return {
    results,
    byControl,
    verdictCounts,
    unknownControls: results
      .filter((result) => result.verdict === 'UNKNOWN')
      .map((result) => result.controlCode),
    openGaps: results.filter((result) => result.verdict === 'FAIL').length,
  };
}

function evaluateOne(
  control: Control,
  input: ControlEvaluatorInput,
): ControlResultLike {
  const base = {
    controlCode: control.code,
    rulePackVersion: input.rulePackVersion,
    scoringVersion: input.scoringVersion,
  };

  if (factsUnavailable(input.facts)) {
    return { ...base, verdict: 'UNKNOWN', reasonCode: 'applicability_unavailable', confidence: null, evidence: [] };
  }
  if (!isApplicable(control.appliesWhen, input.facts)) {
    return { ...base, verdict: 'NOT_APPLICABLE', reasonCode: 'applies_when_false', confidence: null, evidence: [] };
  }
  if (control.tags.includes('manual-only')) {
    return { ...base, verdict: 'MANUAL', reasonCode: 'manual_only', confidence: null, evidence: [] };
  }

  const grouped = groupEvidence(control.code, input.findings);
  const requiredDetectors = input.mappings
    .filter((mapping) => mapping.controlCode === control.code)
    .map((mapping) => mapping.scanner);
  const unavailable = requiredDetectors.filter(
    (detector) => input.detectorStatuses[detector] !== 'completed',
  );
  const citedFromCompleted = grouped.active.filter(
    (finding) =>
      finding.scanner !== undefined && input.detectorStatuses[finding.scanner] === 'completed',
  );
  const completedScanners = new Set(
    citedFromCompleted.map((finding) => finding.scanner).filter((name): name is string => !!name),
  );
  const determinativeFromCompleted =
    citedFromCompleted.some((finding) => finding.confidence === 'direct') ||
    completedScanners.size >= 2;

  if (unavailable.length > 0 && !determinativeFromCompleted) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      reasonCode: 'detector_unavailable',
      confidence: null,
      evidence: [],
    };
  }

  const violations = grouped.active.filter((finding) => finding.kind === 'violation');
  const weak = grouped.active.filter((finding) => finding.kind === 'weak_control');
  if (violations.length > 0 || weak.length > 0) {
    const candidates = [...violations, ...weak];
    const direct = candidates.some((finding) => finding.confidence === 'direct') || grouped.corroborated;
    const verdict = direct ? 'FAIL' : 'PARTIAL';
    return {
      ...base,
      verdict,
      reasonCode: direct ? 'cited_gap' : 'weak_evidence',
      confidence: grouped.corroborated || candidates.some((f) => f.confidence === 'direct')
        ? 'direct'
        : 'inferred',
      evidence: candidates.map(toEvidenceReference),
    };
  }

  const positives = grouped.active.filter((finding) => finding.kind === 'positive');
  if (positives.length > 0) {
    const direct = positives.some((finding) => finding.confidence === 'direct') || grouped.corroborated;
    return {
      ...base,
      verdict: direct ? 'PASS' : 'PARTIAL',
      reasonCode: direct ? 'positive_evidence' : 'weak_positive_evidence',
      confidence: grouped.corroborated ? 'direct' : positives[0]?.confidence ?? 'inferred',
      evidence: positives.map(toEvidenceReference),
    };
  }

  return {
    ...base,
    verdict: 'UNKNOWN',
    reasonCode: 'no_determinable_evidence',
    confidence: null,
    evidence: [],
  };
}

function factsUnavailable(facts: RepoFacts): boolean {
  const empty = (values: readonly string[] | undefined) =>
    values === undefined || values.length === 0;
  return (
    empty(facts.languages) && empty(facts.frameworks) && empty(facts.resourceTypes)
  );
}

function groupEvidence(controlCode: string, findings: readonly EvidenceLike[]): GroupedEvidence {
  const active = findings.filter(
    (finding) =>
      finding.controlCode === controlCode &&
      finding.status !== 'false_positive' &&
      finding.status !== 'fixed',
  );
  const scanners = new Set(
    active.map((finding) => finding.scanner ?? 'unknown').filter((name) => name !== 'unknown'),
  );
  return {
    active,
    scanners,
    hasDirect: active.some((finding) => finding.confidence === 'direct'),
    corroborated: scanners.size >= 2,
  };
}

function toEvidenceReference(finding: EvidenceLike): EvidenceReferenceLike {
  return {
    kind: finding.kind,
    ...(finding.scanner === undefined ? {} : { scanner: finding.scanner }),
    ...(finding.scannerRuleId === undefined ? {} : { scannerRuleId: finding.scannerRuleId }),
    ...(finding.evidenceHash === undefined ? {} : { evidenceHash: finding.evidenceHash }),
    ...(finding.filePath === undefined ? {} : { filePath: finding.filePath }),
    ...(finding.lineStart === undefined ? {} : { lineStart: finding.lineStart }),
    ...(finding.lineEnd === undefined ? {} : { lineEnd: finding.lineEnd }),
    ...(finding.fingerprint === undefined ? {} : { fingerprint: finding.fingerprint }),
  };
}
```

- [x] **Step 4: Run focused tests**

Run: `pnpm --filter @dpdpa/orchestrator test -- control-evaluator.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/orchestrator/src/modules/scoring/control-evaluator.ts apps/orchestrator/test/control-evaluator.test.ts
git commit -m "feat(scoring): add pure control evaluator"
```

---

### Task 4: Add scoring v2 and version dispatch

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/scoring.v2.ts`
- Modify: `apps/orchestrator/src/modules/scoring/scoring.engine.ts`
- Modify: `apps/orchestrator/test/scoring.engine.test.ts`
- Create: `apps/orchestrator/test/scoring.v2.test.ts`

**Interfaces:**
- Consumes: `ScoreInput`, `ScoreResult`, `DEFAULT_SECTION_WEIGHTS`, `DEFAULT_GRADES` from `./scoring.engine.js`; `ControlResultLike` from `./control-evaluator.js`.
- Produces: `SCORING_V2_VERSION`, `LEGACY_SCORING_VERSION`, `scoringVersionForNewScan(enabled: boolean): string`, `isScoringV2(version: string | null | undefined): boolean`, `ScoreResultV2`, `scoreScanVersioned(input: VersionedScoreInput): VersionedScoreResult`.

- [x] **Step 1: Write the failing v2 tests**

```ts
// apps/orchestrator/test/scoring.v2.test.ts
import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import type { ControlResultLike } from '../src/modules/scoring/control-evaluator.js';
import { scoreScanV2 } from '../src/modules/scoring/scoring.v2.js';

const control = (code: string, section: string, weight: number): Control => ({
  code,
  section,
  title: 'title',
  summary: 'summary',
  obligation: 'obligation',
  legalReference: 'DPDPA',
  severity: 'high',
  weight,
  evidenceStrength: 'direct',
  scored: true,
  appliesWhen: {},
  remediation: 'fix',
  tags: [],
});

const result = (
  controlCode: string,
  verdict: ControlResultLike['verdict'],
  reasonCode = 'test',
): ControlResultLike => ({
  controlCode,
  verdict,
  reasonCode,
  confidence: null,
  evidence: [],
  rulePackVersion: 'dpdpa-2026.10.6',
  scoringVersion: 'scoring-2.0.0',
});

describe('scoreScanV2', () => {
  it('excludes UNKNOWN from the score and reports zero evidence coverage', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      results: [result('DPDPA-8.4-SECRET-01', 'UNKNOWN', 'no_determinable_evidence')],
      coverage: 'full',
    });
    expect(scored.score).toBeNull();
    expect(scored.grade).toBeNull();
    expect(scored.gradeWithheldReason).toBe('insufficient_evidence');
    expect(scored.evidenceCoverage).toBe(0);
    expect(scored.verdictCounts.UNKNOWN).toBe(1);
  });

  it('gives no credit to a FAIL control', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      results: [result('DPDPA-8.4-SECRET-01', 'FAIL', 'cited_gap')],
      coverage: 'full',
    });
    expect(scored.score).toBe(0);
    expect(scored.grade).toBe('F');
    expect(scored.gradeWithheldReason).toBeNull();
    expect(scored.verdictCounts.FAIL).toBe(1);
  });

  it('caps the grade at C when evidence coverage is below 0.75', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [
        control('DPDPA-8.4-SECRET-01', '8(4)', 10),
        control('DPDPA-8.4-ENC-01', '8(4)', 10),
      ],
      facts: { languages: ['java'] },
      results: [
        result('DPDPA-8.4-SECRET-01', 'PASS', 'positive_evidence'),
        result('DPDPA-8.4-ENC-01', 'UNKNOWN', 'no_determinable_evidence'),
      ],
      coverage: 'full',
    });
    expect(scored.score).toBe(100);
    expect(scored.evidenceCoverage).toBe(0.5);
    expect(scored.grade).toBe('C');
  });

  it('withholds the grade when scanner coverage is partial', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      results: [result('DPDPA-8.4-SECRET-01', 'PASS', 'positive_evidence')],
      coverage: 'partial',
    });
    expect(scored.score).toBe(100);
    expect(scored.grade).toBeNull();
    expect(scored.gradeWithheldReason).toBe('partial_coverage');
  });

  it('preserves the legacy false-pass behaviour through version dispatch', async () => {
    const { scoreScanVersioned } = await import('../src/modules/scoring/scoring.engine.js');
    const legacy = scoreScanVersioned({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      scoringVersion: '1.0.0',
    });
    expect(legacy.score).toBe(100);
    expect(legacy.grade).toBe('A');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpdpa/orchestrator test -- scoring.v2.test.ts`  
Expected: FAIL — module missing.

- [x] **Step 3: Implement scoring v2**

```ts
// apps/orchestrator/src/modules/scoring/scoring.v2.ts
import {
  DEFAULT_GRADES,
  DEFAULT_SECTION_WEIGHTS,
  gradeFor,
  round2,
  type ScoreInput,
  type ScoreCounts,
  type ScoreResult,
  type SectionResult,
} from './scoring.engine.js';
import type { ControlResultLike } from './control-evaluator.js';

export interface SectionResultV2 extends SectionResult {
  evidenceCoverage: number | null;
  verdictCounts: Partial<Record<ControlResultLike['verdict'], number>>;
}

export interface ScoreResultV2 extends ScoreResult {
  sections: SectionResultV2[];
  evidenceCoverage: number | null;
  verdictCounts: Record<ControlResultLike['verdict'], number>;
  unknownControls: string[];
  openGaps: number;
  gradeWithheldReason: 'partial_coverage' | 'insufficient_evidence' | null;
}

export interface ScoreInputV2 extends ScoreInput {
  results: readonly ControlResultLike[];
  partialCredit?: number | undefined;
}

export function scoreScanV2(input: ScoreInputV2): ScoreResultV2 {
  const coverage = input.coverage ?? 'full';
  const sectionWeights = input.sectionWeights ?? DEFAULT_SECTION_WEIGHTS;
  const grades = input.grades ?? DEFAULT_GRADES;
  const partialCredit = input.partialCredit ?? 0.5;
  const controlByCode = new Map(input.controls.map((control) => [control.code, control]));
  const verdictCounts: ScoreResultV2['verdictCounts'] = {
    PASS: 0, FAIL: 0, PARTIAL: 0, UNKNOWN: 0, NOT_APPLICABLE: 0,
    MANUAL: 0, ATTESTED_PASS: 0, ATTESTED_FAIL: 0,
  };

  interface Bucket {
    applicable: number;
    scoredWeight: number;
    creditWeight: number;
    determinableWeight: number;
    failedWeight: number;
    verdicts: Partial<Record<ControlResultLike['verdict'], number>>;
  }
  const buckets = new Map<string, Bucket>();

  for (const result of input.results) {
    verdictCounts[result.verdict] += 1;
    const control = controlByCode.get(result.controlCode);
    if (!control || !control.scored) continue;
    const bucket = buckets.get(control.section) ?? {
      applicable: 0,
      scoredWeight: 0,
      creditWeight: 0,
      determinableWeight: 0,
      failedWeight: 0,
      verdicts: {},
    };

    const excluded = result.verdict === 'NOT_APPLICABLE' || result.verdict === 'MANUAL';
    if (!excluded) bucket.applicable += control.weight;
    if (result.verdict === 'MANUAL' || result.verdict === 'NOT_APPLICABLE') {
      buckets.set(control.section, bucket);
      continue;
    }

    bucket.verdicts[result.verdict] = (bucket.verdicts[result.verdict] ?? 0) + 1;
    if (result.verdict === 'UNKNOWN') {
      buckets.set(control.section, bucket);
      continue;
    }

    const attested = result.verdict === 'ATTESTED_PASS' || result.verdict === 'ATTESTED_FAIL';
    const effectiveWeight = attested ? control.weight * 0.5 : control.weight;
    const multiplier = result.confidence === 'direct' || result.confidence === null ? 1 : 0.5;
    const credit =
      result.verdict === 'PASS' || result.verdict === 'ATTESTED_PASS'
        ? 1
        : result.verdict === 'PARTIAL'
          ? partialCredit * multiplier
          : 0;

    bucket.scoredWeight += effectiveWeight;
    bucket.creditWeight += credit * effectiveWeight;
    if (result.verdict === 'FAIL') bucket.failedWeight += control.weight;
    if (!attested) bucket.determinableWeight += control.weight;
    buckets.set(control.section, bucket);
  }

  const sectionCodes = [...new Set(input.controls.map((control) => control.section))];
  const sections: SectionResultV2[] = sectionCodes
    .map((section) => {
      const bucket = buckets.get(section) ?? {
        applicable: 0,
        scoredWeight: 0,
        creditWeight: 0,
        determinableWeight: 0,
        failedWeight: 0,
        verdicts: {},
      };
      const assessed = bucket.scoredWeight > 0;
      return {
        section,
        score: assessed ? round2((100 * bucket.creditWeight) / bucket.scoredWeight) : null,
        applicableWeight: bucket.applicable,
        failedWeight: bucket.failedWeight,
        sectionWeight: sectionWeights[section] ?? 0,
        assessed,
        evidenceCoverage:
          bucket.applicable === 0
            ? null
            : round4(bucket.determinableWeight / bucket.applicable),
        verdictCounts: bucket.verdicts,
      };
    })
    .sort((a, b) => a.section.localeCompare(b.section));

  const sectionScores: Record<string, number | null> = {};
  for (const section of sections) sectionScores[section.section] = section.score;

  let numerator = 0;
  let denominator = 0;
  let coverageNumerator = 0;
  let coverageDenominator = 0;
  for (const section of sections) {
    const weight = section.sectionWeight;
    if (section.assessed) {
      numerator += (section.score ?? 0) * weight;
      denominator += weight;
    }
    // Applicable sections with no determinable verdict still count as zero coverage.
    if (section.evidenceCoverage !== null) {
      coverageNumerator += section.evidenceCoverage * weight;
      coverageDenominator += weight;
    }
  }

  const score = denominator === 0 ? null : round2(numerator / denominator);
  const evidenceCoverage =
    coverageDenominator === 0 ? null : round4(coverageNumerator / coverageDenominator);
  const hasCriticalFail = input.results.some(
    (result) => result.verdict === 'FAIL' && controlByCode.get(result.controlCode)?.severity === 'critical',
  );

  let gradeWithheldReason: ScoreResultV2['gradeWithheldReason'] = null;
  let grade: string | null = null;
  if (coverage === 'partial') {
    gradeWithheldReason = 'partial_coverage';
  } else if (score === null || evidenceCoverage === null || evidenceCoverage < 0.5) {
    gradeWithheldReason = 'insufficient_evidence';
  } else {
    grade = gradeFor(score, grades);
    if (evidenceCoverage < 0.75 && grade !== null && ['A', 'B'].includes(grade)) grade = 'C';
    if (hasCriticalFail && grade !== null && ['A', 'B', 'C'].includes(grade)) grade = 'D';
  }

  return {
    score,
    grade,
    sectionScores,
    sections,
    counts: countFindingsV2(input.findings),
    coverage,
    evidenceCoverage,
    verdictCounts,
    unknownControls: input.results
      .filter((result) => result.verdict === 'UNKNOWN')
      .map((result) => result.controlCode),
    openGaps: verdictCounts.FAIL,
    gradeWithheldReason,
  };
}

function round4(value: number) {
  return Math.round((value + 1e-9) * 10000) / 10000;
}
function countFindingsV2(findings: ScoreInput['findings']): ScoreCounts {
  const counts: ScoreCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: findings.length, mapped: 0, unmapped: 0, acceptedRisk: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
    if (finding.controlCode === null) counts.unmapped += 1;
    else counts.mapped += 1;
    if (finding.status === 'accepted_risk') counts.acceptedRisk += 1;
  }
  return counts;
}
```

- [x] **Step 4: Add the dispatcher to `scoring.engine.ts`**

Add these imports immediately after the existing imports at the top of the file (ES module imports must stay at the top; the cycle is safe because every value imported from `scoring.v2.ts` is used only when `scoreScanVersioned` is called, after module initialisation):

```ts
import { scoreScanV2, type ScoreResultV2 } from './scoring.v2.js';
import type { ControlResultLike } from './control-evaluator.js';
```

Append to the end of the file:

```ts
export const LEGACY_SCORING_VERSION = '1.0.0';
export const SCORING_V2_VERSION = 'scoring-2.0.0';

export function scoringVersionForNewScan(enabled: boolean): string {
  return enabled ? SCORING_V2_VERSION : LEGACY_SCORING_VERSION;
}

export function isScoringV2(version: string | null | undefined): boolean {
  return version === SCORING_V2_VERSION;
}

export interface VersionedScoreInput extends ScoreInput {
  scoringVersion?: string | null;
  results?: readonly ControlResultLike[];
}
export type VersionedScoreResult = ScoreResult | ScoreResultV2;

export function scoreScanVersioned(input: VersionedScoreInput): VersionedScoreResult {
  if (isScoringV2(input.scoringVersion)) {
    if (!input.results) {
      throw new Error('scoring v2 requires control results');
    }
    return scoreScanV2({ ...input, results: input.results });
  }
  return scoreScan(input);
}
```

Keep the existing `scoreScan` body and the legacy test at `scoring.engine.test.ts:104-109` unchanged.

- [x] **Step 5: Run focused tests**

Run: `pnpm --filter @dpdpa/orchestrator test -- scoring.v2.test.ts scoring.engine.test.ts`  
Expected: PASS, including the legacy `100/A` false-pass assertion.

- [x] **Step 6: Commit**

```bash
git add apps/orchestrator/src/modules/scoring/scoring.v2.ts apps/orchestrator/src/modules/scoring/scoring.engine.ts apps/orchestrator/test/scoring.v2.test.ts apps/orchestrator/test/scoring.engine.test.ts
git commit -m "feat(scoring): add version-dispatched scoring v2"
```

---

### Task 5: Wire evaluation, persistence, and feature flag into scan completion

**Files:**
- Modify: `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`
- Modify: `apps/orchestrator/src/modules/scans/scans.module.ts`
- Modify: `apps/orchestrator/src/modules/scans/scans.service.ts`
- Modify: `apps/orchestrator/test/scan-scoring.service.test.ts`
- Modify: `apps/orchestrator/test/scans.service.test.ts`

**Interfaces:**
- Consumes: `FeatureFlagsService.isEnabled(flag: string, fallback?: boolean): boolean`; `evaluateControls`; `scoreScanVersioned`; `scoringVersionForNewScan`.
- Produces: `MapAndScoreResult` gains `evidenceCoverage`, `verdictCounts`, `unknownControls`, `openGaps`, `gradeWithheldReason`; `dpdpa_readiness_v2` feature flag.

- [x] **Step 1: Write failing service tests**

Add `FeatureFlagsService` to the imports at the top of `apps/orchestrator/test/scan-scoring.service.test.ts`:

```ts
import type { FeatureFlagsService } from '../src/modules/feature-flags/feature-flags.service.js';
```

In the existing `make()` helper, add the flag mock and `controlResult` mock, and pass the flag to the service:

```ts
  const flags = {
    isEnabled: vi.fn().mockReturnValue(false),
  };
  const tx = {
    // ...existing scan, scannerFinding, dpdpaRule, ruleMapping mocks...
    controlResult: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  let pack: LoadedRulePack;
  const packService = { load: async () => pack } as unknown as RulePackService;
  const service = new ScanScoringService(
    packService,
    prisma as unknown as PrismaService,
    flags as unknown as FeatureFlagsService,
  );
```

Add `flags` to the object returned by `make()`:

```ts
  return {
    service,
    tx,
    flags,
    updates,
    creates,
    setPack: (loaded: LoadedRulePack) => {
      pack = loaded;
    },
  };
```

Append this test inside the existing `describe` block:

```ts
  it('uses scoring v2 and persists a FAIL control result when the flag is enabled', async () => {
    const harness = make(null, [
      row({
        scanner: 'gitleaks',
        scannerRuleId: 'generic-api-key',
        severity: 'high',
        evidenceHash: 'sha256:webgoat-secret',
        fingerprint: 'fpt_secret',
      }),
    ]);
    harness.setPack(pack);
    harness.flags.isEnabled.mockImplementation((flag: string) => flag === 'dpdpa_readiness_v2');

    const scored = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { gitleaks: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(scored.scoringVersion).toBe('scoring-2.0.0');
    expect(scored.grade).toBe('F');
    expect(scored.gradeWithheldReason).toBeNull();
    expect(scored.verdictCounts.FAIL).toBeGreaterThan(0);
    expect(harness.tx.controlResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scanId_controlId: {
            scanId: SCAN_ID,
            controlId: 'rule-DPDPA-8.4-SECRET-01',
          },
        },
        create: expect.objectContaining({
          controlCode: 'DPDPA-8.4-SECRET-01',
          verdict: 'FAIL',
          reasonCode: 'cited_gap',
        }),
      }),
    );
  });
```

Add to `apps/orchestrator/test/scans.service.test.ts`:

```ts
  it('stores the v2 assessment summary on scan completion', async () => {
    scoring.mapAndScore.mockResolvedValue({
      score: null,
      grade: null,
      sectionScores: {},
      counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
      coverage: 'full',
      rulePackVersion: 'dpdpa-2026.10.6',
      scoringVersion: 'scoring-2.0.0',
      evidenceCoverage: 0,
      verdictCounts: { UNKNOWN: 11, FAIL: 1 },
      unknownControls: [],
      openGaps: 1,
      gradeWithheldReason: 'insufficient_evidence',
      findings: { mapped: 1, unmapped: 0, suppressed: 0, new: 1, persistent: 0, reopened: 0, resolved: 0 },
    });

    await service.complete(orgId, scanId, completeInput);

    expect(scans.update).toHaveBeenCalledWith(
      scanId,
      expect.objectContaining({
        scoringVersion: 'scoring-2.0.0',
        evidenceCoverage: expect.any(Prisma.Decimal),
        gradeWithheldReason: 'insufficient_evidence',
      }),
      expect.anything(),
    );
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dpdpa/orchestrator test -- scan-scoring.service.test.ts scans.service.test.ts`  
Expected: FAIL — new result fields/upsert expectations missing.

- [x] **Step 3: Inject the feature flag**

In `apps/orchestrator/src/modules/scans/scans.module.ts`:

```ts
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';
```

Add `FeatureFlagsModule` to `imports`.

In `ScanScoringService` constructor:

```ts
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';

  constructor(
    private readonly pack: RulePackService,
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}
```

The `make()` helper modified in Step 1 already passes the flag mock. Apply the same third argument to any other direct `new ScanScoringService(pack, prisma)` construction in tests.

- [x] **Step 4: Extend result types and map evidence**

In `scan-scoring.service.ts`, extend `MapAndScoreResult`:

```ts
  evidenceCoverage: number | null;
  verdictCounts: Record<string, number>;
  unknownControls: string[];
  openGaps: number;
  gradeWithheldReason: 'partial_coverage' | 'insufficient_evidence' | null;
```

Add to the loop state:

```ts
    const evidence: ControlEvidence[] = [];
```

Add this helper at file scope:

```ts
function kindFor(finding: MappedFinding): 'violation' | 'unverified' {
  return finding.controlCode === null ? 'unverified' : 'violation';
}
```

After `scored.push(...)` push evidence:

```ts
        evidence.push({
          controlCode: finding.controlCode,
          kind: kindFor(finding),
          scanner: finding.scanner,
          scannerRuleId: finding.scannerRuleId,
          evidenceHash: finding.evidenceHash,
          filePath: finding.filePath,
          lineStart: finding.lineStart,
          lineEnd: finding.lineEnd,
          fingerprint: finding.fingerprint,
          severity: finding.severity,
          confidence: finding.confidence,
          status,
        });
```

Add to the finding `data` object:

```ts
          kind: kindFor(finding),
          detector: finding.scanner,
```

- [x] **Step 5: Evaluate, persist, and dispatch**

Replace the scoring block at `scan-scoring.service.ts:200-208` with:

```ts
    const coverageMode = coverageFor(coverage);
    const scoringVersion = scoringVersionForNewScan(
      this.flags.isEnabled('dpdpa_readiness_v2', false),
    );
    const evaluation = evaluateControls({
      controls: loaded.controls,
      facts,
      mappings: loaded.mappings,
      detectorStatuses: buildDetectorStatuses(coverage),
      findings: evidence,
      rulePackVersion: loaded.pack,
      scoringVersion,
    });

    for (const controlResult of evaluation.results) {
      const controlId = ruleIds.get(controlResult.controlCode);
      if (!controlId) {
        throw new Error(`Missing persisted rule for ${controlResult.controlCode}`);
      }
      await tx.controlResult.upsert({
        where: {
          scanId_controlId: { scanId: scan.id, controlId },
        },
        create: {
          orgId: scan.orgId,
          scanId: scan.id,
          controlId,
          controlCode: controlResult.controlCode,
          verdict: controlResult.verdict,
          reasonCode: controlResult.reasonCode,
          confidence: controlResult.confidence,
          evidence: controlResult.evidence as Prisma.InputJsonValue,
          rulePackVersion: loaded.pack,
          scoringVersion,
        },
        update: {
          verdict: controlResult.verdict,
          reasonCode: controlResult.reasonCode,
          confidence: controlResult.confidence,
          evidence: controlResult.evidence as Prisma.InputJsonValue,
          rulePackVersion: loaded.pack,
          scoringVersion,
        },
      });
    }

    const versioned = scoreScanVersioned({
      findings: scored,
      controls: loaded.controls,
      facts,
      coverage: coverageMode,
      sectionWeights: loaded.sectionWeights,
      grades: loaded.grades,
      scoringVersion,
      results: evaluation.results,
    });
    const v2 = 'evidenceCoverage' in versioned ? versioned : null;
```

In the following `counts` block, replace every `result.counts` with `versioned.counts`:

```ts
    const counts = {
      critical: versioned.counts.critical,
      high: versioned.counts.high,
      medium: versioned.counts.medium,
      low: versioned.counts.low,
      info: versioned.counts.info,
      total: versioned.counts.total,
    };
```

Replace the return block with:

```ts
    return {
      score: versioned.score,
      grade: versioned.grade,
      sectionScores: versioned.sectionScores,
      counts,
      coverage: coverageMode,
      rulePackVersion: loaded.pack,
      scoringVersion,
      evidenceCoverage: v2?.evidenceCoverage ?? null,
      verdictCounts: v2?.verdictCounts ?? {},
      unknownControls: v2?.unknownControls ?? [],
      openGaps: v2?.openGaps ?? 0,
      gradeWithheldReason: v2?.gradeWithheldReason ?? null,
      findings: { ...tally, resolved },
    };
```

Add imports:

```ts
import {
  buildDetectorStatuses,
  evaluateControls,
  type ControlEvidence,
  type ControlResultLike,
} from './control-evaluator.js';
import {
  isScoringV2,
  scoreScanVersioned,
  scoringVersionForNewScan,
} from './scoring.engine.js';
```

Change the existing import of `scoreScan` to `scoreScanVersioned`.

- [x] **Step 6: Dispatch `scorePersisted` by stored version**

Replace `scorePersisted` with:

```ts
  async scorePersisted(
    scan: Scan,
    facts: RepoFacts,
    tx: Prisma.TransactionClient,
    findings?: readonly { controlCode: string | null; severity: Severity; status: FindingStatus }[],
  ) {
    const loaded = await this.pack.load();
    const rows =
      findings ??
      (await tx.scannerFinding.findMany({
        where: { scanId: scan.id },
        select: { controlCode: true, severity: true, status: true },
      }));
    const result = scoreScanVersioned({
      findings: rows,
      controls: loaded.controls,
      facts,
      coverage: coverageFor(scan.coverage),
      sectionWeights: loaded.sectionWeights,
      grades: loaded.grades,
      scoringVersion: scan.scoringVersion,
      results: isScoringV2(scan.scoringVersion)
        ? (await tx.controlResult.findMany({
            where: { scanId: scan.id },
            select: {
              controlCode: true,
              verdict: true,
              reasonCode: true,
              confidence: true,
              evidence: true,
              rulePackVersion: true,
              scoringVersion: true,
            },
          })).map((row) => ({
            controlCode: row.controlCode,
            verdict: row.verdict as ControlResultLike['verdict'],
            reasonCode: row.reasonCode,
            confidence: row.confidence as ControlResultLike['confidence'],
            evidence: (row.evidence as unknown as ControlEvidence[]) ?? [],
            rulePackVersion: row.rulePackVersion,
            scoringVersion: row.scoringVersion,
          }))
        : undefined,
    });
    return { loaded, result };
  }
```

`isScoringV2` and `ControlResultLike` are already included in the imports from Step 5.

- [x] **Step 7: Persist assessment summary in `ScansService.complete`**

In the `scans.update` payload at `scans.service.ts:355-369`, add:

```ts
          evidenceCoverage:
            scored.evidenceCoverage === null
              ? null
              : new Prisma.Decimal(scored.evidenceCoverage),
          verdictCounts: scored.verdictCounts,
          unknownControls: scored.unknownControls,
          gradeWithheldReason: scored.gradeWithheldReason,
```

- [x] **Step 8: Run focused tests**

Run: `pnpm --filter @dpdpa/orchestrator test -- scan-scoring.service.test.ts scans.service.test.ts`  
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add apps/orchestrator/src/modules/scoring/scan-scoring.service.ts apps/orchestrator/src/modules/scans/scans.module.ts apps/orchestrator/src/modules/scans/scans.service.ts apps/orchestrator/test/scan-scoring.service.test.ts apps/orchestrator/test/scans.service.test.ts
git commit -m "feat(scoring): persist v2 control results"
```

---

### Task 6: Expose assessment in scan detail and clean readiness language in shared web logic

**Files:**
- Modify: `apps/orchestrator/src/modules/scans/scans.service.ts`
- Modify: `apps/orchestrator/src/modules/reports/report-template.ts`
- Modify: `apps/orchestrator/src/modules/reports/report-pdf.ts`
- Modify: `apps/orchestrator/test/report-template.test.ts`
- Modify: `apps/orchestrator/test/report-pdf.test.ts`
- Modify: `apps/web/shared/scan.ts`
- Modify: `apps/web/server/utils/fixtures/scans.ts`
- Modify: `apps/web/test/new-scan-screens.test.ts`
- Modify: `apps/web/test/scan.test.ts`
- Modify: `apps/web/test/scorecard.test.ts`
- Create: `apps/web/test/readiness-language.test.ts`
- Modify: `apps/web/app/components/new/NewScanDetail.vue` (minimal withheld-grade banner and grade tile)
- Modify: `apps/web/app/components/scan/SectionBreakdown.vue` (status class keys)
- Modify: `apps/orchestrator/test/internal-scans.controller.test.ts` (detail shape coverage)
- Modify: `apps/orchestrator/test/scans.service.test.ts` (assessment derivation coverage)

**Interfaces:**
- Consumes: `AssessmentSummary` from `@dpdpa/contracts`; `ScanDetail` from `apps/web/shared/scan.ts`.
- Produces: `ScanDetail.assessment`; readiness-only `SectionStatus` values `not_assessed | safeguard_evidence | partial_evidence | gap_evidence`.

- [x] **Step 1: Write failing tests**

Add to `apps/web/test/new-scan-screens.test.ts`:

```ts
  it('shows insufficient evidence with no letter for a v2 silent scan', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_v2',
          status: 'completed',
          score: null,
          grade: null,
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/fx-silent-app', visibility: 'public' },
          ref: '',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: 'scoring-2.0.0',
          assessment: {
            score: null,
            evidenceCoverage: 0,
            openGaps: 0,
            verdictCounts: { UNKNOWN: 12 },
            unknownControls: [],
            detectorStatuses: { gitleaks: 'completed' },
            gradeWithheldReason: 'insufficient_evidence',
            consentGatingRatio: null,
          },
          error: null,
          timestamps: {
            queuedAt: '2026-11-27T05:00:00Z',
            startedAt: '2026-11-27T05:00:10Z',
            completedAt: '2026-11-27T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });
    expect(wrapper.text()).toContain('Insufficient evidence');
    expect(wrapper.text()).toContain('No letter');
    expect(wrapper.text()).not.toContain('Compliant');
    expect(wrapper.text()).not.toContain('Non-compliant');
  });
```

Create `apps/web/test/readiness-language.test.ts`. Assert on **rendered text**, not source text: existing CSS token names such as `status-compliant-bg` are legitimate implementation details and must not fail a copy lint.

```ts
// apps/web/test/readiness-language.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewScanDetail from '../app/components/new/NewScanDetail.vue';
import type { ScanDetail } from '../shared/scan';

const FORBIDDEN = ['compliant', 'non-compliant', 'violation of the act', 'certified'];

const base = {
  id: 'scn_language',
  status: 'completed',
  coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
  repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
  ref: 'main',
  commitSha: null,
  previousScore: null,
  sectionScores: { '8(4)': 0, '6': 82 },
  counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
  scannerVersions: {},
  rulePackVersion: 'dpdpa-2026.10.6',
  error: null,
  timestamps: {
    queuedAt: '2026-11-27T05:00:00Z',
    startedAt: '2026-11-27T05:00:10Z',
    completedAt: '2026-11-27T05:01:00Z',
    durationMs: 50_000,
  },
  links: { findings: '', events: '', report: '' },
} satisfies Partial<ScanDetail>;

const scans = [
  {
    ...base,
    score: 90,
    grade: 'A',
    scoringVersion: '1.0.0',
    assessment: null,
  },
  {
    ...base,
    score: null,
    grade: null,
    scoringVersion: 'scoring-2.0.0',
    assessment: {
      score: null,
      evidenceCoverage: 0,
      openGaps: 0,
      verdictCounts: { UNKNOWN: 12 },
      unknownControls: ['DPDPA-8.4-SECRET-01'],
      detectorStatuses: { gitleaks: 'completed' },
      gradeWithheldReason: 'insufficient_evidence',
      consentGatingRatio: null,
    },
  },
] as unknown as ScanDetail[];

describe('readiness UI language', () => {
  it.each(scans)('renders only readiness wording for scoringVersion $scoringVersion', async (scan) => {
    const wrapper = await mountSuspended(NewScanDetail, { props: { scan } });
    const text = wrapper.text().toLowerCase();
    for (const phrase of FORBIDDEN) {
      expect(text, `forbidden phrase: ${phrase}`).not.toContain(phrase);
    }
  });
});
```

Add to `apps/orchestrator/test/report-template.test.ts`:

```ts
  it('uses readiness-only section status wording', () => {
    const html = renderReportHtml(model());
    expect(html).toContain('Partial evidence');
    expect(html).toContain('Evidence of a gap');
    expect(html.toLowerCase()).not.toContain('compliant');
  });
```

Replace the old assertion in the same file:

```ts
    expect(html).toContain('non-compliant');
```

with:

```ts
    expect(html).toContain('Evidence of a gap');
```

Replace the assertions in `apps/web/test/scan.test.ts`:

```ts
    expect(sectionStatus(100)).toBe('compliant');
    expect(sectionStatus(90)).toBe('compliant');
    expect(sectionStatus(89.9)).toBe('partial');
    expect(sectionStatus(85)).toBe('partial');
    expect(sectionStatus(75)).toBe('partial');
    expect(sectionStatus(68.2)).toBe('non_compliant');
    expect(sectionStatus(null)).toBe('not_assessed');
```

with:

```ts
    expect(sectionStatus(100)).toBe('safeguard_evidence');
    expect(sectionStatus(90)).toBe('safeguard_evidence');
    expect(sectionStatus(89.9)).toBe('partial_evidence');
    expect(sectionStatus(85)).toBe('partial_evidence');
    expect(sectionStatus(75)).toBe('partial_evidence');
    expect(sectionStatus(68.2)).toBe('gap_evidence');
    expect(sectionStatus(null)).toBe('not_assessed');
```

Replace the assertion in `apps/web/test/scorecard.test.ts`:

```ts
    expect(row?.text()).toContain('Non-compliant');
```

with:

```ts
    expect(row?.text()).toContain('Partial evidence');
```

Add to `apps/orchestrator/test/report-pdf.test.ts`:

```ts
  it('uses readiness-only section status wording', async () => {
    const raw = extractText(await pdf());
    expect(raw).toContain('Partial evidence');
    expect(raw.toLowerCase()).not.toContain('compliant');
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/orchestrator test -- internal-scans.controller.test.ts report-template.test.ts report-pdf.test.ts && pnpm --filter @dpdpa/web test -- new-scan-screens.test.ts readiness-language.test.ts scan.test.ts scorecard.test.ts`  
Expected: FAIL — `assessment` missing and forbidden labels present.

- [x] **Step 3: Add assessment to backend detail**

In `toDetail` at `scans.service.ts:649-682`, add:

```ts
    assessment: scan.evidenceCoverage === null && !isScoringV2(scan.scoringVersion)
      ? null
      : {
          score: scan.score === null ? null : Number(scan.score),
          evidenceCoverage:
            scan.evidenceCoverage === null ? null : Number(scan.evidenceCoverage),
          openGaps: Array.isArray(scan.verdictCounts)
            ? 0
            : Number((scan.verdictCounts as Record<string, number>).FAIL ?? 0),
          verdictCounts: (scan.verdictCounts ?? {}) as Record<string, number>,
          unknownControls: (scan.unknownControls ?? []) as string[],
          detectorStatuses: Object.fromEntries(
            Object.entries((scan.coverage ?? {}) as Record<string, string>).map(
              ([scanner, status]) => [scanner, status === 'completed' ? 'completed' : 'skipped'],
            ),
          ),
          gradeWithheldReason: (scan.gradeWithheldReason ?? null) as
            | 'partial_coverage'
            | 'insufficient_evidence'
            | null,
          consentGatingRatio: null,
        },
```

Import `isScoringV2` from `../scoring/scoring.engine.js`.

- [x] **Step 4: Replace section labels in `apps/web/shared/scan.ts`**

Replace lines 125-140 with:

```ts
export type SectionStatus =
  | 'not_assessed'
  | 'safeguard_evidence'
  | 'partial_evidence'
  | 'gap_evidence';

export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
  not_assessed: 'Not assessed by code',
  safeguard_evidence: 'Evidence of a safeguard',
  partial_evidence: 'Partial evidence',
  gap_evidence: 'Evidence of a gap',
};

export function sectionStatus(score: number | null): SectionStatus {
  if (score === null) return 'not_assessed';
  if (score >= 90) return 'safeguard_evidence';
  if (score >= 75) return 'partial_evidence';
  return 'gap_evidence';
}
```

- [x] **Step 5: Update `ScanDetail`**

Add to `ScanDetail` after `scoringVersion`:

```ts
  assessment: {
    score: number | null;
    evidenceCoverage: number | null;
    openGaps: number;
    verdictCounts: Record<string, number>;
    unknownControls: string[];
    detectorStatuses: Record<string, 'completed' | 'failed' | 'timed_out' | 'skipped'>;
    gradeWithheldReason: 'partial_coverage' | 'insufficient_evidence' | null;
    consentGatingRatio: number | null;
  } | null;
```

Add `assessment: null` to every fixture object in `apps/web/server/utils/fixtures/scans.ts` and to the existing test fixture in `new-scan-screens.test.ts`.

- [x] **Step 6: Update `SectionBreakdown.vue` status classes**

Replace `STATUS_CLASSES` and `BAR_CLASSES` with:

```ts
const STATUS_CLASSES: Record<SectionStatus, string> = {
  safeguard_evidence: 'bg-status-compliant-bg text-status-compliant-text border-status-compliant-border',
  partial_evidence: 'bg-status-partial-bg text-status-partial-text border-status-partial-border',
  gap_evidence: 'bg-status-noncompliant-bg text-status-noncompliant-text border-status-noncompliant-border',
  not_assessed: 'bg-status-na-bg text-status-na-text border-status-na-border',
};

const BAR_CLASSES: Record<SectionStatus, string> = {
  safeguard_evidence: 'bg-status-compliant-text',
  partial_evidence: 'bg-status-partial-text',
  gap_evidence: 'bg-status-noncompliant-text',
  not_assessed: 'bg-transparent',
};
```

The token names are existing CSS variables; only user-facing labels changed.

- [x] **Step 7: Replace report/export section status wording**

In both `apps/orchestrator/src/modules/reports/report-template.ts` and `apps/orchestrator/src/modules/reports/report-pdf.ts`, replace the section-status helper with:

```ts
function sectionStatus(score: number | null): string {
  if (score === null) return 'not assessed';
  if (score >= 90) return 'evidence of a safeguard';
  if (score >= 75) return 'partial evidence';
  return 'evidence of a gap';
}
```

Keep HTML escaping in `report-template.ts` and PDFKit text calls in `report-pdf.ts` unchanged. The report title, disclaimer, and v1 methodology text remain unchanged.

- [x] **Step 8: Run focused tests**

Run: `pnpm --filter @dpdpa/orchestrator test -- internal-scans.controller.test.ts report-template.test.ts report-pdf.test.ts && pnpm --filter @dpdpa/web test -- new-scan-screens.test.ts readiness-language.test.ts scan.test.ts scorecard.test.ts`  
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add apps/orchestrator/src/modules/scans/scans.service.ts apps/orchestrator/src/modules/reports/report-template.ts apps/orchestrator/src/modules/reports/report-pdf.ts apps/orchestrator/test/internal-scans.controller.test.ts apps/orchestrator/test/scans.service.test.ts apps/orchestrator/test/report-template.test.ts apps/orchestrator/test/report-pdf.test.ts apps/web/shared/scan.ts apps/web/server/utils/fixtures/scans.ts apps/web/app/components/new/NewScanDetail.vue apps/web/app/components/scan/SectionBreakdown.vue apps/web/test/new-scan-screens.test.ts apps/web/test/readiness-language.test.ts apps/web/test/scan.test.ts apps/web/test/scorecard.test.ts docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-a.md
git commit -m "feat(api): expose assessment summary and readiness labels"
```

---

### Task 7: Install Motion for Vue and add the motion foundation

**Files:**
- Modify: `apps/web/package.json` and `pnpm-lock.yaml` via pnpm
- Modify: `apps/web/nuxt.config.ts`
- Modify: `apps/web/app/assets/css/main.css`
- Create: `apps/web/app/composables/useReadinessMotion.ts`
- Create: `apps/web/test/readiness-motion.test.ts`

**Interfaces:**
- Consumes: Motion Vue docs — install `motion-v`, add `motion-v/nuxt`, use `useReducedMotion` from `motion-v`.
- Produces: `useReadinessMotion(): { reduceMotion: Ref<boolean>; enter: ComputedRef<Record<string, unknown>>; subtle: ComputedRef<Record<string, unknown>> }`.

**Verified sources:**
- https://motion.dev/docs/vue — `npm install motion-v`; Nuxt module `motion-v/nuxt`.
- https://motion.dev/docs/vue-motion-component — `motion` components, `initial`, `animate`, `whileHover`, `whileInView`, `AnimatePresence`.
- https://motion.dev/docs/vue-scroll-animations — `whileInView` with `inViewOptions.once`.
- https://motion.dev/docs/vue-use-reduced-motion — `useReducedMotion()` returns a reactive boolean and responds to changes.
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion — OS-level reduced-motion preference.

- [x] **Step 1: Write the failing test**

```ts
// apps/web/test/readiness-motion.test.ts
import { describe, expect, it } from 'vitest';
import { ENTER_MOTION, SUBTLE_MOTION } from '../app/composables/useReadinessMotion';

describe('readiness motion vocabulary', () => {
  it('uses transform/opacity only for entry motion', () => {
    expect(ENTER_MOTION).toEqual({ opacity: 1, y: 0 });
  });

  it('uses a short spring for subtle interactions', () => {
    expect(SUBTLE_MOTION).toEqual({ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 });
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpdpa/web test -- readiness-motion.test.ts`  
Expected: FAIL — module missing.

- [x] **Step 3: Install and configure Motion**

Run from repository root:

```bash
pnpm --filter @dpdpa/web add motion-v
```

Verify `apps/web/package.json` now contains `"motion-v"` and the lockfile is updated. Do not install any premium UI pack.

Modify `apps/web/nuxt.config.ts`:

```ts
  modules: ['nuxt-security', '@nuxt/ui', 'nuxt-auth-utils', 'motion-v/nuxt'],
```

Add to `apps/web/app/assets/css/main.css` after the existing motion vocabulary block:

```css
  --motion-enter-y: 10px;
  --motion-hover-lift: -2px;
  --motion-focus-ring: var(--color-brand-500);
```

Extend the existing reduced-motion block so it also covers `scroll-behavior` (already present) and any new `.motion-*` classes added in later tasks:

```css
  .motion-enter,
  .motion-hover,
  .motion-scroll-reveal {
    animation: none !important;
    transition: none !important;
    transform: none !important;
    opacity: 1 !important;
    filter: none !important;
  }
```

- [x] **Step 4: Implement the composable**

```ts
// apps/web/app/composables/useReadinessMotion.ts
import { useReducedMotion } from 'motion-v';
import { computed, type ComputedRef, type Ref } from 'vue';

export const ENTER_MOTION = { opacity: 1, y: 0 } as const;
export const SUBTLE_MOTION = { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 } as const;

export function useReadinessMotion(): {
  reduceMotion: Ref<boolean>;
  enter: ComputedRef<Record<string, unknown>>;
  subtle: ComputedRef<Record<string, unknown>>;
} {
  const reduceMotion = useReducedMotion();
  const enter = computed<Record<string, unknown>>(() => ({
    initial: reduceMotion.value ? false : { opacity: 0, y: 10 },
    animate: reduceMotion.value ? false : ENTER_MOTION,
    transition: reduceMotion.value ? { duration: 0 } : SUBTLE_MOTION,
  }));
  const subtle = computed<Record<string, unknown>>(() =>
    reduceMotion.value ? { duration: 0 } : SUBTLE_MOTION,
  );
  return { reduceMotion, enter, subtle };
}
```

Import the composable explicitly in components; do not rely on Nuxt auto-import in tests.

- [x] **Step 5: Run focused tests and typecheck**

Run: `pnpm --filter @dpdpa/web test -- readiness-motion.test.ts && pnpm --filter @dpdpa/web typecheck`  
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/nuxt.config.ts apps/web/app/assets/css/main.css apps/web/app/composables/useReadinessMotion.ts apps/web/test/readiness-motion.test.ts
git commit -m "feat(ui): add motion-v foundation"
```

---

### Task 8: Add curated pro motion primitives

**Files:**
- Create: `apps/web/app/components/motion/palette.ts`
- Create: `apps/web/app/components/motion/MotionTextReveal.vue`
- Create: `apps/web/app/components/motion/MetricTile.vue`
- Create: `apps/web/app/components/motion/ScrollReveal.vue`
- Create: `apps/web/app/components/motion/CommandPalette.vue`
- Create: `apps/web/app/components/motion/HoverCard.vue`
- Create: `apps/web/test/motion-primitives.test.ts`

**Interfaces:**
- Consumes: `motion`, `AnimatePresence`, `useReducedMotion` from `motion-v`; `useId` from Vue. The command palette emits navigation; the composed page uses Nuxt `navigateTo`.
- Produces: reusable Vue components with props documented below.

**Curated pattern sources:**
- Animmaster Lib scroll/background/text/hover effects: https://animmasterlib.dev/ (free/public gallery patterns only).
- Skiper UI command palette, image reveal, animated tabs, and one-file component idea: https://skiper-ui.com/ and https://skiper-ui.com/docs/quick-start (no paid source).
- Vengeance UI hover effects, animated tooltips, and scroll-driven layouts: https://www.vengenceui.com/ (free/public patterns only).
- Motion Primitives documented Text Effect/Animated Number/In View/Cursor/Spotlight patterns: https://motion-primitives.com/docs/text-effect and https://github.com/ibelick/motion-primitives (MIT; patterns ported independently to Vue).
- Motion for Vue: https://motion.dev/docs/vue-motion-component, https://motion.dev/docs/vue-scroll-animations, https://motion.dev/docs/vue-use-reduced-motion.

- [ ] **Step 1: Write failing component tests**

```ts
// apps/web/test/motion-primitives.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import CommandPalette from '../app/components/motion/CommandPalette.vue';
import MetricTile from '../app/components/motion/MetricTile.vue';
import MotionTextReveal from '../app/components/motion/MotionTextReveal.vue';

describe('motion primitives', () => {
  it('renders a metric tile with text, not emoji icons', async () => {
    const wrapper = await mountSuspended(MetricTile, {
      props: { label: 'Evidence coverage', value: '0%', caption: 'No determinable evidence' },
    });
    expect(wrapper.text()).toContain('Evidence coverage');
    expect(wrapper.text()).toContain('0%');
    expect(wrapper.find('[data-testid="metric-tile"]').exists()).toBe(true);
  });

  it('renders readiness text without forbidden language', async () => {
    const wrapper = await mountSuspended(MotionTextReveal, {
      props: { text: 'Insufficient evidence — no letter', as: 'p' },
    });
    expect(wrapper.text()).toContain('Insufficient evidence');
    expect(wrapper.text()).not.toContain('Compliant');
  });

  it('supports keyboard navigation in the command palette', async () => {
    const wrapper = await mountSuspended(CommandPalette, {
      props: {
        open: true,
        items: [
          { id: 'scans', label: 'Scans', href: '/app/scans' },
          { id: 'rules', label: 'Rules', href: '/app/rules' },
        ],
      },
    });
    const input = wrapper.find('input');
    expect(input.exists()).toBe(true);
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('navigate')?.[0]).toEqual([{ id: 'rules', label: 'Rules', href: '/app/rules' }]);
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test -- motion-primitives.test.ts`  
Expected: FAIL — components missing.

- [ ] **Step 3: Implement `MotionTextReveal.vue`**

```vue
<!-- apps/web/app/components/motion/MotionTextReveal.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { motion, useReducedMotion } from 'motion-v';

const props = withDefaults(
  defineProps<{ text: string; as?: 'h1' | 'h2' | 'p'; delay?: number; id?: string }>(),
  { as: 'p', delay: 0, id: undefined },
);

const reduceMotion = useReducedMotion();
const words = computed(() => props.text.split(' '));
const variants = computed(() =>
  reduceMotion.value
    ? {}
    : {
        hidden: { opacity: 0, y: 8, filter: 'blur(4px)' },
        visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
      },
);
</script>

<template>
  <motion.h1
    v-if="as === 'h1'"
    :id="id"
    class="text-ink-900"
    :initial="reduceMotion ? false : 'hidden'"
    animate="visible"
    :variants="variants"
    :aria-label="text"
  >
    <motion.span
      v-for="(word, index) in words"
      :key="index"
      :variants="variants"
      :custom="index"
      :transition="{ delay: reduceMotion ? 0 : props.delay + index * 0.04, duration: 0.24 }"
      class="inline-block"
    >{{ word }}&nbsp;</motion.span>
  </motion.h1>
  <motion.h2
    v-else-if="as === 'h2'"
    :id="id"
    class="text-ink-900"
    :initial="reduceMotion ? false : 'hidden'"
    animate="visible"
    :variants="variants"
    :aria-label="text"
  >
    <motion.span
      v-for="(word, index) in words"
      :key="index"
      :variants="variants"
      :custom="index"
      :transition="{ delay: reduceMotion ? 0 : props.delay + index * 0.04, duration: 0.24 }"
      class="inline-block"
    >{{ word }}&nbsp;</motion.span>
  </motion.h2>
  <motion.p
    v-else
    :id="id"
    class="text-ink-500"
    :initial="reduceMotion ? false : 'hidden'"
    animate="visible"
    :variants="variants"
    :aria-label="text"
  >
    <motion.span
      v-for="(word, index) in words"
      :key="index"
      :variants="variants"
      :custom="index"
      :transition="{ delay: reduceMotion ? 0 : props.delay + index * 0.04, duration: 0.24 }"
      class="inline-block"
    >{{ word }}&nbsp;</motion.span>
  </motion.p>
</template>
```

- [ ] **Step 4: Implement `MetricTile.vue`**

```vue
<!-- apps/web/app/components/motion/MetricTile.vue -->
<script setup lang="ts">
import { motion, useReducedMotion } from 'motion-v';

const reduceMotion = useReducedMotion();

withDefaults(
  defineProps<{
    label: string;
    value: string;
    caption: string;
    tone?: 'neutral' | 'warning' | 'gap';
    testId?: string;
  }>(),
  { tone: 'neutral', testId: 'metric-tile' },
);

const TONE_CLASS = {
  neutral: 'border-ink-200',
  warning: 'border-status-partial-border',
  gap: 'border-status-noncompliant-border',
} as const;
</script>

<template>
  <motion.div
    :data-testid="testId"
    class="motion-enter bg-surface min-w-0 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)]"
    :class="TONE_CLASS[tone]"
    :initial="reduceMotion ? false : { opacity: 0, y: 10 }"
    :animate="reduceMotion ? false : { opacity: 1, y: 0 }"
    :transition="reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }"
    :whileHover="reduceMotion ? undefined : { y: -2 }"
  >
    <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">{{ label }}</p>
    <p class="text-ink-900 mt-2 text-2xl font-semibold tabular-nums">{{ value }}</p>
    <p class="text-ink-500 mt-1 text-xs">{{ caption }}</p>
  </motion.div>
</template>
```

- [ ] **Step 5: Implement `ScrollReveal.vue`**

```vue
<!-- apps/web/app/components/motion/ScrollReveal.vue -->
<script setup lang="ts">
import { motion, useReducedMotion } from 'motion-v';

const reduceMotion = useReducedMotion();
</script>

<template>
  <motion.div
    class="motion-scroll-reveal"
    :initial="reduceMotion ? false : { opacity: 0, y: 12 }"
    :whileInView="reduceMotion ? undefined : { opacity: 1, y: 0 }"
    :inViewOptions="{ once: true, amount: 0.2 }"
    :transition="{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }"
  >
    <slot />
  </motion.div>
</template>
```

- [ ] **Step 6a: Add the shared palette item type**

```ts
// apps/web/app/components/motion/palette.ts
export interface PaletteItem {
  id: string;
  label: string;
  href: string;
  hint?: string;
}
```

- [ ] **Step 6b: Implement `CommandPalette.vue`**

```vue
<!-- apps/web/app/components/motion/CommandPalette.vue -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { AnimatePresence, motion, useReducedMotion } from 'motion-v';
import type { PaletteItem } from './palette';

const props = defineProps<{ open: boolean; items: readonly PaletteItem[] }>();
const emit = defineEmits<{ close: []; navigate: [item: PaletteItem] }>();
const reduceMotion = useReducedMotion();
const query = ref('');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);

const filtered = computed(() => {
  const term = query.value.trim().toLowerCase();
  return term === ''
    ? props.items
    : props.items.filter((item) => `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(term));
});

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      query.value = '';
      active.value = 0;
      return;
    }
    await nextTick();
    input.value?.focus();
  },
);

function move(delta: number): void {
  const count = filtered.value.length;
  if (count === 0) return;
  active.value = (active.value + delta + count) % count;
}

function choose(item: PaletteItem | undefined): void {
  if (!item) return;
  emit('navigate', item);
  emit('close');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    choose(filtered.value[active.value]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}
</script>

<template>
  <AnimatePresence>
    <motion.div
      v-if="props.open"
      class="bg-overlay fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]"
      :initial="reduceMotion ? false : { opacity: 0 }"
      :animate="reduceMotion ? false : { opacity: 1 }"
      :exit="reduceMotion ? undefined : { opacity: 0 }"
      role="presentation"
      @click.self="emit('close')"
    >
      <motion.div
        class="bg-surface border-ink-200 w-full max-w-xl rounded-[var(--radius-card)] border shadow-[var(--shadow-popover)]"
        :initial="reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }"
        :animate="reduceMotion ? false : { opacity: 1, y: 0, scale: 1 }"
        :exit="reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref="input"
          v-model="query"
          class="border-ink-200 focus-visible:ring-brand-500 w-full rounded-t-[var(--radius-card)] border-b bg-transparent px-4 py-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          type="text"
          placeholder="Search pages"
          aria-label="Search pages"
          aria-controls="palette-results"
          @keydown="onKeydown"
        />
        <ul id="palette-results" role="listbox" class="max-h-72 overflow-auto p-2">
          <li
            v-for="(item, index) in filtered"
            :key="item.id"
            role="option"
            :aria-selected="index === active"
            class="focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-3 py-2 text-sm"
            :class="index === active ? 'bg-ink-100' : ''"
            @mouseenter="active = index"
            @click="choose(item)"
          >
            <span class="text-ink-800">{{ item.label }}</span>
            <span v-if="item.hint" class="text-ink-400 ml-2 text-xs">{{ item.hint }}</span>
          </li>
        </ul>
      </motion.div>
    </motion.div>
  </AnimatePresence>
</template>
```

The palette is navigation-agnostic: it emits `navigate` and `close`; the composed page performs the Nuxt navigation.

- [ ] **Step 7: Implement `HoverCard.vue`**

```vue
<!-- apps/web/app/components/motion/HoverCard.vue -->
<script setup lang="ts">
import { ref, useId } from 'vue';
import { AnimatePresence, motion, useReducedMotion } from 'motion-v';

withDefaults(defineProps<{ label: string; detail: string; side?: 'top' | 'bottom' }>(), {
  side: 'top',
});
const show = ref(false);
const id = useId();
const reduceMotion = useReducedMotion();
</script>

<template>
  <span class="relative inline-flex">
    <motion.span
      class="focus-visible:ring-brand-500 rounded-[var(--radius-control)]"
      tabindex="0"
      :aria-describedby="show ? id : undefined"
      :while-hover="reduceMotion ? undefined : { y: -2 }"
      :while-focus="reduceMotion ? undefined : { y: -2 }"
      @mouseenter="show = true"
      @mouseleave="show = false"
      @focus="show = true"
      @blur="show = false"
    >
      <slot />
    </motion.span>
    <AnimatePresence>
      <motion.span
        v-if="show"
        :id="id"
        role="tooltip"
        class="bg-surface-raised border-ink-200 absolute left-1/2 z-40 w-56 -translate-x-1/2 rounded-[var(--radius-control)] border p-2 text-xs shadow-[var(--shadow-popover)]"
        :class="side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'"
        :initial="reduceMotion ? false : { opacity: 0, y: side === 'top' ? 4 : -4 }"
        :animate="reduceMotion ? false : { opacity: 1, y: 0 }"
        :exit="reduceMotion ? undefined : { opacity: 0 }"
      >
        <strong class="text-ink-800 block font-semibold">{{ label }}</strong>
        <span class="text-ink-500 mt-1 block">{{ detail }}</span>
      </motion.span>
    </AnimatePresence>
  </span>
</template>
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @dpdpa/web test -- motion-primitives.test.ts && pnpm --filter @dpdpa/web typecheck`  
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/components/motion apps/web/test/motion-primitives.test.ts
git commit -m "feat(ui): add pro motion primitives for Nuxt"
```

---

### Task 9: Compose the assessment UI with legacy badge and could-not-determine panel

**Files:**
- Modify: `apps/web/app/components/new/NewScanDetail.vue`
- Modify: `apps/web/app/components/dashboard/ScoreRing.vue`
- Modify: `apps/web/app/components/scan/ScoreCard.vue`
- Modify: `apps/web/app/components/scan/CoverageBanner.vue`
- Modify: `apps/web/test/new-scan-screens.test.ts`

**Interfaces:**
- Consumes: `ScanDetail.assessment`, `MetricTile`, `MotionTextReveal`, `ScrollReveal`, `HoverCard`, `CommandPalette`.
- Produces: four headline tiles, legacy badge, “Could not determine” panel, command palette entry point.

- [ ] **Step 1: Add failing assertions**

Append to `apps/web/test/new-scan-screens.test.ts`:

```ts
  it('adds four assessment tiles and a legacy badge for old scoring', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_v1',
          status: 'completed',
          score: 90,
          grade: 'A',
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/legacy-repo', visibility: 'public' },
          ref: 'main',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: '1.0.0',
          assessment: null,
          error: null,
          timestamps: {
            queuedAt: '2026-11-27T05:00:00Z',
            startedAt: '2026-11-27T05:00:10Z',
            completedAt: '2026-11-27T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });
    const text = wrapper.text();
    expect(text).toContain('Legacy scoring: no evidence was treated as pass');
    expect(text).toContain('Evidence coverage');
    expect(text).toContain('Open gaps');
    expect(text).toContain('Could not determine');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/web test -- new-scan-screens.test.ts`  
Expected: FAIL — tiles/badge/panel absent.

- [ ] **Step 3: Update `ScoreRing.vue`**

Replace `shownGrade` logic:

```ts
const shownGrade = computed(() => {
  if (props.coverage.state === 'partial') return null;
  if (props.grade === null) return null;
  return props.grade;
});
```

Add a prop:

```ts
    reason?: 'partial_coverage' | 'insufficient_evidence' | null;
```

with default `null`, and replace the grade paragraph block:

```vue
       <p v-if="shownGrade" class="mt-1 text-lg font-semibold">grade {{ shownGrade }}</p>
       <p v-else-if="reason === 'insufficient_evidence'" class="text-ink-500 mt-1 text-sm">
         Insufficient evidence · no letter
       </p>
       <p v-else class="text-ink-500 mt-1 text-sm">grade withheld</p>
```

- [ ] **Step 4: Update `CoverageBanner.vue`**

Add prop:

```ts
    evidenceNote?: string | null;
```

Render the extra note:

```vue
      <span v-if="evidenceNote" class="mt-1 block">{{ evidenceNote }}</span>
```

- [ ] **Step 5: Update `ScoreCard.vue`**

Add `legacy?: boolean` prop with default `false`. Add before the score:

```vue
    <p
      v-if="legacy"
      data-testid="legacy-scoring-badge"
      class="bg-status-partial-bg text-status-partial-text border-status-partial-border mb-3 inline-flex rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs"
    >
      Legacy scoring: no evidence was treated as pass
    </p>
```

- [ ] **Step 6: Compose `NewScanDetail.vue`**

Add imports:

```ts
import { navigateTo } from '#app';
import CommandPalette from '~/components/motion/CommandPalette.vue';
import HoverCard from '~/components/motion/HoverCard.vue';
import MetricTile from '~/components/motion/MetricTile.vue';
import MotionTextReveal from '~/components/motion/MotionTextReveal.vue';
import ScrollReveal from '~/components/motion/ScrollReveal.vue';
```

Add state and computed values:

```ts
const paletteOpen = ref(false);
const legacy = computed(() => props.scan?.scoringVersion !== 'scoring-2.0.0');
const assessment = computed(() => props.scan?.assessment ?? null);
const evidenceCoverage = computed(() => {
  const value = assessment.value?.evidenceCoverage;
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
});
const openGaps = computed(() => assessment.value?.openGaps ?? 0);
const unknownCount = computed(() => assessment.value?.unknownControls.length ?? 0);
const gradeReason = computed(() => assessment.value?.gradeWithheldReason ?? null);

async function onPaletteNavigate(item: { href: string }): Promise<void> {
  await navigateTo(item.href);
}
```

Add the palette trigger inside `DashboardPageHeader` actions:

```vue
          <button
            type="button"
            class="border-ink-300 rounded-[var(--radius-control)] cursor-pointer border px-3 py-1.5 text-sm"
            data-action="open-command-palette"
            aria-haspopup="dialog"
            @click="paletteOpen = true"
          >
            Quick actions
          </button>
```

Replace the score section with:

```vue
       <section
         class="bg-surface grid gap-5 rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
       >
         <ScoreRing
           :score="scan.score"
           :grade="scan.grade"
           :coverage="coverage"
           :reason="gradeReason"
         />
         <div>
           <CoverageBanner
             v-if="coverage.note"
             :note="coverage.note"
             :evidence-note="gradeReason === 'insufficient_evidence' ? 'Insufficient evidence for a letter grade.' : null"
           />
           <ScoreCard
             v-else
             :scan-id="scan.id"
             :score="scan.score"
             :grade="scan.grade"
             :previous-score="scan.previousScore"
             :coverage="coverage.state"
             :coverage-note="coverage.note"
             :counts="scan.counts"
             :legacy="legacy"
           />
           <SeverityBar :counts="scan.counts" class="mt-5" />
         </div>
       </section>

       <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
         <MetricTile label="Score" :value="scan.score === null ? '—' : scan.score.toFixed(1)" caption="Readiness score" />
         <MetricTile
           label="Evidence coverage"
           :value="evidenceCoverage"
           :caption="legacy ? 'Legacy scoring: no evidence coverage' : 'Weight of determinable controls'"
           :tone="assessment && assessment.evidenceCoverage !== null && assessment.evidenceCoverage < 0.5 ? 'warning' : 'neutral'"
           test-id="evidence-coverage-tile"
         />
         <MetricTile
           label="Open gaps"
           :value="String(openGaps)"
           caption="Cited evidence of a gap"
           :tone="openGaps > 0 ? 'gap' : 'neutral'"
           test-id="open-gaps-tile"
         />
         <MetricTile
           label="Consent gating"
           :value="assessment?.consentGatingRatio === null || assessment?.consentGatingRatio === undefined ? '—' : `${Math.round(assessment.consentGatingRatio * 100)}%`"
           :caption="`${unknownCount} controls could not be determined`"
           test-id="consent-gating-tile"
         />
       </div>

       <ScrollReveal>
         <section
           class="bg-surface mt-6 rounded-[var(--radius-card)] border border-[var(--color-status-partial-border)] p-4"
           aria-labelledby="unknown-heading"
         >
           <MotionTextReveal
             id="unknown-heading"
             as="h2"
             text="Could not determine"
             class="text-ink-900 text-sm font-semibold"
           />
           <p class="text-ink-500 mt-2 text-sm">
             These controls need evidence the code scan could not determine. Add a detector, provide
             documentation, or verify manually. Unknown controls never become evidence of a safeguard.
           </p>
           <div class="mt-3 flex flex-wrap gap-2">
             <HoverCard
               v-for="code in unknownCount > 0 ? assessment!.unknownControls : ['No control codes recorded']"
               :key="code"
               label="Could not determine"
               detail="This control has no determinable code evidence in this scan."
             >
               <span class="border-ink-200 rounded-[var(--radius-pill)] border px-2 py-0.5 font-mono text-xs">{{ code }}</span>
             </HoverCard>
           </div>
         </section>
       </ScrollReveal>

       <CommandPalette
         :open="paletteOpen"
         :items="[
           { id: 'findings', label: 'Findings', href: `/app/scans/${scan.id}/findings` },
           { id: 'coverage', label: 'Coverage', href: `/app/scans/${scan.id}/coverage` },
           { id: 'remediation', label: 'Remediation', href: `/app/scans/${scan.id}/remediation` },
           { id: 'rules', label: 'Rules', href: '/app/rules' },
         ]"
         @navigate="onPaletteNavigate"
         @close="paletteOpen = false"
       />
```

- [ ] **Step 7: Run focused tests**

Run: `pnpm --filter @dpdpa/web test -- new-scan-screens.test.ts motion-primitives.test.ts readiness-language.test.ts`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/components/new/NewScanDetail.vue apps/web/app/components/dashboard/ScoreRing.vue apps/web/app/components/scan/ScoreCard.vue apps/web/app/components/scan/CoverageBanner.vue apps/web/app/components/motion/MotionTextReveal.vue apps/web/test/new-scan-screens.test.ts
git commit -m "feat(ui): compose evidence coverage assessment view"
```

---

### Task 10: Add the fx-silent-app fixture and Phase A exit-gate tests

**Files:**
- Create: `tests/golden-repos/fx-silent-app/manifest.yaml`
- Create: `tests/golden-repos/fx-silent-app/README.md`
- Create: `apps/orchestrator/test/phase-a-exit-gate.test.ts`

**Interfaces:**
- Consumes: `goldenManifestSchema` from `@dpdpa/contracts`; `loadRulePack`; `evaluateControls`; `scoreScanV2`.
- Produces: automated silent-repository gate; manual WebGoat smoke checklist.

- [ ] **Step 1: Write the failing exit-gate test**

```ts
// apps/orchestrator/test/phase-a-exit-gate.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { goldenManifestSchema } from '@dpdpa/contracts';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';
import { buildDetectorStatuses, evaluateControls } from '../src/modules/scoring/control-evaluator.js';
import { scoreScanV2 } from '../src/modules/scoring/scoring.v2.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const packDir = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));

describe('Phase A exit gate', () => {
  it('fx-silent-app shows insufficient evidence and no letter', async () => {
    const manifest = goldenManifestSchema.parse(
      parse(readFileSync(`${root}tests/golden-repos/fx-silent-app/manifest.yaml`, 'utf8')),
    );
    const pack = await loadRulePack(packDir);
    const evaluation = evaluateControls({
      controls: pack.controls,
      facts: {
        languages: manifest.languages,
        frameworks: [],
        resourceTypes: [],
      },
      mappings: pack.mappings,
      detectorStatuses: buildDetectorStatuses(
        Object.fromEntries(manifest.scanners.map((scanner) => [scanner, 'completed'])),
      ),
      findings: [],
      rulePackVersion: pack.pack,
      scoringVersion: 'scoring-2.0.0',
    });
    const scored = scoreScanV2({
      findings: [],
      controls: pack.controls,
      facts: { languages: manifest.languages },
      coverage: 'full',
      results: evaluation.results,
    });

    expect(scored.score).toBeNull();
    expect(scored.grade).toBeNull();
    expect(scored.gradeWithheldReason).toBe('insufficient_evidence');
    expect(scored.unknownControls.length).toBeGreaterThan(0);
  });

  it('a WebGoat-like direct secret finding produces a gap and no A grade', async () => {
    const pack = await loadRulePack(packDir);
    const control = pack.controls.find((item) => item.code === 'DPDPA-8.4-SECRET-01');
    expect(control).toBeDefined();

    const evaluation = evaluateControls({
      controls: [control!],
      facts: { languages: ['java'] },
      mappings: pack.mappings,
      detectorStatuses: { gitleaks: 'completed' },
      findings: [
        {
          controlCode: 'DPDPA-8.4-SECRET-01',
          kind: 'violation',
          scanner: 'gitleaks',
          scannerRuleId: 'generic-api-key',
          evidenceHash:
            'sha256:2389c7fb2b3b53c985eba440fc8f23bc38c62d4abe0b6f857dc698dd8468f876',
          filePath: 'src/main/java/org/owasp/webgoat/DOMInjection.java',
          lineStart: 63,
          lineEnd: 63,
          fingerprint: 'fixture:webgoat:generic-api-key',
          severity: 'critical',
          confidence: 'direct',
          status: 'open',
        },
      ],
      rulePackVersion: pack.pack,
      scoringVersion: 'scoring-2.0.0',
    });
    const scored = scoreScanV2({
      findings: [],
      controls: [control!],
      facts: { languages: ['java'] },
      coverage: 'full',
      results: evaluation.results,
    });

    expect(evaluation.results[0]?.verdict).toBe('FAIL');
    expect(scored.score).toBe(0);
    expect(scored.grade).toBe('F');
    expect(scored.grade).not.toBe('A');
    expect(scored.gradeWithheldReason).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-a-exit-gate.test.ts`  
Expected: FAIL — fixture missing.

- [ ] **Step 3: Add the fixture**

```yaml
# tests/golden-repos/fx-silent-app/manifest.yaml
name: fx-silent-app
languages:
  - python
scanners:
  - semgrep
  - checkov
  - gitleaks
expectedFindings: []
expectedCoverage: full
tolerances:
  extraFindings: 0
```

```md
<!-- tests/golden-repos/fx-silent-app/README.md -->
# fx-silent-app

Fixture-only repository used to prove that a clean scanner run produces
`UNKNOWN` controls, `score: null`, and no letter grade under scoring v2.

This fixture is a unit/acceptance test input. It is not pilot evidence and must
never be presented as a real repository assessment.
```

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-a-exit-gate.test.ts && pnpm --filter @dpdpa/contracts test -- golden-manifest.test.ts`  
Expected: PASS.

- [ ] **Step 5: Manual WebGoat smoke gate (not CI)**

Run only after the user explicitly approves a local scan. Use the public WebGoat repository with the v2 flag enabled:

```bash
FEATURE_FLAGS='{"dpdpa_readiness_v2":true}' pnpm --filter @dpdpa/orchestrator start:dev
```

In Playwright MCP:
1. Sign in and open `/app`.
2. Start a scan for `https://github.com/OWASP/WebGoat.git`, ref `master`, with an empty blank reference field.
3. Wait for `completed`, `3/3` scanners, `0 unmapped`.
4. Open scan detail and confirm `DPDPA-8.4-SECRET-01` is `Evidence of a gap`, `Evidence coverage` is below 50%, no letter grade is shown, and the legacy badge is absent.
5. Record scan ID, commit SHA, and verdict counts in the PR description. Do not call this a compliance result.

- [ ] **Step 6: Commit**

```bash
git add tests/golden-repos/fx-silent-app apps/orchestrator/test/phase-a-exit-gate.test.ts
git commit -m "test: add Phase A silent and gap exit gates"
```

---

### Task 11: Full verification and user-visible Playwright MCP review

**Files:**
- No source changes unless a gate fails; fix failures in the owning task above.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green monorepo gates and a watched UI walkthrough.

- [ ] **Step 1: Run the full gates**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all green. If any gate fails, return to the owning task and fix before continuing.

- [ ] **Step 2: Verify legacy scores stayed unchanged**

Run: `pnpm --filter @dpdpa/orchestrator test -- scoring.engine.test.ts scoring.v2.test.ts phase-a-exit-gate.test.ts`  
Expected: legacy `100/A` assertion still passes; v2 gates pass.

- [ ] **Step 3: Verify no canary/source retention**

Confirm `control_results.evidence` contains only hash/path/line/fingerprint fields from `evidenceReferenceSchema`; no `snippet`, `content`, `source`, or secret value. Confirm no canary fixture string appears in app logs, DB rows, object storage, or API responses.

- [ ] **Step 4: Playwright MCP walkthrough**

Use Playwright MCP with the user watching:
1. `/app` — command palette opens with `Quick actions`, keyboard arrows move selection, Enter navigates, Escape closes.
2. Scan detail for a v2 silent scan — four metric tiles, `Insufficient evidence — no letter`, `Could not determine` panel, no forbidden wording.
3. Scan detail for `77971e23-6f5a-46fd-abcc-cc508b34cdee` (legacy) — legacy badge visible, score `90`, grade `A` unchanged, section labels use readiness wording.
4. With OS reduced motion enabled — entry/hover/scroll motion is instant and focus remains visible.
5. Report preview for the legacy scan — PDF still renders and v1 methodology text is unchanged.

- [ ] **Step 5: Final status**

Do not push, deploy, merge PR #103, update image pins, or touch `infra/`. Report the branch, commits, test output, and manual smoke IDs. Ask the user for explicit approval before any push/PR/deploy action.

---

## Self-Review

**Spec coverage**
- Product position and forbidden language: Tasks 6, 7, 9, 11.
- Canonical verdicts and finding kinds: Tasks 1, 3.
- PASS requires positive evidence / FAIL requires cited evidence / UNKNOWN excluded: Tasks 3, 4, 10.
- Detector failure short-circuit: Task 3.
- Confidence multiplier and corroboration: Tasks 3, 4.
- Scoring v2 formulas, coverage caps, grade caps: Task 4.
- `control_results` persistence, RLS, indexes, retention by cascade: Task 2; service writes in Task 5.
- `kind` and `detector` on findings: Task 2; populated in Task 5.
- Assessment summary shape: Tasks 1, 5, 6.
- Scanner coverage separate from evidence coverage: Tasks 4, 6, 9.
- Legacy scoring unchanged: Tasks 4, 5, 10, 11.
- Four headline tiles and could-not-determine panel: Task 9.
- Rule pack v2, inventory analyzer, attestations, new pages, report v2, SARIF/Markdown, legal review: Phase B–F, intentionally out of this Phase A plan.
- Frontend refactor using the five named public sources: Tasks 7, 8, 9, with premium effects recreated as original Vue components.

**Placeholder scan**
- No `TBD`, `TODO`, “implement later”, “fill in details”, or “similar to Task N” remains.
- Every code-bearing step contains concrete code or an exact command.
- Manual WebGoat smoke is explicitly labelled manual, not a CI gate.

**Type consistency**
- `ControlResultLike` is defined in Task 3 and consumed by Tasks 4 and 5.
- `scoreScanVersioned` is defined in Task 4 and consumed by Task 5.
- `MapAndScoreResult` fields added in Task 5 are consumed by Task 6 backend detail and Task 9 UI.
- `ScanDetail.assessment` is added in Task 6 and consumed by Task 9.
- `MetricTile`, `MotionTextReveal`, `ScrollReveal`, `CommandPalette`, and `HoverCard` are defined in Task 8 and consumed in Task 9.
- `motion-v` is installed/configured in Task 7 before components import it in Task 8.
- `fx-silent-app` manifest schema matches `goldenManifestSchema` from `@dpdpa/contracts`.
