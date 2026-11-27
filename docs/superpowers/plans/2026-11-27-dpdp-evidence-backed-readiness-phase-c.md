# Evidence-backed DPDPA Readiness Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the inventory MVP, signed callback/persistence, and the first v2 control set so `fx-good-app`, `fx-bad-app`, and `fx-silent-app` produce their declared golden verdicts.

**Architecture:** The Python scan runner adds four bounded, content-light detectors (`schema_scan`, `form_scan`, `mechanism_scan`, `artefact_scan`) that emit only allowlisted tokens, relative paths, line numbers, counts, detector IDs, and detector status. The signed completion callback carries that report to the orchestrator, which stores it with scan facts and feeds a pure inventory-evidence adapter into the existing Phase A `ControlEvaluator` and scoring v2 path. Phase B contracts and the checksummed pack remain the source of truth; this plan adds the first substantive controls/mappings and never rewrites Phase B schemas, the v1 loader, or legacy scoring.

**Tech Stack:** Python 3.12, pytest, Ruff, mypy, TypeScript, NestJS, Zod 4, Prisma/PostgreSQL, YAML 2.9.1, Vitest, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md`  
**Phase B spec:** `docs/superpowers/specs/2026-11-27-dpdp-readiness-phase-b-design.md`  
**ADR:** `docs/decisions/0001-evidence-backed-dpdp-readiness.md`  
**Branch:** `feat/dpdp-readiness-phase-c`, stacked from the agreed Phase B HEAD; opened as its own PR only after explicit approval.

## Global Constraints

- Readiness only. No compliance verdict, certificate, badge, or legal conclusion.
- Forbidden outside quoted disclaimers: `compliant`, `non-compliant`, `violation of the Act`, `certified`. An exit-gate language lint enforces this across pack content, reports, exports, and rule messages.
- PASS requires recorded positive evidence. FAIL requires cited gap evidence. UNKNOWN is excluded from the score and never becomes a pass.
- A required detector that failed, timed out, or was skipped yields UNKNOWN with `detector_unavailable`, unless determinable evidence from a completed detector or a valid attestation exists.
- Never retain source code or file contents: no source code, file contents, secret values, or raw scanner output persisted in PostgreSQL, Redis, object storage, logs, or traces.
- No canary needle, source text, matched value, secret value, or file content may enter the pack, DB, object storage, callbacks, logs, or API responses.
- New scans use `scoring-2.0.0`, `inventory-1.0.0`, and the rule pack `dpdpa-2026.11.0`; legacy scans keep `scoringVersion: "1.0.0"` and exact historical scores.
- Scoring is deterministic and versioned; every fixture run twice must produce byte-identical `control_results`.
- Emit detector status for every inventory module; a failed module never produces PASS.
- Fixtures are test inputs only and must never be presented as pilot evidence or sign-off data.
- Tests first. At every task boundary, run the task's focused tests **and** `pnpm lint && pnpm typecheck && pnpm test`; do not commit unless all are green. For Python-only tasks also run `cd apps/scan-runner && ruff check . && ruff format --check . && mypy --strict . && pytest -q`.
- Before any commit, the exact gate command `pnpm lint && pnpm typecheck && pnpm test` must be green.
- One separate branch and one separate PR per phase; Phase C uses `feat/dpdp-readiness-phase-c` stacked from the agreed Phase B HEAD and is never merged by this work.
- No push, PR creation, merge, deploy, image-pin update, or `infra/` change happens without explicit user approval.
- Do not modify `packages/contracts/src/pack-v2.ts`, `packages/contracts/test/pack-v2.test.ts`, `packages/rule-packs/scoring.yaml`, `scoringVersion: "1.0.0"` for legacy paths, the v1 loader, or legacy scores.
- Every new or changed v2 file must be covered by `v2/manifest.yaml` after `pnpm --filter @dpdpa/rule-packs manifest:v2`; never hand-edit checksums.
- Never use network access, repository writes, code execution from repository content, `eval`, or YAML unsafe load in analyzer code.
- Control-code normalization: the original multiword examples `DPDPA-6-CONSENT-GATE-01` and `DPDPA-6-FORM-PURPOSE-01` do not match the existing `CONTROL_CODE_PATTERN`. All Phase C artifacts use `DPDPA-6-CONSENTGATE-01` and `DPDPA-6-FORMPURPOSE-01`; the Phase B contract itself is unchanged.

---

## Preconditions and zero-context orientation

Run these before Task 1. If any command fails, stop; do not start Phase C on the wrong base.

```bash
git status --short
git log --oneline -5
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dpdpa/rule-packs test
cd apps/scan-runner && ruff check . && ruff format --check . && mypy --strict . && pytest -q
```

Expected: no unexpected working-tree changes, all gates green, and Phase B artifacts present. Record the exact RED/GREEN lines for each task in the execution ledger.

Phase B already provides these facts:

- `packages/contracts/src/pack-v2.ts` exports `DPDPA_PACK_V2_VERSION = 'dpdpa-2026.11.0'`, `INVENTORY_V1_VERSION = 'inventory-1.0.0'`, `INVENTORY_MODULE_KEYS`, `inventoryFactSchema`, `inventorySignalSchema`, `controlsFileV2Schema`, `detectorsFileV2Schema`, `mappingsFileV2Schema`, `catalogFileSchema`, `validatePackV2`, and `ValidationIssue`.
- `apps/orchestrator/src/modules/scoring/control-evaluator.ts` exports `evaluateControls`, `buildDetectorStatuses`, `ControlEvaluatorInput`, `ControlEvidence`, and `ControlResultLike`.
- `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts` exposes `mapAndScore(scan, facts, coverage, tx)` and `scorePersisted(scan, facts, tx)`.
- `apps/scan-runner/src/scan_runner/cli.py` currently calls `collect_facts(workspace)` and `send_completion(..., facts=facts)`; Phase C keeps that path and adds `inventory`.
- `packages/rule-packs/scripts/generate-manifest-v2.mjs` and `pnpm --filter @dpdpa/rule-packs manifest:v2` regenerate `v2/manifest.yaml` from every file under `v2/` except the manifest itself.

## File Structure

- `packages/contracts/src/golden-manifest.ts` — add bounded expected-verdict records to golden manifests.
- `packages/contracts/test/golden-manifest.test.ts` — contract tests for the new expected-verdict shape.
- `tests/golden-repos/fx-good-app/` — fixture source files and verdict manifest for positive-evidence verdicts.
- `tests/golden-repos/fx-bad-app/` — fixture source files and verdict manifest for cited-gap verdicts.
- `tests/golden-repos/fx-silent-app/` — quiet fixture with a verdict manifest for undetermined/not-applicable verdicts.
- `packages/rule-packs/v2/controls.yaml` — first five substantive v2 controls with legal references and declared detectors.
- `packages/rule-packs/v2/detectors.yaml` — declarations for the first four inventory detectors.
- `packages/rule-packs/v2/mappings/inventory.yaml` — detector-to-control mappings with bounded confidence and rationale.
- `packages/rule-packs/v2/field_dictionary.yaml` — basic allowlisted personal-data field dictionary.
- `packages/rule-packs/v2/manifest.yaml` — regenerated checksum manifest, never hand-edited.
- `packages/rule-packs/test/v2-phase-c-controls.test.mjs` — pack-content assertions for the first control set.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/__init__.py` — public analyzer export.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/types.py` — bounded signal constructors and detector constants.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/paths.py` — bounded, deterministic file walking and text reads.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/schema_scan.py` — schema/field detector.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/form_scan.py` — collection-form detector.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/mechanism_scan.py` — privacy mechanism detector.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/artefact_scan.py` — artefact-presence detector.
- `apps/scan-runner/src/scan_runner/dpdp_inventory/analyzer.py` — deadline-aware orchestration and report assembly.
- `apps/scan-runner/tests/test_dpdp_inventory.py` — analyzer detector, containment, and determinism tests.
- `apps/scan-runner/src/scan_runner/cli.py` — signed completion payload addition and analyzer call site.
- `apps/scan-runner/tests/test_callbacks.py` — callback inventory payload and canary-containment tests.
- `apps/orchestrator/src/modules/scans/scan.schemas.ts` — bounded inventory report in the completion schema.
- `apps/orchestrator/src/modules/scans/inventory-status.ts` — pure scan inventory status derivation.
- `apps/orchestrator/src/modules/scans/scans.service.ts` — persist inventory report and version/status fields; pass report to scoring.
- `apps/orchestrator/test/inventory-status.test.ts` — status derivation tests.
- `apps/orchestrator/test/scan.schemas.test.ts` — inventory schema validation tests.
- `apps/orchestrator/test/scans.service.test.ts` — completion persistence tests.
- `apps/orchestrator/src/modules/rule-pack/rule-pack.schemas.ts` — widen detector-name type while keeping the v1 runtime schema unchanged.
- `apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts` — add `InventoryRule` and an empty default on `LoadedRulePack`.
- `apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts` — validated v2 loader and adapter into `LoadedRulePack`.
- `apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts` — cached `loadV2()` next to unchanged `load()`.
- `apps/orchestrator/test/rule-pack-v2.loader.test.ts` — v2 load, validation, and legacy-scoring-reuse tests.
- `apps/orchestrator/src/modules/scoring/control-evaluator.ts` — treat `missing_control` as cited gap evidence.
- `apps/orchestrator/test/control-evaluator.test.ts` — `missing_control` verdict tests.
- `apps/orchestrator/src/modules/scoring/inventory-evidence.ts` — pure signal-to-evidence adapter.
- `apps/orchestrator/test/inventory-evidence.test.ts` — adapter tests with no source-shaped fields.
- `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts` — choose v2 pack, merge detector statuses, include inventory evidence, rescore from stored inventory.
- `apps/orchestrator/test/scan-scoring.service.test.ts` — v2 pack/inventory evidence wiring tests.
- `apps/orchestrator/test/phase-c-exit-gate.test.ts` — runs the three golden fixtures through analyzer plus evaluator.
- `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-c.md` — this plan, included in the final phase commit.

### Task 1: Golden verdict contract and fixture manifests

**Files:**
- Modify: `packages/contracts/src/golden-manifest.ts`
- Modify: `packages/contracts/test/golden-manifest.test.ts`
- Create: `tests/golden-repos/fx-good-app/manifest.yaml`
- Create: `tests/golden-repos/fx-good-app/app.js`
- Create: `tests/golden-repos/fx-good-app/schema.py`
- Create: `tests/golden-repos/fx-good-app/privacy-notice.md`
- Create: `tests/golden-repos/fx-good-app/backup-policy.md`
- Create: `tests/golden-repos/fx-bad-app/manifest.yaml`
- Create: `tests/golden-repos/fx-bad-app/app.js`
- Create: `tests/golden-repos/fx-bad-app/schema.py`
- Create: `tests/golden-repos/fx-silent-app/manifest.yaml`
- Modify: `tests/golden-repos/fx-silent-app/manifest.yaml` (replace the existing content)
- Create: `tests/golden-repos/fx-silent-app/app.py`

**Interfaces:**
- Consumes: `CONTROL_CODE_PATTERN` from `packages/contracts/src/fingerprint.ts`; `readinessVerdictSchema` from `packages/contracts/src/readiness.ts`; `goldenManifestSchema` from `packages/contracts/src/golden-manifest.ts`.
- Produces: `expectedVerdictSchema` and `ExpectedVerdict` exported from `@dpdpa/contracts`; `goldenManifestSchema` accepts optional `expectedVerdicts`; three fixture manifests whose `expectedVerdicts` are consumed by Task 10.

- [x] **Step 1: Write the failing contract test**

Append this test to `packages/contracts/test/golden-manifest.test.ts`:

```ts
import { readinessVerdictSchema } from '../src/readiness';

it('accepts bounded expected verdicts and rejects unknown control codes', () => {
  const manifest = {
    ...FULL_MANIFEST,
    expectedVerdicts: [
      {
        controlCode: 'DPDPA-8.4-MON-01',
        verdict: 'PASS',
        reasonCode: 'positive_evidence',
      },
    ],
  };

  expect(goldenManifestSchema.parse(manifest).expectedVerdicts).toEqual(
    manifest.expectedVerdicts,
  );
  expect(readinessVerdictSchema.parse('UNKNOWN')).toBe('UNKNOWN');
  expect(() =>
    goldenManifestSchema.parse({
      ...manifest,
      expectedVerdicts: [{ controlCode: 'DP-6-01', verdict: 'PASS' }],
    }),
  ).toThrow();
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/contracts test -- golden-manifest.test.ts`

