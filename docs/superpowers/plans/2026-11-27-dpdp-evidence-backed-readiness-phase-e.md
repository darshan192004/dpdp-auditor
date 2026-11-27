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
- Forbidden in product UI/report/export strings outside quoted disclaimers: “compliant”, “non-compliant”, “violation of the Act”, “certified”.
- Tests first. At every task boundary, run the task's focused tests **and** `pnpm lint && pnpm typecheck && pnpm test`; do not commit unless all are green.
- A CI language lint must cover UI strings, report/export strings, and rule messages. CSS token names such as `status-compliant-bg` and quoted disclaimers are exempt; user-facing copy is not.
- Never retain, transmit, persist, log, or trace source code or file contents. Evidence references carry hashes, paths, lines, detector IDs, and fingerprints only.
- Never turn missing evidence into `PASS`; `UNKNOWN` is excluded from the score and shown prominently.
- Legacy scans keep `scoringVersion: "1.0.0"` and exact historical scores. New v2 scans carry `"scoring-2.0.0"`.
- Do not change `packages/rule-packs/scoring.yaml`; its numeric `scoringVersion: 1.0.0` stays valid for legacy pack loading.
- Do not push, create a PR, merge, deploy, start a shared server, change image pins, or touch `infra/` or `infra/certs/*` without explicit user approval.
- Use a separate branch and PR for Phase E: `feat/dpdp-readiness-phase-e`, stacked from the agreed Phase D HEAD. Do not commit Phase E work to a Phase A–D branch.
- Fixtures are test inputs only and must never be presented as pilot evidence or sign-off data. WebGoat and Juice-Shop-like repos are manual smoke tests only, not CI gates.
- k3s deployment and the gVisor RuntimeClass sign-off gate remain paused pending explicit user approval.
- External pentest remains `Pending — deferred for internal pilot`.
- UI verification must use Playwright MCP so the user can watch live.
- Deterministic, versioned scoring only: attestation verdicts, coverage, and grade caps must be reproducible from the stored pack version and scan inputs.
- An attestation is a human statement, never code evidence. It must not become an evidence reference, raise evidence coverage, or lift a grade above the coverage cap.
- Attestation writes are org-scoped, owner/admin-only, audited, and expiry-aware. Unexpired written truth wins over absence; code evidence wins over an attestation.
- Never open GitHub issues or pull requests on a target repository from an export.

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
AssertionError: expected [] to deeply equal []
```

and the duplicate-key assertion fails with `expected [] to contain 'duplicate_attestation_key'`.

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
- Produces: `loadRulePackV2(dir, options?) => Promise<LoadedRulePackV2>` with `pack`, `controls`, `controlsByCode`, and `attestationsByKey: Map<string, ControlV2[]>`; `RulePackV2Error`.

- [x] **Step 1: Write the failing loader tests**

```ts
// apps/orchestrator/test/rule-pack-v2.loader.test.ts
import { createHash } from 'node:crypto';
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
  controlsFileV2Schema,
  packManifestV2Schema,
  validatePackV2,
  type ControlV2,
  type PackFileV2,
} from '@dpdpa/contracts';

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
  const controlsFile = files.find((file) => file.path === 'controls.yaml');
  if (!controlsFile) throw new RulePackV2Error('RULE_PACK_MISSING', 'missing controls.yaml');
  const controls = controlsFileV2Schema.parse(controlsFile.value).controls;
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

- [ ] **Step 1: Write the failing evaluator tests**

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

