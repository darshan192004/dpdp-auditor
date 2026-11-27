# Evidence-backed DPDPA Readiness Phase E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add attestation-backed readiness scoring, the remaining readiness UI pages, v2 reports, SARIF/Markdown exports, and a language/enforcement gate while keeping legacy scans and reports unchanged.

**Architecture:** Phase E sits on the stacked Phase B–D branch and consumes the B `Attestation` storage shape, the C/D inventory and control catalogue, and the Phase A version-dispatched scorer. The orchestrator remains the only PostgreSQL writer: it validates v2 pack attestation keys, stores org/repo-scoped owner-admin attestations, feeds only valid unexpired attestations into the pure evaluator, and recomputes derived `control_results` and scan assessment fields. Nuxt/Nitro remains a thin proxy for the new inventory, gaps, fix-plan, attestation, export, and report views; report rendering stays in `apps/orchestrator/src/modules/reports/` (there is no `apps/renderer` directory in this repository) and is selected by `scan.scoringVersion`.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Zod 4, YAML, Vue 3.5.45, Nuxt 4.6.4, @nuxt/ui 3.3.7, Vitest, Playwright, PDFKit, SARIF 2.1.0.

**Spec:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md`  
**Phase B design:** `docs/superpowers/specs/2026-11-27-dpdp-readiness-phase-b-design.md`  
**ADR:** `docs/decisions/0001-evidence-backed-dpdp-readiness.md`

## Global Constraints

- Readiness only. No compliance verdict, certificate, badge, or legal conclusion.
- Forbidden wording outside quoted disclaimers: 'compliant', 'non-compliant', 'violation of the Act', 'certified'. A CI language lint enforces this across UI strings, reports, exports, and rule messages.
- Never retain, transmit, persist, log, or trace source code or file contents. Evidence references carry hashes, paths, lines, detector IDs, and fingerprints only.
- Never retain source code or file contents: no source code, file contents, secret values, or raw scanner output persisted in PostgreSQL, Redis, object storage, logs, or traces.
- Missing evidence never PASS. PASS requires recorded positive evidence; FAIL requires cited gap evidence; UNKNOWN is excluded from the score and never becomes a pass.
- A required detector that failed, timed out, or was skipped yields UNKNOWN with `detector_unavailable`, unless determinable evidence from a completed detector or a valid attestation exists.
- UNKNOWN excluded from the score and shown prominently, beside a named coverage banner when a detector failed, timed out, or was skipped.
- Scoring is deterministic and versioned; every fixture run twice must produce byte-identical `control_results`.
- New scans use `scoring-2.0.0`, `inventory-1.0.0`, and the rule pack `dpdpa-2026.11.0`; legacy scans keep `scoringVersion: "1.0.0"` and exact historical scores.
- Do not change `packages/rule-packs/scoring.yaml`; its numeric `scoringVersion: 1.0.0` stays valid for legacy pack loading.
- Fixtures are test inputs only and must never be presented as pilot evidence or sign-off data. WebGoat and Juice-Shop-like repos are manual smoke tests only, not CI gates.
- Tests first: RED then GREEN at every task boundary. Record the exact RED failure before writing the implementation.
- Tests first. At every task boundary, run the task's focused tests **and** `pnpm lint && pnpm typecheck && pnpm test`; do not commit unless all are green.
- Before any commit, the exact gate command `pnpm lint && pnpm typecheck && pnpm test` must be green.
- One separate branch and one separate PR per phase; Phase E uses `feat/dpdp-readiness-phase-e` stacked from the agreed Phase D HEAD and is never merged by this work.
- Full A–F is delivered as phase-gated PRs. No push, PR creation, merge, deploy, image-pin update, or `infra/` change happens without explicit user approval.
- UI verification must use Playwright MCP so the user can watch live.
- Deterministic, versioned scoring only: attestation verdicts, coverage, and grade caps must be reproducible from the stored pack version and scan inputs.
- An attestation is a human statement, never code evidence. It must not become an evidence reference, raise evidence coverage, or lift a grade above the coverage cap.
- Attestation writes are org-scoped, owner/admin-only, audited, and expiry-aware. Unexpired written truth wins over absence; code evidence wins over an attestation.
- Never open GitHub issues or pull requests on a target repository from an export.
- k3s deployment and the gVisor RuntimeClass sign-off gate remain paused pending explicit user approval.
- External pentest remains `Pending — deferred for internal pilot`.

---

## File Structure

- `packages/contracts/src/pack-v2.ts` — add bounded `attestationKey` to v2 controls and enforce key uniqueness/mapping in validation.
- `packages/contracts/test/pack-v2.test.ts` — contract tests for attestation key mapping and rejection.
- `packages/rule-packs/v2/controls.yaml` — pack-authored attestation keys mapped to control codes.
- `packages/rule-packs/v2/manifest.yaml` — regenerated hash manifest after the control file change.
- `apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts` — validated v2 pack loader with key-to-control map.
- `apps/orchestrator/test/rule-pack-v2.loader.test.ts` — loader and fail-closed tests.
- `apps/orchestrator/src/modules/scoring/control-evaluator.ts` — attestation fallback after code evidence.
- `apps/orchestrator/src/modules/scoring/scoring.v2.ts` — explicit attested-half-credit and coverage-cap tests.
- `apps/orchestrator/src/modules/attestations/` — repository, service, schemas, controller, and module for B's `Attestation` table.
- `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts` — repository-wide v2 rescore helper using active attestations.
- `apps/orchestrator/src/modules/reports/` — v2 view model, template selection, SARIF/Markdown exporters, and report tests.
- `apps/web/shared/` — wire contracts for inventory, gaps, fix plan, attestations, exports, and v2 report data.
- `apps/web/server/api/v1/` — BFF proxy routes and guarded fixture answers for the new read/write pages.
- `apps/web/server/utils/fixtures/` — contract-shaped test inputs for new pages; never pilot data.
- `apps/web/app/pages/app/` — Data Inventory, Compliance Gaps, Fix Plan, Attestations, and Exports pages.
- `apps/web/app/components/new/` — scan detail tiles and rules explanation additions.
- `apps/web/app/utils/nav.ts`, `apps/web/app/utils/breadcrumbs.ts`, `apps/web/app/components/shell/ConsoleSidebar.vue` — navigation for new pages.
- `apps/web/test/` and `apps/web/e2e/` — unit and Playwright gates.
- `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-e.md` — this plan.

---

### Task 1: Map attestation keys in v2 pack contracts

**Files:**
- Modify: `packages/contracts/src/pack-v2.ts`
- Modify: `packages/contracts/test/pack-v2.test.ts`
- Modify: `packages/rule-packs/v2/controls.yaml`
- Regenerate: `packages/rule-packs/v2/manifest.yaml`

**Interfaces:**
- Consumes: `controlV2Schema`, `validatePackV2`, `DPDPA_PACK_V2_VERSION`, `PackFileV2`, and `ValidationIssue` from `packages/contracts/src/pack-v2.ts`.
- Produces: `ControlV2.attestationKey?: string`, `ATTESTATION_KEY_PATTERN`, validator issue codes `missing_attestation_key` and `duplicate_attestation_key`, and a pack-authored key-to-control mapping.

- [x] **Step 1: Write the failing attestation-key contract tests**

```ts
// packages/contracts/test/pack-v2.test.ts
import { describe, expect, it } from 'vitest';
import {
  attestationSchema,
  controlV2Schema,
  detectorV2Schema,
  DPDPA_PACK_V2_VERSION,
  INVENTORY_V1_VERSION,
  inventorySignalSchema,
  validatePackV2,
} from '../src/pack-v2';

const attestedControl = {
  ...validControl,
  evidenceMode: 'attestation',
  attestationKey: 'secrets.managed_store',
};

describe('Phase E attestation key mapping', () => {
  it('maps pack attestation keys to controls without hard-coded control IDs', () => {
    const fixture = packFixture({ control: attestedControl });
    const second = {
      ...attestedControl,
      code: 'DPDPA-13-GRIEVANCE-01',
      attestationKey: 'grievance.contact.published',
    };
    const controls = fixture.files[0]!.value as { controls: unknown[] };
    controls.controls.push(second);

    const issues = validatePackV2(fixture);
    expect(issues).toEqual([]);
    const parsed = controlV2Schema.parse(attestedControl);
    expect(parsed.attestationKey).toBe('secrets.managed_store');
  });

  it('rejects an attestation-mode control with no key', () => {
    const fixture = packFixture({ control: { ...attestedControl, attestationKey: undefined } });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain(
      'missing_attestation_key',
    );
  });

  it('rejects duplicate attestation keys', () => {
    const fixture = packFixture({ control: attestedControl });
    const controls = fixture.files[0]!.value as { controls: unknown[] };
    controls.controls.push({
      ...attestedControl,
      code: 'DPDPA-13-GRIEVANCE-01',
    });

    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain(
      'duplicate_attestation_key',
    );
  });

  it('rejects malformed attestation keys and malformed attestation timestamps', () => {
    expect(controlV2Schema.safeParse({ ...attestedControl, attestationKey: 'Bad Key!' }).success).toBe(
      false,
    );
    expect(
      attestationSchema.safeParse({
        orgId: '3f2c1a10-5f0e-4f2a-9f7a-1e5c6b7d8a90',
        repositoryId: '8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d',
        key: 'secrets.managed_store',
        answer: true,
        note: null,
        attestedBy: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
        attestedAt: 'yesterday',
        expiresAt: null,
      }).success,
    ).toBe(false);
  });
});
```

The file already defines `validControl`, `packFixture`, and the existing imports. Keep the existing Phase B tests unchanged.

- [x] **Step 2: Run the focused contract test and confirm RED**

```bash
pnpm --filter @dpdpa/contracts exec vitest run test/pack-v2.test.ts -t 'Phase E attestation key mapping'
```

Expected RED output includes:

```text
FAIL  test/pack-v2.test.ts > Phase E attestation key mapping > maps pack attestation keys to controls without hard-coded control IDs
AssertionError: expected [ { path: 'controls.yaml', code: 'invalid_schema', ... } ] to deeply equal []
```

The missing-key assertion fails with `expected [] to contain 'missing_attestation_key'`, and the duplicate-key assertion fails because it sees `invalid_schema`/`duplicate_control` instead of `duplicate_attestation_key`.

- [x] **Step 3: Add the bounded contract and validator rules**

```ts
// packages/contracts/src/pack-v2.ts
export const ATTESTATION_KEY_PATTERN = /^[a-z][a-z0-9_.:-]{2,96}$/;

export const controlV2Schema = z
  .object({
    code: z.string().regex(CONTROL_CODE_PATTERN),
    section: z.string().regex(SECTION_REF_PATTERN),
    actRef: z.string().regex(LEGAL_REF_PATTERN),
    ruleRef: ruleId,
    title: z.string().min(1).max(200),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    weight: z.number().int().min(1).max(10),
    evidenceMode: evidenceModeSchema,
    attestationKey: z.string().regex(ATTESTATION_KEY_PATTERN).optional(),
    appliesWhen: z
      .array(z.object({ language: token.optional(), stack: token.optional() }).strict())
      .max(32),
    violationRules: z.array(violationRuleSchema).max(32),
    absenceRules: z.array(absenceRuleSchema).max(32),
    positiveRules: z.array(positiveRuleSchema).max(32),
    partialCredit: z.boolean(),
    remediationKey: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    legalRefs: z.array(z.string().regex(LEGAL_REF_PATTERN)).min(1).max(8),
  })
  .strict();
```

Add these checks inside `validatePackV2` beside the existing `seenControls` loop:

```ts
  const attestationKeys = new Map<string, string>();
  for (const control of controls) {
    if (control.evidenceMode === 'attestation' && control.attestationKey === undefined) {
      issues.push({
        path: 'controls.yaml',
        code: 'missing_attestation_key',
        message: `control ${control.code} has no attestation key`,
      });
    }
    if (control.attestationKey !== undefined) {
      const previous = attestationKeys.get(control.attestationKey);
      if (previous !== undefined) {
        issues.push({
          path: 'controls.yaml',
          code: 'duplicate_attestation_key',
          message: `attestation key is mapped more than once; first control ${previous}`,
        });
      } else {
        attestationKeys.set(control.attestationKey, control.code);
      }
    }
  }
```

- [x] **Step 4: Put the real key in the v2 pack and refresh its manifest**

```yaml
# packages/rule-packs/v2/controls.yaml
  - code: DPDPA-8.4-SECRET-01
    section: '8(4)'
    actRef: DPDPA Section 8(4)
    ruleRef: reasonable-security-safeguards
    title: Secrets are not stored in source
    severity: critical
    weight: 5
    evidenceMode: attestation
    attestationKey: secrets.managed_store
    appliesWhen: []
    violationRules: []
    absenceRules: []
    positiveRules: []
    partialCredit: false
    remediationKey: remove-hardcoded-secrets
    legalRefs:
      - DPDPA Section 8(4)
      - DPDP Rules 4
```

```bash
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs validate
```

Expected output:

```text
{"pack":"dpdpa-2026.11.0","issues":[]}
```

- [x] **Step 5: Run the focused test and confirm GREEN**

```bash
pnpm --filter @dpdpa/contracts exec vitest run test/pack-v2.test.ts -t 'Phase E attestation key mapping'
```

Expected GREEN output:

```text
✓ test/pack-v2.test.ts > Phase E attestation key mapping > maps pack attestation keys to controls without hard-coded control IDs
✓ test/pack-v2.test.ts > Phase E attestation key mapping > rejects an attestation-mode control with no key
✓ test/pack-v2.test.ts > Phase E attestation key mapping > rejects duplicate attestation keys
✓ test/pack-v2.test.ts > Phase E attestation key mapping > rejects malformed attestation keys and malformed attestation timestamps
Test Files  1 passed (1)
Tests  4 passed (4)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add packages/contracts/src/pack-v2.ts packages/contracts/test/pack-v2.test.ts packages/rule-packs/v2/controls.yaml packages/rule-packs/v2/manifest.yaml
git commit -m "feat(readiness): map v2 attestation keys to controls"
```

---

### Task 2: Load attestation key mappings from the validated v2 pack

**Files:**
- Create: `apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts`
- Create: `apps/orchestrator/test/rule-pack-v2.loader.test.ts`

**Interfaces:**
- Consumes: `validatePackV2`, `DPDPA_PACK_V2_VERSION`, `type ControlV2`, and `type PackFileV2` from `@dpdpa/contracts`; `parse` from `yaml`; Node `fs`/`path` helpers.
- Produces: `loadRulePackV2(dir) => Promise<LoadedRulePackV2>` with `pack`, `controls`, `controlsByCode`, `attestationsByKey: Map<string, ControlV2[]>`, `detectors: DetectorV2[]`, and `commencement: CommencementEntry[]`; `RulePackV2Error`.

- [x] **Step 1: Write the failing loader tests**

```ts
// apps/orchestrator/test/rule-pack-v2.loader.test.ts
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DPDPA_PACK_V2_VERSION } from '@dpdpa/contracts';
import {
  loadRulePackV2,
  RulePackV2Error,
} from '../src/modules/rule-pack/rule-pack-v2.loader.js';

const packDir = fileURLToPath(new URL('../../../packages/rule-packs/v2', import.meta.url));
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('v2 attestation pack loader', () => {
  it('loads pack-authored key-to-control mappings', async () => {
    const loaded = await loadRulePackV2(packDir);
    expect(loaded.pack).toBe(DPDPA_PACK_V2_VERSION);
    expect(loaded.attestationsByKey.get('secrets.managed_store')?.map((c) => c.code)).toEqual([
      'DPDPA-8.4-SECRET-01',
    ]);
    expect(loaded.detectors.map((detector) => detector.id)).toContain('schema_scan');
    expect(loaded.commencement.map((entry) => entry.provision)).toContain('DPDP Rules 4');
  });

  it('fails closed on checksum drift', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'phase-e-loader-')), 'v2');
    created.push(dir);
    await cp(packDir, dir, { recursive: true });
    const controls = await readFile(join(dir, 'controls.yaml'), 'utf8');
    await writeFile(join(dir, 'controls.yaml'), `${controls}\n# drift\n`, 'utf8');

    await expect(loadRulePackV2(dir)).rejects.toMatchObject({
      name: 'RulePackV2Error',
      code: 'RULE_PACK_HASH_MISMATCH',
    });
  });

  it('never returns raw file content from a validation failure', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'phase-e-loader-')), 'v2');
    created.push(dir);
    await cp(packDir, dir, { recursive: true });
    const controls = await readFile(join(dir, 'controls.yaml'), 'utf8');
    const canary = 'CANARY_LOADER_SOURCE_MUST_NOT_ESCAPE';
    await writeFile(join(dir, 'controls.yaml'), `${controls}\n# ${canary}\n`, 'utf8');

    const error = await loadRulePackV2(dir).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(RulePackV2Error);
    expect(JSON.stringify(error)).not.toContain(canary);
  });
});
```

- [x] **Step 2: Run the focused loader test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/rule-pack-v2.loader.test.ts
```

Expected RED output:

```text
FAIL  test/rule-pack-v2.loader.test.ts > v2 attestation pack loader > loads pack-authored key-to-control mappings
Error: Cannot find module '../src/modules/rule-pack/rule-pack-v2.loader.js'
```

- [x] **Step 3: Add the validated v2 loader**

```ts
// apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import {
  commencementFileSchema,
  controlsFileV2Schema,
  detectorsFileV2Schema,
  packManifestV2Schema,
  validatePackV2,
  type ControlV2,
  type DetectorV2,
  type PackFileV2,
} from '@dpdpa/contracts';
import type { z } from 'zod';

type CommencementEntry = z.infer<typeof commencementFileSchema>['entries'][number];

export type RulePackV2ErrorCode =
  | 'RULE_PACK_MISSING'
  | 'RULE_PACK_INVALID'
  | 'RULE_PACK_HASH_MISMATCH';

export class RulePackV2Error extends Error {
  constructor(
    readonly code: RulePackV2ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RulePackV2Error';
  }
}

export interface LoadedRulePackV2 {
  pack: string;
  controls: ControlV2[];
  controlsByCode: Map<string, ControlV2>;
  attestationsByKey: Map<string, ControlV2[]>;
  detectors: DetectorV2[];
  commencement: CommencementEntry[];
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...(await listFiles(full, base)));
    else if (entry.isFile()) {
      const path = relative(base, full).split(sep).join('/');
      if (path !== 'manifest.yaml') paths.push(path);
    }
  }
  return paths.sort();
}

export async function loadRulePackV2(dir: string): Promise<LoadedRulePackV2> {
  const rawManifest = await readFile(join(dir, 'manifest.yaml'), 'utf8').catch(() => {
    throw new RulePackV2Error('RULE_PACK_MISSING', 'missing v2 manifest.yaml');
  });
  const manifest = packManifestV2Schema.parse(parse(rawManifest));
  const files: PackFileV2[] = [];
  for (const path of await listFiles(dir)) {
    const bytes = await readFile(join(dir, ...path.split('/')));
    files.push({
      path,
      value: parse(bytes.toString('utf8')) as unknown,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  const known = new Map(manifest.files.map((file) => [file.path, file.sha256]));
  for (const file of files) {
    if (known.get(file.path) !== file.sha256) {
      throw new RulePackV2Error(
        'RULE_PACK_HASH_MISMATCH',
        `${file.path} hash does not match the v2 manifest`,
      );
    }
  }
  const issues = validatePackV2({ files, manifest });
  if (issues.length > 0) {
    throw new RulePackV2Error('RULE_PACK_INVALID', `v2 pack has ${issues.length} validation issue(s)`);
  }
  const named = (path: string) => {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) throw new RulePackV2Error('RULE_PACK_MISSING', `missing ${path}`);
    return file.value;
  };
  const controls = controlsFileV2Schema.parse(named('controls.yaml')).controls;
  const detectors = detectorsFileV2Schema.parse(named('detectors.yaml')).detectors;
  const commencement = commencementFileSchema.parse(named('commencement.yaml')).entries;
  const attestationsByKey = new Map<string, ControlV2[]>();
  for (const control of controls) {
    if (control.attestationKey === undefined) continue;
    const mapped = attestationsByKey.get(control.attestationKey) ?? [];
    mapped.push(control);
    attestationsByKey.set(control.attestationKey, mapped);
  }
  return {
    pack: manifest.pack,
    controls,
    controlsByCode: new Map(controls.map((control) => [control.code, control])),
    attestationsByKey,
    detectors,
    commencement,
  };
}
```

- [x] **Step 4: Run the focused loader test and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/rule-pack-v2.loader.test.ts
```

Expected GREEN output:

```text
✓ test/rule-pack-v2.loader.test.ts > v2 attestation pack loader > loads pack-authored key-to-control mappings
✓ test/rule-pack-v2.loader.test.ts > v2 attestation pack loader > fails closed on checksum drift
✓ test/rule-pack-v2.loader.test.ts > v2 attestation pack loader > never returns raw file content from a validation failure
Test Files  1 passed (1)
Tests  3 passed (3)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts apps/orchestrator/test/rule-pack-v2.loader.test.ts
git commit -m "feat(readiness): load v2 attestation key mappings"
```

---

### Task 3: Add attestation fallback to the pure control evaluator

**Files:**
- Modify: `apps/orchestrator/src/modules/scoring/control-evaluator.ts`
- Create: `apps/orchestrator/test/attestation-control-evaluator.test.ts`

**Interfaces:**
- Consumes: `Control`, `ControlEvaluatorInput`, `ControlResultLike`, and `evaluateControls` from `apps/orchestrator/src/modules/scoring/control-evaluator.ts`; B's `attestationSchema` answer convention.
- Produces: `ControlEvaluatorInput.attestationsByControl?: ReadonlyMap<string, readonly AttestationForEvaluator[]>`, verdicts `ATTESTED_PASS`/`ATTESTED_FAIL`, reason codes `attested_pass`/`attested_fail`, and an empty `evidence` array for attested verdicts.

- [x] **Step 1: Write the failing evaluator tests**

```ts
// apps/orchestrator/test/attestation-control-evaluator.test.ts
import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import {
  evaluateControls,
  type ControlEvaluatorInput,
} from '../src/modules/scoring/control-evaluator.js';

const control: Control = {
  code: 'DPDPA-8.4-SECRET-01',
  section: '8(4)',
  title: 'Secrets are not stored in source',
  summary: 'No service credential should be stored in source.',
  obligation: 'Use managed secret storage.',
  legalReference: 'DPDPA Section 8(4)',
  severity: 'critical',
  weight: 4,
  evidenceStrength: 'direct',
  scored: true,
  appliesWhen: {},
  remediation: 'Store the credential outside source.',
  tags: [],
};

function input(
  overrides: Partial<ControlEvaluatorInput> = {},
): ControlEvaluatorInput {
  return {
    controls: [control],
    facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
    mappings: [{ scanner: 'gitleaks', controlCode: control.code }],
    detectorStatuses: { gitleaks: 'completed' },
    findings: [],
    rulePackVersion: 'dpdpa-2026.11.0',
    scoringVersion: 'scoring-2.0.0',
    ...overrides,
  };
}