Expected RED: `AssertionError` or Zod error showing `expectedVerdicts` was stripped/rejected because the schema does not define it.

- [x] **Step 3: Write the minimal implementation**

In `packages/contracts/src/golden-manifest.ts`, add the import:

```ts
import { readinessVerdictSchema } from './readiness';
```

Add this exported schema and type before `goldenManifestSchema`:

```ts
export const expectedVerdictSchema = z
  .object({
    controlCode: z.string().regex(CONTROL_CODE_PATTERN),
    verdict: readinessVerdictSchema,
    reasonCode: z.string().min(1).max(64).optional(),
  })
  .strict();
export type ExpectedVerdict = z.infer<typeof expectedVerdictSchema>;
```

Add one property to `goldenManifestSchema`:

```ts
  expectedVerdicts: z.array(expectedVerdictSchema).min(1).max(32).optional(),
```

- [x] **Step 4: Run the test to verify GREEN**

Run: `pnpm --filter @dpdpa/contracts test -- golden-manifest.test.ts`

Expected GREEN: all `golden-manifest.test.ts` tests pass.

- [x] **Step 5: Write the golden fixtures**

Create `tests/golden-repos/fx-good-app/manifest.yaml`:

```yaml
name: fx-good-app
languages:
  - javascript
  - python
scanners:
  - semgrep
  - checkov
  - gitleaks
expectedFindings: []
expectedCoverage: full
expectedVerdicts:
  - controlCode: DPDPA-5-NOTICE-01
    verdict: PASS
    reasonCode: positive_evidence
  - controlCode: DPDPA-6-CONSENTGATE-01
    verdict: PASS
    reasonCode: positive_evidence
  - controlCode: DPDPA-6-FORMPURPOSE-01
    verdict: PASS
    reasonCode: positive_evidence
  - controlCode: DPDPA-8.4-MON-01
    verdict: PASS
    reasonCode: positive_evidence
  - controlCode: DPDPA-8.4-BACKUP-01
    verdict: PASS
    reasonCode: positive_evidence
tolerances:
  extraFindings: 0
```

Create `tests/golden-repos/fx-good-app/app.js`:

```js
const consentGate = true;
const purposeStatement = true;
const privacyNoticeLink = '/privacy-notice';
const email = '';
```

Create `tests/golden-repos/fx-good-app/schema.py`:

```python
audit_log = True
```

Create `tests/golden-repos/fx-good-app/privacy-notice.md`:

```md
# Privacy notice fixture

This fixture contains allowlisted artefact tokens only.
```

Create `tests/golden-repos/fx-good-app/backup-policy.md`:

```md
# Backup policy fixture

This fixture contains allowlisted artefact tokens only.
```

Create `tests/golden-repos/fx-bad-app/manifest.yaml`:

```yaml
name: fx-bad-app
languages:
  - javascript
  - python
scanners:
  - semgrep
  - checkov
  - gitleaks
expectedFindings: []
expectedCoverage: full
expectedVerdicts:
  - controlCode: DPDPA-5-NOTICE-01
    verdict: FAIL
    reasonCode: cited_gap
  - controlCode: DPDPA-6-CONSENTGATE-01
    verdict: FAIL
    reasonCode: cited_gap
  - controlCode: DPDPA-6-FORMPURPOSE-01
    verdict: FAIL
    reasonCode: cited_gap
  - controlCode: DPDPA-8.4-MON-01
    verdict: FAIL
    reasonCode: cited_gap
  - controlCode: DPDPA-8.4-BACKUP-01
    verdict: FAIL
    reasonCode: cited_gap
tolerances:
  extraFindings: 0
```

Create `tests/golden-repos/fx-bad-app/app.js`:

```js
const email = '';
```

Create `tests/golden-repos/fx-bad-app/schema.py`:

```python
connection = None
```

Replace `tests/golden-repos/fx-silent-app/manifest.yaml` with:

```yaml
name: fx-silent-app
languages:
  - python
scanners:
  - semgrep
  - checkov
  - gitleaks
expectedFindings: []
expectedCoverage: full
expectedVerdicts:
  - controlCode: DPDPA-5-NOTICE-01
    verdict: NOT_APPLICABLE
    reasonCode: applies_when_false
  - controlCode: DPDPA-6-CONSENTGATE-01
    verdict: NOT_APPLICABLE
    reasonCode: applies_when_false
  - controlCode: DPDPA-6-FORMPURPOSE-01
    verdict: NOT_APPLICABLE
    reasonCode: applies_when_false
  - controlCode: DPDPA-8.4-MON-01
    verdict: UNKNOWN
    reasonCode: no_determinable_evidence
  - controlCode: DPDPA-8.4-BACKUP-01
    verdict: UNKNOWN
    reasonCode: no_determinable_evidence
tolerances:
  extraFindings: 0
```

Create `tests/golden-repos/fx-silent-app/app.py`:

```python
value = None
```

- [x] **Step 6: Run fixture manifest validation to verify GREEN**

Run: `pnpm --filter @dpdpa/contracts test -- golden-manifest.test.ts`

Expected GREEN: all fixture manifests parse, including the three new `expectedVerdicts` arrays.

- [x] **Step 7: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/contracts/src/golden-manifest.ts packages/contracts/test/golden-manifest.test.ts tests/golden-repos/fx-good-app tests/golden-repos/fx-bad-app tests/golden-repos/fx-silent-app
git commit -m "test(contracts): add phase c golden verdict manifests"
```

### Task 2: First substantive v2 pack content

**Files:**
- Modify: `packages/rule-packs/v2/controls.yaml`
- Modify: `packages/rule-packs/v2/detectors.yaml`
- Modify: `packages/rule-packs/v2/mappings/inventory.yaml`
- Modify: `packages/rule-packs/v2/field_dictionary.yaml`
- Modify: `packages/rule-packs/v2/manifest.yaml` (regenerated only)
- Create: `packages/rule-packs/test/v2-phase-c-controls.test.mjs`

**Interfaces:**
- Consumes: `controlsFileV2Schema`, `detectorsFileV2Schema`, `mappingsFileV2Schema`, `catalogFileSchema`, `validatePackV2`, `DPDPA_PACK_V2_VERSION`, and `CONTROL_CODE_PATTERN` from `@dpdpa/contracts`.
- Produces: five control codes used by Task 1 manifests and Task 10; four detector IDs used by the Python analyzer, callback, v2 loader, and adapter; inventory mappings consumed by Task 7; `field_dictionary.yaml` keys mirrored by Task 3.

- [x] **Step 1: Write the failing pack-content test**

Create `packages/rule-packs/test/v2-phase-c-controls.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import YAML from 'yaml';
import {
  CONTROL_CODE_PATTERN,
  catalogFileSchema,
  controlsFileV2Schema,
  detectorsFileV2Schema,
  DPDPA_PACK_V2_VERSION,
  mappingsFileV2Schema,
} from '@dpdpa/contracts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'v2');
const readYaml = async (name) => YAML.parse(await readFile(join(root, name), 'utf8'));

const EXPECTED_CODES = [
  'DPDPA-5-NOTICE-01',
  'DPDPA-6-CONSENTGATE-01',
  'DPDPA-6-FORMPURPOSE-01',
  'DPDPA-8.4-MON-01',
  'DPDPA-8.4-BACKUP-01',
];

const EXPECTED_DETECTORS = ['schema_scan', 'form_scan', 'mechanism_scan', 'artefact_scan'];

test('Phase C v2 controls are valid and reference only declared detectors', () => {
  const controls = controlsFileV2Schema.parse(readYamlResult('controls.yaml'));
  const detectors = detectorsFileV2Schema.parse(readYamlResult('detectors.yaml'));
  const mappings = mappingsFileV2Schema.parse(readYamlResult('mappings/inventory.yaml'));
  const dictionary = catalogFileSchema.parse(readYamlResult('field_dictionary.yaml'));

  assert.equal(controls.pack, DPDPA_PACK_V2_VERSION);
  assert.deepEqual(
    controls.controls.map((control) => control.code),
    EXPECTED_CODES,
  );
  assert.deepEqual(
    detectors.detectors.map((detector) => detector.id),
    EXPECTED_DETECTORS,
  );
  assert.deepEqual(dictionary.entries.map((entry) => entry.key), [
    'email',
    'phone',
    'full_name',
    'address',
    'date_of_birth',
    'aadhaar',
  ]);

  const declared = new Set(detectors.detectors.map((detector) => detector.id));
  const controlsByCode = new Map(controls.controls.map((control) => [control.code, control]));
  for (const control of controls.controls) {
    assert.match(control.code, CONTROL_CODE_PATTERN);
    assert.ok(control.legalRefs.length > 0, `${control.code} needs a legal ref`);
    for (const rule of [
      ...control.violationRules,
      ...control.absenceRules,
      ...control.positiveRules,
    ]) {
      assert.ok(declared.has(rule.detector), `${control.code} has undeclared detector`);
    }
  }
  for (const mapping of mappings.mappings) {
    assert.ok(declared.has(mapping.detector));
    assert.ok(controlsByCode.has(mapping.control));
  }
});

function readYamlResult(name) {
  // Loaded synchronously by the helper below; kept as a function so each test
  // reads a fresh object and cannot mutate another test's fixture.
  return yamlCache[name];
}

const yamlCache = Object.fromEntries(
  await Promise.all(
    ['controls.yaml', 'detectors.yaml', 'mappings/inventory.yaml', 'field_dictionary.yaml'].map(
      async (name) => [name, await readYaml(name)],
    ),
  ),
);
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/rule-packs exec node --test test/v2-phase-c-controls.test.mjs`

Expected RED: `AssertionError: deepEqual` showing the current control/detector arrays do not equal the Phase C arrays, or a Zod error for the current empty mappings.

- [x] **Step 3: Write the control catalogue**

Replace `packages/rule-packs/v2/controls.yaml` with:

```yaml
version: 1
pack: dpdpa-2026.11.0
effectiveFrom: '2026-11-15'
controls:
  - code: DPDPA-5-NOTICE-01
    section: '5'
    actRef: DPDPA Section 5
    ruleRef: publish-privacy-notice
    title: Privacy notice artefact is present at collection
    severity: medium
    weight: 2
    evidenceMode: absence
    appliesWhen:
      - stack: web
    violationRules: []
    absenceRules:
      - id: absence.privacy_notice
        detector: artefact_scan
        token: privacy_notice
        pathHint: privacy-notice.md
        confidence: direct
    positiveRules:
      - id: positive.privacy_notice
        detector: artefact_scan
        token: privacy_notice
        confidence: direct
    partialCredit: false
    remediationKey: publish-privacy-notice
    legalRefs:
      - DPDPA Section 5
      - DPDP Rules 4
  - code: DPDPA-6-CONSENTGATE-01
    section: '6'
    actRef: DPDPA Section 6
    ruleRef: gate-web-forms-on-consent
    title: Personal-data forms have a recorded consent gate
    severity: high
    weight: 5
    evidenceMode: absence
    appliesWhen:
      - stack: web
    violationRules: []
    absenceRules:
      - id: absence.consent_gate
        detector: form_scan
        token: consent_gate
        pathHint: app.js
        confidence: direct
    positiveRules:
      - id: positive.consent_gate
        detector: form_scan
        token: consent_gate
        confidence: direct
      - id: positive.consent_gate_mechanism
        detector: mechanism_scan
        token: consent_gate_mechanism
        confidence: direct
    partialCredit: false
    remediationKey: gate-web-forms-on-consent
    legalRefs:
      - DPDPA Section 6
      - DPDP Rules 4
  - code: DPDPA-6-FORMPURPOSE-01
    section: '6'
    actRef: DPDPA Section 6
    ruleRef: add-form-purpose
    title: Collection forms state a purpose
    severity: medium
    weight: 2
    evidenceMode: absence
    appliesWhen:
      - stack: web
    violationRules: []
    absenceRules:
      - id: absence.purpose_statement
        detector: form_scan
        token: purpose_statement
        pathHint: app.js
        confidence: direct
    positiveRules:
      - id: positive.purpose_statement
        detector: form_scan
        token: purpose_statement
        confidence: direct
    partialCredit: false
    remediationKey: add-form-purpose
    legalRefs:
      - DPDPA Section 6
      - DPDP Rules 4
  - code: DPDPA-8.4-MON-01
    section: '8(4)'
    actRef: DPDPA Section 8(4)
    ruleRef: add-audit-logging
    title: Audit logging is present in the data schema
    severity: medium
    weight: 3
    evidenceMode: absence
    appliesWhen: []
    violationRules: []
    absenceRules:
      - id: absence.audit_log
        detector: schema_scan
        token: audit_log
        pathHint: schema.py
        confidence: direct
    positiveRules:
      - id: positive.audit_log
        detector: schema_scan
        token: audit_log
        confidence: direct
    partialCredit: false
    remediationKey: add-audit-logging
    legalRefs:
      - DPDPA Section 8(4)
      - DPDP Rules 4
  - code: DPDPA-8.4-BACKUP-01
    section: '8(4)'
    actRef: DPDPA Section 8(4)
    ruleRef: add-backup-policy
    title: Backup policy artefact is present
    severity: medium
    weight: 2
    evidenceMode: absence
    appliesWhen: []
    violationRules: []
    absenceRules:
      - id: absence.backup_policy
        detector: artefact_scan
        token: backup_policy
        pathHint: backup-policy.md
        confidence: direct
    positiveRules:
      - id: positive.backup_policy
        detector: artefact_scan
        token: backup_policy
        confidence: direct
    partialCredit: false
    remediationKey: add-backup-policy
    legalRefs:
      - DPDPA Section 8(4)
      - DPDP Rules 4