- [ ] **Step 2: Run the focused evaluator test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-control-evaluator.test.ts
```

Expected RED output:

```text
FAIL  test/attestation-control-evaluator.test.ts > attestation evaluator semantics > uses an unexpired attested answer only when no code evidence is determinable
AssertionError: expected 'UNKNOWN' to be 'ATTESTED_PASS'
```

- [ ] **Step 3: Add the attestation input and fallback**

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

- [ ] **Step 4: Run the focused evaluator test and confirm GREEN**

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

- [ ] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/scoring/control-evaluator.ts apps/orchestrator/test/attestation-control-evaluator.test.ts
git commit -m "feat(readiness): apply attestation fallback in evaluator"

---

### Task 4: Prove attested credit never raises evidence coverage or the grade cap

**Files:**
- Create: `apps/orchestrator/test/attestation-scoring.test.ts`
- Modify: `apps/orchestrator/src/modules/scoring/scoring.v2.ts`

**Interfaces:**
- Consumes: `scoreScanV2`, `ScoreInputV2`, `ControlResultLike`, and `type Control` from the Phase A scoring modules.
- Produces: explicit regression assertions that `ATTESTED_PASS` receives half credit, is excluded from `determinableWeight`, and leaves `evidenceCoverage` at `0` when no code evidence exists.

- [ ] **Step 1: Write the failing scoring regression tests**

```ts
// apps/orchestrator/test/attestation-scoring.test.ts
import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import type { ControlResultLike } from '../src/modules/scoring/control-evaluator.js';
import { scoreScanV2 } from '../src/modules/scoring/scoring.v2.js';

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
    reasonCode: verdict.startsWith('ATTESTED') ? 'attested_pass' : 'positive_evidence',
    confidence: verdict.startsWith('ATTESTED') ? null : 'direct',
    evidence: [],
    rulePackVersion: 'dpdpa-2026.11.0',
    scoringVersion: 'scoring-2.0.0',
  };
}