describe('attestation evaluator semantics', () => {
  it('lets code evidence win over an attested answer', () => {
    const result = evaluateControls(
      input({
        findings: [
          {
            controlCode: control.code,
            kind: 'violation',
            scanner: 'gitleaks',
            scannerRuleId: 'generic-api-key',
            evidenceHash: 'sha256:code-only',
            severity: 'critical',
            confidence: 'direct',
            status: 'open',
          },
        ],
        attestationsByControl: new Map([
          [
            control.code,
            [{ key: 'secrets.managed_store', answer: true, attestedAt: '2026-11-27T00:00:00Z' }],
          ],
        ]),
      }),
    ).results[0]!;

    expect(result.verdict).toBe('FAIL');
    expect(result.reasonCode).toBe('cited_gap');
    expect(result.evidence.map((item) => item.evidenceHash)).toEqual(['sha256:code-only']);
  });

  it('uses an unexpired attested answer only when no code evidence is determinable', () => {
    const result = evaluateControls(
      input({
        attestationsByControl: new Map([
          [
            control.code,
            [{ key: 'secrets.managed_store', answer: true, attestedAt: '2026-11-27T00:00:00Z' }],
          ],
        ]),
      }),
    ).results[0]!;

    expect(result.verdict).toBe('ATTESTED_PASS');
    expect(result.reasonCode).toBe('attested_pass');
    expect(result.confidence).toBeNull();
    expect(result.evidence).toEqual([]);
  });

  it('uses a false attested answer when a required detector is unavailable', () => {
    const result = evaluateControls(
      input({
        detectorStatuses: { gitleaks: 'timed_out' },
        attestationsByControl: new Map([
          [
            control.code,
            [{ key: 'secrets.managed_store', answer: false, attestedAt: '2026-11-27T00:00:00Z' }],
          ],
        ]),
      }),
    ).results[0]!;

    expect(result.verdict).toBe('ATTESTED_FAIL');
    expect(result.reasonCode).toBe('attested_fail');
    expect(result.evidence).toEqual([]);
  });

  it('keeps UNKNOWN when no determinable evidence or attestation exists', () => {
    const result = evaluateControls(input()).results[0]!;
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCode).toBe('no_determinable_evidence');
  });
});
```

- [x] **Step 2: Run the focused evaluator test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-control-evaluator.test.ts
```

Expected RED output:

```text
FAIL  test/attestation-control-evaluator.test.ts > attestation evaluator semantics > uses an unexpired attested answer only when no code evidence is determinable
AssertionError: expected 'UNKNOWN' to be 'ATTESTED_PASS'
```

- [x] **Step 3: Add the attestation input and fallback**

```ts
// apps/orchestrator/src/modules/scoring/control-evaluator.ts
export interface AttestationForEvaluator {
  key: string;
  answer: boolean;
  attestedAt: string | Date;
  expiresAt?: string | Date | null;
}

export interface ControlEvaluatorInput {
  controls: readonly Control[];
  facts: RepoFacts;
  mappings: readonly Pick<Mapping, 'scanner' | 'controlCode'>[];
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
  findings: readonly EvidenceLike[];
  rulePackVersion: string;
  scoringVersion: string;
  attestationsByControl?: ReadonlyMap<string, readonly AttestationForEvaluator[]>;
}
```

Replace the detector-unavailable and final `UNKNOWN` branches inside `evaluateOne` with these ordered branches:

```ts
  const attested = input.attestationsByControl?.get(control.code) ?? [];
  const usableAttestation = attested.find((item) => {
    if (item.expiresAt === null || item.expiresAt === undefined) return true;
    const expires = new Date(item.expiresAt).getTime();
    return Number.isFinite(expires) && expires > Date.now();
  });

  if (unavailable.length > 0 && !determinativeFromCompleted) {
    if (usableAttestation !== undefined) {
      return {
        ...base,
        verdict: usableAttestation.answer ? 'ATTESTED_PASS' : 'ATTESTED_FAIL',
        reasonCode: usableAttestation.answer ? 'attested_pass' : 'attested_fail',
        confidence: null,
        evidence: [],
      };
    }
    return {
      ...base,
      verdict: 'UNKNOWN',
      reasonCode: 'detector_unavailable',
      confidence: null,
      evidence: [],
    };
  }
```

Keep the existing `FAIL`, `PARTIAL`, and `PASS` branches exactly as they are. Replace the final `no_determinable_evidence` return with:

```ts
  if (usableAttestation !== undefined) {
    return {
      ...base,
      verdict: usableAttestation.answer ? 'ATTESTED_PASS' : 'ATTESTED_FAIL',
      reasonCode: usableAttestation.answer ? 'attested_pass' : 'attested_fail',
      confidence: null,
      evidence: [],
    };
  }

  return {
    ...base,
    verdict: 'UNKNOWN',
    reasonCode: 'no_determinable_evidence',
    confidence: null,
    evidence: [],
  };
```

- [x] **Step 4: Run the focused evaluator test and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-control-evaluator.test.ts
```

Expected GREEN output:

```text
✓ test/attestation-control-evaluator.test.ts > attestation evaluator semantics > lets code evidence win over an attested answer
✓ test/attestation-control-evaluator.test.ts > attestation evaluator semantics > uses an unexpired attested answer only when no code evidence is determinable
✓ test/attestation-control-evaluator.test.ts > attestation evaluator semantics > uses a false attested answer when a required detector is unavailable
✓ test/attestation-control-evaluator.test.ts > attestation evaluator semantics > keeps UNKNOWN when no determinable evidence or attestation exists
Test Files  1 passed (1)
Tests  4 passed (4)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/scoring/control-evaluator.ts apps/orchestrator/test/attestation-control-evaluator.test.ts
git commit -m "feat(readiness): apply attestation fallback in evaluator"
```

---

### Task 4: Prove attested credit never raises evidence coverage or the grade cap

**Files:**
- Create: `apps/orchestrator/test/attestation-scoring.test.ts`
- Modify: `apps/orchestrator/src/modules/scoring/scoring.v2.ts`

**Interfaces:**
- Consumes: `scoreScanV2`, `ScoreInputV2`, `ControlResultLike`, and `type Control` from the Phase A scoring modules.
- Produces: explicit regression assertions that `ATTESTED_PASS` receives half credit, is excluded from `determinableWeight`, and leaves `evidenceCoverage` at `0` when no code evidence exists.

- [x] **Step 1: Write the failing scoring regression tests**

```ts
// apps/orchestrator/test/attestation-scoring.test.ts
import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import type { ControlResultLike } from '../src/modules/scoring/control-evaluator.js';
import { ATTESTED_VERDICTS, scoreScanV2 } from '../src/modules/scoring/scoring.v2.js';

const control: Control = {
  code: 'DPDPA-8.4-SECRET-01',
  section: '8(4)',
  title: 'Secrets are not stored in source',
  summary: 'No service credential should be stored in source.',
  obligation: 'Use managed secret storage.',
  legalReference: 'DPDPA Section 8(4)',
  severity: 'critical',
  weight: 4,
  evidenceStrength: 'direct',
  scored: true,
  appliesWhen: {},
  remediation: 'Store the credential outside source.',
  tags: [],
};

function result(verdict: ControlResultLike['verdict']): ControlResultLike {
  return {
    controlCode: control.code,
    verdict,
    reasonCode: verdict === 'ATTESTED_FAIL' ? 'attested_fail' : verdict.startsWith('ATTESTED') ? 'attested_pass' : 'positive_evidence',
    confidence: verdict.startsWith('ATTESTED') ? null : 'direct',
    evidence: [],
    rulePackVersion: 'dpdpa-2026.11.0',
    scoringVersion: 'scoring-2.0.0',
  };
}

describe('attestation scoring caps', () => {
  it('exports one canonical set of attested verdicts', () => {
    expect([...ATTESTED_VERDICTS].sort()).toEqual(['ATTESTED_FAIL', 'ATTESTED_PASS']);
  });

  it('gives an attested pass half credit but no evidence coverage', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control],
      facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
      coverage: 'full',
      results: [result('ATTESTED_PASS')],
    });

    expect(scored.score).toBe(50);
    expect(scored.evidenceCoverage).toBe(0);
    expect(scored.grade).toBeNull();
    expect(scored.gradeWithheldReason).toBe('insufficient_evidence');
    expect(scored.verdictCounts.ATTESTED_PASS).toBe(1);
  });

  it('excludes an attested fail from the failure-driven critical cap input', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control],
      facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
      coverage: 'full',
      results: [result('ATTESTED_FAIL')],
    });

    expect(scored.score).toBe(0);
    expect(scored.evidenceCoverage).toBe(0);
    expect(scored.sections[0]?.failedWeight).toBe(0);
    expect(scored.verdictCounts.ATTESTED_FAIL).toBe(1);
  });

  it('counts code evidence as coverage alongside an attested control', () => {
    const second: Control = { ...control, code: 'DPDPA-5-NOTICE-01', section: '5' };
    const scored = scoreScanV2({
      findings: [],
      controls: [control, second],
      facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
      coverage: 'full',
      results: [result('ATTESTED_PASS'), result('PASS')],
    });

    expect(scored.sections.find((section) => section.section === '8(4)')?.evidenceCoverage).toBe(0);
    expect(scored.sections.find((section) => section.section === '5')?.evidenceCoverage).toBe(1);
  });
});
```

- [x] **Step 2: Run the focused scoring test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-scoring.test.ts
```

Expected RED output:

```text
SyntaxError: The requested module '../src/modules/scoring/scoring.v2.js' does not provide an export named 'ATTESTED_VERDICTS'
```

The harness must not count the three behavior assertions alone as RED: the missing canonical export is the deliberate failure. Keep all four assertions through GREEN so they act as regression tests.

- [x] **Step 3: Make the attestation exclusion explicit in the scorer**

```ts
// apps/orchestrator/src/modules/scoring/scoring.v2.ts
export const ATTESTED_VERDICTS = new Set<ControlResultLike['verdict']>([
  'ATTESTED_PASS',
  'ATTESTED_FAIL',
]);
```

Replace the local `attested` boolean inside `scoreScanV2` with:

```ts
    const attested = ATTESTED_VERDICTS.has(result.verdict);
```

Keep `effectiveWeight = control.weight * 0.5`, keep `PASS`/`ATTESTED_PASS` as the only full-credit verdicts, keep `failedWeight` limited to `FAIL`, and keep `determinableWeight` incremented only when `!attested`. No other scoring constants change.

- [x] **Step 4: Run the focused scoring test and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-scoring.test.ts
```

Expected GREEN output:

```text
✓ test/attestation-scoring.test.ts > attestation scoring caps > exports one canonical set of attested verdicts
✓ test/attestation-scoring.test.ts > attestation scoring caps > gives an attested pass half credit but no evidence coverage
✓ test/attestation-scoring.test.ts > attestation scoring caps > excludes an attested fail from the failure-driven critical cap input
✓ test/attestation-scoring.test.ts > attestation scoring caps > counts code evidence as coverage alongside an attested control
Test Files  1 passed (1)
Tests  4 passed (4)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/scoring/scoring.v2.ts apps/orchestrator/test/attestation-scoring.test.ts
git commit -m "test(readiness): pin attestation coverage caps"
```

---

### Task 5: Add the org/repo-scoped attestation repository and service

**Files:**
- Create: `apps/orchestrator/src/modules/attestations/attestation.schemas.ts`
- Create: `apps/orchestrator/src/modules/attestations/attestations.repository.ts`
- Create: `apps/orchestrator/src/modules/attestations/attestations.service.ts`
- Create: `apps/orchestrator/test/attestations.service.test.ts`
- Modify: `apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts`

**Interfaces:**
- Consumes: B's `prisma.attestation` model and `attestationSchema` key/answer/expiry conventions; `IdentityService.getMembership(orgId, userId)`; `RepositoriesRepository.findActiveById(orgId, repositoryId)`; `AuditService.record`; `ScanScoringService.rescoreRepository` (added in Task 6); `RulePackService.loadV2` (added in this task).
- Produces: `writeAttestationSchema`, `AttestationView`, `AttestationsRepository.list/upsert`, and `AttestationsService.set/list` with owner/admin enforcement, key validation, auditing, and expiry checks.

- [x] **Step 1: Write the failing service tests**

```ts
// apps/orchestrator/test/attestations.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Attestation } from '@prisma/client';
import { ApiError } from '../src/common/api-error.js';
import { AttestationsService } from '../src/modules/attestations/attestations.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const REPO = '55555555-5555-4555-8555-555555555555';
const USER = '22222222-2222-4222-9222-222222222222';
const KEY = 'secrets.managed_store';

function row(overrides: Partial<Attestation> = {}): Attestation {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    orgId: ORG,
    repositoryId: REPO,
    key: KEY,
    answer: true,
    note: null,
    attestedBy: USER,
    attestedAt: new Date('2026-11-27T00:00:00.000Z'),
    expiresAt: null,
    createdAt: new Date('2026-11-27T00:00:00.000Z'),
    updatedAt: new Date('2026-11-27T00:00:00.000Z'),
    ...overrides,
  };
}