```

- [x] **Step 4: Write detector, mapping, and dictionary content**

Replace `packages/rule-packs/v2/detectors.yaml` with:

```yaml
version: 1
pack: dpdpa-2026.11.0
detectors:
  - id: schema_scan
    module: inventory
    inputs: [source]
    outputs: [fact, signal, status]
    timeoutMs: 30000
    stacks: []
    confidence: direct
    failureMode: UNKNOWN
    controlRefs:
      - DPDPA-8.4-MON-01
  - id: form_scan
    module: inventory
    inputs: [source]
    outputs: [fact, signal, status]
    timeoutMs: 30000
    stacks: [web]
    confidence: direct
    failureMode: UNKNOWN
    controlRefs:
      - DPDPA-6-CONSENTGATE-01
      - DPDPA-6-FORMPURPOSE-01
  - id: mechanism_scan
    module: inventory
    inputs: [source]
    outputs: [fact, signal, status]
    timeoutMs: 30000
    stacks: []
    confidence: direct
    failureMode: UNKNOWN
    controlRefs:
      - DPDPA-6-CONSENTGATE-01
  - id: artefact_scan
    module: inventory
    inputs: [artefacts]
    outputs: [fact, signal, status]
    timeoutMs: 30000
    stacks: []
    confidence: direct
    failureMode: UNKNOWN
    controlRefs:
      - DPDPA-5-NOTICE-01
      - DPDPA-8.4-BACKUP-01
```

Replace `packages/rule-packs/v2/mappings/inventory.yaml` with:

```yaml
version: 1
pack: dpdpa-2026.11.0
mappings:
  - detector: artefact_scan
    control: DPDPA-5-NOTICE-01
    confidence: direct
    rationale: Bounded artefact presence is determinable from repository paths.
  - detector: form_scan
    control: DPDPA-6-CONSENTGATE-01
    confidence: direct
    rationale: Form source can expose an allowlisted consent-gate token.
  - detector: mechanism_scan
    control: DPDPA-6-CONSENTGATE-01
    confidence: direct
    rationale: Mechanism source can corroborate an allowlisted consent-gate token.
  - detector: form_scan
    control: DPDPA-6-FORMPURPOSE-01
    confidence: direct
    rationale: Form source can expose an allowlisted purpose statement.
  - detector: schema_scan
    control: DPDPA-8.4-MON-01
    confidence: direct
    rationale: Schema source can expose an allowlisted audit-log token.
  - detector: artefact_scan
    control: DPDPA-8.4-BACKUP-01
    confidence: direct
    rationale: Bounded artefact presence is determinable from repository paths.
```

Replace `packages/rule-packs/v2/field_dictionary.yaml` with:

```yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: email
    label: Email address field
  - key: phone
    label: Phone number field
  - key: full_name
    label: Full name field
  - key: address
    label: Postal address field
  - key: date_of_birth
    label: Date of birth field
  - key: aadhaar
    label: Aadhaar identifier field
```

- [x] **Step 5: Regenerate the manifest and verify GREEN**

```bash
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-phase-c-controls.test.mjs
pnpm --filter @dpdpa/rule-packs validate
```

Expected GREEN: the pack-content test passes and `validate` prints `v2 pack valid` (or the current success line) with no structured issues. The manifest diff contains only SHA-256 entries and `generatedAt`.

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/rule-packs/v2 packages/rule-packs/test/v2-phase-c-controls.test.mjs
git commit -m "feat(rule-packs): add phase c inventory controls and mappings"
```

### Task 3: Bounded analyzer core and schema detector

**Files:**
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/__init__.py`
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/types.py`
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/paths.py`
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/schema_scan.py`
- Create: `apps/scan-runner/tests/test_dpdp_inventory.py`

**Interfaces:**
- Consumes: `INVENTORY_V1_VERSION` value `inventory-1.0.0`; `inventorySignalSchema` bounded fields `detector`, `kind`, `path`, `line`, `token`, `count`.
- Produces: `make_signal(detector: str, kind: str, path: str, line: int | None, token: str, count: int | None = None) -> dict[str, Any]`; `ModuleResult(key: str, signals: list[dict[str, Any]], status: str)`; `iter_files(root: Path) -> Iterator[tuple[Path, str]]`; `scan_schema(root: Path, deadline: float) -> ModuleResult`; `FIELD_TOKENS` tuple mirrored by the v2 field dictionary.

- [x] **Step 1: Write the failing test**

Create `apps/scan-runner/tests/test_dpdp_inventory.py`:

```python
"""Offline unit tests for the bounded DPDP inventory analyzer."""

from __future__ import annotations

import json
import time
from pathlib import Path

from scan_runner.dpdp_inventory.schema_scan import FIELD_TOKENS, scan_schema

CANARY = "CANARY_PHASE_C_SCHEMA_NEVER_EMIT"


def test_schema_scan_emits_allowlisted_tokens_without_matched_values(tmp_path: Path) -> None:
    (tmp_path / "model.py").write_text(
        f"# {CANARY}\nclass Profile:\n    email = None\n    audit_log = True\n",
        encoding="utf-8",
    )

    result = scan_schema(tmp_path, time.monotonic() + 60)

    assert result.status == "completed"
    assert [(signal["token"], signal["line"]) for signal in result.signals] == [
        ("pii_field.email", 3),
        ("audit_log", 4),
    ]
    assert CANARY not in json.dumps(result.signals, sort_keys=True)
    assert all(set(signal) <= {"detector", "kind", "path", "line", "token", "count"} for signal in result.signals)


def test_schema_scan_has_no_field_dictionary_drift() -> None:
    assert FIELD_TOKENS == ("email", "phone", "full_name", "address", "date_of_birth", "aadhaar")


def test_schema_scan_skips_work_after_deadline(tmp_path: Path) -> None:
    (tmp_path / "model.py").write_text("email = None\n", encoding="utf-8")

    result = scan_schema(tmp_path, time.monotonic() - 1)

    assert result.status == "skipped"
    assert result.signals == []
```

- [x] **Step 2: Run the Python test to verify RED**

Run: `cd apps/scan-runner && python -m pytest tests/test_dpdp_inventory.py -v`

Expected RED: `ModuleNotFoundError: No module named 'scan_runner.dpdp_inventory'`.

- [x] **Step 3: Write the bounded core modules**

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/types.py`:

```python
"""Bounded value shapes shared by DPDP inventory detectors."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Final

MODULE_KEYS: Final[tuple[str, ...]] = (
    "schema_scan",
    "form_scan",
    "mechanism_scan",
    "artefact_scan",
)
DETECTOR_STATUSES: Final[frozenset[str]] = frozenset(
    {"completed", "failed", "timed_out", "skipped"}
)
MAX_SIGNALS_PER_MODULE: Final = 500


@dataclass(frozen=True)
class ModuleResult:
    """One detector's bounded output and terminal status."""

    key: str
    signals: list[dict[str, Any]]
    status: str


def utc_now() -> str:
    """Return a compact UTC timestamp for inventory facts."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def make_signal(
    detector: str,
    kind: str,
    path: str,
    line: int | None,
    token: str,
    count: int | None = None,
) -> dict[str, Any]:
    """Build only contract-allowed fields; callers never pass source text."""
    signal: dict[str, Any] = {
        "detector": detector,
        "kind": kind,
        "path": path,
        "line": line,
        "token": token,
    }
    if count is not None:
        signal["count"] = count
    return signal
```

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/paths.py`:

```python
"""Deterministic, bounded file walking for inventory detectors."""

from __future__ import annotations

from pathlib import Path
from typing import Final, Iterator

SKIP_DIRS: Final[frozenset[str]] = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        "node_modules",
        "vendor",
        "build",
        "dist",
        "target",
        ".venv",
        "venv",
        ".tox",
        ".next",
        ".nuxt",
        ".cache",
        "__pycache__",
        ".mypy_cache",
        ".pytest_cache",
        "coverage",
        ".terraform",
    }
)
SOURCE_SUFFIXES: Final[frozenset[str]] = frozenset(
    {".py", ".pyi", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue", ".html", ".java", ".go", ".rb", ".php", ".cs", ".kt"}
)
MAX_FILE_BYTES: Final = 1_000_000
MAX_FILES: Final = 10_000
MAX_LINES_PER_FILE: Final = 2_000


def iter_files(root: Path) -> Iterator[tuple[Path, str]]:
    """Yield bounded source files as ``(absolute, relative POSIX path)``."""
    seen = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        try:
            relative = path.relative_to(root).as_posix()
        except ValueError:
            continue
        if any(part in SKIP_DIRS for part in Path(relative).parts):
            continue
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        seen += 1
        if seen > MAX_FILES:
            return
        yield path, relative


def read_lines(path: Path) -> list[str]:
    """Read a bounded line list; binary or unreadable files become empty."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    return text.splitlines()[:MAX_LINES_PER_FILE]
```

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/schema_scan.py`:

```python
"""Schema and field-name detector. Emits tokens, never matched source text."""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Final

from .paths import read_lines, iter_files
from .types import MAX_SIGNALS_PER_MODULE, ModuleResult, make_signal

FIELD_TOKENS: Final[tuple[str, ...]] = (
    "email",
    "phone",
    "full_name",
    "address",
    "date_of_birth",
    "aadhaar",
)
_FIELD_RE: Final = re.compile(
    r"\b(" + "|".join(FIELD_TOKENS) + r")\b", re.IGNORECASE
)
_AUDIT_RE: Final = re.compile(r"\baudit_log\b", re.IGNORECASE)


def scan_schema(root: Path, deadline: float) -> ModuleResult:
    """Collect bounded field and audit-log signals from source files."""
    signals: list[dict[str, object]] = []
    seen: set[tuple[str, int | None, str]] = set()
    for path, relative in iter_files(root):
        if time.monotonic() >= deadline:
            return ModuleResult("schema_scan", signals, "skipped")
        for number, line in enumerate(read_lines(path), start=1):
            for token in _FIELD_RE.findall(line):
                key = (relative, number, f"pii_field.{token.lower()}")
                if key in seen:
                    continue
                seen.add(key)
                signals.append(
                    make_signal("schema_scan", "field", relative, number, key[2])
                )
            if _AUDIT_RE.search(line):
                key = (relative, number, "audit_log")
                if key not in seen:
                    seen.add(key)
                    signals.append(
                        make_signal("schema_scan", "config", relative, number, "audit_log")
                    )
            if len(signals) >= MAX_SIGNALS_PER_MODULE:
                return ModuleResult("schema_scan", signals, "completed")
    return ModuleResult("schema_scan", signals, "completed")
```

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/__init__.py`:

```python
"""Bounded inventory detectors for the DPDPA readiness assessment."""

from .schema_scan import FIELD_TOKENS, scan_schema

__all__ = ["FIELD_TOKENS", "scan_schema"]
```

- [x] **Step 4: Run the Python test to verify GREEN**

Run: `cd apps/scan-runner && python -m pytest tests/test_dpdp_inventory.py -v`

Expected GREEN: three tests pass; no canary marker appears in captured output.

- [x] **Step 5: Run Python gates and commit**

```bash
cd apps/scan-runner && ruff check . && ruff format --check . && mypy --strict . && pytest -q
cd ../..
pnpm lint && pnpm typecheck && pnpm test
git add apps/scan-runner/src/scan_runner/dpdp_inventory apps/scan-runner/tests/test_dpdp_inventory.py
git commit -m "feat(scan-runner): add bounded schema inventory detector"
```

### Task 4: Form, mechanism, artefact detectors and analyzer report

**Files:**
- Modify: `apps/scan-runner/src/scan_runner/dpdp_inventory/__init__.py`
- Modify: `apps/scan-runner/src/scan_runner/dpdp_inventory/paths.py`
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/form_scan.py`
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/mechanism_scan.py`
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/artefact_scan.py`
- Create: `apps/scan-runner/src/scan_runner/dpdp_inventory/analyzer.py`
- Modify: `apps/scan-runner/tests/test_dpdp_inventory.py`