describe('attestation scoring caps', () => {
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

- [ ] **Step 2: Run the focused scoring test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-scoring.test.ts
```

Expected RED output:

```text
FAIL  test/attestation-scoring.test.ts > attestation scoring caps > counts code evidence as coverage alongside an attested control
TypeError: Cannot read properties of undefined (reading 'evidenceCoverage')
```

If the first two assertions pass, keep their current math and add the section-level assertion; the task is complete only when all three tests pass.

- [ ] **Step 3: Make the attestation exclusion explicit in the scorer**

```ts
// apps/orchestrator/src/modules/scoring/scoring.v2.ts
const ATTESTED_VERDICTS = new Set<ControlResultLike['verdict']>([
  'ATTESTED_PASS',
  'ATTESTED_FAIL',
]);
```

Replace the local `attested` boolean inside `scoreScanV2` with:

```ts
    const attested = ATTESTED_VERDICTS.has(result.verdict);
```

Keep `effectiveWeight = control.weight * 0.5`, keep `PASS`/`ATTESTED_PASS` as the only full-credit verdicts, keep `failedWeight` limited to `FAIL`, and keep `determinableWeight` incremented only when `!attested`. No other scoring constants change.

- [ ] **Step 4: Run the focused scoring test and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-scoring.test.ts
```

Expected GREEN output:

```text
✓ test/attestation-scoring.test.ts > attestation scoring caps > gives an attested pass half credit but no evidence coverage
✓ test/attestation-scoring.test.ts > attestation scoring caps > excludes an attested fail from the failure-driven critical cap input
✓ test/attestation-scoring.test.ts > attestation scoring caps > counts code evidence as coverage alongside an attested control
Test Files  1 passed (1)
Tests  3 passed (3)
```

- [ ] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/scoring/scoring.v2.ts apps/orchestrator/test/attestation-scoring.test.ts
git commit -m "test(readiness): pin attestation coverage caps"

---

### Task 5: Add the org/repo-scoped attestation repository and service

**Files:**
- Create: `apps/orchestrator/src/modules/attestations/attestation.schemas.ts`
- Create: `apps/orchestrator/src/modules/attestations/attestations.repository.ts`
- Create: `apps/orchestrator/src/modules/attestations/attestations.service.ts`
- Create: `apps/orchestrator/test/attestations.service.test.ts`
- Modify: `apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts`

**Interfaces:**
- Consumes: B's `prisma.attestation` model and `attestationSchema` key/answer/expiry conventions; `IdentityService.getMembership(orgId, userId)`; `RepositoriesRepository.findById(orgId, repositoryId)`; `AuditService.record`; `ScanScoringService.rescoreRepository` (added in Task 6); `RulePackService.loadV2` (added in this task).
- Produces: `writeAttestationSchema`, `AttestationView`, `AttestationsRepository.list/upsert`, and `AttestationsService.set/list` with owner/admin enforcement, key validation, auditing, and expiry checks.

- [ ] **Step 1: Write the failing service tests**

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
  const repositories = { findById: vi.fn().mockResolvedValue({ id: REPO, orgId: ORG }) };
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
    repositories.findById.mockResolvedValue(null);
    await expect(service.set(write)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused service test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestations.service.test.ts
```

Expected RED output:

```text
FAIL  test/attestations.service.test.ts > attestation service > accepts an owner write, audits it without the note, and rescores the repository
Error: Cannot find module '../src/modules/attestations/attestations.service.js'
```

- [ ] **Step 3: Add the schema, repository, service, and v2 loader accessor**

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
    const repository = await this.repositories.findById(input.orgId, input.repositoryId);
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

- [ ] **Step 4: Run the focused service test and confirm GREEN**

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

- [ ] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/attestations apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts apps/orchestrator/test/attestations.service.test.ts
git commit -m "feat(readiness): add scoped attestation service"

---

### Task 6: Recompute all completed v2 scans for the attested repository

**Files:**
- Modify: `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`
- Create: `apps/orchestrator/test/attestation-rescore.test.ts`

**Interfaces:**
- Consumes: `SCORING_V2_VERSION`, `scanAssessmentUpdate`, `assessmentEventFields`, `factsFrom`, and B's `Attestation` rows.
- Produces: `ScanScoringService.rescoreRepository(orgId, repositoryId, tx)`; `scorePersisted` accepts an optional active-attestation map and rewrites `control_results` for every completed v2 scan; legacy scans are untouched.

- [ ] **Step 1: Write the failing repository-rescore test**

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

- [ ] **Step 2: Run the failing rescore test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-rescore.test.ts
```

Expected RED output:

```text
FAIL  test/attestation-rescore.test.ts > attestation-triggered rescore > rescores completed v2 scans with active attestations only
TypeError: service.rescoreRepository is not a function
```

- [ ] **Step 3: Add the rescore helper and attestation-aware scoring input**

```ts
// apps/orchestrator/src/modules/scoring/scan-scoring.service.ts
import { assessmentEventFields, scanAssessmentUpdate } from './assessment-fields.js';
import { factsFrom } from './applicability.js';
import {
  SCORING_V2_VERSION,
  isScoringV2,
  LEGACY_SCORING_VERSION,
  scoreScanVersioned,
  scoringVersionForNewScan,
} from './scoring.engine.js';
import type { AttestationForEvaluator } from './control-evaluator.js';
```

Add the public method before `persistControlResults`:

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

- [ ] **Step 4: Run the focused rescore test and confirm GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/attestation-rescore.test.ts
```

Expected GREEN output:

```text
✓ test/attestation-rescore.test.ts > attestation-triggered rescore > rescores completed v2 scans with active attestations only
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [ ] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/scoring/scan-scoring.service.ts apps/orchestrator/test/attestation-rescore.test.ts
git commit -m "feat(readiness): rescore v2 scans after attestation writes"

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

- [ ] **Step 1: Write the failing controller and fixture tests**

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

- [ ] **Step 2: Run the focused route tests and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/internal-attestations.controller.test.ts && pnpm --filter @dpdpa/web exec vitest run test/attestation-fixtures.test.ts
```

Expected RED output:

```text
Error: Cannot find module '../src/modules/attestations/internal-attestations.controller.js'
```

- [ ] **Step 3: Add the internal controller and module**

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

- [ ] **Step 4: Add the BFF routes and guarded fixtures**

```ts
// apps/web/server/api/v1/repos/[repoId]/attestations/index.get.ts
import { requireIdentity } from '../../../../../utils/session';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { fixtureAttestations } from '../../../../../utils/fixtures/attestations';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { getRouterParam } from 'h3';

export default defineEventHandler(async (event) => {
  const repoId = getRouterParam(event, 'repoId');
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
  const repoId = getRouterParam(event, 'repoId');
  const key = getRouterParam(event, 'key');
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

- [ ] **Step 5: Run the focused route tests and confirm GREEN**

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

- [ ] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/attestations apps/orchestrator/src/app.module.ts apps/orchestrator/test/internal-attestations.controller.test.ts apps/web/server/api/v1/repos apps/web/server/utils/fixtures/attestations.ts apps/web/test/attestation-fixtures.test.ts
git commit -m "feat(readiness): expose scoped attestation routes"

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

- [ ] **Step 1: Write the failing read-service test**

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

- [ ] **Step 2: Run the failing read-service test and confirm RED**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/readiness-read.service.test.ts
```

Expected RED output:

```text
FAIL  test/readiness-read.service.test.ts > readiness read service > returns bounded inventory signals without source values
Error: Cannot find module '../src/modules/readiness/readiness-read.service.js'
```

- [ ] **Step 3: Add the read service**

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

- [ ] **Step 4: Add web contracts, fixtures, and proxy routes**

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

- [ ] **Step 5: Run the focused read tests and confirm GREEN**

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

- [ ] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/orchestrator/src/modules/readiness apps/orchestrator/src/app.module.ts apps/orchestrator/test/readiness-read.service.test.ts apps/web/shared/readiness.ts apps/web/server/utils/fixtures/readiness.ts apps/web/server/api/v1/scan apps/web/test/readiness-read-fixtures.test.ts
git commit -m "feat(readiness): add readiness read routes"

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

- [ ] **Step 1: Write the failing page, nav, and breadcrumb tests**

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
    expect(page.getByRole('heading', { level: 1 }).text()).toBe('Data Inventory');
    expect(page.text()).toContain('email_address');
    expect(page.getByRole('table')).toBeTruthy();
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
    expect(page.getByRole('button', { name: 'Record attestation' })).toBeTruthy();
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

- [ ] **Step 2: Run the focused UI tests and confirm RED**

```bash
pnpm --filter @dpdpa/web exec vitest run test/readiness-pages.test.ts test/readiness-nav.test.ts test/breadcrumbs.test.ts
```

Expected RED output:

```text
FAIL  test/readiness-pages.test.ts > readiness pages > renders an inventory table from bounded signals
Error: Cannot find module '../app/components/readiness/ReadinessDataView.vue'
```

- [ ] **Step 3: Add the reusable views**

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
import type { FixtureAttestation } from '~/server/utils/fixtures/attestations';

defineProps<{ rows: FixtureAttestation[]; canWrite: boolean }>();
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Attestations</h1>
        <p class="text-sm text-muted">Human statements recorded for this repository.</p>
      </div>
      <button v-if="canWrite" type="button" class="rounded border px-3 py-2">
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

- [ ] **Step 4: Add the five pages**

```vue
<!-- apps/web/app/pages/app/readiness/inventory.vue -->
<script setup lang="ts">
import ReadinessDataView from '~/components/readiness/ReadinessDataView.vue';
const route = useRoute();
const { data } = await useFetch(`/api/v1/scan/${String(route.params.scanId)}/inventory`);
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
const { data } = await useFetch(`/api/v1/scan/${String(route.params.scanId)}/gaps`);
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
const { data } = await useFetch(`/api/v1/scan/${String(route.params.scanId)}/fix-plan`);
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
const { data } = await useFetch(`/api/v1/repos/${String(route.params.repoId)}/attestations`);
const session = useAuth();
const canWrite = computed(() => ['owner', 'admin'].includes(session.value?.role ?? ''));
</script>

<template>
  <ReadinessAttestationList :rows="data?.data ?? []" :can-write="canWrite" />
</template>
```

```vue
<!-- apps/web/app/pages/app/readiness/exports.vue -->
<script setup lang="ts">
const route = useRoute();
const scanId = String(route.params.scanId);
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">Exports</h1>
    <p class="text-sm text-muted">Machine-readable and issue-ready views of control results.</p>
    <ul class="space-y-2">
      <li><a :href="`/api/v1/scan/${scanId}/export/sarif`">Download SARIF 2.1.0</a></li>
      <li><a :href="`/api/v1/scan/${scanId}/export/markdown`">Download issue-ready Markdown</a></li>
    </ul>
  </section>
</template>
```

- [ ] **Step 5: Add navigation and breadcrumbs**

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

In `apps/web/app/utils/breadcrumbs.ts`, add before the final `return crumbs`:

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

- [ ] **Step 6: Run the focused UI tests and confirm GREEN**

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

- [ ] **Step 7: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected output ends with successful lint, successful typecheck, and `Tasks: 100% successful`. Then:

```bash
git add apps/web/app/components/readiness apps/web/app/pages/app/readiness apps/web/test/readiness-pages.test.ts apps/web/app/utils/nav.ts apps/web/app/components/shell/ConsoleSidebar.vue apps/web/app/utils/breadcrumbs.ts apps/web/test/breadcrumbs.test.ts apps/web/test/readiness-nav.test.ts
git commit -m "feat(readiness): add readiness UI pages"
```