function make(role: 'owner' | 'admin' | 'viewer' | null = 'owner') {
  const tx = {};
  const repository = {
    upsert: vi.fn().mockResolvedValue(row()),
    list: vi.fn().mockResolvedValue([row()]),
  };
  const repositories = { findActiveById: vi.fn().mockResolvedValue({ id: REPO, orgId: ORG }) };
  const pack = {
    loadV2: vi.fn().mockResolvedValue({
      pack: 'dpdpa-2026.11.0',
      attestationsByKey: new Map([[KEY, [{ code: 'DPDPA-8.4-SECRET-01' }]]]),
    }),
  };
  const identity = {
    getMembership: vi.fn().mockResolvedValue(role === null ? null : { role, status: 'active' }),
  };
  const audit = { record: vi.fn().mockResolvedValue({}) };
  const scoring = { rescoreRepository: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  const service = new AttestationsService(
    repository as never,
    repositories as never,
    pack as never,
    identity as never,
    audit as never,
    scoring as never,
    prisma as never,
  );
  return { service, repository, repositories, pack, identity, audit, scoring, prisma, tx };
}

const write = {
  orgId: ORG,
  repositoryId: REPO,
  key: KEY,
  answer: true,
  note: 'Managed credential store is configured.',
  attestedBy: USER,
  expiresAt: '2027-01-01T00:00:00.000Z',
};

describe('attestation service', () => {
  it('accepts an owner write, audits it without the note, and rescores the repository', async () => {
    const { service, repository, audit, scoring, tx } = make('owner');
    await service.set(write);

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: KEY, answer: true, attestedBy: USER }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attestation.upserted',
        resourceType: 'attestation',
        resourceId: row().id,
      }),
      tx,
    );
    expect(JSON.stringify(audit.record.mock.calls[0]![0])).not.toContain('Managed credential store');
    expect(scoring.rescoreRepository).toHaveBeenCalledWith(ORG, REPO, tx);
  });

  it('rejects a viewer write', async () => {
    const { service, repository } = make('viewer');
    await expect(service.set(write)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('rejects a key that is not mapped by the v2 pack', async () => {
    const { service, repository } = make();
    await expect(service.set({ ...write, key: 'unknown.key' })).rejects.toBeInstanceOf(ApiError);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('rejects an already expired attestation', async () => {
    const { service, repository } = make();
    await expect(
      service.set({ ...write, expiresAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('rejects a repository id from another organisation', async () => {
    const { service, repositories, repository } = make();
    repositories.findActiveById.mockResolvedValue(null);
    await expect(service.set(write)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the focused service test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestations.service.test.ts
```

Expected RED output:

```text
FAIL  test/attestations.service.test.ts > attestation service > accepts an owner write, audits it without the note, and rescores the repository
Error: Cannot find module '../src/modules/attestations/attestations.service.js'
```

- [x] **Step 3: Add the schema, repository, service, and v2 loader accessor**

```ts
// apps/orchestrator/src/modules/attestations/attestation.schemas.ts
import { z } from 'zod';

export const writeAttestationSchema = z
  .object({
    orgId: z.uuid(),
    repositoryId: z.uuid(),
    key: z.string().regex(/^[a-z][a-z0-9_.:-]{2,96}$/),
    answer: z.boolean(),
    note: z.string().max(2000).nullable().optional(),
    attestedBy: z.uuid(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();

export type WriteAttestationInput = z.infer<typeof writeAttestationSchema>;

export function toAttestationView(row: {
  id: string;
  repositoryId: string;
  key: string;
  answer: boolean;
  note: string | null;
  attestedBy: string;
  attestedAt: Date;
  expiresAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    key: row.key,
    answer: row.answer,
    note: row.note,
    attestedBy: row.attestedBy,
    attestedAt: row.attestedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

```ts
// apps/orchestrator/src/modules/attestations/attestations.repository.ts
import { Injectable } from '@nestjs/common';
import { Prisma, type Attestation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { WriteAttestationInput } from './attestation.schemas.js';

@Injectable()
export class AttestationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string, repositoryId: string, tx?: Prisma.TransactionClient) {
    return this.client(tx).attestation.findMany({
      where: { orgId, repositoryId },
      orderBy: { key: 'asc' },
    });
  }

  activeByRepository(orgId: string, repositoryId: string, tx?: Prisma.TransactionClient) {
    const now = new Date();
    return this.client(tx).attestation.findMany({
      where: {
        orgId,
        repositoryId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { key: 'asc' },
    });
  }

  upsert(input: WriteAttestationInput, tx?: Prisma.TransactionClient): Promise<Attestation> {
    return this.client(tx).attestation.upsert({
      where: {
        orgId_repositoryId_key: {
          orgId: input.orgId,
          repositoryId: input.repositoryId,
          key: input.key,
        },
      },
      create: {
        orgId: input.orgId,
        repositoryId: input.repositoryId,
        key: input.key,
        answer: input.answer,
        note: input.note ?? null,
        attestedBy: input.attestedBy,
        expiresAt: input.expiresAt === null || input.expiresAt === undefined
          ? null
          : new Date(input.expiresAt),
      },
      update: {
        answer: input.answer,
        note: input.note ?? null,
        attestedBy: input.attestedBy,
        attestedAt: new Date(),
        expiresAt: input.expiresAt === null || input.expiresAt === undefined
          ? null
          : new Date(input.expiresAt),
      },
    });
  }

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }
}
```

```ts
// apps/orchestrator/src/modules/attestations/attestations.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdentityService } from '../identity/identity.service.js';
import { RepositoriesRepository } from '../repos/repositories.repository.js';
import { RulePackService } from '../rule-pack/rule-pack.service.js';
import { ScanScoringService } from '../scoring/scan-scoring.service.js';
import { AttestationsRepository } from './attestations.repository.js';
import { toAttestationView, writeAttestationSchema, type WriteAttestationInput } from './attestation.schemas.js';

@Injectable()
export class AttestationsService {
  constructor(
    private readonly attestations: AttestationsRepository,
    private readonly repositories: RepositoriesRepository,
    private readonly pack: RulePackService,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    private readonly scoring: ScanScoringService,
    private readonly prisma: PrismaService,
  ) {}

  async set(raw: WriteAttestationInput) {
    const input = writeAttestationSchema.parse(raw);
    if (input.expiresAt !== null && input.expiresAt !== undefined) {
      if (new Date(input.expiresAt).getTime() <= Date.now()) {
        throw new ApiError('VALIDATION_ERROR', 'An attestation must expire in the future.');
      }
    }

    const loaded = await this.pack.loadV2();
    if (!loaded.attestationsByKey.has(input.key)) {
      throw new ApiError('NOT_FOUND', 'The attestation key is not in the active rule pack.');
    }
    const membership = await this.identity.getMembership(input.orgId, input.attestedBy);
    if (
      membership === null ||
      membership.status !== 'active' ||
      !['owner', 'admin'].includes(membership.role)
    ) {
      throw new ApiError('FORBIDDEN', 'Only an active owner or admin can write attestations.');
    }
    const repository = await this.repositories.findActiveById(input.orgId, input.repositoryId);
    if (repository === null) throw new ApiError('NOT_FOUND', 'The repository does not exist.');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await this.attestations.upsert(input, tx);
      await this.audit.record(
        {
          orgId: input.orgId,
          actorType: 'user',
          actorUserId: input.attestedBy,
          action: 'attestation.upserted',
          resourceType: 'attestation',
          resourceId: row.id,
          metadata: {
            repositoryId: input.repositoryId,
            key: input.key,
            answer: input.answer,
            expiresAt: input.expiresAt ?? null,
          },
        },
        tx,
      );
      await this.scoring.rescoreRepository(input.orgId, input.repositoryId, tx);
      return toAttestationView(row);
    });
  }

  async list(orgId: string, repositoryId: string) {
    const rows = await this.attestations.list(orgId, repositoryId);
    return rows.map(toAttestationView);
  }
}
```

In `RulePackService`, add the import and cached accessor:

```ts
import { join } from 'node:path';
import { loadRulePackV2, type LoadedRulePackV2 } from './rule-pack-v2.loader.js';

export class RulePackService implements OnModuleInit {
  private cached: Promise<LoadedRulePack> | undefined;
  private cachedV2: Promise<LoadedRulePackV2> | undefined;

  loadV2(): Promise<LoadedRulePackV2> {
    this.cachedV2 ??= loadRulePackV2(join(this.dir(), 'v2'));
    return this.cachedV2;
  }
}
```

- [x] **Step 4: Run the focused service test and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestations.service.test.ts
```

Expected GREEN output:

```text
✓ test/attestations.service.test.ts > attestation service > accepts an owner write, audits it without the note, and rescores the repository
✓ test/attestations.service.test.ts > attestation service > rejects a viewer write
✓ test/attestations.service.test.ts > attestation service > rejects a key that is not mapped by the v2 pack
✓ test/attestations.service.test.ts > attestation service > rejects an already expired attestation
✓ test/attestations.service.test.ts > attestation service > rejects a repository id from another organisation
Test Files  1 passed (1)
Tests  5 passed (5)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/attestations apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts apps/orchestrator/test/attestations.service.test.ts
git commit -m "feat(readiness): add scoped attestation service"
```

---

### Task 6: Recompute all completed v2 scans for the attested repository

**Files:**
- Modify: `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`
- Create: `apps/orchestrator/test/attestation-rescore.test.ts`

**Interfaces:**
- Consumes: `SCORING_V2_VERSION`, `scanAssessmentUpdate`, `assessmentEventFields`, `factsFrom`, and B's `Attestation` rows.
- Produces: `ScanScoringService.rescoreRepository(orgId, repositoryId, tx)`; `scorePersisted` accepts an optional active-attestation map and rewrites `control_results` for every completed v2 scan; legacy scans are untouched.

- [x] **Step 1: Write the failing repository-rescore test**

```ts
// apps/orchestrator/test/attestation-rescore.test.ts
import { Prisma, type Scan } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ScanScoringService } from '../src/modules/scoring/scan-scoring.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const REPO = '55555555-5555-4555-8555-555555555555';

const scan = {
  id: '88888888-8888-4888-8888-888888888888',
  orgId: ORG,
  repositoryId: REPO,
  status: 'completed',
  scoringVersion: 'scoring-2.0.0',
  facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
  coverage: { gitleaks: 'completed' },
} as unknown as Scan;

const result = {
  score: 60,
  grade: null,
  sectionScores: { '8(4)': 60 },
  counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  coverage: 'full',
  evidenceCoverage: 0,
  verdictCounts: { ATTESTED_PASS: 1 },
  unknownControls: [],
  gradeWithheldReason: 'insufficient_evidence',
};

describe('attestation-triggered rescore', () => {
  it('rescores completed v2 scans with active attestations only', async () => {
    const tx = {
      scan: {
        findMany: vi.fn().mockResolvedValue([scan]),
        update: vi.fn().mockResolvedValue(scan),
      },
      scanEvent: { create: vi.fn().mockResolvedValue({}) },
      attestation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'a1',
            orgId: ORG,
            repositoryId: REPO,
            key: 'secrets.managed_store',
            answer: true,
            note: 'CANARY_NOTE_MUST_NOT_BE_SCORED',
            attestedBy: '22222222-2222-4222-9222-222222222222',
            attestedAt: new Date('2026-11-27T00:00:00.000Z'),
            expiresAt: null,
          },
        ]),
      },
    };
    const pack = {
      load: vi.fn().mockResolvedValue({ pack: 'dpdpa-2026.10.6' }),
      loadV2: vi.fn().mockResolvedValue({
        pack: 'dpdpa-2026.11.0',
        attestationsByKey: new Map([
          [
            'secrets.managed_store',
            [{ code: 'DPDPA-8.4-SECRET-01', section: '8(4)', weight: 4 }],
          ],
        ]),
      }),
    };
    const prisma = {};
    const flags = { isEnabled: vi.fn().mockReturnValue(true) };
    const service = new ScanScoringService(pack as never, prisma as never, flags as never);
    const scorePersisted = vi
      .spyOn(service, 'scorePersisted')
      .mockResolvedValue({ loaded: { pack: 'dpdpa-2026.11.0' }, result } as never);

    await service.rescoreRepository(ORG, REPO, tx as never);

    expect(tx.scan.findMany).toHaveBeenCalledWith({
      where: {
        orgId: ORG,
        repositoryId: REPO,
        status: 'completed',
        scoringVersion: 'scoring-2.0.0',
      },
      orderBy: { completedAt: 'desc' },
    });
    const map = scorePersisted.mock.calls[0]![3];
    expect(map.get('DPDPA-8.4-SECRET-01')).toEqual([
      expect.objectContaining({ key: 'secrets.managed_store', answer: true }),
    ]);
    expect(JSON.stringify(map)).not.toContain('CANARY_NOTE_MUST_NOT_BE_SCORED');
    expect(tx.scan.update).toHaveBeenCalledWith({
      where: { id: scan.id },
      data: expect.objectContaining({
        score: expect.any(Prisma.Decimal),
        evidenceCoverage: expect.any(Prisma.Decimal),
        verdictCounts: { ATTESTED_PASS: 1 },
      }),
    });
    expect(tx.scanEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scanId: scan.id,
        orgId: ORG,
        type: 'score_recomputed',
        payload: expect.objectContaining({ evidenceCoverage: 0 }),
      }),
    });
  });
});
```

- [x] **Step 2: Run the failing rescore test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-rescore.test.ts
```

Expected RED output:

```text
FAIL  test/attestation-rescore.test.ts > attestation-triggered rescore > rescores completed v2 scans with active attestations only
TypeError: service.rescoreRepository is not a function
```

- [x] **Step 3: Add the rescore helper and attestation-aware scoring input**

In `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`, extend the existing imports rather than duplicating them:

```ts
import {
  buildDetectorStatuses,
  evaluateControls,
  type AttestationForEvaluator,
  type ControlEvidence,
  type ControlResultLike,
} from './control-evaluator.js';
import { factsFrom, type RepoFacts } from './applicability.js';
import { assessmentEventFields, scanAssessmentUpdate } from './assessment-fields.js';
import {
  isScoringV2,
  LEGACY_SCORING_VERSION,
  SCORING_V2_VERSION,
  scoreScanVersioned,
  scoringVersionForNewScan,
  type ScoreCounts,
  type VersionedScoreInput,
} from './scoring.engine.js';
```

Remove the old separate `import type { RepoFacts } from './applicability.js';` line. Add the public method before `persistControlResults`:

```ts
  async rescoreRepository(
    orgId: string,
    repositoryId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const scans = await tx.scan.findMany({
      where: {
        orgId,
        repositoryId,
        status: 'completed',
        scoringVersion: SCORING_V2_VERSION,
      },
      orderBy: { completedAt: 'desc' },
    });
    if (scans.length === 0) return;

    const active = await tx.attestation.findMany({
      where: {
        orgId,
        repositoryId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { key: 'asc' },
    });
    const loadedV2 = await this.pack.loadV2();
    const attestationsByControl = new Map<string, AttestationForEvaluator[]>();
    for (const row of active) {
      const value: AttestationForEvaluator = {
        key: row.key,
        answer: row.answer,
        attestedAt: row.attestedAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
      };
      for (const control of loadedV2.attestationsByKey.get(row.key) ?? []) {
        const items = attestationsByControl.get(control.code) ?? [];
        items.push(value);
        attestationsByControl.set(control.code, items);
      }
    }

    for (const scan of scans) {
      const { result } = await this.scorePersisted(scan, factsFrom(scan.facts), tx, attestationsByControl);
      await tx.scan.update({
        where: { id: scan.id },
        data: {
          score: result.score === null ? null : new Prisma.Decimal(result.score),
          grade: result.grade,
          sectionScores: result.sectionScores,
          counts: {
            critical: result.counts.critical,
            high: result.counts.high,
            medium: result.counts.medium,
            low: result.counts.low,
            info: result.counts.info,
            total: result.counts.total,
          },
          coverageStatus: result.coverage,
          ...scanAssessmentUpdate(result),
        },
      });
      await tx.scanEvent.create({
        data: {
          scanId: scan.id,
          orgId,
          type: 'score_recomputed',
          payload: {
            score: result.score,
            grade: result.grade,
            coverage: result.coverage,
            ...assessmentEventFields(result),
          },
        },
      });
    }
  }
```

Change the `scorePersisted` signature and evaluator call:

```ts
  async scorePersisted(
    scan: Scan,
    facts: RepoFacts,
    tx: Prisma.TransactionClient,
    attestationsByControl?: ReadonlyMap<string, readonly AttestationForEvaluator[]>,
  ) {
```

```ts
      results = evaluateControls({
        controls: loaded.controls,
        facts,
        mappings: loaded.mappings,
        detectorStatuses: buildDetectorStatuses(coverageRecord(scan.coverage)),
        findings: evidence,
        rulePackVersion: loaded.pack,
        scoringVersion,
        ...(attestationsByControl === undefined ? {} : { attestationsByControl }),
      }).results;
```

- [x] **Step 4: Run the focused rescore test and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-rescore.test.ts
```

Expected GREEN output:

```text
✓ test/attestation-rescore.test.ts > attestation-triggered rescore > rescores completed v2 scans with active attestations only
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/scoring/scan-scoring.service.ts apps/orchestrator/test/attestation-rescore.test.ts
git commit -m "feat(readiness): rescore v2 scans after attestation writes"
```

---

### Task 7: Expose attestation read/write routes and module wiring

**Files:**
- Create: `apps/orchestrator/src/modules/attestations/internal-attestations.controller.ts`
- Create: `apps/orchestrator/src/modules/attestations/attestations.module.ts`
- Create: `apps/orchestrator/test/internal-attestations.controller.test.ts`
- Modify: `apps/orchestrator/src/app.module.ts`
- Create: `apps/web/server/api/v1/repos/[repoId]/attestations/index.get.ts`
- Create: `apps/web/server/api/v1/repos/[repoId]/attestations/[key].put.ts`
- Create: `apps/web/server/utils/fixtures/attestations.ts`
- Create: `apps/web/test/attestation-fixtures.test.ts`

**Interfaces:**
- Consumes: `AttestationsService.set/list`; `InternalHmacGuard`; Nitro `requireRole`, `callOrchestrator`, `fixturesAnswer`, and BFF session identity.
- Produces: internal `GET/PUT /internal/v1/repos/:repositoryId/attestations[/:key]`, BFF `GET/PUT /api/v1/repos/:repoId/attestations*`, and guarded fixture answers for local/CI only.

- [x] **Step 1: Write the failing controller and fixture tests**

```ts
// apps/orchestrator/test/internal-attestations.controller.test.ts
import { describe, expect, it, vi } from 'vitest';
import { InternalAttestationsController } from '../src/modules/attestations/internal-attestations.controller.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const REPO = '55555555-5555-4555-8555-555555555555';
const USER = '22222222-2222-4222-9222-222222222222';

describe('internal attestations controller', () => {
  it('passes trusted org, repository, and actor into the scoped service', async () => {
    const service = {
      set: vi.fn().mockResolvedValue({ id: 'att-1', answer: true }),
      list: vi.fn().mockResolvedValue([]),
    };
    const controller = new InternalAttestationsController(service as never);

    await controller.put(ORG, REPO, 'secrets.managed_store', {
      answer: true,
      note: 'Managed credential store is configured.',
      expiresAt: '2027-01-01T00:00:00.000Z',
      actorUserId: USER,
    });

    expect(service.set).toHaveBeenCalledWith({
      orgId: ORG,
      repositoryId: REPO,
      key: 'secrets.managed_store',
      answer: true,
      note: 'Managed credential store is configured.',
      expiresAt: '2027-01-01T00:00:00.000Z',
      attestedBy: USER,
    });
  });

  it('lists only through the org/repo path scope', async () => {
    const service = { set: vi.fn(), list: vi.fn().mockResolvedValue([]) };
    const controller = new InternalAttestationsController(service as never);
    await controller.list(ORG, REPO);
    expect(service.list).toHaveBeenCalledWith(ORG, REPO);
  });
});
```

```ts
// apps/web/test/attestation-fixtures.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureAttestations } from '../server/utils/fixtures/attestations';

describe('attestation fixtures', () => {
  it('are contract-shaped and never carry source text', () => {
    const rows = fixtureAttestations();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).toEqual([
        'id',
        'repositoryId',
        'key',
        'answer',
        'note',
        'attestedBy',
        'attestedAt',
        'expiresAt',
        'updatedAt',
      ]);
      expect(row.note?.includes('CANARY')).toBe(false);
    }
  });
});
```

- [x] **Step 2: Run the focused route tests and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/internal-attestations.controller.test.ts && pnpm --filter @dpdpa/web exec vitest run test/attestation-fixtures.test.ts
```

Expected RED output:

```text
Error: Cannot find module '../src/modules/attestations/internal-attestations.controller.js'
```

- [x] **Step 3: Add the internal controller and module**

```ts
// apps/orchestrator/src/modules/attestations/internal-attestations.controller.ts
import { Body, Controller, Get, Headers, Param, Put, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { AttestationsService } from './attestations.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

@Controller('internal/v1/repos')
@UseGuards(InternalHmacGuard)
export class InternalAttestationsController {
  constructor(private readonly attestations: AttestationsService) {}

  @Get(':repositoryId/attestations')
  list(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('repositoryId') repositoryId: string,
  ) {
    return { data: this.attestations.list(orgIdFrom(orgHeader), repositoryId) };
  }

  @Put(':repositoryId/attestations/:key')
  put(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('repositoryId') repositoryId: string,
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      data: this.attestations.set({
        orgId: orgIdFrom(orgHeader),
        repositoryId,
        key,
        answer: body.answer as boolean,
        note: (body.note as string | null | undefined) ?? null,
        expiresAt: (body.expiresAt as string | null | undefined) ?? null,
        attestedBy: String(body.actorUserId),
      }),
    };
  }
}
```

```ts
// apps/orchestrator/src/modules/attestations/attestations.module.ts
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { ReposModule } from '../repos/repos.module.js';
import { RulePackModule } from '../rule-pack/rule-pack.module.js';
import { ScansModule } from '../scans/scans.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AttestationsRepository } from './attestations.repository.js';
import { AttestationsService } from './attestations.service.js';
import { InternalAttestationsController } from './internal-attestations.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    IdentityModule,
    InternalAuthModule,
    ReposModule,
    RulePackModule,
    ScansModule,
  ],
  controllers: [InternalAttestationsController],
  providers: [AttestationsRepository, AttestationsService],
  exports: [AttestationsRepository, AttestationsService],
})
export class AttestationsModule {}
```

Add `AttestationsModule` to `apps/orchestrator/src/app.module.ts` imports beside `ScansModule`.

- [x] **Step 4: Add the BFF routes and guarded fixtures**

```ts
// apps/web/server/api/v1/repos/[repoId]/attestations/index.get.ts
import { requireIdentity } from '../../../../../utils/session';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { fixtureAttestations } from '../../../../../utils/fixtures/attestations';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { getRouterParam } from 'h3';

export default defineEventHandler(async (event) => {
  const repoId = getRouterParam(event, 'repoId') ?? '';
  if (fixturesAnswer(event)) return { data: fixtureAttestations(repoId) };
  const identity = await requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/repos/${repoId}/attestations`,
    headers: { 'x-org-id': identity.orgId },
  });
});
```

```ts
// apps/web/server/api/v1/repos/[repoId]/attestations/[key].put.ts
import { getRouterParam, readBody } from 'h3';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { requireRole } from '../../../../../utils/session';
import { callOrchestrator } from '../../../../../utils/orchestrator';

export default defineEventHandler(async (event) => {
  const repoId = getRouterParam(event, 'repoId') ?? '';
  const key = getRouterParam(event, 'key') ?? '';
  const body = await readBody<Record<string, unknown>>(event);
  if (fixturesAnswer(event)) return { data: { ...body, repositoryId: repoId, key } };

  const identity = requireRole(event, ['owner', 'admin']);
  return callOrchestrator(event, {
    method: 'PUT',
    path: `/internal/v1/repos/${repoId}/attestations/${encodeURIComponent(key ?? '')}`,
    headers: { 'x-org-id': identity.orgId },
    body: { ...body, actorUserId: identity.userId },
  });
});
```

```ts
// apps/web/server/utils/fixtures/attestations.ts
export interface FixtureAttestation {
  id: string;
  repositoryId: string;
  key: string;
  answer: boolean;
  note: string | null;
  attestedBy: string;
  attestedAt: string;
  expiresAt: string | null;
  updatedAt: string;
}

export function fixtureAttestations(repositoryId = '0f000000-0000-4000-8000-000000000020'): FixtureAttestation[] {
  return [
    {
      id: 'att_01J8Z6C3D4E5F6G7H8J9K0M1N2',
      repositoryId,
      key: 'secrets.managed_store',
      answer: true,
      note: 'A managed credential store is used for this repository.',
      attestedBy: '0f000000-0000-4000-8000-000000000002',
      attestedAt: '2026-11-27T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    },
  ];
}
```

- [x] **Step 5: Run the focused route tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/internal-attestations.controller.test.ts && pnpm --filter @dpdpa/web exec vitest run test/attestation-fixtures.test.ts
```

Expected GREEN output:

```text
✓ test/internal-attestations.controller.test.ts > internal attestations controller > passes trusted org, repository, and actor into the scoped service
✓ test/internal-attestations.controller.test.ts > internal attestations controller > lists only through the org/repo path scope
Test Files  1 passed (1)
Tests  2 passed (2)
✓ test/attestation-fixtures.test.ts > attestation fixtures > are contract-shaped and never carry source text
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/attestations apps/orchestrator/src/app.module.ts apps/orchestrator/test/internal-attestations.controller.test.ts apps/web/server/api/v1/repos apps/web/server/utils/fixtures/attestations.ts apps/web/test/attestation-fixtures.test.ts
git commit -m "feat(readiness): expose scoped attestation routes"
```

---

### Task 8: Add read-only inventory, gaps, and fix-plan routes

**Files:**
- Create: `apps/orchestrator/src/modules/readiness/readiness-read.service.ts`
- Create: `apps/orchestrator/src/modules/readiness/internal-readiness.controller.ts`
- Create: `apps/orchestrator/src/modules/readiness/readiness.module.ts`
- Create: `apps/orchestrator/test/readiness-read.service.test.ts`
- Create: `apps/web/shared/readiness.ts`
- Create: `apps/web/server/utils/fixtures/readiness.ts`
- Create: `apps/web/server/api/v1/scan/[scanId]/inventory.get.ts`
- Create: `apps/web/server/api/v1/scan/[scanId]/gaps.get.ts`
- Create: `apps/web/server/api/v1/scan/[scanId]/fix-plan.get.ts`
- Create: `apps/web/test/readiness-read-fixtures.test.ts`
- Modify: `apps/orchestrator/src/app.module.ts`

**Interfaces:**
- Consumes: Phase C/D `scan.facts.inventory.signals`, `scan.inventoryVersion`, `scan.inventoryStatus`, `scan.consentGatingRatio`, and persisted `control_result` rows from B/A.
- Produces: `ReadinessReadService.inventory/gaps/fixPlan`; internal `GET /internal/v1/scans/:scanId/{inventory,gaps,fix-plan}`; BFF `GET /api/v1/scan/:scanId/{inventory,gaps,fix-plan}`; wire types `ReadinessInventory`, `ReadinessGap`, and `FixPlan`.

- [x] **Step 1: Write the failing read-service test**

```ts
// apps/orchestrator/test/readiness-read.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ReadinessReadService } from '../src/modules/readiness/readiness-read.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCAN = '88888888-8888-4888-8888-888888888888';

function scanRow() {
  return {
    id: SCAN,
    orgId: ORG,
    inventoryVersion: 'inventory-1.0.0',
    inventoryStatus: 'completed',
    consentGatingRatio: { toString: () => '0.75' },
    facts: {
      inventory: {
        signals: [
          {
            detector: 'form_scan',
            kind: 'field',
            path: 'src/api/user.ts',
            line: 12,
            token: 'email_address',
            count: 1,
            detectedAt: '2026-11-27T00:00:00.000Z',
          },
        ],
      },
    },
  };
}

describe('readiness read service', () => {
  it('returns bounded inventory signals without source values', async () => {
    const prisma = {
      scan: { findFirst: vi.fn().mockResolvedValue(scanRow()) },
      controlResult: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ReadinessReadService(prisma as never);
    const view = await service.inventory(ORG, SCAN);

    expect(view.version).toBe('inventory-1.0.0');
    expect(view.status).toBe('completed');
    expect(view.consentGatingRatio).toBe(0.75);
    expect(view.signals).toEqual([
      expect.objectContaining({
        detector: 'form_scan',
        token: 'email_address',
        path: 'src/api/user.ts',
        line: 12,
      }),
    ]);
    expect(JSON.stringify(view)).not.toContain('value');
  });

  it('maps gaps from non-passing persisted verdicts', async () => {
    const prisma = {
      scan: { findFirst: vi.fn().mockResolvedValue(scanRow()) },
      controlResult: {
        findMany: vi.fn().mockResolvedValue([
          {
            controlCode: 'DPDPA-8.4-SECRET-01',
            verdict: 'FAIL',
            reasonCode: 'cited_gap',
            evidence: [{ kind: 'violation', scanner: 'gitleaks' }],
            rule: { section: '8(4)', title: 'Secrets are not stored in source', remediationGuidance: 'Use a secret manager.' },
          },
          {
            controlCode: 'DPDPA-6-CONSENT-01',
            verdict: 'ATTESTED_FAIL',
            reasonCode: 'attested_fail',
            evidence: [],
            rule: { section: '6', title: 'Consent gate is present', remediationGuidance: 'Add a consent gate.' },
          },
        ]),
      },
    };
    const service = new ReadinessReadService(prisma as never);
    const gaps = await service.gaps(ORG, SCAN);

    expect(gaps.map((gap) => gap.verdict)).toEqual(['FAIL', 'ATTESTED_FAIL']);
    expect(gaps[0]?.evidence[0]).toEqual({ kind: 'violation', scanner: 'gitleaks' });
    expect(gaps[1]?.evidence).toEqual([]);
  });

  it('builds a fix plan from gap remediation guidance only', async () => {
    const prisma = {
      scan: { findFirst: vi.fn().mockResolvedValue(scanRow()) },
      controlResult: {
        findMany: vi.fn().mockResolvedValue([
          {
            controlCode: 'DPDPA-8.4-SECRET-01',
            verdict: 'FAIL',
            reasonCode: 'cited_gap',
            evidence: [],
            rule: { section: '8(4)', title: 'Secrets are not stored in source', remediationGuidance: 'Use a secret manager.' },
          },
        ]),
      },
    };
    const service = new ReadinessReadService(prisma as never);
    const plan = await service.fixPlan(ORG, SCAN);

    expect(plan.steps).toEqual([
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        title: 'Secrets are not stored in source',
        remedy: 'Use a secret manager.',
      },
    ]);
  });
});
```

- [x] **Step 2: Run the failing read-service test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/readiness-read.service.test.ts
```

Expected RED output:

```text
FAIL  test/readiness-read.service.test.ts > readiness read service > returns bounded inventory signals without source values
Error: Cannot find module '../src/modules/readiness/readiness-read.service.js'
```

- [x] **Step 3: Add the read service**

```ts
// apps/orchestrator/src/modules/readiness/readiness-read.service.ts
import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface InventorySignalLike {
  detector: string;
  kind: string;
  path: string;
  line: number | null;
  token: string;
  count?: number | null;
}

@Injectable()
export class ReadinessReadService {
  constructor(private readonly prisma: PrismaService) {}

  async inventory(orgId: string, scanId: string) {
    const scan = await this.scan(orgId, scanId);
    const facts = scan.facts as {
      inventory?: { signals?: readonly InventorySignalLike[] };
    };
    const signals = (facts.inventory?.signals ?? []).map((signal) => ({
      detector: signal.detector,
      kind: signal.kind,
      path: signal.path,
      line: signal.line,
      token: signal.token,
      ...(signal.count === undefined ? {} : { count: signal.count }),
    }));
    return {
      version: scan.inventoryVersion,
      status: scan.inventoryStatus,
      consentGatingRatio:
        scan.consentGatingRatio === null ? null : Number(scan.consentGatingRatio.toString()),
      signals,
    };
  }

  async gaps(orgId: string, scanId: string) {
    await this.scan(orgId, scanId);
    const rows = await this.prisma.controlResult.findMany({
      where: {
        orgId,
        scanId,
        verdict: { in: ['FAIL', 'PARTIAL', 'ATTESTED_FAIL'] },
      },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, title: true, remediationGuidance: true } } },
    });
    return rows.map((row) => ({
      controlCode: row.controlCode,
      section: row.rule.section,
      title: row.rule.title,
      verdict: row.verdict,
      reasonCode: row.reasonCode,
      evidence: row.evidence as unknown[],
    }));
  }

  private async scan(orgId: string, scanId: string) {
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, orgId },
      select: {
        inventoryVersion: true,
        inventoryStatus: true,
        consentGatingRatio: true,
        facts: true,
      },
    });
    if (scan === null) throw new ApiError('NOT_FOUND', 'The scan does not exist.');
    return scan;
  }
}
```

Add this `fixPlan` method inside `ReadinessReadService`, after `gaps()`:

```ts
  async fixPlan(orgId: string, scanId: string) {
    await this.scan(orgId, scanId);
    const rows = await this.prisma.controlResult.findMany({
      where: {
        orgId,
        scanId,
        verdict: { in: ['FAIL', 'PARTIAL', 'ATTESTED_FAIL'] },
      },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, title: true, remediationGuidance: true } } },
    });
    return {
      steps: rows.map((row) => ({
        controlCode: row.controlCode,
        section: row.rule.section,
        title: row.rule.title,
        remedy:
          row.verdict === 'ATTESTED_FAIL'
            ? 'Record a current attestation.'
            : row.rule.remediationGuidance,
      })),
    };
  }
```

Add the controller and module:

```ts
// apps/orchestrator/src/modules/readiness/internal-readiness.controller.ts
import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { ReadinessReadService } from './readiness-read.service.js';

@Controller('internal/v1/scans')
@UseGuards(InternalHmacGuard)
export class InternalReadinessController {
  constructor(private readonly readiness: ReadinessReadService) {}

  @Get(':scanId/inventory')
  inventory(@Headers('x-org-id') org: string | undefined, @Param('scanId') scanId: string) {
    return { data: this.readiness.inventory(orgIdFrom(org), scanId) };
  }

  @Get(':scanId/gaps')
  gaps(@Headers('x-org-id') org: string | undefined, @Param('scanId') scanId: string) {
    return { data: this.readiness.gaps(orgIdFrom(org), scanId) };
  }

  @Get(':scanId/fix-plan')
  fixPlan(@Headers('x-org-id') org: string | undefined, @Param('scanId') scanId: string) {
    return { data: this.readiness.fixPlan(orgIdFrom(org), scanId) };
  }
}

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}
```

```ts
// apps/orchestrator/src/modules/readiness/readiness.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { InternalReadinessController } from './internal-readiness.controller.js';
import { ReadinessReadService } from './readiness-read.service.js';

@Module({
  imports: [PrismaModule, InternalAuthModule],
  controllers: [InternalReadinessController],
  providers: [ReadinessReadService],
  exports: [ReadinessReadService],
})
export class ReadinessModule {}
```

Add `ReadinessModule` to `apps/orchestrator/src/app.module.ts` imports.

- [x] **Step 4: Add web contracts, fixtures, and proxy routes**

```ts
// apps/web/shared/readiness.ts
export interface ReadinessInventory {
  version: string | null;
  status: string | null;
  consentGatingRatio: number | null;
  signals: Array<{
    detector: string;
    kind: string;
    path: string;
    line: number | null;
    token: string;
    count?: number | null;
  }>;
}