**Interfaces:**
- Consumes: `ModuleResult`, `MODULE_KEYS`, `make_signal`, `utc_now`, `iter_files`, `read_lines`, `MAX_SIGNALS_PER_MODULE`; `INVENTORY_V1_VERSION = inventory-1.0.0`.
- Produces: `analyze_repo(root: Path, *, deadline_s: int = 120) -> dict` with keys `inventoryVersion`, `facts`, `signals`, `detectorStatuses`; `scan_form`, `scan_mechanisms`, and `scan_artefacts`, each returning `ModuleResult`. Task 5 calls `analyze_repo` from `cli.py`; Phase F consumes the same signature.

- [x] **Step 1: Write the failing tests**

Append to `apps/scan-runner/tests/test_dpdp_inventory.py`:

```python
from scan_runner.dpdp_inventory.analyzer import analyze_repo


def _copy_fixture(tmp_path: Path, name: str) -> Path:
    source = Path(__file__).resolve().parents[3] / "tests" / "golden-repos" / name
    target = tmp_path / name
    target.mkdir(parents=True)
    for path in source.iterdir():
        if path.is_file():
            (target / path.name).write_bytes(path.read_bytes())
    return target


def test_analyzer_reports_good_fixture_signals(tmp_path: Path) -> None:
    report = analyze_repo(_copy_fixture(tmp_path, "fx-good-app"), deadline_s=60)

    assert report["inventoryVersion"] == "inventory-1.0.0"
    assert report["detectorStatuses"] == {
        "schema_scan": "completed",
        "form_scan": "completed",
        "mechanism_scan": "completed",
        "artefact_scan": "completed",
    }
    tokens = {signal["token"] for signal in report["signals"]}
    assert {
        "pii_field.email",
        "consent_gate",
        "consent_gate_mechanism",
        "purpose_statement",
        "privacy_notice_link",
        "audit_log",
        "privacy_notice",
        "backup_policy",
    } <= tokens
    assert CANARY not in json.dumps(report, sort_keys=True)


def test_analyzer_has_no_need_signal_for_silent_fixture(tmp_path: Path) -> None:
    report = analyze_repo(_copy_fixture(tmp_path, "fx-silent-app"), deadline_s=60)

    assert report["signals"] == []
    assert all(fact["signals"] == [] for fact in report["facts"])


def test_analyzer_signal_output_is_deterministic(tmp_path: Path) -> None:
    repo = _copy_fixture(tmp_path, "fx-bad-app")
    first = analyze_repo(repo, deadline_s=60)
    second = analyze_repo(repo, deadline_s=60)

    assert first["signals"] == second["signals"]
    assert [fact["key"] for fact in first["facts"]] == [
        fact["key"] for fact in second["facts"]
    ]
```

- [x] **Step 2: Run the Python tests to verify RED**

Run: `cd apps/scan-runner && python -m pytest tests/test_dpdp_inventory.py -v`

Expected RED: `ModuleNotFoundError: No module named 'scan_runner.dpdp_inventory.analyzer'`.

- [x] **Step 3: Implement form, mechanism, and artefact detectors**

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/form_scan.py`:

```python
"""Collection-form detector. Emits fixed tokens and bounded locations only."""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Final

from .paths import iter_files, read_lines
from .schema_scan import FIELD_TOKENS
from .types import MAX_SIGNALS_PER_MODULE, ModuleResult, make_signal

_CONSENT_RE: Final = re.compile(r"\bconsent(?:Gate|_gate)?\b", re.IGNORECASE)
_PURPOSE_RE: Final = re.compile(r"\bpurpose(?:Statement|_statement)?\b", re.IGNORECASE)
_PRIVACY_RE: Final = re.compile(r"\bprivacy(?:Notice|notice)\b.*\blink\b|\blink\b.*\bprivacy(?:Notice|notice)\b", re.IGNORECASE)
_FIELD_RE: Final = re.compile(r"\b(" + "|".join(FIELD_TOKENS) + r")\b", re.IGNORECASE)


def scan_form(root: Path, deadline: float) -> ModuleResult:
    """Collect form-purpose, consent-link, and allowlisted field tokens."""
    signals: list[dict[str, object]] = []
    seen: set[tuple[str, int | None, str]] = set()
    for path, relative in iter_files(root):
        if time.monotonic() >= deadline:
            return ModuleResult("form_scan", signals, "skipped")
        for number, line in enumerate(read_lines(path), start=1):
            candidates: list[tuple[str, str]] = []
            if _CONSENT_RE.search(line):
                candidates.append(("config", "consent_gate"))
            if _PURPOSE_RE.search(line):
                candidates.append(("config", "purpose_statement"))
            if _PRIVACY_RE.search(line):
                candidates.append(("route", "privacy_notice_link"))
            for field in _FIELD_RE.findall(line):
                candidates.append(("field", f"pii_field.{field.lower()}"))
            for kind, token in candidates:
                key = (relative, number, token)
                if key in seen:
                    continue
                seen.add(key)
                signals.append(make_signal("form_scan", kind, relative, number, token))
                if len(signals) >= MAX_SIGNALS_PER_MODULE:
                    return ModuleResult("form_scan", signals, "completed")
    return ModuleResult("form_scan", signals, "completed")
```

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/mechanism_scan.py`:

```python
"""Privacy-mechanism detector. Emits fixed mechanism tokens only."""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Final

from .paths import iter_files, read_lines
from .types import MAX_SIGNALS_PER_MODULE, ModuleResult, make_signal

_PATTERNS: Final[tuple[tuple[re.Pattern[str], str], ...]] = (
    (re.compile(r"\bconsent(?:Gate|_gate)\b", re.IGNORECASE), "consent_gate_mechanism"),
    (re.compile(r"\bconsent(?:Withdrawal|_withdrawal)\b", re.IGNORECASE), "consent_withdrawal"),
    (re.compile(r"\baudit(?:Log|_log)\b", re.IGNORECASE), "audit_log_mechanism"),
)


def scan_mechanisms(root: Path, deadline: float) -> ModuleResult:
    """Collect allowlisted mechanism tokens from source files."""
    signals: list[dict[str, object]] = []
    seen: set[tuple[str, int | None, str]] = set()
    for path, relative in iter_files(root):
        if time.monotonic() >= deadline:
            return ModuleResult("mechanism_scan", signals, "skipped")
        for number, line in enumerate(read_lines(path), start=1):
            for pattern, token in _PATTERNS:
                if not pattern.search(line):
                    continue
                key = (relative, number, token)
                if key in seen:
                    continue
                seen.add(key)
                signals.append(make_signal("mechanism_scan", "symbol", relative, number, token))
                if len(signals) >= MAX_SIGNALS_PER_MODULE:
                    return ModuleResult("mechanism_scan", signals, "completed")
    return ModuleResult("mechanism_scan", signals, "completed")
```

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/artefact_scan.py`:

```python
"""Artefact-presence detector. Reads paths only, never artefact contents."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Final

from .types import ModuleResult, make_signal

ARTEFACT_TOKENS: Final[dict[str, str]] = {
    "privacy-notice.md": "privacy_notice",
    "dsr-sop.md": "dsr_sop",
    "backup-policy.md": "backup_policy",
    "processor-list.md": "processor_list",
}


def scan_artefacts(root: Path, deadline: float) -> ModuleResult:
    """Collect bounded artefact tokens from repository paths."""
    signals: list[dict[str, object]] = []
    for path in sorted(root.rglob("*")):
        if time.monotonic() >= deadline:
            return ModuleResult("artefact_scan", signals, "skipped")
        if not path.is_file():
            continue
        token = ARTEFACT_TOKENS.get(path.name.lower())
        if token is None:
            continue
        try:
            relative = path.relative_to(root).as_posix()
        except ValueError:
            continue
        signals.append(make_signal("artefact_scan", "artefact", relative, None, token, 1))
    return ModuleResult("artefact_scan", signals, "completed")
```

- [x] **Step 4: Implement the analyzer report**

Create `apps/scan-runner/src/scan_runner/dpdp_inventory/analyzer.py`:

```python
"""Deadline-aware orchestration for the four bounded inventory detectors."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable

from .artefact_scan import scan_artefacts
from .form_scan import scan_form
from .mechanism_scan import scan_mechanisms
from .paths import SKIP_DIRS
from .schema_scan import scan_schema
from .types import DETECTOR_STATUSES, MODULE_KEYS, ModuleResult, utc_now

INVENTORY_VERSION = "inventory-1.0.0"
_DETECTORS: tuple[tuple[str, Callable[[Path, float], ModuleResult]], ...] = (
    ("schema_scan", scan_schema),
    ("form_scan", scan_form),
    ("mechanism_scan", scan_mechanisms),
    ("artefact_scan", scan_artefacts),
)


def analyze_repo(root: Path, *, deadline_s: int = 120) -> dict[str, Any]:
    """Run all inventory modules inside one deadline and emit bounded facts."""
    deadline = time.monotonic() + max(1, deadline_s)
    facts: list[dict[str, Any]] = []
    detector_statuses: dict[str, str] = {}
    all_signals: list[dict[str, Any]] = []

    for expected_key, detector in _DETECTORS:
        if time.monotonic() >= deadline:
            result = ModuleResult(expected_key, [], "skipped")
        else:
            try:
                result = detector(root, deadline)
            except Exception:
                result = ModuleResult(expected_key, [], "failed")
        if result.key not in MODULE_KEYS or result.status not in DETECTOR_STATUSES:
            result = ModuleResult(expected_key, [], "failed")
        signals = sorted(
            result.signals,
            key=lambda signal: (
                str(signal["path"]),
                int(signal["line"] or 0),
                str(signal["token"]),
            ),
        )
        detector_statuses[result.key] = result.status
        facts.append(
            {"key": result.key, "signals": signals, "detectedAt": utc_now()}
        )
        all_signals.extend(signals)

    return {
        "inventoryVersion": INVENTORY_VERSION,
        "facts": facts,
        "signals": sorted(
            all_signals,
            key=lambda signal: (
                str(signal["path"]),
                int(signal["line"] or 0),
                str(signal["token"]),
            ),
        ),
        "detectorStatuses": detector_statuses,
    }
```

Replace `apps/scan-runner/src/scan_runner/dpdp_inventory/__init__.py` with:

```python
"""Bounded inventory detectors for the DPDPA readiness assessment."""

from .analyzer import INVENTORY_VERSION, analyze_repo
from .schema_scan import FIELD_TOKENS, scan_schema

__all__ = ["FIELD_TOKENS", "INVENTORY_VERSION", "analyze_repo", "scan_schema"]
```

- [x] **Step 5: Run Python tests and gates to verify GREEN**

```bash
cd apps/scan-runner && python -m pytest tests/test_dpdp_inventory.py -v
cd apps/scan-runner && ruff check . && ruff format --check . && mypy --strict . && pytest -q
cd ../..
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: all analyzer tests pass; Ruff, mypy strict, pytest, and full monorepo gates are green.

- [x] **Step 6: Commit**

```bash
git add apps/scan-runner/src/scan_runner/dpdp_inventory apps/scan-runner/tests/test_dpdp_inventory.py
git commit -m "feat(scan-runner): assemble bounded inventory report"
```

### Task 5: Signed callback inventory payload and runner wiring

**Files:**
- Modify: `apps/scan-runner/src/scan_runner/cli.py`
- Modify: `apps/scan-runner/tests/test_callbacks.py`

**Interfaces:**
- Consumes: `analyze_repo(root: Path, *, deadline_s: int = 120) -> dict` from Task 4; `post_signed(config, path, payload, client=...)`; existing `send_completion(config, statuses, counts, *, durations=None, commit_sha=None, workspace_bytes=None, facts=None, client=None)`.
- Produces: `send_completion(..., inventory: dict | None = None)` emitting a sanitized `inventory` key; `sanitize_inventory(report: object) -> dict | None`; `run_scan` calls `analyze_repo(workspace)` and passes the report to completion. Task 6 validates the same shape in the orchestrator.

- [x] **Step 1: Write the failing callback test**