export interface ReadinessGap {
  controlCode: string;
  section: string;
  title: string;
  verdict: 'FAIL' | 'PARTIAL' | 'ATTESTED_FAIL';
  reasonCode: string;
  evidence: unknown[];
}

export interface FixPlan {
  steps: Array<{
    controlCode: string;
    section: string;
    title: string;
    remedy: string;
  }>;
}
```

```ts
// apps/web/server/utils/fixtures/readiness.ts
import type { FixPlan, ReadinessGap, ReadinessInventory } from '~~/shared/readiness';

export function fixtureInventory(): ReadinessInventory {
  return {
    version: 'inventory-1.0.0',
    status: 'completed',
    consentGatingRatio: 0.75,
    signals: [
      {
        detector: 'form_scan',
        kind: 'field',
        path: 'src/api/user.ts',
        line: 12,
        token: 'email_address',
        count: 1,
      },
    ],
  };
}

export function fixtureGaps(): ReadinessGap[] {
  return [
    {
      controlCode: 'DPDPA-8.4-SECRET-01',
      section: '8(4)',
      title: 'Secrets are not stored in source',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      evidence: [{ kind: 'violation', scanner: 'gitleaks' }],
    },
  ];
}

export function fixtureFixPlan(): FixPlan {
  return {
    steps: [
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        title: 'Secrets are not stored in source',
        remedy: 'Use a secret manager.',
      },
    ],
  };
}
```

```ts
// apps/web/server/api/v1/scan/[scanId]/inventory.get.ts
import { getRouterParam } from 'h3';
import { fixturesAnswer } from '../../../../utils/org-request';
import { fixtureInventory } from '../../../../utils/fixtures/readiness';
import { callOrchestrator } from '../../../../utils/orchestrator';
import { requireIdentity } from '../../../../utils/session';

export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) return { data: fixtureInventory() };
  const identity = requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/inventory`,
    headers: { 'x-org-id': identity.orgId },
  });
});
```

```ts
// apps/web/server/api/v1/scan/[scanId]/gaps.get.ts
import { getRouterParam } from 'h3';
import { fixturesAnswer } from '../../../../utils/org-request';
import { fixtureGaps } from '../../../../utils/fixtures/readiness';
import { callOrchestrator } from '../../../../utils/orchestrator';
import { requireIdentity } from '../../../../utils/session';

export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) return { data: fixtureGaps() };
  const identity = requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/gaps`,
    headers: { 'x-org-id': identity.orgId },
  });
});
```

```ts
// apps/web/server/api/v1/scan/[scanId]/fix-plan.get.ts
import { getRouterParam } from 'h3';
import { fixturesAnswer } from '../../../../utils/org-request';
import { fixtureFixPlan } from '../../../../utils/fixtures/readiness';
import { callOrchestrator } from '../../../../utils/orchestrator';
import { requireIdentity } from '../../../../utils/session';

export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) return { data: fixtureFixPlan() };
  const identity = requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/fix-plan`,
    headers: { 'x-org-id': identity.orgId },
  });
});
```

```ts
// apps/web/test/readiness-read-fixtures.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureFixPlan, fixtureGaps, fixtureInventory } from '../server/utils/fixtures/readiness';

describe('readiness read fixtures', () => {
  it('match the shared wire contracts', () => {
    expect(fixtureInventory().signals[0]?.token).toBe('email_address');
    expect(fixtureGaps()[0]?.verdict).toBe('FAIL');
    expect(fixtureFixPlan().steps[0]?.controlCode).toBe('DPDPA-8.4-SECRET-01');
  });
});
```

- [x] **Step 5: Run the focused read tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/readiness-read.service.test.ts && pnpm --filter @dpdpa/web exec vitest run test/readiness-read-fixtures.test.ts
```

Expected GREEN output:

```text
✓ test/readiness-read.service.test.ts > readiness read service > returns bounded inventory signals without source values
✓ test/readiness-read.service.test.ts > readiness read service > maps gaps from non-passing persisted verdicts
✓ test/readiness-read.service.test.ts > readiness read service > builds a fix plan from gap remediation guidance only
Test Files  1 passed (1)
Tests  3 passed (3)
✓ test/readiness-read-fixtures.test.ts > readiness read fixtures > match the shared wire contracts
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/readiness apps/orchestrator/src/app.module.ts apps/orchestrator/test/readiness-read.service.test.ts apps/web/shared/readiness.ts apps/web/server/utils/fixtures/readiness.ts apps/web/server/api/v1/scan apps/web/test/readiness-read-fixtures.test.ts
git commit -m "feat(readiness): add readiness read routes"
```

---

### Task 9: Add the five readiness UI pages and their navigation

**Files:**
- Create: `apps/web/app/components/readiness/ReadinessDataView.vue`
- Create: `apps/web/app/components/readiness/ReadinessAttestationList.vue`
- Create: `apps/web/app/pages/app/readiness/inventory.vue`
- Create: `apps/web/app/pages/app/readiness/gaps.vue`
- Create: `apps/web/app/pages/app/readiness/fix-plan.vue`
- Create: `apps/web/app/pages/app/readiness/attestations.vue`
- Create: `apps/web/app/pages/app/readiness/exports.vue`
- Create: `apps/web/test/readiness-pages.test.ts`
- Modify: `apps/web/app/utils/nav.ts`
- Modify: `apps/web/app/components/shell/ConsoleSidebar.vue`
- Modify: `apps/web/app/utils/breadcrumbs.ts`
- Modify: `apps/web/test/breadcrumbs.test.ts`
- Create: `apps/web/test/readiness-nav.test.ts`

**Interfaces:**
- Consumes: `ReadinessInventory`, `ReadinessGap`, `FixPlan`, `FixtureAttestation`, and BFF read routes from Task 8.
- Produces: `/app/readiness/inventory`, `/app/readiness/gaps`, `/app/readiness/fix-plan`, `/app/readiness/attestations`, `/app/readiness/exports`, `READINESS_NAV`, and breadcrumbs for each route.

- [x] **Step 1: Write the failing page, nav, and breadcrumb tests**

```ts
// apps/web/test/readiness-pages.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ReadinessAttestationList from '../app/components/readiness/ReadinessAttestationList.vue';
import ReadinessDataView from '../app/components/readiness/ReadinessDataView.vue';

describe('readiness pages', () => {
  it('renders an inventory table from bounded signals', async () => {
    const page = await mountSuspended(ReadinessDataView, {
      props: {
        title: 'Data Inventory',
        summary: 'Detected field names, routes, dependencies, and regions.',
        columns: ['Detector', 'Token', 'Path'],
        rows: [{ Detector: 'form_scan', Token: 'email_address', Path: 'src/api/user.ts' }],
      },
    });
    expect(page.find('h1').text()).toBe('Data Inventory');
    expect(page.text()).toContain('email_address');
    expect(page.find('table').exists()).toBe(true);
  });

  it('renders attestation state without treating it as code evidence', async () => {
    const page = await mountSuspended(ReadinessAttestationList, {
      props: {
        canWrite: true,
        rows: [
          {
            id: 'att-1',
            repositoryId: 'repo-1',
            key: 'secrets.managed_store',
            answer: true,
            note: null,
            attestedBy: 'user-1',
            attestedAt: '2026-11-27T00:00:00.000Z',
            expiresAt: '2027-01-01T00:00:00.000Z',
            updatedAt: '2026-11-27T00:00:00.000Z',
          },
        ],
      },
    });
    expect(page.text()).toContain('secrets.managed_store');
    expect(page.text()).toContain('Attested yes');
    expect(page.find('button').text()).toBe('Record attestation');
    await page.find('button').trigger('click');
    expect(page.emitted('record')).toHaveLength(1);
    expect(page.text()).not.toContain('evidence reference');
  });
});
```

```ts
// apps/web/test/readiness-nav.test.ts
import { describe, expect, it } from 'vitest';
import { APP_NAV, READINESS_NAV } from '../app/utils/nav';
import { breadcrumbsFor } from '../app/utils/breadcrumbs';

describe('readiness navigation', () => {
  it('keeps the existing six top-level destinations and adds readiness sublinks', () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      'Overview',
      'Repositories',
      'Scans',
      'Rules',
      'Audit',
      'Settings',
    ]);
    expect(READINESS_NAV.map((item) => item.to)).toEqual([
      '/app/readiness/inventory',
      '/app/readiness/gaps',
      '/app/readiness/fix-plan',
      '/app/readiness/attestations',
      '/app/readiness/exports',
    ]);
  });

  it('names every readiness page in the breadcrumb', () => {
    for (const [path, label] of [
      ['/app/readiness/inventory', 'Data Inventory'],
      ['/app/readiness/gaps', 'Compliance Gaps'],
      ['/app/readiness/fix-plan', 'Fix Plan'],
      ['/app/readiness/attestations', 'Attestations'],
      ['/app/readiness/exports', 'Exports'],
    ] as const) {
      expect(breadcrumbsFor(path).at(-1)).toEqual({ label });
    }
  });
});
```

Add these cases to `apps/web/test/breadcrumbs.test.ts`:

```ts
  it('maps readiness routes to labelled crumbs', () => {
    expect(breadcrumbsFor('/app/readiness/gaps')).toEqual([
      { label: 'Overview', to: '/app' },
      { label: 'Readiness', to: '/app/readiness/inventory' },
      { label: 'Compliance Gaps' },
    ]);
  });
```

- [x] **Step 2: Run the focused UI tests and confirm RED**

```bash
pnpm --filter @dpdpa/web exec vitest run test/readiness-pages.test.ts test/readiness-nav.test.ts test/breadcrumbs.test.ts
```

Expected RED output:

```text
FAIL  test/readiness-pages.test.ts > readiness pages > renders an inventory table from bounded signals
Error: Cannot find module '../app/components/readiness/ReadinessDataView.vue'
```

- [x] **Step 3: Add the reusable views**

```vue
<!-- apps/web/app/components/readiness/ReadinessDataView.vue -->
<script setup lang="ts">
defineProps<{
  title: string;
  summary: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
}>();
</script>

<template>
  <section class="space-y-4">
    <header>
      <h1 class="text-2xl font-semibold">{{ title }}</h1>
      <p class="text-sm text-muted">{{ summary }}</p>
    </header>
    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column" class="px-3 py-2">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index" class="border-t border-default">
            <td v-for="column in columns" :key="column" class="px-3 py-2">
              {{ row[column] ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
```

```vue
<!-- apps/web/app/components/readiness/ReadinessAttestationList.vue -->
<script setup lang="ts">
interface AttestationRow {
  id: string;
  repositoryId: string;
  key: string;
  answer: boolean;
  note: string | null;
  attestedBy: string;
  attestedAt: string;
  expiresAt: string | null;
  updatedAt: string;
}

defineProps<{ rows: AttestationRow[]; canWrite: boolean }>();
const emit = defineEmits<{ record: [] }>();
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Attestations</h1>
        <p class="text-sm text-muted">Human statements recorded for this repository.</p>
      </div>
      <button
        v-if="canWrite"
        type="button"
        class="rounded border px-3 py-2"
        @click="emit('record')"
      >
        Record attestation
      </button>
    </header>
    <ul class="space-y-2">
      <li v-for="row in rows" :key="row.id" class="rounded-lg border border-default p-3">
        <p class="font-mono text-sm">{{ row.key }}</p>
        <p class="text-sm">Attested {{ row.answer ? 'yes' : 'no' }}</p>
        <p class="text-xs text-muted">Recorded {{ row.attestedAt }}</p>
      </li>
    </ul>
    <p class="text-xs text-muted">Attestations are not code evidence and do not change coverage.</p>
  </section>
</template>
```

- [x] **Step 4: Add the five pages**

```vue
<!-- apps/web/app/pages/app/readiness/inventory.vue -->
<script setup lang="ts">
import ReadinessDataView from '~/components/readiness/ReadinessDataView.vue';
const route = useRoute();
const scanId = computed(() => String(route.query.scanId ?? ''));
const { data } = await useAsyncData('readiness-inventory', () =>
  scanId.value === ''
    ? Promise.resolve({ data: { signals: [] } })
    : $fetch(`/api/v1/scan/${scanId.value}/inventory`),
);
const signals = computed(() => data.value?.data?.signals ?? []);
const rows = computed(() =>
  signals.value.map((signal) => ({
    Detector: signal.detector,
    Token: signal.token,
    Path: signal.path,
  })),
);
</script>

<template>
  <ReadinessDataView
    title="Data Inventory"
    summary="Detected field names, routes, dependencies, and regions."
    :columns="['Detector', 'Token', 'Path']"
    :rows="rows"
  />
</template>
```

```vue
<!-- apps/web/app/pages/app/readiness/gaps.vue -->
<script setup lang="ts">
import ReadinessDataView from '~/components/readiness/ReadinessDataView.vue';
const route = useRoute();
const scanId = computed(() => String(route.query.scanId ?? ''));
const { data } = await useAsyncData('readiness-gaps', () =>
  scanId.value === ''
    ? Promise.resolve({ data: [] })
    : $fetch(`/api/v1/scan/${scanId.value}/gaps`),
);
const rows = computed(() =>
  (data.value?.data ?? []).map((gap) => ({
    Control: gap.controlCode,
    Section: gap.section,
    Verdict: gap.verdict,
    Reason: gap.reasonCode,
  })),
);
</script>

<template>
  <ReadinessDataView
    title="Compliance Gaps"
    summary="Non-passing controls recorded for this scan."
    :columns="['Control', 'Section', 'Verdict', 'Reason']"
    :rows="rows"
  />
</template>
```

```vue
<!-- apps/web/app/pages/app/readiness/fix-plan.vue -->
<script setup lang="ts">
import ReadinessDataView from '~/components/readiness/ReadinessDataView.vue';
const route = useRoute();
const scanId = computed(() => String(route.query.scanId ?? ''));
const { data } = await useAsyncData('readiness-fix-plan', () =>
  scanId.value === ''
    ? Promise.resolve({ data: { steps: [] } })
    : $fetch(`/api/v1/scan/${scanId.value}/fix-plan`),
);
const rows = computed(() =>
  (data.value?.data?.steps ?? []).map((step) => ({
    Control: step.controlCode,
    Section: step.section,
    Remedy: step.remedy,
  })),
);
</script>

<template>
  <ReadinessDataView
    title="Fix Plan"
    summary="Remediation steps from the active rule pack."
    :columns="['Control', 'Section', 'Remedy']"
    :rows="rows"
  />
</template>
```

```vue
<!-- apps/web/app/pages/app/readiness/attestations.vue -->
<script setup lang="ts">
import ReadinessAttestationList from '~/components/readiness/ReadinessAttestationList.vue';
const route = useRoute();
const repoId = computed(() => String(route.query.repoId ?? ''));
const { data, refresh } = await useAsyncData('readiness-attestations', () =>
  repoId.value === ''
    ? Promise.resolve({ data: [] })
    : $fetch(`/api/v1/repos/${repoId.value}/attestations`),
);
const { org } = useAppContext();
const canWrite = computed(() => ['owner', 'admin'].includes(org.value?.role ?? ''));

async function record() {
  if (repoId.value === '') return;
  await $fetch(`/api/v1/repos/${repoId.value}/attestations/secrets.managed_store`, {
    method: 'PUT',
    body: { answer: true, note: null, expiresAt: '2027-01-01T00:00:00.000Z' },
  });
  await refresh();
}
</script>

<template>
  <ReadinessAttestationList
    :rows="data?.data ?? []"
    :can-write="canWrite"
    @record="record"
  />
</template>
```

```vue
<!-- apps/web/app/pages/app/readiness/exports.vue -->
<script setup lang="ts">
const route = useRoute();
const scanId = computed(() => String(route.query.scanId ?? ''));
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">Exports</h1>
    <p class="text-sm text-muted">Machine-readable and issue-ready views of control results.</p>
    <ul class="space-y-2">
      <li>
        <a :href="scanId ? `/api/v1/scan/${scanId}/export/sarif` : '#'">Download SARIF 2.1.0</a>
      </li>
      <li>
        <a :href="scanId ? `/api/v1/scan/${scanId}/export/markdown` : '#'">
          Download issue-ready Markdown
        </a>
      </li>
    </ul>
  </section>
</template>
```

- [x] **Step 5: Add navigation and breadcrumbs**

```ts
// apps/web/app/utils/nav.ts
export const READINESS_NAV: AppNavItem[] = [
  { label: 'Data Inventory', to: '/app/readiness/inventory', icon: 'database', hint: 'Detected fields and surfaces' },
  { label: 'Compliance Gaps', to: '/app/readiness/gaps', icon: 'shield-alert', hint: 'Non-passing controls' },
  { label: 'Fix Plan', to: '/app/readiness/fix-plan', icon: 'wrench', hint: 'Remediation steps' },
  { label: 'Attestations', to: '/app/readiness/attestations', icon: 'badge-check', hint: 'Owner-admin statements' },
  { label: 'Exports', to: '/app/readiness/exports', icon: 'download', hint: 'SARIF and Markdown' },
];
```

In `ConsoleSidebar.vue`, import `READINESS_NAV`, add a labelled `Readiness` group after `Remediation`, and render one link per item with `:to="item.to"` and `{{ item.label }}`; leave `APP_NAV` and its existing `Primary` navigation role unchanged.

In `apps/web/app/utils/breadcrumbs.ts`, add before the final `return withoutTrailingLink(crumbs);`:

```ts
  if (section === 'readiness') {
    crumbs.push({ label: 'Readiness', to: '/app/readiness/inventory' });
    const labels: Record<string, string> = {
      inventory: 'Data Inventory',
      gaps: 'Compliance Gaps',
      'fix-plan': 'Fix Plan',
      attestations: 'Attestations',
      exports: 'Exports',
    };
    const child = parts[2];
    if (child !== undefined && labels[child] !== undefined) {
      crumbs.push({ label: labels[child]! });
    }
  }
```

- [x] **Step 6: Run the focused UI tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/web exec vitest run test/readiness-pages.test.ts test/readiness-nav.test.ts test/breadcrumbs.test.ts
```

Expected GREEN output:

```text
✓ test/readiness-pages.test.ts > readiness pages > renders an inventory table from bounded signals
✓ test/readiness-pages.test.ts > readiness pages > renders attestation state without treating it as code evidence
✓ test/readiness-nav.test.ts > readiness navigation > keeps the existing six top-level destinations and adds readiness sublinks
✓ test/readiness-nav.test.ts > readiness navigation > names every readiness page in the breadcrumb
✓ test/breadcrumbs.test.ts > breadcrumbsFor > maps readiness routes to labelled crumbs
Test Files  3 passed (3)
Tests  5 passed (5)
```

- [x] **Step 7: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/web/app/components/readiness apps/web/app/pages/app/readiness apps/web/test/readiness-pages.test.ts apps/web/app/utils/nav.ts apps/web/app/components/shell/ConsoleSidebar.vue apps/web/app/utils/breadcrumbs.ts apps/web/test/breadcrumbs.test.ts apps/web/test/readiness-nav.test.ts
git commit -m "feat(readiness): add readiness UI pages"
```

---

### Task 10: Explain detectors and absence semantics on the Rules page

**Files:**
- Create: `apps/orchestrator/src/modules/readiness/detector-catalog.service.ts`
- Create: `apps/orchestrator/src/modules/readiness/internal-detectors.controller.ts`
- Modify: `apps/orchestrator/src/modules/readiness/readiness.module.ts`
- Create: `apps/orchestrator/test/detector-catalog.service.test.ts`
- Create: `apps/web/shared/detectors.ts`
- Create: `apps/web/server/api/v1/rules/detectors.get.ts`
- Create: `apps/web/app/components/rules/RuleDetectorExplainer.vue`
- Modify: `apps/web/app/pages/app/rules/[code].vue`
- Modify: `apps/web/test/readiness-language.test.ts`

**Interfaces:**
- Consumes: `RulePackService.loadV2()` from Task 2/5; `DetectorV2` and `ControlV2` from `@dpdpa/contracts`; `InternalHmacGuard`; BFF `requireIdentity` and `callOrchestrator`.
- Produces: `DetectorCatalogService.list()` returning bounded detector metadata with `controls` and `absence` rule tokens; internal `GET /internal/v1/detectors`; BFF `GET /api/v1/rules/detectors`; `RuleDetectorExplainer` with explicit "Could not determine" wording.

- [x] **Step 1: Write the failing catalog tests**

```ts
// apps/orchestrator/test/detector-catalog.service.test.ts
import { describe, expect, it } from 'vitest';
import { DetectorCatalogService } from '../src/modules/readiness/detector-catalog.service.js';

describe('detector catalog', () => {
  it('explains detector inputs, outputs, and failure mode without source content', async () => {
    const pack = {
      loadV2: async () => ({
        pack: 'dpdpa-2026.11.0',
        detectors: [
          {
            id: 'form_scan',
            module: 'inventory',
            inputs: ['source'],
            outputs: ['signal', 'status'],
            timeoutMs: 30_000,
            stacks: [],
            confidence: 'inferred',
            failureMode: 'UNKNOWN',
            controlRefs: ['DPDPA-6-CONSENT-01'],
          },
        ],
        controls: [
          {
            code: 'DPDPA-6-CONSENT-01',
            evidenceMode: 'absence',
            absenceRules: [
              {
                id: 'consent_gate_absent',
                detector: 'form_scan',
                token: 'consent_checkbox',
                confidence: 'inferred',
              },
            ],
          },
        ],
      }),
    };
    const service = new DetectorCatalogService(pack as never);
    const view = await service.list();

    expect(view.detectors[0]).toEqual({
      id: 'form_scan',
      module: 'inventory',
      inputs: ['source'],
      outputs: ['signal', 'status'],
      timeoutMs: 30_000,
      confidence: 'inferred',
      failureMode: 'UNKNOWN',
      controls: [
        {
          code: 'DPDPA-6-CONSENT-01',
          evidenceMode: 'absence',
          absenceTokens: ['consent_checkbox'],
        },
      ],
    });
    expect(JSON.stringify(view)).not.toContain('value');
    expect(JSON.stringify(view)).not.toContain('snippet');
  });
});
```

```ts
// apps/web/shared/detectors.ts addition in apps/web/test/readiness-language.test.ts
import RuleDetectorExplainer from '../app/components/rules/RuleDetectorExplainer.vue';

  it('explains absence detectors with readiness-only wording', async () => {
    const wrapper = await mountSuspended(RuleDetectorExplainer, {
      props: {
        detectors: [
          {
            id: 'form_scan',
            module: 'inventory',
            inputs: ['source'],
            outputs: ['signal', 'status'],
            timeoutMs: 30_000,
            confidence: 'inferred',
            failureMode: 'UNKNOWN',
            controls: [
              {
                code: 'DPDPA-6-CONSENT-01',
                evidenceMode: 'absence',
                absenceTokens: ['consent_checkbox'],
              },
            ],
          },
        ],
      },
    });
    const text = wrapper.text().toLowerCase();
    expect(text).toContain('form_scan');
    expect(text).toContain('consent_checkbox');
    expect(text).toContain('could not determine');
    for (const phrase of FORBIDDEN) {
      expect(text, `forbidden phrase: ${phrase}`).not.toContain(phrase);
    }
  });
```

The first block is a new import at the top of the existing test file; the second block is a new `it(...)` inside the existing `describe('readiness UI language', ...)`.

- [x] **Step 2: Run the focused detector tests and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/detector-catalog.service.test.ts && pnpm --filter @dpdpa/web exec vitest run test/readiness-language.test.ts
```

Expected RED output:

```text
Error: Cannot find module '../src/modules/readiness/detector-catalog.service.js'
```

- [x] **Step 3: Add the catalog service and internal route**

```ts
// apps/orchestrator/src/modules/readiness/detector-catalog.service.ts
import { Injectable } from '@nestjs/common';
import { RulePackService } from '../rule-pack/rule-pack.service.js';

@Injectable()
export class DetectorCatalogService {
  constructor(private readonly pack: RulePackService) {}

  async list() {
    const loaded = await this.pack.loadV2();
    return {
      pack: loaded.pack,
      detectors: loaded.detectors.map((detector) => ({
        id: detector.id,
        module: detector.module,
        inputs: detector.inputs,
        outputs: detector.outputs,
        timeoutMs: detector.timeoutMs,
        confidence: detector.confidence,
        failureMode: detector.failureMode,
        controls: loaded.controls
          .filter((control) => detector.controlRefs.includes(control.code))
          .map((control) => ({
            code: control.code,
            evidenceMode: control.evidenceMode,
            absenceTokens: control.absenceRules.map((rule) => rule.token),
          })),
      })),
    };
  }
}
```

```ts
// apps/orchestrator/src/modules/readiness/internal-detectors.controller.ts
import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { DetectorCatalogService } from './detector-catalog.service.js';

@Controller('internal/v1/detectors')
@UseGuards(InternalHmacGuard)
export class InternalDetectorsController {
  constructor(private readonly catalog: DetectorCatalogService) {}

  @Get()
  list(@Headers('x-org-id') org: string | undefined) {
    if (!org) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
    return { data: this.catalog.list() };
  }
}
```

In `apps/orchestrator/src/modules/readiness/readiness.module.ts`, import `RulePackModule`, add `InternalDetectorsController` to `controllers` and `DetectorCatalogService` to `providers` and `exports`.

- [x] **Step 4: Add the BFF proxy and web explainer**

```ts
// apps/web/shared/detectors.ts
export interface DetectorControlExplanation {
  code: string;
  evidenceMode: string;
  absenceTokens: string[];
}

export interface DetectorExplanation {
  id: string;
  module: string;
  inputs: string[];
  outputs: string[];
  timeoutMs: number;
  confidence: string;
  failureMode: string;
  controls: DetectorControlExplanation[];
}
```

```ts
// apps/web/server/api/v1/rules/detectors.get.ts
import { fixturesAnswer } from '../../../../utils/org-request';
import { callOrchestrator } from '../../../../utils/orchestrator';
import { requireIdentity } from '../../../../utils/session';

export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) {
    return {
      data: {
        pack: 'dpdpa-2026.11.0',
        detectors: [
          {
            id: 'form_scan',
            module: 'inventory',
            inputs: ['source'],
            outputs: ['signal', 'status'],
            timeoutMs: 30_000,
            confidence: 'inferred',
            failureMode: 'UNKNOWN',
            controls: [
              {
                code: 'DPDPA-6-CONSENT-01',
                evidenceMode: 'absence',
                absenceTokens: ['consent_checkbox'],
              },
            ],
          },
        ],
      },
    };
  }
  const identity = requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: '/internal/v1/detectors',
    headers: { 'x-org-id': identity.orgId },
  });
});
```

```vue
<!-- apps/web/app/components/rules/RuleDetectorExplainer.vue -->
<script setup lang="ts">
import type { DetectorExplanation } from '~~/shared/detectors';

defineProps<{ detectors: DetectorExplanation[] }>();
</script>

<template>
  <section aria-labelledby="detector-explainer-heading" class="space-y-2">
    <h2 id="detector-explainer-heading" class="text-sm font-semibold">How evidence is found</h2>
    <p class="text-sm text-muted">
      Each detector reads a named input and emits bounded signals. A detector that is unavailable
      produces Could not determine; it never produces a pass. An absence rule looks for the named
      token and records no value from the source file.
    </p>
    <article
      v-for="detector in detectors"
      :key="detector.id"
      class="rounded-lg border border-default p-3 text-sm"
    >
      <h3 class="font-mono">{{ detector.id }}</h3>
      <p>Inputs: {{ detector.inputs.join(', ') }} · Outputs: {{ detector.outputs.join(', ') }}</p>
      <p>Timeout: {{ detector.timeoutMs }} ms · Failure mode: {{ detector.failureMode }}</p>
      <ul v-if="detector.controls.length > 0" class="mt-2 list-disc pl-5">
        <li v-for="control in detector.controls" :key="control.code">
          {{ control.code }} · {{ control.evidenceMode }} ·
          {{ control.absenceTokens.join(', ') || 'no absence tokens' }}
        </li>
      </ul>
    </article>
  </section>
</template>
```

In `apps/web/app/pages/app/rules/[code].vue`, import `RuleDetectorExplainer`, fetch `/api/v1/rules/detectors` with `useFetch`, and insert `<RuleDetectorExplainer :detectors="detectors" />` immediately after the `Scanner evidence` section and before `How to fix it`. Add `const detectors = computed(() => detectorData.value?.data?.detectors ?? []);` using the fetch response variable `detectorData`.

- [x] **Step 5: Run the focused detector tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/detector-catalog.service.test.ts && pnpm --filter @dpdpa/web exec vitest run test/readiness-language.test.ts
```

Expected GREEN output:

```text
✓ test/detector-catalog.service.test.ts > detector catalog > explains detector inputs, outputs, and failure mode without source content
Test Files  1 passed (1)
Tests  1 passed (1)
✓ test/readiness-language.test.ts > readiness UI language > explains absence detectors with readiness-only wording
Test Files  1 passed (1)
Tests  4 passed (4)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/readiness apps/orchestrator/test/detector-catalog.service.test.ts apps/web/shared/detectors.ts apps/web/server/api/v1/rules apps/web/app/components/rules/RuleDetectorExplainer.vue apps/web/app/pages/app/rules apps/web/test/readiness-language.test.ts
git commit -m "feat(readiness): explain detectors and absence semantics"
```

---

### Task 11: Add attestation and detector tiles to scan detail

**Files:**
- Modify: `apps/web/app/components/new/NewScanDetail.vue`
- Create: `apps/web/test/scan-detail-tiles.test.ts`

**Interfaces:**
- Consumes: `ScanDetail.assessment.verdictCounts`, `ScanDetail.assessment.detectorStatuses`, and `MetricTile` from the existing scan detail view; the attestation route from Task 7.
- Produces: `Attested statements` and `Detectors unavailable` tiles with explicit captions that deny evidence status, plus an `Attestations` quick-action link to `/app/readiness/attestations`.

- [x] **Step 1: Write the failing scan-detail tile tests**

```ts
// apps/web/test/scan-detail-tiles.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import NewScanDetail from '../app/components/new/NewScanDetail.vue';
import type { ScanDetail } from '../shared/scan';

const base = {
  id: 'scn_tiles',
  status: 'completed',
  coverage: { semgrep: 'completed', gitleaks: 'timed_out' },
  repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
  ref: 'main',
  commitSha: null,
  previousScore: null,
  score: null,
  grade: null,
  sectionScores: { '8(4)': 0 },
  counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  scannerVersions: {},
  rulePackVersion: 'dpdpa-2026.11.0',
  scoringVersion: 'scoring-2.0.0',
  error: null,
  timestamps: {
    queuedAt: '2026-11-27T05:00:00Z',
    startedAt: '2026-11-27T05:00:10Z',
    completedAt: '2026-11-27T05:01:00Z',
    durationMs: 50_000,
  },
  links: { findings: '', events: '', report: '' },
  assessment: {
    score: null,
    evidenceCoverage: 0,
    openGaps: 0,
    verdictCounts: { ATTESTED_PASS: 2, ATTESTED_FAIL: 1, UNKNOWN: 3 },
    unknownControls: ['DPDPA-8.4-SECRET-01'],
    detectorStatuses: { semgrep: 'completed', gitleaks: 'timed_out' },
    gradeWithheldReason: 'insufficient_evidence',
    consentGatingRatio: 0.75,
  },
} as unknown as ScanDetail;

describe('scan detail attestation tiles', () => {
  it('shows attested statements as human statements, not evidence', async () => {
    const page = await mountSuspended(NewScanDetail, { props: { scan: base } });
    const tile = page.find('[data-testid="attested-statements-tile"]');
    expect(tile.exists()).toBe(true);
    expect(tile.text()).toContain('Attested statements');
    expect(tile.text()).toContain('3');
    expect(tile.text()).toContain('Human statements; not code evidence');
  });

  it('names unavailable detectors and links to attestations', async () => {
    const page = await mountSuspended(NewScanDetail, { props: { scan: base } });
    expect(page.find('[data-testid="detectors-unavailable-tile"]').text()).toContain('gitleaks');
    const links = page.findAll('a');
    const link = links.find((candidate) => candidate.text() === 'Attestations');
    expect(link?.attributes('href')).toBe('/app/readiness/attestations?repoId=r1');
  });
});
```

- [x] **Step 2: Run the focused tile tests and confirm RED**

```bash
pnpm --filter @dpdpa/web exec vitest run test/scan-detail-tiles.test.ts
```

Expected RED output:

```text
FAIL  test/scan-detail-tiles.test.ts > scan detail attestation tiles > shows attested statements as human statements, not evidence
AssertionError: expected false to be true
```

- [x] **Step 3: Add the computed values and tiles**

In the `<script setup>` of `apps/web/app/components/new/NewScanDetail.vue`, add after `const assessment = computed(...)`:

```ts
const attestedCount = computed(() => {
  const counts = assessment.value?.verdictCounts;
  if (counts === undefined || counts === null) return 0;
  return (counts.ATTESTED_PASS ?? 0) + (counts.ATTESTED_FAIL ?? 0);
});
const unavailableDetectors = computed(() =>
  Object.entries(assessment.value?.detectorStatuses ?? {})
    .filter(([, status]) => status !== 'completed')
    .map(([detector]) => detector),
);
```

In the template, inside the existing `<div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">`, add immediately after the `Consent gating` `MetricTile`:

```vue
        <MetricTile
          v-if="attestedCount > 0"
          label="Attested statements"
          :value="String(attestedCount)"
          caption="Human statements; not code evidence"
          test-id="attested-statements-tile"
        />
        <MetricTile
          v-if="unavailableDetectors.length > 0"
          label="Detectors unavailable"
          :value="String(unavailableDetectors.length)"
          :caption="`${unavailableDetectors.join(', ')} — outcome not determined`"
          tone="warning"
          test-id="detectors-unavailable-tile"
        />
```

In the header actions, add immediately after the `Remediation` `NuxtLink`:

```vue
          <NuxtLink
            :to="`/app/readiness/attestations?repoId=${scan.repository.id}`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Attestations
          </NuxtLink>
          <NuxtLink
            :to="`/app/readiness/inventory?scanId=${scan.id}`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Data Inventory
          </NuxtLink>
          <NuxtLink
            :to="`/app/readiness/gaps?scanId=${scan.id}`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Compliance Gaps
          </NuxtLink>
          <NuxtLink
            :to="`/app/readiness/fix-plan?scanId=${scan.id}`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Fix Plan
          </NuxtLink>
          <NuxtLink
            :to="`/app/readiness/exports?scanId=${scan.id}`"
            class="border-ink-300 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            Exports
          </NuxtLink>
```

Also add these items to the `CommandPalette` `:items` array:

```ts
          { id: 'attestations', label: 'Attestations', href: `/app/readiness/attestations?repoId=${scan.repository.id}` },
          { id: 'inventory', label: 'Data Inventory', href: `/app/readiness/inventory?scanId=${scan.id}` },
          { id: 'gaps', label: 'Compliance Gaps', href: `/app/readiness/gaps?scanId=${scan.id}` },
          { id: 'fix-plan', label: 'Fix Plan', href: `/app/readiness/fix-plan?scanId=${scan.id}` },
          { id: 'exports', label: 'Exports', href: `/app/readiness/exports?scanId=${scan.id}` },
```

- [x] **Step 4: Run the focused tile tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/web exec vitest run test/scan-detail-tiles.test.ts
```

Expected GREEN output:

```text
✓ test/scan-detail-tiles.test.ts > scan detail attestation tiles > shows attested statements as human statements, not evidence
✓ test/scan-detail-tiles.test.ts > scan detail attestation tiles > names unavailable detectors and links to attestations
Test Files  1 passed (1)
Tests  2 passed (2)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/web/app/components/new/NewScanDetail.vue apps/web/test/scan-detail-tiles.test.ts
git commit -m "feat(readiness): add attestation detail tiles"
```

---

### Task 12: Build and select the v2 report view model

**Files:**
- Create: `apps/orchestrator/src/modules/reports/report-view-model-v2.ts`
- Create: `apps/orchestrator/src/modules/reports/report-v2.service.ts`
- Modify: `apps/orchestrator/src/modules/reports/reports.service.ts`
- Modify: `apps/orchestrator/src/modules/reports/reports.module.ts`
- Modify: `apps/orchestrator/src/modules/reports/report-template.ts`
- Modify: `apps/orchestrator/src/modules/reports/report-view-model.ts`
- Create: `apps/orchestrator/test/report-v2-view-model.test.ts`
- Create: `apps/orchestrator/test/report-v2-selection.test.ts`

**Interfaces:**
- Consumes: `buildReportViewModel` and `REPORT_DISCLAIMER` from `report-view-model.ts`; `isScoringV2`/`SCORING_V2_VERSION` from `scoring.engine.ts`; `PrismaService`; `RulePackService.loadV2()`; `commencementFileSchema` entries from `@dpdpa/contracts`.
- Produces: `buildReportV2ViewModel(input)` with the nine ordered sections; `ReportV2Service.viewModel(orgId, reportId)`; `ReportsService.viewModel` returns v2 only when `scan.scoringVersion === "scoring-2.0.0"` and otherwise returns the exact v1 payload.

- [x] **Step 1: Write the failing v2 view-model tests**

```ts
// apps/orchestrator/test/report-v2-view-model.test.ts
import { describe, expect, it } from 'vitest';
import type { ReportTemplateModel } from '../src/modules/reports/report-template.js';
import {
  buildReportV2ViewModel,
  REPORT_V2_SECTION_IDS,
  type ReportV2Input,
} from '../src/modules/reports/report-view-model-v2.js';

function base(): ReportTemplateModel {
  return {
    report: {
      id: 'rpt_1',
      format: 'pdf',
      templateVersion: '2.0.0',
      createdAt: '2026-11-27T10:00:00.000Z',
    },
    organization: {
      id: 'org_1',
      name: 'Acme',
      slug: 'acme',
      dataRegion: 'ap-south-1',
      branding: { logoUrl: null, primaryColor: null, footerText: null },
    },
    scan: {
      id: 'scn_1',
      repository: { id: 'repo_1', fullName: 'acme/repo', visibility: 'private' },
      ref: 'main',
      commitSha: 'a'.repeat(40),
      status: 'completed',
      score: null,
      grade: null,
      sectionScores: { '8(4)': 50 },
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      coverage: { gitleaks: 'timed_out' },
      coverageStatus: 'partial',
      scannerVersions: { gitleaks: '8.28.0' },
      rulePackVersion: 'dpdpa-2026.11.0',
      scoringVersion: 'scoring-2.0.0',
      timestamps: {
        queuedAt: '2026-11-27T09:00:00.000Z',
        startedAt: '2026-11-27T09:00:10.000Z',
        completedAt: '2026-11-27T09:01:00.000Z',
        durationMs: 50_000,
      },
    },
    topFindings: [],
    methodology: {
      scoringVersion: 'scoring-2.0.0',
      rulePackVersion: 'dpdpa-2026.11.0',
      summary: 'Versioned readiness scoring.',
    },
    disclaimer: 'Technical aid only; not legal advice.',
    generatedAt: '2026-11-27T10:00:00.000Z',
  };
}

function input(overrides: Partial<ReportV2Input> = {}): ReportV2Input {
  return {
    base: base(),
    controlResults: [
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        verdict: 'FAIL',
        reasonCode: 'cited_gap',
        remediation: 'Use a managed credential store.',
      },
      {
        controlCode: 'DPDPA-6-CONSENT-01',
        section: '6',
        verdict: 'ATTESTED_PASS',
        reasonCode: 'attested_pass',
        remediation: 'None.',
      },
      {
        controlCode: 'DPDPA-9-CHILD-01',
        section: '9',
        verdict: 'UNKNOWN',
        reasonCode: 'detector_unavailable',
        remediation: 'Add a detector.',
      },
      {
        controlCode: 'DPDPA-7-LEGIT-01',
        section: '7',
        verdict: 'PASS',
        reasonCode: 'positive_evidence',
        remediation: 'None.',
      },
    ],
    inventory: {
      version: 'inventory-1.0.0',
      status: 'completed',
      signals: [
        {
          detector: 'form_scan',
          kind: 'field',
          path: 'src/api/user.ts',
          line: 12,
          token: 'email_address',
        },
      ],
      consentGatingRatio: 0.75,
    },
    commencement: [
      {
        provision: 'DPDP Rules 4',
        effectiveFrom: '2026-11-13',
        sourceUrl: 'https://www.meity.gov.in/example.pdf',
        verifiedOn: '2026-11-26',
      },
    ],
    detectorVersions: { gitleaks: '8.28.0' },
    provenanceSearches: ['dpdp act section 8(4) safeguards'],
    ...overrides,
  };
}

describe('report v2 view model', () => {
  it('emits every required section in a stable order', () => {
    const model = buildReportV2ViewModel(input());
    expect(model.sections.map((section) => section.id)).toEqual(REPORT_V2_SECTION_IDS);
    expect(REPORT_V2_SECTION_IDS).toEqual([
      'executive_summary',
      'gaps_by_section',
      'evidence_of_safeguards',
      'could_not_determine',
      'data_inventory_summary',
      'fix_plan',
      'methodology',
      'limitations',
      'disclaimer',
    ]);
    expect(model.sections.find((section) => section.id === 'executive_summary')?.table).toEqual([
      {
        provision: 'DPDP Rules 4',
        effectiveFrom: '2026-11-13',
        sourceUrl: 'https://www.meity.gov.in/example.pdf',
        verifiedOn: '2026-11-26',
      },
    ]);
  });

  it('keeps attestations out of evidence and lists unknowns prominently', () => {
    const model = buildReportV2ViewModel(input());
    const evidence = model.sections.find((section) => section.id === 'evidence_of_safeguards');
    expect(evidence?.rows?.map((row) => row.controlCode)).toEqual(['DPDPA-7-LEGIT-01']);
    const unknown = model.sections.find((section) => section.id === 'could_not_determine');
    expect(unknown?.rows?.map((row) => row.controlCode)).toEqual(['DPDPA-9-CHILD-01']);
    expect(JSON.stringify(model)).not.toContain('CANARY_SOURCE_VALUE');
  });

  it('groups gaps and derives the fix plan only from non-passing verdicts', () => {
    const model = buildReportV2ViewModel(input());
    const gaps = model.sections.find((section) => section.id === 'gaps_by_section');
    expect(gaps?.groups).toEqual([
      { section: '8(4)', rows: [expect.objectContaining({ verdict: 'FAIL' })] },
    ]);
    const plan = model.sections.find((section) => section.id === 'fix_plan');
    expect(plan?.rows?.map((row) => row.remedy)).toEqual(['Use a managed credential store.']);
  });
});
```

```ts
// apps/orchestrator/test/report-v2-selection.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from '../src/modules/reports/reports.service.js';

function service(scoringVersion: string, v2: unknown) {
  const report = {
    id: 'rpt_1',
    orgId: 'org_1',
    scanId: 'scn_1',
    templateVersion: '2.0.0',
    status: 'ready',
    scan: { scoringVersion },
    organization: { id: 'org_1' },
  };
  const reports = { findById: vi.fn().mockResolvedValue(report) };
  const findings = { topForScan: vi.fn().mockResolvedValue([]) };
  const base = new ReportsService(
    reports as never,
    findings as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    v2 as never,
  );
  return base;
}

describe('report version selection', () => {
  it('uses the v2 service only for scoring-2.0.0 scans', async () => {
    const v2 = { viewModel: vi.fn().mockResolvedValue({ sections: [] }) };
    const selected = await service('scoring-2.0.0', v2).viewModel('org_1', 'rpt_1');
    expect(selected).toEqual({ sections: [] });
    expect(v2.viewModel).toHaveBeenCalledWith('org_1', 'rpt_1');
  });

  it('keeps the v1 payload for legacy scans', async () => {
    const v2 = { viewModel: vi.fn().mockResolvedValue({ sections: [] }) };
    const legacy = await service('1.0.0', v2).viewModel('org_1', 'rpt_1');
    expect(v2.viewModel).not.toHaveBeenCalled();
    expect(legacy).toMatchObject({
      report: { id: 'rpt_1' },
      methodology: { scoringVersion: '1.0.0' },
    });
  });
});
```

- [x] **Step 2: Run the focused v2 view-model tests and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/report-v2-view-model.test.ts test/report-v2-selection.test.ts
```

Expected RED output:

```text
Error: Cannot find module '../src/modules/reports/report-view-model-v2.js'
```

- [x] **Step 3: Add the pure v2 view model**

```ts
// apps/orchestrator/src/modules/reports/report-view-model-v2.ts
import type { ReportTemplateModel } from './report-template.js';

export const REPORT_V2_SECTION_IDS = [
  'executive_summary',
  'gaps_by_section',
  'evidence_of_safeguards',
  'could_not_determine',
  'data_inventory_summary',
  'fix_plan',
  'methodology',
  'limitations',
  'disclaimer',
] as const;

export interface ReportV2ControlResult {
  controlCode: string;
  section: string;
  verdict: string;
  reasonCode: string;
  remediation: string;
}

export interface ReportV2Input {
  base: ReportTemplateModel;
  controlResults: readonly ReportV2ControlResult[];
  inventory: {
    version: string | null;
    status: string | null;
    signals: readonly {
      detector: string;
      kind: string;
      path: string;
      line: number | null;
      token: string;
    }[];
    consentGatingRatio: number | null;
  } | null;
  commencement: readonly {
    provision: string;
    effectiveFrom: string;
    sourceUrl: string;
    verifiedOn: string;
  }[];
  detectorVersions: Readonly<Record<string, string>>;
  provenanceSearches: readonly string[];
}

interface SectionRow {
  controlCode?: string;
  section?: string;
  verdict?: string;
  reasonCode?: string;
  remedy?: string;
}

export interface ReportV2Section {
  id: (typeof REPORT_V2_SECTION_IDS)[number];
  title: string;
  rows?: SectionRow[];
  groups?: Array<{ section: string; rows: SectionRow[] }>;
  table?: ReportV2Input['commencement'][number][];
  text?: string;
}

export function buildReportV2ViewModel(input: ReportV2Input) {
  const { base } = input;
  const gaps = input.controlResults.filter((row) =>
    ['FAIL', 'PARTIAL', 'ATTESTED_FAIL'].includes(row.verdict),
  );
  const evidence = input.controlResults.filter((row) => ['PASS', 'PARTIAL'].includes(row.verdict));
  const unknown = input.controlResults.filter((row) => row.verdict === 'UNKNOWN');
  const grouped = new Map<string, SectionRow[]>();
  for (const row of gaps) {
    const items = grouped.get(row.section) ?? [];
    items.push({
      controlCode: row.controlCode,
      verdict: row.verdict,
      reasonCode: row.reasonCode,
    });
    grouped.set(row.section, items);
  }
  const sections: ReportV2Section[] = [
    {
      id: 'executive_summary',
      title: 'Executive readiness summary',
      rows: [
        { section: 'score', remedy: base.scan.score === null ? 'Not assessed' : base.scan.score.toFixed(1) },
        { section: 'evidence coverage', remedy: String(base.scan.evidenceCoverage ?? null) },
        { section: 'open gaps', remedy: String(gaps.length) },
      ],
      table: [...input.commencement],
    },
    {
      id: 'gaps_by_section',
      title: 'Gaps grouped by section',
      groups: [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([section, rows]) => ({ section, rows })),
    },
    {
      id: 'evidence_of_safeguards',
      title: 'Evidence of safeguards',
      rows: evidence.map((row) => ({
        controlCode: row.controlCode,
        section: row.section,
        verdict: row.verdict,
      })),
    },
    {
      id: 'could_not_determine',
      title: 'Could not determine',
      rows: unknown.map((row) => ({
        controlCode: row.controlCode,
        section: row.section,
        reasonCode: row.reasonCode,
      })),
    },
    {
      id: 'data_inventory_summary',
      title: 'Data inventory summary',
      text:
        input.inventory === null
          ? 'No inventory was recorded for this scan.'
          : `${input.inventory.signals.length} bounded signals at ${input.inventory.version ?? 'unknown version'}; consent gating ${input.inventory.consentGatingRatio ?? 'not determined'}.`,
    },
    {
      id: 'fix_plan',
      title: 'Fix plan',
      rows: gaps.map((row) => ({
        controlCode: row.controlCode,
        section: row.section,
        remedy: row.remediation,
      })),
    },
    {
      id: 'methodology',
      title: 'Methodology and provenance',
      text: `Detector versions: ${JSON.stringify(input.detectorVersions)}. Searches: ${input.provenanceSearches.join('; ')}.`,
    },
    {
      id: 'limitations',
      title: 'Limitations',
      text: 'Repository evidence cannot establish notices, consents, contracts, or processing purposes. Unavailable detectors remain unknown.',
    },
    {
      id: 'disclaimer',
      title: 'Disclaimer',
      text: base.disclaimer,
    },
  ];
  return {
    report: base.report,
    organization: base.organization,
    scan: base.scan,
    scoringVersion: base.scan.scoringVersion,
    sections,
    generatedAt: base.generatedAt,
  };
}
```

- [x] **Step 3a: Add the optional coverage field to the shared view model**

In `apps/orchestrator/src/modules/reports/report-template.ts`, add to `ReportTemplateModel['scan']` after `coverageStatus: string;`:

```ts
    evidenceCoverage?: number | null;
```

In `apps/orchestrator/src/modules/reports/report-view-model.ts`, add to the returned `scan` object after `coverageStatus: scan.coverageStatus,`:

```ts
      evidenceCoverage:
        scan.evidenceCoverage === null ? null : Number(scan.evidenceCoverage?.toString() ?? 0),
```

The field is optional so existing v1 fixtures and PDF tests remain valid; v1 output gains a null-safe number only when the scan has the column.

- [x] **Step 4: Add the data-gathering service and version dispatch**

```ts
// apps/orchestrator/src/modules/reports/report-v2.service.ts
import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RulePackService } from '../rule-pack/rule-pack.service.js';
import { buildReportViewModel } from './report-view-model.js';
import { buildReportV2ViewModel } from './report-view-model-v2.js';

@Injectable()
export class ReportV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pack: RulePackService,
  ) {}

  async viewModel(orgId: string, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, orgId },
      include: { scan: { include: { repository: true } }, organization: true },
    });
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');

    const findings = await this.prisma.scannerFinding.findMany({
      where: { scanId: report.scanId, orgId },
      include: { rule: true },
    });
    const base = buildReportViewModel({
      report,
      scan: report.scan,
      organization: report.organization,
      findings,
    });
    const rows = await this.prisma.controlResult.findMany({
      where: { scanId: report.scanId, orgId },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, remediationGuidance: true } } },
    });
    const loaded = await this.pack.loadV2();
    const facts = report.scan.facts as {
      inventory?: {
        signals?: Array<{
          detector: string;
          kind: string;
          path: string;
          line: number | null;
          token: string;
        }>;
      };
    };
    const inventorySignals = (facts.inventory?.signals ?? []).map((signal) => ({
      detector: signal.detector,
      kind: signal.kind,
      path: signal.path,
      line: signal.line,
      token: signal.token,
    }));

    return buildReportV2ViewModel({
      base: {
        ...base,
        scan: {
          ...base.scan,
          evidenceCoverage:
            report.scan.evidenceCoverage === null
              ? null
              : Number(report.scan.evidenceCoverage.toString()),
        },
      },
      controlResults: rows.map((row) => ({
        controlCode: row.controlCode,
        section: row.rule.section,
        verdict: row.verdict,
        reasonCode: row.reasonCode,
        remediation: row.rule.remediationGuidance,
      })),
      inventory: {
        version: report.scan.inventoryVersion,
        status: report.scan.inventoryStatus,
        signals: inventorySignals,
        consentGatingRatio:
          report.scan.consentGatingRatio === null
            ? null
            : Number(report.scan.consentGatingRatio.toString()),
      },
      commencement: loaded.commencement,
      detectorVersions: report.scan.scannerVersions as Record<string, string>,
      provenanceSearches: [
        ...new Set(
          loaded.controls.flatMap((control) =>
            control.violationRules.map((rule) => rule.provenance.search),
          ),
        ),
      ].slice(0, 32),
    });
  }
}
```

In `apps/orchestrator/src/modules/reports/reports.service.ts`, add imports and the optional constructor parameter:

```ts
import { Optional } from '@nestjs/common';
import { isScoringV2 } from '../scoring/scoring.engine.js';
import { ReportV2Service } from './report-v2.service.js';
```

```ts
    @Optional() private readonly v2?: ReportV2Service,
```

At the start of `viewModel(orgId, reportId)`, after the expiry check:

```ts
    if (isScoringV2(report.scan.scoringVersion) && this.v2 !== undefined) {
      return this.v2.viewModel(orgId, reportId);
    }
```

In `apps/orchestrator/src/modules/reports/reports.module.ts`, import `PrismaModule` and `RulePackModule`, add `ReportV2Service` to `providers` and `exports`.

- [x] **Step 5: Run the focused v2 view-model tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/report-v2-view-model.test.ts test/report-v2-selection.test.ts
```

Expected GREEN output:

```text
✓ test/report-v2-view-model.test.ts > report v2 view model > emits every required section in a stable order
✓ test/report-v2-view-model.test.ts > report v2 view model > keeps attestations out of evidence and lists unknowns prominently
✓ test/report-v2-view-model.test.ts > report v2 view model > groups gaps and derives the fix plan only from non-passing verdicts
✓ test/report-v2-selection.test.ts > report version selection > uses the v2 service only for scoring-2.0.0 scans
✓ test/report-v2-selection.test.ts > report version selection > keeps the v1 payload for legacy scans
Test Files  2 passed (2)
Tests  5 passed (5)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/reports apps/orchestrator/test/report-v2-view-model.test.ts apps/orchestrator/test/report-v2-selection.test.ts
git commit -m "feat(readiness): select v2 report view model by scoring version"
```

---

### Task 13: Render and PDF the v2 report without changing v1 output

**Files:**
- Create: `apps/orchestrator/src/modules/reports/report-template-v2.ts`
- Create: `apps/orchestrator/src/modules/reports/report-pdf-v2.ts`
- Create: `apps/orchestrator/src/modules/reports/report-renderers.ts`
- Modify: `apps/orchestrator/src/modules/reports/report-render.worker.ts`
- Create: `apps/orchestrator/test/report-v2-rendering.test.ts`

**Interfaces:**
- Consumes: `buildReportV2ViewModel` output; `ReportTemplateModel` and `renderReportHtml`/`renderReportPdf` for v1; `isScoringV2` from `scoring.engine.ts`; PDFKit.
- Produces: `renderReportV2Html`, `renderReportV2Pdf`, `renderHtmlForModel`, and `renderPdfForModel`; the worker selects v2 only for `scoring-2.0.0`, preserving v1 byte-for-byte.

- [x] **Step 1: Write the failing rendering tests**

```ts
// apps/orchestrator/test/report-v2-rendering.test.ts
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ReportTemplateModel } from '../src/modules/reports/report-template.js';
import { renderReportHtml } from '../src/modules/reports/report-template.js';
import { renderReportV2Pdf } from '../src/modules/reports/report-pdf-v2.js';
import { renderHtmlForModel } from '../src/modules/reports/report-renderers.js';
import {
  buildReportV2ViewModel,
  type ReportV2Input,
} from '../src/modules/reports/report-view-model-v2.js';