Append to `apps/scan-runner/tests/test_callbacks.py`:

```python
def test_send_completion_posts_bounded_inventory_without_canary() -> None:
    captured: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"data": {"status": "completed"}})

    inventory = {
        "inventoryVersion": "inventory-1.0.0",
        "facts": [
            {
                "key": "schema_scan",
                "signals": [
                    {
                        "detector": "schema_scan",
                        "kind": "config",
                        "path": "model.py",
                        "line": 4,
                        "token": "audit_log",
                        "matchedValue": "CANARY_PHASE_C_CALLBACK_NEVER_EMIT",
                    }
                ],
                "detectedAt": "2026-11-27T00:00:00Z",
            }
        ],
        "signals": [],
        "detectorStatuses": {"schema_scan": "completed"},
        "raw": "CANARY_PHASE_C_CALLBACK_NEVER_EMIT",
    }

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        send_completion(
            CONFIG,
            {"semgrep": "completed", "checkov": "completed", "gitleaks": "completed"},
            {"semgrep": 0, "checkov": 0, "gitleaks": 0},
            client=client,
            inventory=inventory,
        )

    payload = json.loads(captured["request"].content)
    assert payload["inventory"]["facts"][0]["signals"][0] == {
        "detector": "schema_scan",
        "kind": "config",
        "path": "model.py",
        "line": 4,
        "token": "audit_log",
    }
    assert "CANARY_PHASE_C_CALLBACK_NEVER_EMIT" not in captured["request"].content.decode()
```

- [x] **Step 2: Run the Python test to verify RED**

Run: `cd apps/scan-runner && python -m pytest tests/test_callbacks.py::test_send_completion_posts_bounded_inventory_without_canary -v`

Expected RED: `TypeError: send_completion() got an unexpected keyword argument 'inventory'`.

- [x] **Step 3: Implement the sanitizer and callback addition**

At the imports of `apps/scan-runner/src/scan_runner/cli.py`, add:

```python
import re
from scan_runner.dpdp_inventory import analyze_repo
```

Add these constants and helpers immediately above `send_completion`:

```python
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_.:/-]{1,120}$")
_PATH_RE = re.compile(r"^(?!/)(?!.*\.\.)[^\0]{1,240}$")
_INVENTORY_KINDS = frozenset(
    {"file", "symbol", "field", "route", "dependency", "config", "artefact", "region", "cookie", "header"}
)
_INVENTORY_KEYS = frozenset(
    {"schema_scan", "form_scan", "mechanism_scan", "artefact_scan", "dep_scan", "sdk_init_scan", "region_scan", "pii_literal_scan", "cookie_scan", "cmp_scan", "header_scan", "cms_scan"}
)
_INVENTORY_STATUSES = frozenset({"completed", "failed", "timed_out", "skipped"})


def _bounded_signal(value: object) -> dict[str, object] | None:
    if not isinstance(value, dict):
        return None
    detector = value.get("detector")
    kind = value.get("kind")
    path = value.get("path")
    line = value.get("line")
    token = value.get("token")
    if not isinstance(detector, str) or not _TOKEN_RE.match(detector):
        return None
    if not isinstance(kind, str) or kind not in _INVENTORY_KINDS:
        return None
    if not isinstance(path, str) or not _PATH_RE.match(path):
        return None
    if not isinstance(line, int) or isinstance(line, bool) or not 1 <= line <= 100_000:
        return None
    if not isinstance(token, str) or not _TOKEN_RE.match(token):
        return None
    signal: dict[str, object] = {
        "detector": detector,
        "kind": kind,
        "path": path,
        "line": line,
        "token": token,
    }
    count = value.get("count")
    if isinstance(count, int) and not isinstance(count, bool) and 0 <= count <= 100_000:
        signal["count"] = count
    return signal


def sanitize_inventory(report: object) -> dict[str, object] | None:
    """Keep only contract-shaped inventory data before signing a callback."""
    if not isinstance(report, dict):
        return None
    if report.get("inventoryVersion") != "inventory-1.0.0":
        return None
    raw_facts = report.get("facts")
    raw_statuses = report.get("detectorStatuses")
    if not isinstance(raw_facts, list) or not isinstance(raw_statuses, dict):
        return None

    facts: list[dict[str, object]] = []
    for raw_fact in raw_facts[:12]:
        if not isinstance(raw_fact, dict):
            continue
        key = raw_fact.get("key")
        detected_at = raw_fact.get("detectedAt")
        raw_signals = raw_fact.get("signals")
        if key not in _INVENTORY_KEYS or not isinstance(detected_at, str):
            continue
        if not isinstance(raw_signals, list):
            continue
        signals = [
            signal
            for signal in (_bounded_signal(item) for item in raw_signals[:2000])
            if signal is not None
        ]
        facts.append({"key": key, "signals": signals, "detectedAt": detected_at})

    statuses = {
        key: value
        for key, value in raw_statuses.items()
        if isinstance(key, str) and _TOKEN_RE.match(key) and value in _INVENTORY_STATUSES
    }
    if not facts or not statuses:
        return None
    return {
        "inventoryVersion": "inventory-1.0.0",
        "facts": facts,
        "signals": [],
        "detectorStatuses": statuses,
    }
```

Change the `send_completion` signature by adding:

```python
    inventory: dict[str, object] | None = None,
```

before `client: httpx.Client | None = None`.

Add this after the `facts` payload assignment in `send_completion`:

```python
    sanitized = sanitize_inventory(inventory) if inventory is not None else None
    if sanitized is not None:
        payload["inventory"] = sanitized
```

- [x] **Step 4: Wire the analyzer into `run_scan`**

In `run_scan`, add immediately after `workspace = Path(config.workspace)`:

```python
    scan_started = time.monotonic()
```

Replace the block between the existing fact log and `send_completion(` with:

```python
        try:
            inventory_report = analyze_repo(workspace)
            log.info(
                "inventory detector statuses: %s",
                inventory_report["detectorStatuses"],
            )
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("inventory analysis failed: %s", exc)
            inventory_report = None
        send_completion(
            config,
            statuses,
            counts,
            durations=durations,
            commit_sha=read_commit_sha(workspace),
            workspace_bytes=total_workspace_bytes(workspace),
            facts=facts,
            inventory=inventory_report,
        )
        return exit_code
```

Remove the old `send_completion(...)` call and standalone `return exit_code` so the replacement is the only completion path. `scan_started` is intentionally present for the Phase F budget task.

- [x] **Step 5: Run Python tests and gates to verify GREEN**

```bash
cd apps/scan-runner && python -m pytest tests/test_callbacks.py -v
cd apps/scan-runner && ruff check . && ruff format --check . && mypy --strict . && pytest -q
cd ../..
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: all callback tests pass; no canary appears in any test output.

- [x] **Step 6: Commit**

```bash
git add apps/scan-runner/src/scan_runner/cli.py apps/scan-runner/tests/test_callbacks.py
git commit -m "feat(scan-runner): send bounded inventory in signed completion"
```

### Task 6: Orchestrator completion schema and inventory persistence

**Files:**
- Modify: `apps/orchestrator/src/modules/scans/scan.schemas.ts`
- Create: `apps/orchestrator/src/modules/scans/inventory-status.ts`
- Create: `apps/orchestrator/test/inventory-status.test.ts`
- Modify: `apps/orchestrator/test/scan.schemas.test.ts`
- Modify: `apps/orchestrator/test/scans.service.test.ts`
- Modify: `apps/orchestrator/src/modules/scans/scans.service.ts`

**Interfaces:**
- Consumes: `inventoryFactSchema`, `inventorySignalSchema`, `detectorStatusSchema`, `INVENTORY_V1_VERSION` from `@dpdpa/contracts`; Phase B columns `scans.inventoryVersion`, `scans.inventoryStatus`.
- Produces: `inventoryReportSchema` and `CompleteScan.output.inventory`; `inventoryStatusFor(statuses: Readonly<Record<string, DetectorStatus>>) -> 'completed' | 'partial' | 'failed' | null`; `ScansService.complete` stores `{...facts, inventory}` on `scans.facts` and passes the report as the fifth `mapAndScore` argument.

- [x] **Step 1: Write the failing schema and status tests**

Append to `apps/orchestrator/test/scan.schemas.test.ts`:

```ts
import { completeScanSchema } from '../src/modules/scans/scan.schemas.js';

it('accepts a bounded inventory completion payload and rejects source-shaped fields', () => {
  const inventory = {
    inventoryVersion: 'inventory-1.0.0',
    facts: [
      {
        key: 'schema_scan',
        signals: [
          {
            detector: 'schema_scan',
            kind: 'config',
            path: 'model.py',
            line: 4,
            token: 'audit_log',
          },
        ],
        detectedAt: '2026-11-27T00:00:00Z',
      },
    ],
    signals: [],
    detectorStatuses: { schema_scan: 'completed' },
  };

  const parsed = completeScanSchema.parse({
    scanners: [{ name: 'semgrep', status: 'completed', findings: 0 }],
    facts: { languages: [], frameworks: [], resourceTypes: [] },
    inventory,
  });
  expect(parsed.inventory).toEqual(inventory);

  expect(() =>
    completeScanSchema.parse({
      scanners: [{ name: 'semgrep', status: 'completed', findings: 0 }],
      inventory: { ...inventory, raw: 'CANARY_PHASE_C_DB_NEVER_EMIT' },
    }),
  ).toThrow();
});
```

Create `apps/orchestrator/test/inventory-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { inventoryStatusFor } from '../src/modules/scans/inventory-status.js';

describe('inventoryStatusFor', () => {
  it('maps detector statuses to a scan inventory status', () => {
    expect(inventoryStatusFor({ schema_scan: 'completed' })).toBe('completed');
    expect(inventoryStatusFor({ schema_scan: 'completed', form_scan: 'skipped' })).toBe('partial');
    expect(inventoryStatusFor({ schema_scan: 'failed' })).toBe('failed');
    expect(inventoryStatusFor({})).toBeNull();
  });
});
```

- [x] **Step 2: Run the focused tests to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- scan.schemas.test.ts inventory-status.test.ts`

Expected RED: `Cannot find module '../src/modules/scans/inventory-status.js'` and/or Zod strips/rejects `inventory`.

- [x] **Step 3: Implement the schema and status helper**

At the top of `apps/orchestrator/src/modules/scans/scan.schemas.ts`, add:

```ts
import {
  INVENTORY_V1_VERSION,
  detectorStatusSchema,
  inventoryFactSchema,
  inventorySignalSchema,
} from '@dpdpa/contracts';
```

Add this before `completeScanSchema`:

```ts
/** Phase C: the runner's bounded inventory report travels with completion. */
export const inventoryReportSchema = z
  .strictObject({
    inventoryVersion: z.literal(INVENTORY_V1_VERSION),
    facts: z.array(inventoryFactSchema).max(12),
    signals: z.array(inventorySignalSchema).max(2000),
    detectorStatuses: z.record(z.string().min(1).max(64), detectorStatusSchema),
  });
```

Add this property to `completeScanSchema`:

```ts
  inventory: inventoryReportSchema.optional(),
```

Create `apps/orchestrator/src/modules/scans/inventory-status.ts`:

```ts
import type { DetectorStatus } from '@dpdpa/contracts';

export type InventoryStatus = 'completed' | 'partial' | 'failed' | null;

/** Small deterministic summary stored on `scans.inventoryStatus`. */
export function inventoryStatusFor(
  statuses: Readonly<Record<string, DetectorStatus>>,
): InventoryStatus {
  const values = Object.values(statuses);
  if (values.length === 0) return null;
  if (values.includes('failed')) return 'failed';
  return values.every((value) => value === 'completed') ? 'completed' : 'partial';
}
```

- [x] **Step 4: Add the completion persistence test**

Append this test inside `describe('ScansService.complete', ...)` in `apps/orchestrator/test/scans.service.test.ts`:

```ts
  it('persists the inventory report with the scan facts', async () => {
    const { service, scans, scoring, tx } = make();
    const inventory = {
      inventoryVersion: 'inventory-1.0.0',
      facts: [
        {
          key: 'schema_scan',
          signals: [],
          detectedAt: '2026-11-27T00:00:00Z',
        },
      ],
      signals: [],
      detectorStatuses: { schema_scan: 'completed' },
    };

    await service.complete(ORG_ID, SCAN_ID, { ...COMPLETION, inventory });

    expect(scans.update).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({
        inventoryVersion: 'inventory-1.0.0',
        inventoryStatus: 'completed',
        facts: expect.objectContaining({
          languages: [],
          frameworks: [],
          resourceTypes: [],
          inventory,
        }),
      }),
      expect.anything(),
    );
    expect(scoring.mapAndScore).toHaveBeenCalledWith(
      expect.objectContaining({ id: SCAN_ID }),
      expect.anything(),
      expect.anything(),
      tx,
      inventory,
    );
  });
```