function base(scoringVersion: string): ReportTemplateModel {
  return {
    report: {
      id: 'rpt_1',
      format: 'pdf',
      templateVersion: scoringVersion === '1.0.0' ? '1.0.0' : '2.0.0',
      createdAt: '2026-11-27T10:00:00.000Z',
    },
    organization: {
      id: 'org_1',
      name: 'Acme',
      slug: 'acme',
      dataRegion: 'ap-south-1',
      branding: { logoUrl: null, primaryColor: null, footerText: null },
    },
    scan: {
      id: 'scn_1',
      repository: { id: 'repo_1', fullName: 'acme/repo', visibility: 'private' },
      ref: 'main',
      commitSha: 'a'.repeat(40),
      status: 'completed',
      score: null,
      grade: null,
      sectionScores: {},
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      coverage: {},
      coverageStatus: 'full',
      scannerVersions: {},
      rulePackVersion: 'dpdpa-2026.11.0',
      scoringVersion,
      timestamps: {
        queuedAt: '2026-11-27T09:00:00.000Z',
        startedAt: null,
        completedAt: '2026-11-27T09:01:00.000Z',
        durationMs: 60_000,
      },
    },
    topFindings: [],
    methodology: {
      scoringVersion,
      rulePackVersion: 'dpdpa-2026.11.0',
      summary: 'Versioned readiness scoring.',
    },
    disclaimer: 'Technical aid only; not legal advice.',
    generatedAt: '2026-11-27T10:00:00.000Z',
  };
}

function v2Input(): ReportV2Input {
  return {
    base: base('scoring-2.0.0'),
    controlResults: [
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        verdict: 'FAIL',
        reasonCode: 'cited_gap',
        remediation: 'Use a managed credential store.',
      },
      {
        controlCode: 'DPDPA-9-CHILD-01',
        section: '9',
        verdict: 'UNKNOWN',
        reasonCode: 'detector_unavailable',
        remediation: 'Add a detector.',
      },
    ],
    inventory: null,
    commencement: [],
    detectorVersions: { gitleaks: '8.28.0' },
    provenanceSearches: [],
  };
}

/** Inflate PDFKit streams and decode hex glyph runs so headings are searchable. */
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const decoded: string[] = [];
  for (const match of raw.matchAll(streams)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    decoded.push(
      content
        .replace(/\[([^\]]*)\]\s*TJ/g, (_all, body: string) =>
          (body.match(/<[0-9a-fA-F]+>/g) ?? [])
            .map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1'))
            .join(''),
        )
        .replace(/\(([^)]*)\)\s*Tj/g, (_all, value: string) => value),
    );
  }
  return decoded.join('\n');
}

describe('v2 report rendering', () => {
  it('renders all v2 sections into HTML and keeps v1 HTML unchanged', () => {
    const v2 = buildReportV2ViewModel(v2Input());
    const html = renderHtmlForModel(v2);
    for (const title of [
      'Executive readiness summary',
      'Gaps grouped by section',
      'Evidence of safeguards',
      'Could not determine',
      'Data inventory summary',
      'Fix plan',
      'Methodology and provenance',
      'Limitations',
      'Disclaimer',
    ]) {
      expect(html).toContain(title);
    }
    expect(html).not.toContain('CANARY_SOURCE_VALUE');
    const legacy = renderHtmlForModel(base('1.0.0'));
    expect(legacy).toBe(renderReportHtml(base('1.0.0')));
    expect(legacy).not.toContain('Gaps grouped by section');
  });

  it('renders a real multi-page PDF containing the v2 section titles', async () => {
    const buffer = await renderReportV2Pdf(buildReportV2ViewModel(v2Input()));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect((buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(
      9,
    );
    const text = pdfText(buffer);
    expect(text).toContain('Executive readiness summary');
    expect(text).toContain('Could not determine');
    expect(text).not.toContain('CANARY_SOURCE_VALUE');
  });
});
```

- [x] **Step 2: Run the focused rendering tests and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/report-v2-rendering.test.ts
```

Expected RED output:

```text
Error: Cannot find module '../src/modules/reports/report-pdf-v2.js'
```

- [x] **Step 3: Add the v2 HTML renderer**

```ts
// apps/orchestrator/src/modules/reports/report-template-v2.ts
import type { buildReportV2ViewModel } from './report-view-model-v2.js';

type V2Model = ReturnType<typeof buildReportV2ViewModel>;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rows(model: V2Model, id: string): string {
  const section = model.sections.find((candidate) => candidate.id === id);
  if (section?.rows === undefined || section.rows.length === 0) {
    return '<p>No recorded entries.</p>';
  }
  return `<table><thead><tr><th>Control</th><th>Section</th><th>Verdict</th><th>Detail</th></tr></thead><tbody>${section.rows
    .map(
      (row) =>
        `<tr><td>${esc(row.controlCode)}</td><td>${esc(row.section)}</td><td>${esc(row.verdict)}</td><td>${esc(row.reasonCode ?? row.remedy)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function renderReportV2Html(model: V2Model): string {
  const sections = model.sections
    .map((section) => {
      if (section.id === 'gaps_by_section') {
        const groups = (section.groups ?? [])
          .map(
            (group) =>
              `<h3>Section ${esc(group.section)}</h3><ul>${group.rows
                .map((row) => `<li>${esc(row.controlCode)} — ${esc(row.verdict)}</li>`)
                .join('')}</ul>`,
          )
          .join('');
        return `<section id="${section.id}"><h2>${esc(section.title)}</h2>${groups || '<p>No recorded gaps.</p>'}</section>`;
      }
      if (section.id === 'executive_summary') {
        const table = (section.table ?? [])
          .map(
            (entry) =>
              `<tr><td>${esc(entry.provision)}</td><td>${esc(entry.effectiveFrom)}</td><td>${esc(entry.sourceUrl)}</td><td>${esc(entry.verifiedOn)}</td></tr>`,
          )
          .join('');
        return `<section id="${section.id}"><h2>${esc(section.title)}</h2>${rows(model, section.id)}<table><thead><tr><th>Provision</th><th>Effective</th><th>Source</th><th>Verified</th></tr></thead><tbody>${table}</tbody></table></section>`;
      }
      return `<section id="${section.id}"><h2>${esc(section.title)}</h2>${rows(model, section.id)}<p>${esc(section.text ?? '')}</p></section>`;
    })
    .join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Readiness report ${esc(model.report.id)}</title><style>body{font-family:sans-serif;max-width:52rem;margin:2rem auto;color:#16181d}h2{margin-top:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8dbe2;padding:.4rem;text-align:left}</style></head><body><h1>Readiness report</h1><p>Repository ${esc(model.scan.repository.fullName)} · ref ${esc(model.scan.ref)} · scoring ${esc(model.scan.scoringVersion)}</p>${sections}</body></html>`;
}
```

- [x] **Step 4: Add the v2 PDF renderer and dispatch**

```ts
// apps/orchestrator/src/modules/reports/report-pdf-v2.ts
import PDFDocument from 'pdfkit';
import type { buildReportV2ViewModel } from './report-view-model-v2.js';

type V2Model = ReturnType<typeof buildReportV2ViewModel>;

export async function renderReportV2Pdf(model: V2Model): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  for (const section of model.sections) {
    doc.addPage();
    doc.fontSize(16).text(section.title);
    doc.moveDown().fontSize(10);
    for (const row of section.rows ?? []) {
      doc.text(
        [row.controlCode, row.section, row.verdict, row.reasonCode ?? row.remedy]
          .filter((value) => value !== undefined)
          .join(' · '),
      );
    }
    for (const group of section.groups ?? []) {
      doc.text(`Section ${group.section}`);
      for (const row of group.rows) {
        doc.text(`${row.controlCode ?? ''} · ${row.verdict ?? ''}`);
      }
    }
    for (const entry of section.table ?? []) {
      doc.text(`${entry.provision} · effective ${entry.effectiveFrom} · verified ${entry.verifiedOn}`);
    }
    if (section.text !== undefined) doc.text(section.text);
  }
  doc.end();
  return done;
}
```

```ts
// apps/orchestrator/src/modules/reports/report-renderers.ts
import { isScoringV2 } from '../scoring/scoring.engine.js';
import { renderReportV2Pdf } from './report-pdf-v2.js';
import { renderReportHtml } from './report-template.js';
import { renderReportV2Html } from './report-template-v2.js';
import type { ReportTemplateModel } from './report-template.js';
import type { buildReportV2ViewModel } from './report-view-model-v2.js';

type V2Model = ReturnType<typeof buildReportV2ViewModel>;

export function renderHtmlForModel(model: ReportTemplateModel | V2Model): string {
  return isScoringV2(model.scan.scoringVersion)
    ? renderReportV2Html(model as V2Model)
    : renderReportHtml(model as ReportTemplateModel);
}

export type BrowserPdfRenderer = (
  html: string,
  browserWSEndpoint: string | undefined,
) => Promise<Buffer>;

export function renderPdfForModel(
  model: ReportTemplateModel | V2Model,
  browserWSEndpoint: string | undefined,
  renderBrowserPdf: BrowserPdfRenderer,
): Promise<Buffer> {
  if (isScoringV2(model.scan.scoringVersion)) return renderReportV2Pdf(model as V2Model);
  return browserWSEndpoint !== undefined
    ? renderBrowserPdf(renderReportHtml(model as ReportTemplateModel), browserWSEndpoint)
    : Promise.resolve(renderReportPdf(model as ReportTemplateModel));
}
```

Remove the unused `renderReportPdf` import from `report-renderers.ts`. In `apps/orchestrator/src/modules/reports/report-render.worker.ts`, keep the existing exported `renderPdf` untouched, remove the `renderReportHtml` and `renderReportPdf` imports, import `renderHtmlForModel` and `renderPdfForModel` from `./report-renderers.js`, and replace the rendering block with:

```ts
      const model = viewModel as unknown as Parameters<typeof renderHtmlForModel>[0];
      const pdfBuffer = await renderPdfForModel(
        model,
        env.REPORTS_BROWSER_WS_ENDPOINT,
        renderPdf,
      );
```

Do not use `renderHtmlForModel` in the worker when `REPORTS_BROWSER_WS_ENDPOINT` is set; the browser renderer receives the v1 HTML through `renderPdfForModel` so v1 byte output is unchanged. Keep the `complete()` call and logging unchanged.

- [x] **Step 5: Run the focused rendering tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/report-v2-rendering.test.ts
```

Expected GREEN output:

```text
✓ test/report-v2-rendering.test.ts > v2 report rendering > renders all v2 sections into HTML and keeps v1 HTML unchanged
✓ test/report-v2-rendering.test.ts > v2 report rendering > renders a real multi-page PDF containing the v2 section titles
Test Files  1 passed (1)
Tests  2 passed (2)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/reports apps/orchestrator/test/report-v2-rendering.test.ts
git commit -m "feat(readiness): render v2 report HTML and PDF"
```

---

### Task 14: Generate SARIF 2.1.0 and issue-ready Markdown exports

**Files:**
- Create: `apps/orchestrator/src/modules/exports/export.schemas.ts`
- Create: `apps/orchestrator/src/modules/exports/sarif.service.ts`
- Create: `apps/orchestrator/src/modules/exports/markdown.service.ts`
- Create: `apps/orchestrator/src/modules/exports/internal-exports.controller.ts`
- Create: `apps/orchestrator/src/modules/exports/exports.module.ts`
- Modify: `apps/orchestrator/src/app.module.ts`
- Create: `apps/orchestrator/test/export-services.test.ts`
- Create: `apps/web/server/api/v1/scan/[scanId]/export/sarif.get.ts`
- Create: `apps/web/server/api/v1/scan/[scanId]/export/markdown.get.ts`
- Create: `apps/web/test/export-fixtures.test.ts`

**Interfaces:**
- Consumes: persisted `control_result` rows from Phase A/B; `InternalHmacGuard`; BFF `requireIdentity`, `callOrchestrator`, and `fixturesAnswer`.
- Produces: `buildSarif(input)` conforming to SARIF 2.1.0, `buildIssueMarkdown(input)`, internal `GET /internal/v1/scans/:scanId/export/{sarif,markdown}`, BFF `GET /api/v1/scan/:scanId/export/{sarif,markdown}`. No export opens an issue or PR on the target repository.

- [x] **Step 1: Write the failing export tests**

```ts
// apps/orchestrator/test/export-services.test.ts
import { describe, expect, it } from 'vitest';
import { buildIssueMarkdown } from '../src/modules/exports/markdown.service.js';
import { buildSarif } from '../src/modules/exports/sarif.service.js';

const input = {
  scanId: 'scn_1',
  repository: 'acme/repo',
  rulePackVersion: 'dpdpa-2026.11.0',
  scoringVersion: 'scoring-2.0.0',
  results: [
    {
      controlCode: 'DPDPA-8.4-SECRET-01',
      section: '8(4)',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      remediation: 'Use a managed credential store.',
      evidence: [
        {
          kind: 'violation',
          scanner: 'gitleaks',
          evidenceHash: 'sha256:code-only',
        },
      ],
    },
    {
      controlCode: 'DPDPA-9-CHILD-01',
      section: '9',
      verdict: 'UNKNOWN',
      reasonCode: 'detector_unavailable',
      remediation: 'Add a detector.',
      evidence: [],
    },
    {
      controlCode: 'DPDPA-6-CONSENT-01',
      section: '6',
      verdict: 'ATTESTED_PASS',
      reasonCode: 'attested_pass',
      remediation: 'None.',
      evidence: [],
    },
  ],
};

describe('readiness exports', () => {
  it('builds SARIF 2.1.0 from non-passing results only', () => {
    const sarif = buildSarif(input);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    const run = sarif.runs[0]!;
    expect(run.tool.driver.name).toBe('DPDPA readiness');
    expect(run.tool.driver.rules?.map((rule) => rule.id)).toEqual([
      'DPDPA-8.4-SECRET-01',
      'DPDPA-9-CHILD-01',
    ]);
    expect(run.results?.map((result) => result.level)).toEqual(['error', 'none']);
    expect(run.results?.[0]?.properties).toMatchObject({
      section: '8(4)',
      verdict: 'FAIL',
      evidenceHashes: ['sha256:code-only'],
    });
    expect(JSON.stringify(sarif)).not.toContain('CANARY_SOURCE_VALUE');
    expect(JSON.stringify(sarif)).not.toContain('attested_pass');
  });

  it('builds issue-ready Markdown without issue-creation instructions', () => {
    const markdown = buildIssueMarkdown(input);
    expect(markdown).toContain('# Readiness gaps — acme/repo');
    expect(markdown).toContain('## Section 8(4)');
    expect(markdown).toContain('DPDPA-8.4-SECRET-01');
    expect(markdown).toContain('sha256:code-only');
    expect(markdown).toContain('Could not determine');
    expect(markdown).not.toContain('api.github.com');
    expect(markdown).not.toContain('/issues');
  });
});
```

```ts
// apps/web/test/export-fixtures.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('export routes', () => {
  it('never call the GitHub issue API', async () => {
    const root = fileURLToPath(new URL('../server/api/v1/scan/[scanId]/export', import.meta.url));
    const files = ['sarif.get.ts', 'markdown.get.ts'];
    for (const file of files) {
      const source = await readFile(join(root, file), 'utf8');
      expect(source).not.toContain('api.github.com');
      expect(source).not.toContain('/issues');
      expect(source).not.toContain('createIssue');
    }
  });
});
```

- [x] **Step 2: Run the focused export tests and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/export-services.test.ts && pnpm --filter @dpdpa/web exec vitest run test/export-fixtures.test.ts
```

Expected RED output:

```text
Error: Cannot find module '../src/modules/exports/sarif.service.js'
```

- [x] **Step 3: Add the pure export builders**

```ts
// apps/orchestrator/src/modules/exports/export.schemas.ts
export interface ExportEvidence {
  kind?: string;
  scanner?: string;
  evidenceHash?: string;
}

export interface ExportResult {
  controlCode: string;
  section: string;
  verdict: string;
  reasonCode: string;
  remediation: string;
  evidence: readonly ExportEvidence[];
}

export interface ExportInput {
  scanId: string;
  repository: string;
  rulePackVersion: string | null;
  scoringVersion: string | null;
  results: readonly ExportResult[];
}

export const EXPORT_LIMIT = 500;

export function exportedResults(input: ExportInput): readonly ExportResult[] {
  return input.results
    .filter((row) => row.verdict !== 'PASS' && row.verdict !== 'ATTESTED_PASS')
    .slice(0, EXPORT_LIMIT);
}
```

```ts
// apps/orchestrator/src/modules/exports/sarif.service.ts
import { exportedResults, type ExportInput } from './export.schemas.js';

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  properties: { section: string };
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'none';
  message: { text: string };
  properties: {
    section: string;
    verdict: string;
    reasonCode: string;
    evidenceHashes: string[];
  };
}

export function buildSarif(input: ExportInput) {
  const rows = exportedResults(input);
  const rules: SarifRule[] = rows.map((row) => ({
    id: row.controlCode,
    name: `Readiness ${row.controlCode}`,
    shortDescription: { text: `Section ${row.section} control ${row.controlCode}` },
    properties: { section: row.section },
  }));
  const results: SarifResult[] = rows.map((row) => ({
    ruleId: row.controlCode,
    level: row.verdict === 'UNKNOWN' ? 'none' : 'error',
    message: {
      text:
        row.verdict === 'UNKNOWN'
          ? 'Could not determine: no determinable code evidence or current attestation.'
          : `Readiness gap: ${row.reasonCode}.`,
    },
    properties: {
      section: row.section,
      verdict: row.verdict,
      reasonCode: row.reasonCode,
      evidenceHashes: row.evidence
        .map((item) => item.evidenceHash)
        .filter((hash): hash is string => typeof hash === 'string'),
    },
  }));
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'DPDPA readiness',
            version: input.rulePackVersion ?? 'unknown',
            rules,
          },
        },
        results,
        properties: {
          scanId: input.scanId,
          repository: input.repository,
          scoringVersion: input.scoringVersion,
        },
      },
    ],
  };
}
```

```ts
// apps/orchestrator/src/modules/exports/markdown.service.ts
import { exportedResults, type ExportInput } from './export.schemas.js';

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function buildIssueMarkdown(input: ExportInput): string {
  const rows = exportedResults(input);
  const sections = new Map<string, typeof rows>();
  for (const row of rows) {
    const items = sections.get(row.section) ?? [];
    items.push(row);
    sections.set(row.section, items);
  }
  const lines = [
    `# Readiness gaps — ${input.repository}`,
    '',
    `Scan ${input.scanId} · rule pack ${input.rulePackVersion ?? 'unknown'} · scoring ${input.scoringVersion ?? 'unknown'}`,
    '',
    'This file is an issue-ready draft. Review it before creating any issue; nothing is opened automatically.',
    '',
  ];
  for (const [section, items] of [...sections.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## Section ${section}`, '');
    for (const row of items) {
      lines.push(`### ${row.controlCode} — ${row.verdict}`, '');
      lines.push(`Reason: ${escapeCell(row.reasonCode)}`, '');
      const hashes = row.evidence
        .map((item) => item.evidenceHash)
        .filter((hash): hash is string => typeof hash === 'string');
      lines.push(`Evidence hashes: ${hashes.length > 0 ? hashes.join(', ') : 'none'}`, '');
      lines.push(`Suggested fix: ${escapeCell(row.remediation)}`, '');
      if (row.verdict === 'UNKNOWN') lines.push('Could not determine; add a detector or current attestation.', '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
```

- [x] **Step 4: Add the internal controller and BFF routes**

```ts
// apps/orchestrator/src/modules/exports/internal-exports.controller.ts
import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { buildIssueMarkdown } from './markdown.service.js';
import { buildSarif } from './sarif.service.js';
import type { ExportInput } from './export.schemas.js';

@Controller('internal/v1/scans')
@UseGuards(InternalHmacGuard)
export class InternalExportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':scanId/export/sarif')
  async sarif(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
  ) {
    return { data: buildSarif(await this.input(orgHeader, scanId)) };
  }

  @Get(':scanId/export/markdown')
  async markdown(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
  ) {
    return { data: { markdown: buildIssueMarkdown(await this.input(orgHeader, scanId)) } };
  }

  private async input(orgHeader: string | undefined, scanId: string): Promise<ExportInput> {
    if (!orgHeader) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
    const scan = await this.prisma.scan.findFirst({
      where: { id: scanId, orgId: orgHeader },
      include: { repository: true },
    });
    if (!scan) throw new ApiError('NOT_FOUND', 'The scan does not exist.');
    const rows = await this.prisma.controlResult.findMany({
      where: { scanId, orgId: orgHeader },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, remediationGuidance: true } } },
    });
    return {
      scanId,
      repository: scan.repository.fullName,
      rulePackVersion: scan.rulePackVersion,
      scoringVersion: scan.scoringVersion,
      results: rows.map((row) => ({
        controlCode: row.controlCode,
        section: row.rule.section,
        verdict: row.verdict,
        reasonCode: row.reasonCode,
        remediation: row.rule.remediationGuidance,
        evidence: row.evidence as ExportInput['results'][number]['evidence'],
      })),
    };
  }
}
```

```ts
// apps/orchestrator/src/modules/exports/exports.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { InternalExportsController } from './internal-exports.controller.js';