- [x] **Step 5: Run the tests to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- scan.schemas.test.ts inventory-status.test.ts scans.service.test.ts`

Expected RED: the persistence test fails because `scans.update` has no inventory fields and `mapAndScore` receives four arguments.

- [x] **Step 6: Implement persistence**

In `apps/orchestrator/src/modules/scans/scans.service.ts`, add imports:

```ts
import { inventoryStatusFor } from './inventory-status.js';
```

Immediately after `const input = completeScanSchema.parse(raw);`, add:

```ts
    const storedFacts = input.inventory
      ? ({ ...input.facts, inventory: input.inventory } as Prisma.InputJsonValue)
      : (input.facts as Prisma.InputJsonValue);
    const inventoryStatus = input.inventory
      ? inventoryStatusFor(input.inventory.detectorStatuses)
      : null;
```

Replace `facts: input.facts,` inside the first `this.scans.update` with:

```ts
          facts: storedFacts,
          inventoryVersion: input.inventory?.inventoryVersion ?? null,
          inventoryStatus,
```

Replace the `mapping_started` event payload with:

```ts
        {
          coverage,
          facts: input.facts,
          inventoryVersion: input.inventory?.inventoryVersion ?? null,
          inventoryStatus,
        },
```

Replace the `mapAndScore` call with:

```ts
      const scored = await this.scoring.mapAndScore(
        scan,
        input.facts,
        coverage,
        tx,
        input.inventory,
      );
```

- [x] **Step 7: Run focused and full gates to verify GREEN**

```bash
pnpm --filter @dpdpa/orchestrator test -- scan.schemas.test.ts inventory-status.test.ts scans.service.test.ts
pnpm --filter @dpdpa/orchestrator typecheck
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: all three focused suites pass; full gates green.

- [x] **Step 8: Commit**

```bash
git add apps/orchestrator/src/modules/scans/scan.schemas.ts apps/orchestrator/src/modules/scans/inventory-status.ts apps/orchestrator/test/inventory-status.test.ts apps/orchestrator/test/scan.schemas.test.ts apps/orchestrator/test/scans.service.test.ts apps/orchestrator/src/modules/scans/scans.service.ts
git commit -m "feat(orchestrator): persist bounded inventory completion"
```

### Task 7: Validated v2 loader and missing-control verdicts

**Files:**
- Modify: `apps/orchestrator/src/modules/rule-pack/rule-pack.schemas.ts`
- Modify: `apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts`
- Create: `apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts`
- Modify: `apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts`
- Create: `apps/orchestrator/test/rule-pack-v2.loader.test.ts`
- Modify: `apps/orchestrator/src/modules/scoring/control-evaluator.ts`
- Modify: `apps/orchestrator/test/control-evaluator.test.ts`

**Interfaces:**
- Consumes: `validatePackV2`, `controlsFileV2Schema`, `detectorsFileV2Schema`, `mappingsFileV2Schema`, `DPDPA_PACK_V2_VERSION` from `@dpdpa/contracts`; unchanged legacy `scoring.yaml` from `packages/rule-packs/`.
- Produces: `loadRulePackV2(packDir: string, legacyPackDir?: string) -> Promise<LoadedRulePack>`; `RulePackService.loadV2()`; `LoadedRulePack.inventoryRules: InventoryRule[]`; `DetectorName` type; evaluator treats `missing_control` as a cited gap.

- [x] **Step 1: Write the failing loader and evaluator tests**

Create `apps/orchestrator/test/rule-pack-v2.loader.test.ts`:

```ts
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadRulePackV2 } from '../src/modules/rule-pack/rule-pack-v2.loader.js';

const PACK_DIR = resolve(__dirname, '../../../rule-packs/v2');

describe('loadRulePackV2', () => {
  it('loads the validated Phase C pack using legacy scoring bands', async () => {
    const loaded = await loadRulePackV2(PACK_DIR);

    expect(loaded.pack).toBe('dpdpa-2026.11.0');
    expect(loaded.effectiveFrom).toBe('2026-11-15');
    expect(loaded.scoringVersion).toBe('2.0.0');
    expect(loaded.controls.map((control) => control.code)).toEqual([
      'DPDPA-5-NOTICE-01',
      'DPDPA-6-CONSENTGATE-01',
      'DPDPA-6-FORMPURPOSE-01',
      'DPDPA-8.4-MON-01',
      'DPDPA-8.4-BACKUP-01',
    ]);
    expect(loaded.mappings).toHaveLength(6);
    expect(loaded.inventoryRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          controlCode: 'DPDPA-8.4-MON-01',
          detector: 'schema_scan',
          token: 'audit_log',
          mode: 'absence',
          confidence: 'direct',
        }),
      ]),
    );
    expect(loaded.sectionWeights['8(4)']).toBe(30);
    expect(loaded.grades[0]).toMatchObject({ grade: 'A', min: 90, max: 100 });
  });
});
```

Append to `apps/orchestrator/test/control-evaluator.test.ts`:

```ts
it('returns FAIL for cited missing_control evidence', () => {
  const result = evaluateControls({
    controls: [
      {
        ...control('DPDPA-8.4-MON-01'),
        appliesWhen: {},
      },
    ],
    facts: { languages: ['python'], frameworks: [], resourceTypes: [] },
    mappings: [{ scanner: 'schema_scan', controlCode: 'DPDPA-8.4-MON-01' }],
    detectorStatuses: { schema_scan: 'completed' },
    findings: [
      {
        controlCode: 'DPDPA-8.4-MON-01',
        kind: 'missing_control',
        scanner: 'schema_scan',
        severity: 'high',
        confidence: 'direct',
        status: 'open',
      },
    ],
    rulePackVersion: 'dpdpa-2026.11.0',
    scoringVersion: 'scoring-2.0.0',
  });

  expect(result.results[0]).toMatchObject({
    verdict: 'FAIL',
    reasonCode: 'cited_gap',
  });
});
```

If this test file does not yet define `control(...)`, add this helper at the top:

```ts
function control(code: string): Control {
  return {
    code,
    section: '8(4)',
    title: 'Fixture control',
    summary: 'Fixture control',
    obligation: 'Fixture obligation',
    legalReference: 'DPDPA Section 8(4)',
    severity: 'high',
    weight: 1,
    evidenceStrength: 'direct',
    scored: true,
    appliesWhen: {},
    remediation: 'fixture-remediation',
    tags: [],
  };
}
```

- [x] **Step 2: Run the focused tests to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- rule-pack-v2.loader.test.ts control-evaluator.test.ts`

Expected RED: `Cannot find module '../src/modules/rule-pack/rule-pack-v2.loader.js'` and an evaluator assertion showing `UNKNOWN` instead of `FAIL`.

- [x] **Step 3: Widen detector naming without changing v1 schemas**

In `apps/orchestrator/src/modules/rule-pack/rule-pack.schemas.ts`, replace:

```ts
export type Scanner = 'semgrep' | 'checkov' | 'gitleaks';
```

with:

```ts
export type Scanner = 'semgrep' | 'checkov' | 'gitleaks';
export type DetectorName = Scanner | 'inventory' | (string & {});
```

Then change `Mapping.scanner` from `Scanner` to `DetectorName`. Leave `scannerSchema` exactly as it is.

In `apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts`, add:

```ts
export interface InventoryRule {
  controlCode: string;
  detector: string;
  token: string;
  mode: 'absence' | 'positive';
  confidence: 'direct' | 'inferred' | 'advisory';
  pathHint?: string;
}
```

Add this property to `LoadedRulePack`:

```ts
  inventoryRules: InventoryRule[];
```

Add `inventoryRules: [],` to the returned object at the end of `loadRulePack`.

In `apps/orchestrator/src/modules/scoring/control-evaluator.ts`, import `DetectorName` and use it for `EvidenceLike.scanner`:

```ts
  scanner?: DetectorName;
```

Change the gap detection block from:

```ts
  const violations = grouped.active.filter((finding) => finding.kind === 'violation');
  const weak = grouped.active.filter((finding) => finding.kind === 'weak_control');
  if (violations.length > 0 || weak.length > 0) {
    const candidates = [...violations, ...weak];
```

to:

```ts
  const violations = grouped.active.filter((finding) => finding.kind === 'violation');
  const weak = grouped.active.filter((finding) => finding.kind === 'weak_control');
  const missing = grouped.active.filter((finding) => finding.kind === 'missing_control');
  if (violations.length > 0 || weak.length > 0 || missing.length > 0) {
    const candidates = [...violations, ...weak, ...missing];
```

- [x] **Step 4: Implement the v2 loader**

Create `apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import {
  controlsFileV2Schema,
  detectorsFileV2Schema,
  DPDPA_PACK_V2_VERSION,
  mappingsFileV2Schema,
  validatePackV2,
  type ControlV2,
  type PackFileV2,
} from '@dpdpa/contracts';
import {
  RulePackError,
  type InventoryRule,
  type LoadedRulePack,
} from './rule-pack.loader.js';
import {
  scoringFileSchema,
  type DetectorName,
  type Mapping,
  type Predicate,
} from './rule-pack.schemas.js';

const MANIFEST = 'manifest.yaml';

/** Loads the checksummed v2 pack and adapts it to the Phase A scorer shape. */
export async function loadRulePackV2(
  packDir: string,
  legacyPackDir = join(packDir, '..'),
): Promise<LoadedRulePack> {
  const paths = await listFiles(packDir);
  const files: PackFileV2[] = [];
  for (const path of paths) {
    if (path === MANIFEST) continue;
    const bytes = await readFile(join(packDir, ...path.split('/')));
    const value = path.endsWith('.yaml') ? parse(bytes.toString('utf8')) : undefined;
    files.push({ path, value, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = parse(await readFile(join(packDir, MANIFEST), 'utf8'));
  const issues = validatePackV2({ files, manifest });
  if (issues.length > 0) {
    throw new RulePackError(
      'RULE_PACK_INVALID',
      issues.map((issue) => `${issue.path}: ${issue.code}: ${issue.message}`).join('; '),
    );
  }

  const byPath = new Map(files.map((file) => [file.path, file.value]));
  const controlsFile = controlsFileV2Schema.parse(byPath.get('controls.yaml'));
  detectorsFileV2Schema.parse(byPath.get('detectors.yaml'));
  const mappingFiles = files
    .filter((file) => file.path.startsWith('mappings/') && file.path.endsWith('.yaml'))
    .map((file) => mappingsFileV2Schema.parse(file.value));
  const controlsByCode = new Map(controlsFile.controls.map((control) => [control.code, control]));

  const controls = controlsFile.controls.map(toControl);
  const mappings: Mapping[] = [];
  const inventoryRules: InventoryRule[] = [];
  const seenMappings = new Set<string>();

  for (const file of mappingFiles) {
    for (const mapping of file.mappings) {
      const key = `${mapping.detector}|${mapping.control}`;
      if (seenMappings.has(key)) continue;
      seenMappings.add(key);
      mappings.push({
        scanner: mapping.detector as DetectorName,
        ruleId: `${mapping.detector}.${mapping.control}`,
        scannerRuleVersion: 'inventory-1.0.0',
        controlCode: mapping.control,
        confidence: mapping.confidence,
        rationale: mapping.rationale,
        remediationTemplate: null,
      });
    }
  }
  for (const control of controlsFile.controls) {
    for (const rule of control.absenceRules) {
      inventoryRules.push({
        controlCode: control.code,
        detector: rule.detector,
        token: rule.token,
        mode: 'absence',
        confidence: rule.confidence,
        ...(rule.pathHint === undefined ? {} : { pathHint: rule.pathHint }),
      });
    }
    for (const rule of control.positiveRules) {
      inventoryRules.push({
        controlCode: control.code,
        detector: rule.detector,
        token: rule.token,
        mode: 'positive',
        confidence: rule.confidence,
      });
    }
  }

  const legacy = scoringFileSchema.parse(
    parse(await readFile(join(legacyPackDir, 'scoring.yaml'), 'utf8')),
  );
  if (legacy.pack !== 'dpdpa-2026.10.6' || legacy.scoringVersion !== '1.0.0') {
    throw new RulePackError('RULE_PACK_INVALID', 'legacy scoring config changed');
  }

  return {
    pack: DPDPA_PACK_V2_VERSION,
    effectiveFrom: controlsFile.effectiveFrom,
    scoringVersion: '2.0.0',
    controls,
    controlsByCode: new Map(controls.map((control) => [control.code, control])),
    mappings,
    suppressions: [],
    sectionWeights: legacy.sectionWeights,
    grades: legacy.grades,
    inventoryRules,
  };
}

function toControl(control: ControlV2) {
  const rules = [...control.violationRules, ...control.absenceRules, ...control.positiveRules];
  return {
    code: control.code,
    section: control.section,
    title: control.title,
    summary: control.title,
    obligation: control.actRef,
    legalReference: control.actRef,
    severity: control.severity,
    weight: control.weight,
    evidenceStrength: rules[0]?.confidence ?? 'inferred',
    scored: true,
    appliesWhen: toPredicate(control.appliesWhen),
    remediation: control.remediationKey.replaceAll('-', ' '),
    tags: [control.evidenceMode],
  };
}

function toPredicate(
  appliesWhen: ControlV2['appliesWhen'],
): Predicate {
  if (appliesWhen.length === 0) return {};
  const leaves = appliesWhen.map((entry): Predicate => {
    if (entry.stack === 'web') {
      return {
        any: [{ framework: 'web' }, { language: 'javascript' }, { language: 'typescript' }],
      };
    }
    if (entry.language !== undefined) return { language: entry.language };
    if (entry.stack !== undefined) return { framework: entry.stack };
    return {};
  });
  return leaves.length === 1 ? leaves[0]! : { any: leaves };
}

async function listFiles(root: string, base = root): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await listFiles(full, base)));
    } else {
      paths.push(relative(base, full).split(sep).join('/'));
    }
  }
  return paths.sort();
}
```

Add `loadV2()` to `RulePackService`:

```ts
  private cachedV2: Promise<LoadedRulePack> | undefined;

  loadV2(): Promise<LoadedRulePack> {
    this.cachedV2 ??= loadRulePackV2(join(this.dir(), 'v2'));
    return this.cachedV2;
  }