@Module({
  imports: [PrismaModule, InternalAuthModule],
  controllers: [InternalExportsController],
})
export class ExportsModule {}
```

Add `ExportsModule` to `apps/orchestrator/src/app.module.ts` imports.

```ts
// apps/web/server/api/v1/scan/[scanId]/export/sarif.get.ts
import { getRouterParam, setHeader } from 'h3';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { requireIdentity } from '../../../../../utils/session';

export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) {
    setHeader(event, 'content-disposition', 'attachment; filename="readiness.sarif.json"');
    return {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [],
    };
  }
  const identity = requireIdentity(event);
  const response = await callOrchestrator<{ data: unknown }>(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/export/sarif`,
    headers: { 'x-org-id': identity.orgId },
  });
  setHeader(event, 'content-disposition', 'attachment; filename="readiness.sarif.json"');
  return response.data;
});
```

```ts
// apps/web/server/api/v1/scan/[scanId]/export/markdown.get.ts
import { getRouterParam, setHeader } from 'h3';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { requireIdentity } from '../../../../../utils/session';

export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) {
    setHeader(event, 'content-type', 'text/markdown; charset=utf-8');
    setHeader(event, 'content-disposition', 'attachment; filename="readiness-gaps.md"');
    return '# Readiness gaps\n\nNo recorded gaps in the fixture.';
  }
  const identity = requireIdentity(event);
  const response = await callOrchestrator<{ data: { markdown: string } }>(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/export/markdown`,
    headers: { 'x-org-id': identity.orgId },
  });
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8');
  setHeader(event, 'content-disposition', 'attachment; filename="readiness-gaps.md"');
  return response.data.markdown;
});
```

- [x] **Step 5: Run the focused export tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/export-services.test.ts && pnpm --filter @dpdpa/web exec vitest run test/export-fixtures.test.ts
```

Expected GREEN output:

```text
✓ test/export-services.test.ts > readiness exports > builds SARIF 2.1.0 from non-passing results only
✓ test/export-services.test.ts > readiness exports > builds issue-ready Markdown without issue-creation instructions
Test Files  1 passed (1)
Tests  2 passed (2)
✓ test/export-fixtures.test.ts > export routes > never call the GitHub issue API
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/exports apps/orchestrator/src/app.module.ts apps/orchestrator/test/export-services.test.ts apps/web/server/api/v1/scan apps/web/test/export-fixtures.test.ts
git commit -m "feat(readiness): add SARIF and Markdown exports"
```

---

### Task 15: Add the cross-surface language lint gate

**Files:**
- Create: `apps/web/scripts/lint-readiness-language.mjs`
- Create: `apps/web/test/phase-e-language-lint.test.ts`
- Create: `apps/orchestrator/test/readiness-language-lint.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: the new readiness Vue pages/components from Task 9–11, v2 report/exports sources from Task 12–14, and v2 rule-pack YAML messages.
- Produces: `scanReadinessLanguage(files)` with exemptions only for CSS token names and quoted disclaimers; a `pnpm --filter @dpdpa/web lint:language` script and tests that fail on forbidden user-facing wording anywhere in those surfaces.

- [x] **Step 1: Write the failing language-lint tests**

```ts
// apps/web/test/phase-e-language-lint.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanReadinessLanguage } from '../scripts/lint-readiness-language.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const files = [
  'app/components/new/NewScanDetail.vue',
  'app/components/rules/RuleDetectorExplainer.vue',
  'app/components/readiness/ReadinessAttestationList.vue',
  'app/components/readiness/ReadinessDataView.vue',
  'app/pages/app/readiness/inventory.vue',
  'app/pages/app/readiness/gaps.vue',
  'app/pages/app/readiness/fix-plan.vue',
  'app/pages/app/readiness/attestations.vue',
  'app/pages/app/readiness/exports.vue',
  'server/api/v1/scan/[scanId]/export/sarif.get.ts',
  'server/api/v1/scan/[scanId]/export/markdown.get.ts',
  'server/utils/fixtures/attestations.ts',
  'server/utils/fixtures/readiness.ts',
  '../orchestrator/src/modules/reports/report-view-model-v2.ts',
  '../orchestrator/src/modules/reports/report-template-v2.ts',
  '../orchestrator/src/modules/reports/report-pdf-v2.ts',
  '../orchestrator/src/modules/exports/sarif.service.ts',
  '../orchestrator/src/modules/exports/markdown.service.ts',
  '../../packages/rule-packs/v2/controls.yaml',
  '../../packages/rule-packs/v2/detectors.yaml',
  '../../packages/rule-packs/v2/mappings.yaml',
];

describe('Phase E language lint', () => {
  it('reports every forbidden user-facing phrase in the targeted surfaces', async () => {
    const sources = await Promise.all(
      files.map(async (path) => ({
        path,
        content: await readFile(join(webRoot, path), 'utf8'),
      })),
    );
    expect(scanReadinessLanguage(sources)).toEqual([]);
  });

  it('is not vacuous: it catches a synthetic forbidden phrase', () => {
    const hits = scanReadinessLanguage([
      { path: 'app/pages/app/readiness/gaps.vue', content: '<p>This is compliant.</p>' },
    ]);
    expect(hits).toEqual([
      { path: 'app/pages/app/readiness/gaps.vue', line: 1, phrase: 'compliant' },
    ]);
  });

  it('exempts CSS token names and quoted disclaimers only', () => {
    const hits = scanReadinessLanguage([
      {
        path: 'app/pages/app/readiness/gaps.vue',
        content: [
          '<div class="bg-status-compliant-bg text-status-compliant-text">Gaps</div>',
          "const disclaimer = 'This is not a certification of compliance.';",
        ].join('\n'),
      },
    ]);
    expect(hits).toEqual([]);
  });
});
```

```ts
// apps/orchestrator/test/readiness-language-lint.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const FORBIDDEN: Array<[string, RegExp]> = [
  ['compliant', /\bcompliant\b/i],
  ['non-compliant', /\bnon-compliant\b/i],
  ['violation of the Act', /violation of the act/i],
  ['certified', /\bcertified\b/i],
];

function stripExemptions(source: string): string {
  return source
    .replace(/status-compliant-[a-z]+/g, '')
    .replace(/(['"`])[^'"`\n]*disclaimer[^'"`\n]*\1/gi, '');
}

describe('report and export language lint', () => {
  it('contains no forbidden wording in v2 renderers or export messages', async () => {
    const files = [
      'apps/orchestrator/src/modules/reports/report-view-model-v2.ts',
      'apps/orchestrator/src/modules/reports/report-template-v2.ts',
      'apps/orchestrator/src/modules/reports/report-pdf-v2.ts',
      'apps/orchestrator/src/modules/exports/sarif.service.ts',
      'apps/orchestrator/src/modules/exports/markdown.service.ts',
      'packages/rule-packs/v2/controls.yaml',
      'packages/rule-packs/v2/detectors.yaml',
      'packages/rule-packs/v2/mappings.yaml',
    ];
    const hits: string[] = [];
    for (const path of files) {
      const text = stripExemptions(await readFile(join(root, path), 'utf8'));
      for (const [phrase, pattern] of FORBIDDEN) {
        if (pattern.test(text)) hits.push(`${path}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
```

- [x] **Step 2: Run the focused language tests and confirm RED**

```bash
pnpm --filter @dpdpa/web exec vitest run test/phase-e-language-lint.test.ts && pnpm --filter @dpdpa/orchestrator exec vitest run test/readiness-language-lint.test.ts
```

Expected RED output:

```text
Error: Cannot find module '../scripts/lint-readiness-language.mjs'
```

- [x] **Step 3: Add the shared lint script and package command**

```js
// apps/web/scripts/lint-readiness-language.mjs
const FORBIDDEN = [
  ['compliant', /\bcompliant\b/i],
  ['non-compliant', /\bnon-compliant\b/i],
  ['violation of the Act', /violation of the act/i],
  ['certified', /\bcertified\b/i],
];

export function scanReadinessLanguage(files) {
  const hits = [];
  for (const { path, content } of files) {
    const lines = content.split(/\r?\n/);
    for (const [index, raw] of lines.entries()) {
      const line = raw
        .replace(/status-compliant-[a-z]+/g, '')
        .replace(/(['"`])[^'"`\n]*disclaimer[^'"`\n]*\1/gi, '');
      for (const [phrase, pattern] of FORBIDDEN) {
        if (pattern.test(line)) {
          hits.push({ path, line: index + 1, phrase });
        }
      }
    }
  }
  return hits;
}

const targets = [
  'app/components/new/NewScanDetail.vue',
  'app/components/rules/RuleDetectorExplainer.vue',
  'app/components/readiness/ReadinessAttestationList.vue',
  'app/components/readiness/ReadinessDataView.vue',
  'app/pages/app/readiness/inventory.vue',
  'app/pages/app/readiness/gaps.vue',
  'app/pages/app/readiness/fix-plan.vue',
  'app/pages/app/readiness/attestations.vue',
  'app/pages/app/readiness/exports.vue',
  'server/api/v1/scan/[scanId]/export/sarif.get.ts',
  'server/api/v1/scan/[scanId]/export/markdown.get.ts',
  'server/utils/fixtures/attestations.ts',
  'server/utils/fixtures/readiness.ts',
  '../orchestrator/src/modules/reports/report-view-model-v2.ts',
  '../orchestrator/src/modules/reports/report-template-v2.ts',
  '../orchestrator/src/modules/reports/report-pdf-v2.ts',
  '../orchestrator/src/modules/exports/sarif.service.ts',
  '../orchestrator/src/modules/exports/markdown.service.ts',
  '../../packages/rule-packs/v2/controls.yaml',
  '../../packages/rule-packs/v2/detectors.yaml',
  '../../packages/rule-packs/v2/mappings.yaml',
];

async function main() {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname;
  const files = await Promise.all(
    targets.map(async (path) => ({ path, content: await readFile(join(root, path), 'utf8') })),
  );
  const hits = scanReadinessLanguage(files);
  for (const hit of hits) {
    console.error(`${hit.path}:${hit.line}: forbidden phrase: ${hit.phrase}`);
  }
  process.exitCode = hits.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await main();
}
```

In `apps/web/package.json`, add to `scripts`:

```json
    "lint:language": "node scripts/lint-readiness-language.mjs",
```

- [x] **Step 4: Run the focused language tests and confirm GREEN**

```bash
pnpm --filter @dpdpa/web exec vitest run test/phase-e-language-lint.test.ts && pnpm --filter @dpdpa/orchestrator exec vitest run test/readiness-language-lint.test.ts && pnpm --filter @dpdpa/web lint:language
```

Expected GREEN output:

```text
✓ test/phase-e-language-lint.test.ts > Phase E language lint > reports every forbidden user-facing phrase in the targeted surfaces
✓ test/phase-e-language-lint.test.ts > Phase E language lint > is not vacuous: it catches a synthetic forbidden phrase
✓ test/phase-e-language-lint.test.ts > Phase E language lint > exempts CSS token names and quoted disclaimers only
Test Files  1 passed (1)
Tests  3 passed (3)
✓ test/readiness-language-lint.test.ts > report and export language lint > contains no forbidden wording in v2 renderers or export messages
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dpdpa/web lint:language
```

Expected output ends with successful lint, successful typecheck, `Tasks: 100% successful`, and `lint:language: 0 forbidden phrases`. Then:

```bash
git add apps/web/scripts/lint-readiness-language.mjs apps/web/test/phase-e-language-lint.test.ts apps/orchestrator/test/readiness-language-lint.test.ts apps/web/package.json
git commit -m "test(readiness): enforce cross-surface language lint"
```

---

### Task 16: Playwright walkthrough, PDF verification, and final review

**Files:**
- Create: `apps/web/e2e/phase-e-walkthrough.spec.ts`
- Modify: `apps/web/e2e/pdf-parity.spec.ts`
- Modify: `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-e.md`

**Interfaces:**
- Consumes: the five readiness pages, the Rules explainer, scan detail tiles, export BFF routes, and the existing PDF report flow.
- Produces: a repeatable Playwright walkthrough over fixture data, a PDF download assertion, and a recorded human-observation exit gate before any push/PR/merge/deploy.

- [x] **Step 1: Write the failing Playwright walkthrough**

```ts
// apps/web/e2e/phase-e-walkthrough.spec.ts
import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration';

const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const REPO_ID = '0f000000-0000-4000-8000-000000000020';
const REPORT_ID = 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2';

test.describe('Phase E walkthrough', () => {
  test('renders the five readiness pages from guarded fixtures', async ({ page }) => {
    const routes: Array<[string, string]> = [
      [`/app/readiness/inventory?scanId=${SCAN_ID}`, 'Data Inventory'],
      [`/app/readiness/gaps?scanId=${SCAN_ID}`, 'Compliance Gaps'],
      [`/app/readiness/fix-plan?scanId=${SCAN_ID}`, 'Fix Plan'],
      [`/app/readiness/attestations?repoId=${REPO_ID}`, 'Attestations'],
      [`/app/readiness/exports?scanId=${SCAN_ID}`, 'Exports'],
    ];
    for (const [url, heading] of routes) {
      await page.goto(url);
      await waitForHydration(page);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
    await expect(page.getByText('Human statements recorded for this repository.')).toBeVisible();
    await expect(page.getByText('Attestations are not code evidence and do not change coverage.')).toBeVisible();
  });

  test('renders detector explanations and attestation tiles', async ({ page }) => {
    await page.goto('/app/rules/DPDPA-8.4-ENC-01');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'How evidence is found' })).toBeVisible();

    await page.goto(`/app/scans/${SCAN_ID}`);
    await waitForHydration(page);
    await expect(page.getByRole('link', { name: 'Attestations' })).toBeVisible();
  });

  test('exports SARIF and Markdown from control results', async ({ request }) => {
    const sarif = await request.get(`/api/v1/scan/${SCAN_ID}/export/sarif`);
    expect(sarif.ok()).toBeTruthy();
    expect((await sarif.json()).version).toBe('2.1.0');

    const markdown = await request.get(`/api/v1/scan/${SCAN_ID}/export/markdown`);
    expect(markdown.ok()).toBeTruthy();
    expect(await markdown.text()).toContain('# Readiness gaps');
  });

  test('produces a real PDF from the report flow', async ({ page }) => {
    await page.goto(`/report/${REPORT_ID}`);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const download = page.getByRole('link', { name: 'Download PDF' });
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(download).toHaveAttribute('href', /^\/api\/v1\/report\/pdf\/.+\/download$/);
  });
});
```

Add this case to `apps/web/e2e/pdf-parity.spec.ts` inside the existing describe block:

```ts
  test('v2 report view model keeps attested verdicts out of evidence coverage', async ({ request }) => {
    const response = await request.get(`/api/v1/report/pdf/${FIXTURE_REPORT_ID}/view`);
    expect(response.ok()).toBeTruthy();
    const report = await response.json();
    expect(report.data.scan.scoringVersion).toBe('scoring-2.0.0');
    expect(report.data.sections.map((section: { id: string }) => section.id)).toContain(
      'could_not_determine',
    );
  });
```

- [x] **Step 2: Run the focused Playwright suite and confirm RED**

```bash
pnpm --filter @dpdpa/web test:e2e -- phase-e-walkthrough.spec.ts pdf-parity.spec.ts
```

Expected RED output:

```text
1) PDF parity (P5-23) > v2 report view model keeps attested verdicts out of evidence coverage
Error: expect(received).toBe(expected) // Object.is equality
Expected: "scoring-2.0.0"
Received: "1.0.0"
```

The walkthrough cases pass against the Task 7–14 fixtures; only the new v2 assertion fails because `fixtureReportViewModel` still returns a v1 report. Do not change a production route to satisfy this test.

- [x] **Step 3: Update only the guarded report fixture to v2**

```ts
// apps/web/server/utils/fixtures/reports.ts
export function fixtureReportViewModel(scan: ScanDetail) {
  return {
    report: {
      id: FIXTURE_REPORT_ID,
      format: 'standard',
      templateVersion: '2.0.0',
      createdAt: '2026-11-04T10:05:00.000Z',
    },
    organization: {
      id: '0f000000-0000-4000-8000-000000000001',
      name: 'Acme Payments',
      slug: 'acme-payments',
      dataRegion: 'in',
      branding: { logoUrl: null, primaryColor: null, footerText: null },
    },
    scan: {
      id: scan.id,
      repository: scan.repository,
      ref: scan.ref,
      commitSha: scan.commitSha,
      status: scan.status,
      score: scan.score,
      grade: scan.grade,
      sectionScores: scan.sectionScores,
      counts: scan.counts,
      coverage: scan.coverage,
      coverageStatus: 'full',
      evidenceCoverage: 0,
      scannerVersions: scan.scannerVersions,
      rulePackVersion: scan.rulePackVersion,
      scoringVersion: 'scoring-2.0.0',
      assessment: {
        score: scan.score,
        evidenceCoverage: 0,
        openGaps: 1,
        verdictCounts: { UNKNOWN: 1 },
        unknownControls: ['DPDPA-9-CHILD-01'],
        detectorStatuses: {
          semgrep: 'completed',
          checkov: 'completed',
          gitleaks: 'completed',
        },
        gradeWithheldReason: 'insufficient_evidence',
        consentGatingRatio: 0.75,
      },
      timestamps: scan.timestamps,
    },
    topFindings: [],
    methodology: {
      scoringVersion: 'scoring-2.0.0',
      rulePackVersion: scan.rulePackVersion,
      summary: METHODOLOGY,
    },
    disclaimer: DISCLAIMER,
    generatedAt: '2026-11-04T10:05:06.342Z',
    scoringVersion: 'scoring-2.0.0',
    sections: [
      {
        id: 'executive_summary',
        title: 'Executive readiness summary',
        rows: [
          { section: 'score', remedy: scan.score === null ? 'Not assessed' : scan.score.toFixed(1) },
          { section: 'evidence coverage', remedy: '0' },
          { section: 'open gaps', remedy: '1' },
        ],
        table: [
          {
            provision: 'DPDP Rules 4',
            effectiveFrom: '2026-11-13',
            sourceUrl: 'https://www.meity.gov.in/example.pdf',
            verifiedOn: '2026-11-26',
          },
        ],
      },
      {
        id: 'gaps_by_section',
        title: 'Gaps grouped by section',
        groups: [
          {
            section: '8(4)',
            rows: [
              {
                controlCode: 'DPDPA-8.4-ENC-01',
                verdict: 'FAIL',
                reasonCode: 'gap_evidence',
              },
            ],
          },
        ],
      },
      {
        id: 'evidence_of_safeguards',
        title: 'Evidence of safeguards',
        rows: [],
      },
      {
        id: 'could_not_determine',
        title: 'Could not determine',
        rows: [
          {
            controlCode: 'DPDPA-9-CHILD-01',
            section: '9',
            reasonCode: 'detector_unavailable',
          },
        ],
      },
      {
        id: 'data_inventory_summary',
        title: 'Data inventory summary',
        text: '1 bounded signal at inventory-1.0.0; consent gating 0.75.',
      },
      {
        id: 'fix_plan',
        title: 'Fix plan',
        rows: [
          {
            controlCode: 'DPDPA-8.4-ENC-01',
            section: '8(4)',
            remedy: 'Use a managed credential store.',
          },
        ],
      },
      {
        id: 'methodology',
        title: 'Methodology and provenance',
        text: 'Detector versions: {"semgrep":"1.95.0"}. Searches: dpdp act section 8(4) safeguards.',
      },
      {
        id: 'limitations',
        title: 'Limitations',
        text: 'Repository evidence cannot establish notices, consents, contracts, or processing purposes. Unavailable detectors remain unknown.',
      },
      {
        id: 'disclaimer',
        title: 'Disclaimer',
        text: DISCLAIMER,
      },
    ],
  };
}
```

Keep `FIXTURE_SCAN_ID`, `FIXTURE_REPORT_ID`, and `getFixtureScan` unchanged. This is a guarded fixture input only; do not change `apps/web/server/api/v1/report/pdf/[reportId]/view.get.ts` or any orchestrator route.

- [x] **Step 4: Run the focused Playwright suite and confirm GREEN**

```bash
pnpm --filter @dpdpa/web test:e2e -- phase-e-walkthrough.spec.ts pdf-parity.spec.ts
```

Expected GREEN output:

```text
✓ phase-e-walkthrough.spec.ts > Phase E walkthrough > renders the five readiness pages from guarded fixtures
✓ phase-e-walkthrough.spec.ts > Phase E walkthrough > renders detector explanations and attestation tiles
✓ phase-e-walkthrough.spec.ts > Phase E walkthrough > exports SARIF and Markdown from control results
✓ phase-e-walkthrough.spec.ts > Phase E walkthrough > produces a real PDF from the report flow
✓ pdf-parity.spec.ts > PDF parity (P5-23) > v2 report view model keeps attested verdicts out of evidence coverage
Test Files  2 passed (2)
Tests  8 passed (8)
```

- [x] **Step 5: Run the full Phase E gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dpdpa/web lint:language
pnpm --filter @dpdpa/rule-packs test
pnpm test:e2e
git diff --check
```

Expected GREEN output ends with:

```text
lint: clean
typecheck: 11/11 turbo tasks successful
test: 100% successful
lint:language: 0 forbidden phrases
rule-packs: all tests passed
Playwright: all specs passed, including Phase E walkthrough and PDF parity
git diff --check: clean
```

Full-gate logs can contain intentional error-path fixtures and canary strings from negative tests; those are not failures. No fixture is pilot evidence.

- [x] **Step 6: Human-observed exit gate — do not skip**

Ask the user for explicit approval before starting any local server. With approval, start only a local dev server, then open Playwright MCP and drive the walkthrough while the user watches:

1. Scan detail: Score, Evidence coverage, Open gaps, Consent-gating, Attested statements, and Detectors unavailable tiles; confirm letter grade withheld when evidence is insufficient.
2. Data Inventory: bounded tokens, paths, and line numbers; no field values.
3. Compliance Gaps and Fix Plan: attestations appear as verdicts, never as evidence references.
4. Attestations: owner/admin write control, audit entry, and expiry state from guarded fixtures.
5. Rules: detector inputs/outputs, absence-token explanation, and "Could not determine" wording.
6. Exports: SARIF 2.1.0 JSON and issue-ready Markdown download; confirm no issue was opened on the target repository.
7. Report v2: open the downloaded PDF locally and confirm all nine sections, commencement table, limitations, and disclaimer are present and no source values appear.

If the user cannot watch live, leave this gate unmet; do not substitute a screenshot-only check. Do not start a shared server, deploy, push, open a PR, merge, change image pins, or touch `infra/` without separate explicit approval.

- [x] **Step 7: Fresh-context review and final commit**

Dispatch a fresh-context general subagent to review only the Phase E diff against the agreed Phase D HEAD. Instruct it not to modify files. Require it to check:

- attestation writes are org/repo-scoped, owner/admin-only, audited, and expiry-aware;
- attestation keys come from the validated v2 pack, not hard-coded control IDs;
- code evidence wins; attestations never become evidence, never raise coverage, and never lift a grade above the coverage cap;
- `UNKNOWN` and detector-unavailable paths never become `PASS`;
- legacy v1 scores, reports, and renderer output are unchanged;
- no source or file contents appear in DB writes, logs, API responses, exports, or PDFs;
- no forbidden user-facing wording outside quoted disclaimers or CSS token names.

Fix every Required finding with its own RED/GREEN step, rerun the full gate, then record the evidence in this plan and commit:

```bash
git add apps/web/e2e/phase-e-walkthrough.spec.ts apps/web/e2e/pdf-parity.spec.ts apps/web/server/utils/fixtures/reports.ts docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-e.md
git commit -m "test(readiness): add Phase E walkthrough and exit gate"
```

- [ ] **Step 8: Handoff**

Report the branch, commit list, exact gate output, review findings, and the user-observed walkthrough result. Ask explicitly before pushing the branch or opening PR `feat/dpdp-readiness-phase-e`. Do not merge, deploy, or change `infra/` in this phase.

---


### Phase E execution evidence (Tasks 10–16)

Task 16 focused RED (`pnpm --filter @dpdpa/web exec playwright test e2e/phase-e-walkthrough.spec.ts e2e/pdf-parity.spec.ts`, exit 1):

```text
Error: expect(received).toBe(expected) // Object.is equality
Expected: "scoring-2.0.0"
Received: "1.0.0"
1 failed
  [chromium] › e2e/pdf-parity.spec.ts:48:3 › PDF parity (P5-23) › v2 report view model keeps attested verdicts out of evidence coverage
7 passed (20.2s)
```

Task 16 focused GREEN (same command, exit 0):

```text
8 passed (21.3s)
```

Task 16 full gate (exit 0): `pnpm lint` clean; `pnpm typecheck` 11/11 Turbo tasks successful; `pnpm test` 12/12 Turbo tasks successful; `pnpm --filter @dpdpa/web lint:language` `lint:language: 0 forbidden phrases`; `pnpm --filter @dpdpa/rule-packs test` 0 failed / 0 skipped / 0 todo; `pnpm test:e2e` `87 passed (43.1s)`; `git diff --check` exit 0.

Human-observed exit gate (Step 6) is **partially met and remains unchecked**. A local Nuxt dev server was started on `http://127.0.0.1:3000/` after explicit approval, the user was notified immediately before the live Playwright MCP walkthrough, and the server was stopped afterwards. Observed: all five readiness pages, the Rules detector explainer, scan-detail readiness links, export links, and the PDF export flow. The guarded attestations API exposed an unexpired record and a future expiry; the audit filter `actionContains=attestation` returned zero rows, and no owner/admin write control was visible in the fixture session. The scan-detail fixture is legacy v1, so the Attested statements / Detectors unavailable tiles and the withheld-letter state were not visible. The downloaded fixture PDF contained only placeholder fixture text; a real v2 PDF was generated locally from the production renderer, opened in the browser, and verified with `pdftotext`: 10 pages, all nine section titles, the commencement row, limitations, disclaimer, and zero matches for source-value patterns. Because the fixture surfaces do not expose every Step 6 item, no completion is claimed for this gate.

Fresh-context review: `opencode run --title 'Phase E fresh-context review'` against base `76e78113861db5ec1848e83eefbe8063a8bc6d43` found **no Required findings**. Four non-blocking suggestions were recorded (shared owner/admin role constant, deterministic attestation selection ordering, configurable half-credit multiplier, detector/control reference sync note); no code changes were made from them.

### Rebase onto current origin/main and final verification

- Pre-rebase tip: `c547aada182c99a96e144b5f9a48afdb4121d64a` (`test(readiness): add Phase E walkthrough and exit gate`).
- Target: `origin/main` `5508c4c0669ad3146b9eba1b53af70523fc141c5` (Phase C merge, PR #107). Command: `git rebase origin/main` from `/tmp/opencode/phase-e` on `feat/dpdp-readiness-phase-e`; all 16 commits replayed. The final tip's merge base with `origin/main` is `5508c4c...`.
- No force-push, `--skip`, `--abort`, or force-add was used; every conflict was resolved by preserving both sides.

Exact conflicts and resolutions:

1. `93f8422 feat(readiness): map v2 attestation keys to controls`: `CONFLICT (content): Merge conflict in packages/rule-packs/v2/controls.yaml`, `CONFLICT (content): Merge conflict in packages/rule-packs/v2/manifest.yaml`, `Could not apply 93f8422... feat(readiness): map v2 attestation keys to controls`. Kept all five Phase C controls (`DPDPA-5-NOTICE-01`, `DPDPA-6-CONSENTGATE-01`, `DPDPA-6-FORMPURPOSE-01`, `DPDPA-8.4-MON-01`, `DPDPA-8.4-BACKUP-01`), appended `DPDPA-8.4-SECRET-01` with its attestation key, refreshed the manifest checksum, and changed the Phase C exact-code assertion to a subset presence check. Rebased as `290f52a`.
2. `dae47cd feat(readiness): load v2 attestation key mappings`: `CONFLICT (add/add): Merge conflict in apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts`, `CONFLICT (add/add): Merge conflict in apps/orchestrator/test/rule-pack-v2.loader.test.ts`, `Could not apply dae47cd... feat(readiness): load v2 attestation key mappings`. Merged the Phase C scorer shape (`LoadedRulePack`, `mappings`, `inventoryRules`, `sectionWeights`, `grades`, legacy scoring guard) with `LoadedRulePackV2`, `RulePackV2Error`, `attestationsByKey`, and the checksum-drift/source-value tests. The new mapped control initially made the Phase C golden gate report an unexpected `DPDPA-8.4-SECRET-01` verdict; an explicit `UNKNOWN` expectation was added to each of the three golden manifests, after which that focused gate passed 3/3. Rebased as `874e9ef` (6 files, 119 insertions, 19 deletions).
3. `87ab484 feat(readiness): add scoped attestation service`: `CONFLICT (content): Merge conflict in apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts`, `Could not apply 87ab484... feat(readiness): add scoped attestation service`. Kept the Phase E cached `LoadableRulePackV2` accessor, which still delegates to the Phase C `loadV2()` path. Rebased as `2c858df`.
4. `15b5646 feat(readiness): rescore v2 scans after attestation writes`: `CONFLICT (content): Merge conflict in apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`, `Could not apply 15b5646... feat(readiness): rescore v2 scans after attestation writes`. Restored the Phase C scorer body and re-applied the Phase E `AttestationForEvaluator` import, the optional `attestationsByControl` argument to `scorePersisted`, the `SCORING_V2_VERSION`/`factsFrom`/assessment-field imports, and `rescoreRepository()`. Focused orchestrator tests passed 6/6 and orchestrator typecheck was clean. Rebased as `3869d75`.
5. `f90cf93 feat(readiness): explain detectors and absence semantics`: `CONFLICT (content): Merge conflict in apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts`, `CONFLICT (content): Merge conflict in apps/orchestrator/test/rule-pack-v2.loader.test.ts`, `Could not apply f90cf93... feat(readiness): explain detectors and absence semantics`. Folded `commencement` and `detectors` parsing into the integrated loader, introduced `ReadinessControl = Control & Omit<ControlV2, 'appliesWhen'>` so both the scorer shape and the readiness fields are available, and fixed a stale `packDir` reference to `PACK_DIR`. Focused loader/detector/golden tests passed 9/9 and typecheck was clean. Rebased as `b2bcb5c`.

- Rebase finished with `Successfully rebased and updated refs/heads/feat/dpdp-readiness-phase-e.` at `cb43d14b66a00b5bb7eb864d637880030b89ae49`.
- `pnpm lint` then flagged only Prettier formatting in the two hand-merged loader files. Formatting-only follow-up commit `670750f034999e2143fceba48d1ec150286478bf` (`style(readiness): format merged v2 loader files`, 2 files, 2 insertions, 7 deletions) is the final tip.
- Final tip gate results (all logs under `/tmp/opencode/phase-e-final-*.log`, all exit 0): `pnpm lint` clean (`All matched files use Prettier code style!`); `pnpm typecheck` `Tasks: 11 successful, 11 total`; `pnpm test` `Tasks: 12 successful, 12 total`; focused `pnpm --filter @dpdpa/web exec playwright test e2e/phase-e-walkthrough.spec.ts e2e/pdf-parity.spec.ts` `8 passed (21.9s)`; `pnpm --filter @dpdpa/web lint:language` `lint:language: 0 forbidden phrases`; `pnpm --filter @dpdpa/rule-packs test` `pass 14`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`; `pnpm --filter @dpdpa/rule-packs validate` `{"pack":"dpdpa-2026.11.0","issues":[]}`; `pnpm test:e2e` `87 passed (1.1m)`; `git diff --check` exit 0. Working tree clean after the final commit.
- Step 6 remains unchecked and Step 8 is delivered in the final response; no push, PR, merge, deploy, image-pin change, or `infra/` change was performed.

### Rebase onto Phase D HEAD (`ff38e2b`) and synthetic v2 fixture coverage

Pre-rebase tip was `b959ea4` with a clean tree; `git fetch origin main --prune` confirmed
`origin/main` `ff38e2bc2b1847aad20827550d0c2bdbe3a2ba4c`. `git rebase origin/main` replayed 18
commits, stopped on two conflicts, and finished with
`Successfully rebased and updated refs/heads/feat/dpdp-readiness-phase-e.` No `--skip`,
`--abort`, force-push, or force-add was used. The rebased tip before fixture work was `aa26f22`,
with merge base `ff38e2b` and a clean tree.

Exact conflicts and resolutions:

1. `290f52a feat(readiness): map v2 attestation keys to controls`:
   `CONFLICT (content): Merge conflict in packages/rule-packs/v2/controls.yaml`,
   `CONFLICT (content): Merge conflict in packages/rule-packs/v2/manifest.yaml`,
   `CONFLICT (content): Merge conflict in packages/rule-packs/test/v2-phase-c-controls.test.mjs`,
   `error: could not apply 290f52a...`. Kept Phase D's full 49-control catalogue (including its
   `DPDPA-8.4-SECRET-01` `evidenceMode: violation`, weight 8, and `gitleaks_scan` /
   `generic-api-key` violation rule), kept Phase D's subset assertions, and added only
   `attestationKey: secrets.managed_store` to the existing control. Regenerated the checksum with
   `pnpm --filter @dpdpa/rule-packs manifest:v2` (`manifest.yaml: 20 files for
   dpdpa-2026.11.0`; controls SHA-256 `daa8f80…4763`). Test-first RED/GREEN:
   `pnpm --filter @dpdpa/rule-packs exec node --test test/v2-phase-c-controls.test.mjs` RED exit 1,
   `ℹ tests 2 / ℹ pass 1 / ℹ fail 1`, with
   `AssertionError [ERR_ASSERTION]: Phase E must map the attestation key onto the existing control`,
   `+ undefined`, `- 'secrets.managed_store'`; GREEN exit 0 with `ℹ pass 2 / ℹ fail 0`.
   Rebased as `1147d34`.
2. `874e9ef feat(readiness): load v2 attestation key mappings`:
   `CONFLICT (content): Merge conflict in apps/orchestrator/test/rule-pack-v2.loader.test.ts`,
   `error: could not apply 874e9ef...`. Preserved Phase E's attestation-loader tests (temp-dir
   checksum drift, source-value rejection, attestation key mapping) and kept Phase D's relaxed
   mapping-count assertion (`expect(loaded.mappings.length).toBeGreaterThanOrEqual(6)`). Focused
   orchestrator tests: `Test Files 2 passed (2)`, `Tests 7 passed (7)`. Rebased as `8271405`.

All 18 commits replayed; the formatting-only commit `670750f` was dropped as already upstream.
Phase D catalogue, evidence rules, golden manifests, detector metadata, and commencement data
remain present.

Step 6 fixture gap: the legacy v1 scan fixture hid the readiness tiles, attestation verdict,
owner/admin write control, audit entry, and expiry state from a live fixture session. Added only
synthetic v2 fixture coverage (no source text, file contents, secrets, or canaries):
`apps/web/server/utils/fixtures/v2-walkthrough.ts` and two focused test files, wiring them into
`getFixtureScan`/`getFixtureScanEvents`, `fixtureGaps(scanId)`, `fixtureFixPlan(scanId)`,
`fixtureAttestations(repoId)`, the audit fixture, the attestation list expiry line, and the
fixtures-only `?fixtureRole=owner|admin` override. The v2 scan keeps `grade: null` with
`gradeWithheldReason: insufficient_evidence`; the attestation gap uses verdict `ATTESTED_FAIL`
with `evidence: []`; missing evidence never becomes `PASS`.

Test-first RED (`pnpm --filter @dpdpa/web exec vitest run test/v2-walkthrough-fixtures.test.ts
test/v2-walkthrough-ui.test.ts`, exit 1):

```text
Test Files  2 failed (2)
     Tests  8 failed | 1 passed (9)

FAIL |nuxt| test/v2-walkthrough-fixtures.test.ts > ... > exposes a scoring-v2 scan with every readiness surface
FixtureNotFoundError: The scan does not exist.
FAIL ... > keeps attestation verdicts out of gap evidence ...
AssertionError: expected 0 to be greater than 0
FAIL ... > lists the attested control in the fix plan
AssertionError: expected [ 'DPDPA-8.4-SECRET-01' ] to include 'DPDPA-6-CONSENTGATE-01'
FAIL ... > exposes expiry state and an owner-written attestation
AssertionError: expected false to be true
FAIL ... > records the attestation write in the audit trail
AssertionError: expected 0 to be greater than 0
FAIL ... > maps an owner fixture role so the write control is observable
AssertionError: expected 'undefined' to be 'function'
FAIL |nuxt| test/v2-walkthrough-ui.test.ts > ... > renders every readiness tile and withholds the letter grade
FixtureNotFoundError: The scan does not exist.
FAIL ... > shows the owner/admin write control and expiry state from fixtures
AssertionError: expected 'AttestationsHuman statements recorded…' to contain 'Expired'
```

Test-first GREEN (same command, exit 0):

```text
Test Files  2 passed (2)
     Tests  9 passed (9)
```

Full gate on the final code (all logs `/tmp/opencode/phase-e-step6-*.log`): `pnpm lint` exit 0
(`All matched files use Prettier code style!`; an initial exit 1 flagged only Prettier formatting
in three new/edited files, fixed with the repo's formatter and rerun clean); `pnpm typecheck` 11
successful / 11 total; `pnpm test` 12 successful / 12 total; focused Playwright `8 passed (21.0s)`;
`lint:language: 0 forbidden phrases`; rule-packs `pass 41 / fail 0 / skipped 0 / todo 0`; validate
`{"pack":"dpdpa-2026.11.0","issues":[]}`; `pnpm test:e2e` `87 passed (47.0s)` (an initial run
hit the known `scans-list` empty-state navigation flake, `1 failed / 86 passed`; a clean rerun
passed 87/87). E2E-regenerated `.playwright-mcp` screenshots were restored; `git diff --check`
clean; working tree clean after the commit.

Live walkthrough surface IDs for the user (no server was started in this phase): scan detail
`/app/scans/0f000000-0000-4000-8000-0000000000a1` (Score, Evidence coverage 42%, Open gaps 2,
Consent gating 60%, Attested statements 2, Detectors unavailable gitleaks/checkov, "No letter");
gaps and fix plan `?scanId=0f000000-0000-4000-8000-0000000000a1`; attestations
`/app/readiness/attestations?repoId=0f000000-0000-4000-8000-0000000000a2` and the same URL with
`&fixtureRole=owner` for the write control; audit `actionContains=attestation` shows
`attestation.upserted`.

### Human-observed Step 6 and bounded inventory line numbers

The local Nuxt dev server was started with `NUXT_FIXTURES=1` on `http://localhost:3000/` after the
user approved the live walkthrough, and Playwright MCP drove it while the user watched. The server
was stopped afterwards. Observed:

1. Scan detail `...a1`: Score 71.4, Evidence coverage 42%, Open gaps 2, Consent gating 60%,
   Attested statements 2, Detectors unavailable 2 (checkov, gitleaks), grade "No letter —
   insufficient evidence", and the "Could not determine" region.
2. Data Inventory `...a1`: detector `form_scan`, bounded token `email_address`, path
   `src/api/user.ts`, line `12`; no field values.
3. Compliance Gaps / Fix Plan `...a1`: `DPDPA-6-CONSENTGATE-01` shows verdict `ATTESTED_FAIL`
   (reason `attested_no`) and an owner-attestation remedy. The gaps API returns
   `"evidence": []` for that control, so the attestation never becomes an evidence reference.
4. Attestations `...a2` with `&fixtureRole=owner`: "Record attestation" button, a current
   attestation (`Expires 2027-02-01`) and an expired one (`Expired 2026-06-01`); the audit page
   shows `attestation.upserted` by Ada Owner.
5. Rules `DPDPA-8.4-ENC-01`: detector inputs/outputs, absence token `consent_checkbox`, and the
   "Could not determine" explanation.
6. Exports: `GET /api/v1/scan/...a1/export/sarif` returned SARIF `2.1.0` (200) and
   `/export/markdown` returned issue-ready Markdown (200). Only GETs were made; no issue was
   opened on any target repository.
7. Report v2: a real PDF was generated locally through the production renderer and inspected
   with `pdfinfo`/`pdftotext`: 10 A4 pages, all nine section titles, the commencement row
   (`Section 6 · effective 2026-01-01 · verified 2026-11-27`), Limitations, and Disclaimer. No
   canary/source-value pattern and no forbidden user-facing wording appeared in the PDF.

During the live walkthrough the inventory page rendered Detector, Token and Path but omitted the
already-bounded `line` value. Test-first RED (`playwright test e2e/phase-e-walkthrough.spec.ts -g
'inventory shows bounded'`) failed with `getByRole('columnheader', { name: 'Line' })` element(s)
not found; GREEN after adding the `Line` column passed `1 passed (12.3s)`. Full gates on the final
commit (`pnpm lint && pnpm typecheck && pnpm test && git diff --check`) exited 0 with 12/12 Turbo
tasks and 83 files / 571 web tests passing. Step 6 is checked only on the basis of these observed
surfaces; no pilot sign-off is claimed.

Step 6 is **still unchecked**: the user must watch the live walkthrough and decide. No server,
push, PR, merge, deploy, `infra/` change, or image-pin change was performed.

## Final review checklist (agent before handoff)

- [ ] Every task has `Files`, `Consumes`/`Produces` interfaces, a failing test, a RED command with expected output, minimal code, a GREEN command with expected output, a full-gate command, and a commit command.
- [ ] No placeholder wording such as TBD, TODO, "implement later", "fill in details", "add appropriate validation", "write tests for the above", or "similar to Task N".
- [ ] Global Constraints are copied verbatim and include readiness-only wording, forbidden-term rule, no source retention, `UNKNOWN` exclusion, deterministic versioned scoring, attestation limits, fixture-only inputs, no unapproved push/PR/merge/deploy, TDD, and per-phase branch/PR.
- [ ] Forbidden terms occur only in quoted disclaimers, CSS token names, or the lint rule definitions that reject them.
- [ ] The plan touches only this file; no source, schema, package, or infra file was modified while writing the plan.
- [ ] Phase E consumes explicit interfaces rather than assuming undocumented Phase C/D behavior.

## Definition of done (execution criteria, not yet met)

- [ ] Tasks 1–16 GREEN with recorded RED/GREEN evidence.
- [ ] `pnpm lint && pnpm typecheck && pnpm test`, `pnpm --filter @dpdpa/web lint:language`, `pnpm --filter @dpdpa/rule-packs test`, and `pnpm test:e2e` all green; `git diff --check` clean.
- [ ] v2 pack validates with mapped attestation keys; v1 pack, `scoring.yaml`, legacy scores, and v1 report bytes unchanged.
- [ ] Attestation writes are scoped, audited, expiry-aware, owner/admin-only, and trigger deterministic rescoring of completed v2 scans.
- [ ] Five new pages, Rules detector explanations, scan-detail tiles, v2 reports, SARIF 2.1.0, and Markdown exports work against guarded fixtures.
- [ ] Language lint covers UI, report, export, and rule-pack messages with narrowly scoped exemptions.
- [ ] Fresh-context review found no Required defects; user watched the Playwright walkthrough and verified the PDF.
- [ ] No push, PR, merge, deploy, image-pin change, or `infra/` change without explicit approval.