```

Add the imports:

```ts
import { join } from 'node:path';
import { loadRulePackV2 } from './rule-pack-v2.loader.js';
```

- [x] **Step 5: Run focused and full gates to verify GREEN**

```bash
pnpm --filter @dpdpa/orchestrator test -- rule-pack-v2.loader.test.ts control-evaluator.test.ts
pnpm --filter @dpdpa/orchestrator typecheck
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: all focused tests pass; full gates green. No v1 loader or legacy pack file changed.

- [x] **Step 6: Commit**

```bash
git add apps/orchestrator/src/modules/rule-pack/rule-pack.schemas.ts apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts apps/orchestrator/src/modules/rule-pack/rule-pack-v2.loader.ts apps/orchestrator/src/modules/rule-pack/rule-pack.service.ts apps/orchestrator/test/rule-pack-v2.loader.test.ts apps/orchestrator/src/modules/scoring/control-evaluator.ts apps/orchestrator/test/control-evaluator.test.ts
git commit -m "feat(orchestrator): load validated v2 pack and evaluate missing signals"
```

### Task 8: Pure inventory signal-to-evidence adapter

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/inventory-evidence.ts`
- Create: `apps/orchestrator/test/inventory-evidence.test.ts`

**Interfaces:**
- Consumes: `InventoryReportSchema.output` shape from Task 6; `InventoryRule` from Task 7; `ControlEvidence` and `DetectorStatus` from `control-evaluator.ts`.
- Produces: `inventoryEvidence(input: { report: InventoryReportLike | undefined; rules: readonly InventoryRule[]; detectorStatuses: Readonly<Record<string, DetectorStatus>> }) -> ControlEvidence[]`. Task 9 consumes this function.

- [x] **Step 1: Write the failing adapter test**

Create `apps/orchestrator/test/inventory-evidence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { inventoryEvidence, type InventoryReportLike } from '../src/modules/scoring/inventory-evidence.js';
import type { InventoryRule } from '../src/modules/rule-pack/rule-pack.loader.js';

const rules: InventoryRule[] = [
  {
    controlCode: 'DPDPA-8.4-MON-01',
    detector: 'schema_scan',
    token: 'audit_log',
    mode: 'absence',
    confidence: 'direct',
    pathHint: 'schema.py',
  },
  {
    controlCode: 'DPDPA-6-CONSENTGATE-01',
    detector: 'form_scan',
    token: 'consent_gate',
    mode: 'positive',
    confidence: 'direct',
  },
];

function report(signals: InventoryReportLike['signals']): InventoryReportLike {
  return {
    inventoryVersion: 'inventory-1.0.0',
    facts: [{ key: 'schema_scan', signals, detectedAt: '2026-11-27T00:00:00Z' }],
    signals,
    detectorStatuses: { schema_scan: 'completed', form_scan: 'completed' },
  };
}

describe('inventoryEvidence', () => {
  it('emits positive findings only for observed allowlisted tokens', () => {
    const evidence = inventoryEvidence({
      report: report([
        {
          detector: 'form_scan',
          kind: 'config',
          path: 'app.js',
          line: 1,
          token: 'consent_gate',
        },
      ]),
      rules,
      detectorStatuses: { schema_scan: 'completed', form_scan: 'completed' },
    });

    expect(evidence).toEqual([
      expect.objectContaining({
        controlCode: 'DPDPA-6-CONSENTGATE-01',
        kind: 'positive',
        scanner: 'form_scan',
        scannerRuleId: 'consent_gate',
        confidence: 'direct',
      }),
    ]);
  });

  it('emits missing_control only when a need signal exists', () => {
    const withNeed = report([
      {
        detector: 'schema_scan',
        kind: 'field',
        path: 'model.py',
        line: 2,
        token: 'pii_field.email',
      },
    ]);
    const withoutNeed = report([]);
    const statuses = { schema_scan: 'completed', form_scan: 'completed' };

    expect(inventoryEvidence({ report: withNeed, rules, detectorStatuses: statuses })).toEqual([
      expect.objectContaining({
        controlCode: 'DPDPA-8.4-MON-01',
        kind: 'missing_control',
        scanner: 'schema_scan',
        filePath: 'schema.py',
        confidence: 'direct',
      }),
    ]);
    expect(inventoryEvidence({ report: withoutNeed, rules, detectorStatuses: statuses })).toEqual(
      [],
    );
  });

  it('emits nothing when the required detector did not complete', () => {
    const evidence = inventoryEvidence({
      report: report([]),
      rules,
      detectorStatuses: { schema_scan: 'skipped', form_scan: 'completed' },
    });

    expect(evidence).toEqual([]);
  });
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- inventory-evidence.test.ts`

Expected RED: `Cannot find module '../src/modules/scoring/inventory-evidence.js'`.

- [x] **Step 3: Implement the adapter**

Create `apps/orchestrator/src/modules/scoring/inventory-evidence.ts`:

```ts
import { createHash } from 'node:crypto';

import type { DetectorStatus } from '@dpdpa/contracts';
import type { InventoryRule } from '../rule-pack/rule-pack.loader.js';
import type { ControlEvidence } from './control-evaluator.js';

export interface InventorySignalLike {
  detector: string;
  kind: string;
  path: string;
  line: number | null;
  token: string;
  count?: number | null;
}

export interface InventoryFactLike {
  key: string;
  signals: readonly InventorySignalLike[];
  detectedAt: string;
}

export interface InventoryReportLike {
  inventoryVersion: string;
  facts: readonly InventoryFactLike[];
  signals: readonly InventorySignalLike[];
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
}

export interface InventoryEvidenceInput {
  report: InventoryReportLike | undefined;
  rules: readonly InventoryRule[];
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
}

/** Turns bounded inventory signals into evidence references, never source text. */
export function inventoryEvidence(input: InventoryEvidenceInput): ControlEvidence[] {
  const report = input.report;
  if (report === undefined || report.inventoryVersion !== 'inventory-1.0.0') return [];

  const signals = dedupeSignals([...report.signals, ...report.facts.flatMap((fact) => [...fact.signals])]);
  const needSignal = signals.some(
    (signal) =>
      signal.token.startsWith('pii_field.') ||
      signal.token === 'consent_gate' ||
      signal.token === 'privacy_notice_link',
  );
  const seen = new Set<string>();
  const evidence: ControlEvidence[] = [];

  for (const rule of input.rules) {
    if (input.detectorStatuses[rule.detector] !== 'completed') continue;
    const key = `${rule.mode}|${rule.controlCode}|${rule.detector}|${rule.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = signals.filter(
      (signal) => signal.detector === rule.detector && signal.token === rule.token,
    );
    if (rule.mode === 'positive' && matches.length > 0) {
      evidence.push(toFinding(rule, matches[0]!, 'positive'));
      continue;
    }
    if (rule.mode === 'absence' && matches.length === 0 && needSignal) {
      evidence.push(toMissingFinding(rule));
    }
  }
  return evidence.sort((a, b) => fingerprint(a).localeCompare(fingerprint(b)));
}

function toFinding(
  rule: InventoryRule,
  signal: InventorySignalLike,
  kind: 'positive',
): ControlEvidence {
  const digest = createHash('sha256')
    .update(`${rule.detector}|${signal.path}|${signal.line}|${signal.token}`)
    .digest('hex');
  return {
    controlCode: rule.controlCode,
    kind,
    scanner: rule.detector,
    scannerRuleId: rule.token,
    evidenceHash: `sha256:${digest}`,
    filePath: signal.path,
    lineStart: signal.line,
    lineEnd: signal.line,
    fingerprint: `inv_${digest.slice(0, 24)}`,
    severity: 'medium',
    confidence: rule.confidence,
    status: 'open',
  };
}

function toMissingFinding(rule: InventoryRule): ControlEvidence {
  const path = rule.pathHint ?? 'repository';
  const digest = createHash('sha256')
    .update(`${rule.detector}|${path}|${rule.token}|absent`)
    .digest('hex');
  return {
    controlCode: rule.controlCode,
    kind: 'missing_control',
    scanner: rule.detector,
    scannerRuleId: rule.token,
    evidenceHash: `sha256:${digest}`,
    filePath: path,
    lineStart: null,
    lineEnd: null,
    fingerprint: `inv_${digest.slice(0, 24)}`,
    severity: 'medium',
    confidence: rule.confidence,
    status: 'open',
  };
}

function dedupeSignals(signals: readonly InventorySignalLike[]): InventorySignalLike[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.detector}|${signal.path}|${signal.line ?? ''}|${signal.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fingerprint(finding: ControlEvidence): string {
  return finding.fingerprint ?? finding.evidenceHash ?? '';
}
```

- [x] **Step 4: Run focused and full gates to verify GREEN**

```bash
pnpm --filter @dpdpa/orchestrator test -- inventory-evidence.test.ts
pnpm --filter @dpdpa/orchestrator typecheck
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: adapter tests pass and no canary/source-shaped key is produced.

- [x] **Step 5: Commit**

```bash
git add apps/orchestrator/src/modules/scoring/inventory-evidence.ts apps/orchestrator/test/inventory-evidence.test.ts
git commit -m "feat(scoring): add pure inventory evidence adapter"
```

### Task 9: Scoring service v2 pack and inventory wiring

**Files:**
- Modify: `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`
- Modify: `apps/orchestrator/test/scan-scoring.service.test.ts`

**Interfaces:**
- Consumes: `RulePackService.loadV2()`, `LoadedRulePack.inventoryRules`, `inventoryEvidence(...)`, `scoringVersionForNewScan(enabled)`, `isScoringV2(version)`.
- Produces: `mapAndScore(scan, facts, coverage, tx, inventory?)` uses the validated v2 pack when `dpdpa_readiness_v2` is enabled; `scorePersisted` reads stored `scan.facts.inventory`; both feed inventory evidence and merged detector statuses into `evaluateControls`.

- [x] **Step 1: Write the failing service test**

Add imports at the top of `apps/orchestrator/test/scan-scoring.service.test.ts`:

```ts
import { resolve } from 'node:path';
import { loadRulePackV2 } from '../src/modules/rule-pack/rule-pack-v2.loader.js';
import type { InventoryReportLike } from '../src/modules/scoring/inventory-evidence.js';
```

Inside `make()`, load a v2 pack and expose it on the pack-service stub. Replace the existing `const packService = { load: async () => pack } as unknown as RulePackService;` with:

```ts
  const v2Pack = await loadRulePackV2(
    resolve(__dirname, '../../../rule-packs/v2'),
  );
  const packService = {
    load: async () => pack,
    loadV2: async () => v2Pack,
  } as unknown as RulePackService;
```

Append this test inside the main `describe('ScanScoringService ...')` block:

```ts
  it('uses the v2 pack and inventory evidence when the flag is enabled', async () => {
    const harness = make();
    harness.flags.isEnabled.mockImplementation((flag: string) => flag === 'dpdpa_readiness_v2');
    const inventory: InventoryReportLike = {
      inventoryVersion: 'inventory-1.0.0',
      facts: [
        {
          key: 'schema_scan',
          signals: [
            {
              detector: 'schema_scan',
              kind: 'config',
              path: 'model.py',
              line: 4,
              token: 'audit_log',
            },
          ],
          detectedAt: '2026-11-27T00:00:00Z',
        },
      ],
      signals: [],
      detectorStatuses: { schema_scan: 'completed' },
    };

    const scored = await harness.service.mapAndScore(
      scan({ coverage: {} }),
      FACTS,
      {},
      harness.tx as unknown as Prisma.TransactionClient,
      inventory,
    );

    expect(scored.rulePackVersion).toBe('dpdpa-2026.11.0');
    expect(scored.scoringVersion).toBe('scoring-2.0.0');
    const audits = harness.creates.filter((row) => row.verdict === 'PASS');
    expect(audits.some((row) => row.controlCode === 'DPDPA-8.4-MON-01')).toBe(true);
    expect(
      audits.some((row) => (row.evidence as { scanner?: string }[]).some((ref) => ref.scanner === 'schema_scan')),
    ).toBe(true);
  });
```

If the harness names the persisted control-result array differently, use that array; do not change the assertion semantics.

- [x] **Step 2: Run the focused test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- scan-scoring.service.test.ts`

Expected RED: `TypeError: this.pack.loadV2 is not a function` or the persisted control results contain no `DPDPA-8.4-MON-01` PASS.

- [x] **Step 3: Implement the service changes**

In `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`, add imports:

```ts
import {
  inventoryEvidence,
  type InventoryReportLike,
} from './inventory-evidence.js';
```

Change the `mapAndScore` signature to:

```ts
  async mapAndScore(
    scan: Scan,
    facts: RepoFacts,
    coverage: Record<string, string>,
    tx: Prisma.TransactionClient,
    inventory?: InventoryReportLike,
  ): Promise<MapAndScoreResult> {
```

Replace the opening of `mapAndScore`:

```ts
    const loaded = await this.pack.load();
```

with:

```ts
    const v2Enabled = this.flags.isEnabled('dpdpa_readiness_v2', false);
    const loaded = v2Enabled ? await this.pack.loadV2() : await this.pack.load();
```

Replace the `scoringVersion` assignment block around line 238 with:

```ts
    const scoringVersion = scoringVersionForNewScan(v2Enabled);
```

Inside the `if (isScoringV2(scoringVersion))` block, replace the `evaluateControls({...})` call with:

```ts
      const detectorStatuses = {
        ...buildDetectorStatuses(coverageRecord(scan.coverage)),
        ...(inventory?.detectorStatuses ?? {}),
      };
      const inventoryFindings = inventoryEvidence({
        report: inventory,
        rules: loaded.inventoryRules,
        detectorStatuses,
      });
      results = evaluateControls({
        controls: loaded.controls,
        facts,
        mappings: loaded.mappings,
        detectorStatuses,
        findings: [...evidence, ...inventoryFindings],
        rulePackVersion: loaded.pack,
        scoringVersion,
      }).results;
```

In `scorePersisted`, replace:

```ts
    const loaded = await this.pack.load();
    const scoringVersion = scan.scoringVersion ?? LEGACY_SCORING_VERSION;
```

with:

```ts
    const scoringVersion = scan.scoringVersion ?? LEGACY_SCORING_VERSION;
    const loaded = isScoringV2(scoringVersion)
      ? await this.pack.loadV2()
      : await this.pack.load();
    const inventory = inventoryFromFacts(scan.facts);
```

Inside the is-v2 branch of `scorePersisted`, replace its `evaluateControls({...})` call with the same `detectorStatuses`/`inventoryFindings` pattern, using `findings: [...evidence, ...inventoryFindings]`.

Add this helper at the bottom of the file:

```ts
function inventoryFromFacts(value: unknown): InventoryReportLike | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const inventory = (value as Record<string, unknown>).inventory;
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) {
    return undefined;
  }
  const report = inventory as Partial<InventoryReportLike>;
  if (report.inventoryVersion !== 'inventory-1.0.0') return undefined;
  return report as InventoryReportLike;
}
```

- [x] **Step 4: Run focused and full gates to verify GREEN**

```bash
pnpm --filter @dpdpa/orchestrator test -- scan-scoring.service.test.ts
pnpm --filter @dpdpa/orchestrator typecheck
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: the v2 pack/inventory test passes; all legacy scoring tests remain green.

- [x] **Step 5: Commit**

```bash
git add apps/orchestrator/src/modules/scoring/scan-scoring.service.ts apps/orchestrator/test/scan-scoring.service.test.ts
git commit -m "feat(scoring): feed inventory evidence into v2 scoring"
```

### Task 10: Golden verdict exit gate

**Files:**
- Create: `apps/orchestrator/test/phase-c-exit-gate.test.ts`
- Modify: `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-c.md` (check the DoD boxes during execution)

**Interfaces:**
- Consumes: `analyze_repo`, `loadRulePackV2`, `inventoryEvidence`, `evaluateControls`, `buildDetectorStatuses`, `goldenManifestSchema`; `expectedVerdicts` from Task 1; fixtures from Task 1; pack from Task 2.
- Produces: one executable gate proving the three declared golden verdict sets, twice-run deterministic `control_results`, and canary/source containment.

- [x] **Step 1: Write the exit-gate test**

Create `apps/orchestrator/test/phase-c-exit-gate.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { goldenManifestSchema, type GoldenManifest } from '@dpdpa/contracts';

import { loadRulePackV2 } from '../src/modules/rule-pack/rule-pack-v2.loader.js';
import { buildDetectorStatuses, evaluateControls } from '../src/modules/scoring/control-evaluator.js';
import { inventoryEvidence } from '../src/modules/scoring/inventory-evidence.js';

const REPO = resolve(__dirname, '../../..');
const PY_SRC = join(REPO, 'apps/scan-runner/src');
const PACK_DIR = join(REPO, 'packages/rule-packs/v2');
const FIXTURES = join(REPO, 'tests/golden-repos');
const CANARY = 'CANARY_PHASE_C_EXIT_GATE_NEVER_EMIT';
const FIXTURE_NAMES = ['fx-good-app', 'fx-bad-app', 'fx-silent-app'] as const;

const ANALYZE_SCRIPT = `
import json
import sys
from pathlib import Path
from scan_runner.dpdp_inventory import analyze_repo
print(json.dumps(analyze_repo(Path(sys.argv[1]), deadline_s=60), sort_keys=True))
`;

function runAnalyzer(name: string): unknown {
  const raw = execFileSync('python3', ['-c', ANALYZE_SCRIPT, join(FIXTURES, name)], {
    cwd: REPO,
    env: { ...process.env, PYTHONPATH: PY_SRC },
    encoding: 'utf8',
  });
  expect(raw).not.toContain(CANARY);
  return JSON.parse(raw) as unknown;
}

function manifestFor(name: string): GoldenManifest {
  const raw = readFileSync(join(FIXTURES, name, 'manifest.yaml'), 'utf8');
  return goldenManifestSchema.parse(parse(raw));
}

async function runFixture(name: string) {
  const manifest = manifestFor(name);
  const loaded = await loadRulePackV2(PACK_DIR);
  const detectorStatuses = {
    ...buildDetectorStatuses({
      semgrep: 'completed',
      checkov: 'completed',
      gitleaks: 'completed',
    }),
  };
  const evaluations = [];
  for (let run = 0; run < 2; run += 1) {
    const report = runAnalyzer(name) as Parameters<typeof inventoryEvidence>[0]['report'];
    Object.assign(detectorStatuses, report?.detectorStatuses ?? {});
    evaluations.push(
      evaluateControls({
        controls: loaded.controls,
        facts: {
          languages: manifest.languages,
          frameworks: [],
          resourceTypes: [],
        },
        mappings: loaded.mappings,
        detectorStatuses,
        findings: inventoryEvidence({
          report,
          rules: loaded.inventoryRules,
          detectorStatuses,
        }),
        rulePackVersion: loaded.pack,
        scoringVersion: 'scoring-2.0.0',
      }),
    );
  }

  expect(JSON.stringify(evaluations[1]?.results)).toBe(JSON.stringify(evaluations[0]?.results));
  expect(JSON.stringify(evaluations[0]?.results)).not.toContain(CANARY);
  return { manifest, evaluation: evaluations[0]! };
}

describe('Phase C golden verdict exit gate', () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name} matches its declared verdict manifest`, async () => {
      const { manifest, evaluation } = await runFixture(name);
      expect(manifest.expectedVerdicts).toBeDefined();
      for (const expected of manifest.expectedVerdicts ?? []) {
        const actual = evaluation.byControl.get(expected.controlCode);
        expect(actual, `${name}: missing ${expected.controlCode}`).toBeDefined();
        expect(actual?.verdict).toBe(expected.verdict);
        if (expected.reasonCode !== undefined) {
          expect(actual?.reasonCode).toBe(expected.reasonCode);
        }
      }
      expect(evaluation.unknownControls).toEqual(
        (manifest.expectedVerdicts ?? [])
          .filter((entry) => entry.verdict === 'UNKNOWN')
          .map((entry) => entry.controlCode),
      );
    });
  }
});
```

- [x] **Step 2: Run the exit-gate test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-c-exit-gate.test.ts`

Expected RED before Tasks 1–9: missing golden manifests, missing analyzer module, or missing v2 loader. After Tasks 1–9 this step becomes GREEN.

- [x] **Step 3: Run the full Phase C exit gate**

```bash
pnpm --filter @dpdpa/contracts test -- golden-manifest.test.ts
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs validate
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-phase-c-controls.test.mjs
cd apps/scan-runner && ruff check . && ruff format --check . && mypy --strict . && pytest -q
cd ../..
pnpm --filter @dpdpa/orchestrator test -- rule-pack-v2.loader.test.ts control-evaluator.test.ts inventory-evidence.test.ts scan-scoring.service.test.ts phase-c-exit-gate.test.ts
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN output includes:

```text
fx-good-app matches its declared verdict manifest PASSED
fx-bad-app matches its declared verdict manifest PASSED
fx-silent-app matches its declared verdict manifest PASSED
```

- [x] **Step 4: Check the DoD below and commit the plan**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-c.md
git commit -m "docs: add phase c evidence-backed readiness plan"
```

Do not push, create a PR, merge, deploy, change an image pin, or touch `infra/` until explicitly approved.

## Definition of Done

- [x] The four inventory modules are implemented with bounded path/line/token/count output only.
- [x] `analyze_repo(root: Path, *, deadline_s: int = 120) -> dict` returns `inventoryVersion`, `facts`, `signals`, and `detectorStatuses` exactly as consumed by later phases.
- [x] The signed completion callback carries a sanitized `inventory` key and no canary/source-shaped fields.
- [x] The orchestrator validates the inventory payload, stores `{...facts, inventory}` on `scans.facts`, and sets `inventoryVersion`/`inventoryStatus`; `consentGatingRatio` remains `null` until Phase D.
- [x] The validated v2 pack contains five substantive controls, four declared detectors, and mappings with legal references; manifest checksums were regenerated by the script.
- [x] The v2 scorer uses `dpdpa-2026.11.0`, `scoring-2.0.0`, and `inventory-1.0.0` behind `dpdpa_readiness_v2`; legacy scoring tests stay green.
- [x] `fx-good-app`, `fx-bad-app`, and `fx-silent-app` each match their `expectedVerdicts` manifest.
- [x] Each golden fixture produces byte-identical `control_results` across two runs.
- [x] `UNKNOWN` is excluded, never promoted; a completed detector with no determinable evidence stays `UNKNOWN`.
- [x] `missing_control` results carry cited file/path provenance without source content or matched values.
- [x] Python gates are green: `ruff check . && ruff format --check . && mypy --strict . && pytest -q` from `apps/scan-runner`.
- [x] Monorepo gates are green: `pnpm lint && pnpm typecheck && pnpm test`.
- [x] No forbidden wording outside quoted disclaimers; no source/canary retention in pack, DB, object storage, logs, callbacks, or API responses.
- [x] No push, PR creation, merge, deploy, image-pin change, or `infra/` change occurred without explicit approval.
