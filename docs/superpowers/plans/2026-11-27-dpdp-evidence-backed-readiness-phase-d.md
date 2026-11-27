# Evidence-backed DPDPA Readiness Phase D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `dpdpa-2026.11.0` rule pack with at least 45 substantive controls, web-surface detectors, pinned custom scanner rules, catalogues, structured remediation, document templates, and a persisted consent-gating ratio.

**Architecture:** Phase D is content and evidence completion on top of Phase C. Phase C supplies the v2 pack loader, inventory analyzer, callback/persistence path, and the first control set; Phase D fills the remaining controls, catalogues, detectors, mappings, custom rules, fixtures, remediation, and templates under the already-validated v2 contracts, then computes and persists the consent-gating ratio through the orchestrator's existing completion transaction. The v1 pack, `scoring.yaml`, legacy scores, and Phase B contracts stay untouched; every v2 file addition is followed by regeneration of the SHA-256 manifest so validation stays deterministic.

**Tech Stack:** TypeScript, Zod, Vitest, Node `node:test`, YAML 2.9.1, pnpm/Turbo, NestJS, Prisma/PostgreSQL, Python 3.12, pytest, Semgrep 1.95.0, Checkov 3.2.0, Gitleaks 8.21.0, annotated fixture files.

**Spec:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md`  
**Phase B design:** `docs/superpowers/specs/2026-11-27-dpdp-readiness-phase-b-design.md`  
**ADR:** `docs/decisions/0001-evidence-backed-dpdp-readiness.md`

## Global Constraints

- Readiness only. No compliance verdict, certificate, badge, or legal conclusion.
- Forbidden outside quoted disclaimers: `compliant`, `non-compliant`, `violation of the Act`, `certified`. An exit-gate language lint enforces this across pack content, reports, exports, and rule messages.
- PASS requires recorded positive evidence. FAIL requires cited gap evidence. UNKNOWN is excluded from the score and never becomes a pass.
- No source code, file contents, secret values, or raw scanner output persisted in PostgreSQL, Redis, object storage, logs, or traces.
- New scans use `scoring-2.0.0`, `inventory-1.0.0`, and the rule pack `dpdpa-2026.11.0`.
- Recompute `control_results` on scan completion, finding triage, attestation change, and detector-status change. Upserts must be idempotent and deterministic.
- No network, no code execution, no eval of repository content, no YAML unsafe load.
- Emit detector status for each module; a failed module never produces PASS.
- Custom Semgrep rules and Checkov policies live outside the v2 pack tree, are pinned to the versions in `versions.py`, and have positive and negative fixtures.
- Each PR runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, Python tests for analyzer modules, and a visible Playwright MCP check for user-visible slices. Phase D has no UI slice; record that fact in the local ledger instead.
- Golden fixtures are committed/generated and never rely on network availability. Fixtures are test inputs only and must never be presented as pilot evidence or sign-off data.
- Every fixture runs twice with byte-identical `control_results`.
- Full A–F is delivered as phase-gated PRs. No push, PR creation, merge, deploy, image-pin update, or `infra/` change happens without explicit user approval.
- Tests first. At every task boundary, run the task's focused tests **and** `pnpm lint && pnpm typecheck && pnpm test`; do not commit unless all are green.
- Before any commit, the exact gate command `pnpm lint && pnpm typecheck && pnpm test` must be green.
- One separate branch and one separate PR per phase; Phase D uses `feat/dpdp-readiness-phase-d` stacked from the Phase C HEAD and is never merged by this work.
- Do not modify `packages/contracts/src/pack-v2.ts`, `packages/contracts/test/pack-v2.test.ts`, `packages/rule-packs/scoring.yaml`, `scoringVersion: "1.0.0"`, Phase A evaluator logic, the v1 loader, or legacy scores.
- Every new v2 file must be added to `v2/manifest.yaml` by `pnpm --filter @dpdpa/rule-packs manifest:v2`; never hand-edit checksums.
- Fixtures live under `tests/` and `packages/rule-packs/test/` only. They are test inputs, never pilot evidence, sign-off data, or runtime pack content.
- No canary needle, source text, matched value, secret value, or file content may enter the pack, DB, callbacks, logs, or API responses.

---

## Preconditions and zero-context orientation

Run these before Task 1. If any command fails, stop; do not start Phase D on the wrong base.

```bash
git status --short
git log --oneline -5
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dpdpa/rule-packs test
python3 scripts/check_versions.py
```

Expected: clean working tree (or only the plan file being authored), green full gates, green rule-pack tests, and `scanner version pins aligned: semgrep==1.95.0, checkov==3.2.0, gitleaks==8.21.0`.

If the current branch is not `feat/dpdp-readiness-phase-d`, run `git checkout -b feat/dpdp-readiness-phase-d` from the Phase C HEAD before Task 1. Do not push, open a PR, or switch the base branch.

Phase C must already be on this branch. The D plan consumes these Phase C deliverables without changing their contracts:

1. `packages/rule-packs/v2/controls.yaml`, `detectors.yaml`, and `mappings/inventory.yaml` are loaded by the orchestrator and validated by `node scripts/validate-v2-pack.mjs`.
2. `apps/scan-runner` emits inventory facts in the completion payload under the `inventory` key, using `inventoryFactSchema` from `@dpdpa/contracts`, and the orchestrator persists those facts on `scans.facts`.
3. `scans.inventoryVersion`, `scans.inventoryStatus`, and `scans.consentGatingRatio` columns exist from Phase B; the `consentGatingRatio` value is still `null` everywhere and Phase D fills it.
4. Phase C's first control set and golden fixtures (`fx-good-app`, `fx-bad-app`, `fx-silent-app`) are green. Do not delete or renumber Phase C codes.
5. `CONTROL_CODE_PATTERN` is `/^DPDPA-[0-9]+(?:\.[0-9]+)?-[A-Z0-9]+-[0-9]+$/`; draft-style codes such as `DP-6-01` are invalid.
6. Every YAML file in `packages/rule-packs/v2/` is parsed by the Phase B validator as one of: `controls.yaml`, `detectors.yaml`, `commencement.yaml`, `mappings/*.yaml`, another `*.yaml` matching `catalogFileSchema`, or `templates/*.md`. New custom scanner rule bodies therefore live outside the v2 tree in `packages/rule-packs/custom/` and are referenced by detectors.
7. `pnpm --filter @dpdpa/rule-packs manifest:v2` regenerates `v2/manifest.yaml` from every file under `v2/` except `manifest.yaml`, sorted by POSIX path; `generatedAt` is metadata excluded from checksum comparison.

Repository facts used throughout this plan:

- `packages/contracts/src/pack-v2.ts` exports `DPDPA_PACK_V2_VERSION`, `INVENTORY_V1_VERSION`, `controlsFileV2Schema`, `detectorsFileV2Schema`, `inventoryFactSchema`, `inventorySignalSchema`, `catalogFileSchema`, `mappingsFileV2Schema`, `validatePackV2`, and `ValidationIssue`.
- `packages/contracts/src/fingerprint.ts` exports `CONTROL_CODE_PATTERN`.
- `apps/orchestrator/src/modules/scoring/control-evaluator.ts` exports `evaluateControls`, `buildDetectorStatuses`, and types `ControlEvaluatorInput`, `ControlEvidence`, `ControlResultLike`.
- `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts` exposes `MapAndScoreResult` and `mapAndScore(scan, facts, coverage, tx)`; `apps/orchestrator/src/modules/scans/scans.service.ts` calls it and writes the scan row inside the same transaction, then builds `assessment` with `toAssessment(scan)`.
- `apps/scan-runner/src/scan_runner/versions.py` pins `semgrep==1.95.0`, `checkov==3.2.0`, `gitleaks==8.21.0`; `docker/scan-runner.Dockerfile` carries the same pins. Phase D must not change those pins.
- Existing fixtures live in `tests/golden-repos/` and `tests/semgrep/`; `tests/semgrep/check.py` reads `// ruleid:` and `// ok:` annotations and compares exact `(file, line, rule)` tuples.

---

## File structure

- `packages/rule-packs/v2/controls.yaml` — control definitions; grows to at least 45 controls.
- `packages/rule-packs/v2/detectors.yaml` — inventory, scanner, and web-surface detector declarations.
- `packages/rule-packs/v2/mappings/inventory.yaml` — detector-to-control mappings with confidence and rationale.
- `packages/rule-packs/v2/cmp_catalog.yaml`, `cookie_catalog.yaml`, `security_headers.yaml`, `sdk_catalog.yaml`, `ecosystem_patterns/web.yaml`, `field_dictionary.yaml`, `mechanism_catalog.yaml`, `india-regions.yaml` — bounded, allowlisted pattern catalogues.
- `packages/rule-packs/v2/templates/remediation.md` — generated structured remediation library with one concrete snippet per FAIL-capable control.
- `packages/rule-packs/v2/templates/privacy-notice.md`, `breach-runbook.md`, `dsr-sop.md`, `retention-schedule.md`, `processor-list.md` — readiness document templates with placeholders only.
- `packages/rule-packs/v2/manifest.yaml` — regenerated SHA-256 manifest; never hand-edited.
- `packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml` — pinned custom Semgrep rules, outside the v2 pack tree.
- `packages/rule-packs/custom/checkov/__init__.py`, `dpdp_security_checks.py` — pinned custom Checkov policies, outside the v2 pack tree.
- `packages/rule-packs/scripts/generate-remediation-v2.mjs` — deterministic generator for `templates/remediation.md`.
- `packages/rule-packs/test/v2-controls.test.mjs`, `v2-catalogues.test.mjs`, `v2-detectors.test.mjs`, `custom-semgrep-rules.test.mjs`, `remediation.test.mjs`, `document-templates.test.mjs` — Node tests.
- `tests/semgrep/dpdpa.v2-web.js` — positive and negative Semgrep fixture.
- `tests/golden-repos/fx-cmp-header/`, `fx-gtm-web/` — Checkov/Semgrep fixture inputs for the exit gate.
- `apps/scan-runner/tests/test_custom_checkov_policies.py` — Checkov fixture runner.
- `apps/scan-runner/tests/test_custom_rule_pins.py` — pinned-version assertions for custom rules.
- `apps/orchestrator/src/modules/scoring/consent-gating.ts` — pure ratio computation.
- `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`, `apps/orchestrator/src/modules/scans/scans.service.ts` — ratio propagation and persistence.
- `apps/orchestrator/test/consent-gating.test.ts`, `phase-d-consent-wiring.test.ts`, `phase-d-exit-gate.test.ts` — orchestrator tests.
- `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-d.md` — this plan, committed at the end.

---

### Task 1: Grow the v2 control catalogue to 47 controls

**Files:**
- Modify: `packages/rule-packs/v2/controls.yaml`
- Create: `packages/rule-packs/test/v2-controls.test.mjs`

**Interfaces:**
- Consumes: `controlsFileV2Schema`, `CONTROL_CODE_PATTERN` from `@dpdpa/contracts`; `inventoryFactSchema` module keys already defined in `packages/contracts/src/pack-v2.ts`.
- Produces: a `controls` array with 47 unique control objects; `remediationKey` values consumed by Task 7; `detector` references consumed by Task 4; control codes consumed by Task 9 and the exit gate.

- [x] **Step 1: Write the failing control-catalogue test**

Create `packages/rule-packs/test/v2-controls.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import YAML from 'yaml';
import {
  CONTROL_CODE_PATTERN,
  controlsFileV2Schema,
  DPDPA_PACK_V2_VERSION,
} from '@dpdpa/contracts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = YAML.parse(await readFile(join(root, 'v2', 'controls.yaml'), 'utf8'));

const REQUIRED_CODES = [
  'DPDPA-5-NOTICE-01', 'DPDPA-5-NOTICE-CONTENT-01', 'DPDPA-5-NOTICE-LINK-01',
  'DPDPA-5-ARTEFACT-01', 'DPDPA-6-CONSENT-01', 'DPDPA-6-CONSENT-GATE-01',
  'DPDPA-6-MIN-01', 'DPDPA-6-WD-01', 'DPDPA-7-LAWFUL-01',
  'DPDPA-6-THIRDPARTY-01', 'DPDPA-6-SDK-01', 'DPDPA-6-CMS-01',
  'DPDPA-6-PII-LITERAL-01', 'DPDPA-6-FORM-PURPOSE-01', 'DPDPA-6-DSR-SOP-01',
  'DPDPA-8.4-ENC-01', 'DPDPA-8.4-TLS-01', 'DPDPA-8.4-ACCESS-01',
  'DPDPA-8.4-SECRET-01', 'DPDPA-8.4-LOG-01', 'DPDPA-8.4-MON-01', <!-- gitleaks:allow control code, not a credential -->
  'DPDPA-8.4-BACKUP-01', 'DPDPA-8.4-RET-01', 'DPDPA-8.4-PASSWORD-01',
  'DPDPA-8.4-SESSION-01', 'DPDPA-8.4-HEADER-01', 'DPDPA-8.4-COOKIE-01',
  'DPDPA-8.4-CMP-01', 'DPDPA-8.4-DEP-01', 'DPDPA-8.4-ECOSYSTEM-01',
  'DPDPA-8.5-BREACH-01', 'DPDPA-8.5-RUNBOOK-01', 'DPDPA-8.5-ENCRYPTION-01',
  'DPDPA-8.6-BREACH-01', 'DPDPA-8.6-ALERT-01', 'DPDPA-8.7-ERASE-01',
  'DPDPA-8.7-RET-01', 'DPDPA-8.9-CONTACT-01', 'DPDPA-8.10-GRIEVANCE-01',
  'DPDPA-9-CHILD-01', 'DPDPA-9-AGEGATE-01', 'DPDPA-10-SDF-01',
  'DPDPA-12-ACCESS-01', 'DPDPA-13-ERASE-01', 'DPDPA-13-GRIEVANCE-01',
  'DPDPA-16-XBORDER-01', 'DPDPA-16-REGION-01',
];

test('v2 controls schema accepts the shipped catalogue', () => {
  assert.equal(doc.pack, DPDPA_PACK_V2_VERSION);
  assert.doesNotThrow(() => controlsFileV2Schema.parse(doc));
});

test('v2 pack contains at least 45 unique valid control codes', () => {
  assert.ok(doc.controls.length >= 45, `expected >=45 controls, got ${doc.controls.length}`);
  const codes = doc.controls.map((control) => control.code);
  assert.equal(new Set(codes).size, codes.length, 'control codes must be unique');
  for (const code of codes) assert.match(code, CONTROL_CODE_PATTERN);
  for (const code of REQUIRED_CODES) assert.ok(codes.includes(code), `missing ${code}`);
});

test('every non-manual control has evidence rules and a remediation key', () => {
  for (const control of doc.controls) {
    assert.ok(control.legalRefs.length >= 1, `${control.code} has no legal ref`);
    assert.match(control.remediationKey, /^[a-z0-9_-]{1,64}$/);
    if (control.evidenceMode === 'manual' || control.evidenceMode === 'attestation') continue;
    const rules =
      control.violationRules.length + control.absenceRules.length + control.positiveRules.length;
    assert.ok(rules >= 1, `${control.code} has no evidence rule`);
  }
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-controls.test.mjs
```

Expected RED: `AssertionError: expected 20 to be >= 45` (or the current Phase C count), plus `AssertionError: missing DPDPA-8.4-CMP-01`.

- [x] **Step 3: Write the 47-control YAML**

Replace `packages/rule-packs/v2/controls.yaml` with a document that starts exactly:

```yaml
version: 1
pack: dpdpa-2026.11.0
effectiveFrom: '2026-11-15'
controls:
```

Then write one mapping per row below. Field rules are exact, not suggestions:

- `code`, `section`, `actRef`, `title`, `severity`, `weight`, `evidenceMode`, `appliesWhen`, `ruleRef`, the three rule arrays, `partialCredit`, `remediationKey`, and `legalRefs` are always present.
- `actRef` is `DPDPA Section <section>`; `legalRefs` is `[actRef]` plus `DPDP Rules 4` when section is `8(4)`.
- `ruleRef` equals `remediationKey`.
- `web` in the `when` column becomes `[{ stack: web }]`; `-` becomes `[]`.
- `partialCredit: false` for every row.
- `A(detector, token, confidence)` becomes an `absenceRules` entry `{ id: absence.<token>, detector, token, confidence }`.
- `V(detector, search, confidence)` becomes a `violationRules` entry `{ id: violation.<code lowercased with '-' replaced by '_'>, detector, provenance: { search }, confidence }`.
- `P(detector, token, confidence)` becomes a `positiveRules` entry `{ id: positive.<token>, detector, token, confidence }`.
- `none` means all three rule arrays are `[]` and `evidenceMode` is `manual`.

Full row set:

| code | section | title | sev | w | mode | when | rules | remediationKey |
|---|---|---|---|---:|---|---|---|---|
| DPDPA-5-NOTICE-01 | 5 | Privacy notice is present at collection | medium | 2 | absence | web | A(artefact_scan, privacy_notice, advisory) | publish-privacy-notice |
| DPDPA-5-NOTICE-CONTENT-01 | 5 | Notice covers purposes and rights | medium | 2 | positive | web | P(artefact_scan, notice_purposes, advisory) | complete-notice-content |
| DPDPA-5-NOTICE-LINK-01 | 5 | Notice link is visible at collection forms | medium | 2 | absence | web | A(form_scan, privacy_notice_link, inferred) | link-privacy-notice-from-forms |
| DPDPA-5-ARTEFACT-01 | 5 | Privacy artefacts are present in repository | medium | 2 | absence | - | A(artefact_scan, privacy_artefact, advisory) | add-privacy-artefacts |
| DPDPA-6-CONSENT-01 | 6 | Consent is captured before personal data processing | high | 5 | violation | - | V(semgrep_scan, dpdpa.python.no-consent-check, inferred) | gate-processing-on-consent |
| DPDPA-6-CONSENT-GATE-01 | 6 | Personal-data forms have a recorded consent gate | high | 5 | absence | web | A(form_scan, consent_gate, inferred) | gate-web-forms-on-consent |
| DPDPA-6-MIN-01 | 6 | Only necessary personal data fields are collected | high | 4 | violation | - | V(semgrep_scan, dpdpa.generic.overcollection, inferred) | remove-unnecessary-fields |
| DPDPA-6-WD-01 | 6 | Consent withdrawal is implemented | medium | 3 | violation | - | V(semgrep_scan, dpdpa.python.consent-withdrawal-missing, inferred) | add-consent-withdrawal |
| DPDPA-7-LAWFUL-01 | 7 | A lawful basis is recorded for processing | medium | 2 | violation | - | V(semgrep_scan, dpdpa.generic.lawful-basis-missing, advisory) | record-lawful-basis |
| DPDPA-6-THIRDPARTY-01 | 6 | Processor list is published | medium | 2 | absence | - | A(artefact_scan, processor_list, inferred) | publish-processor-list |
| DPDPA-6-SDK-01 | 6 | SDK initialisation discloses personal-data use | medium | 3 | absence | web | A(sdk_init_scan, sdk_purpose, inferred) | document-sdk-purpose |
| DPDPA-6-CMS-01 | 6 | CMS plugins handling personal data are reviewed | medium | 3 | absence | web | A(cms_scan, cms_pii_plugin, inferred) | review-cms-plugins |
| DPDPA-6-PII-LITERAL-01 | 6 | Personal-data literals are documented | medium | 2 | absence | - | A(pii_literal_scan, pii_literal, inferred) | document-pii-literals |
| DPDPA-6-FORM-PURPOSE-01 | 6 | Collection forms state a purpose | medium | 2 | absence | web | A(form_scan, purpose_statement, inferred) | add-form-purpose |
| DPDPA-6-DSR-SOP-01 | 6 | DSR SOP artefact exists | medium | 2 | absence | - | A(artefact_scan, dsr_sop, inferred) | publish-dsr-sop |
| DPDPA-8.4-ENC-01 | 8(4) | Personal data is encrypted at rest | high | 5 | violation | - | V(checkov_scan, ckv_dpdp_a_1, direct) | enable-encryption-at-rest |
| DPDPA-8.4-TLS-01 | 8(4) | Transport encryption is enforced | high | 5 | absence | web | A(header_scan, strict-transport-security, inferred) | enforce-tls |
| DPDPA-8.4-ACCESS-01 | 8(4) | Data stores and services are not publicly exposed | critical | 8 | violation | - | V(checkov_scan, ckv_dpdp_a_1, direct) | restrict-public-access |
| DPDPA-8.4-SECRET-01 | 8(4) | Secrets are not stored in source | critical | 8 | violation | - | V(gitleaks_scan, generic-api-key, direct) | remove-hardcoded-secrets |
| DPDPA-8.4-LOG-01 | 8(4) | Personal data is not written to logs | critical | 7 | violation | - | V(semgrep_scan, dpdpa.python.pii-in-logs, direct) | redact-personal-data-from-logs |
| DPDPA-8.4-MON-01 | 8(4) | Access and audit logging is enabled | medium | 3 | absence | - | A(schema_scan, audit_log, inferred) | add-audit-logging |
| DPDPA-8.4-BACKUP-01 | 8(4) | Backups protect availability | medium | 2 | absence | - | A(artefact_scan, backup_policy, advisory) | add-backup-policy |
| DPDPA-8.4-RET-01 | 8(4) | Retention limits are enforced in code | high | 4 | violation | - | V(semgrep_scan, dpdpa.generic.unbounded-retention, inferred) | enforce-retention-limit |
| DPDPA-8.4-PASSWORD-01 | 8(4) | Credential policy is documented | medium | 3 | absence | - | A(schema_scan, password_policy, inferred) | enforce-password-policy |
| DPDPA-8.4-SESSION-01 | 8(4) | Session configuration protects personal data | medium | 3 | absence | web | A(header_scan, session_secure, inferred) | secure-session-config |
| DPDPA-8.4-HEADER-01 | 8(4) | Security headers are configured | high | 4 | violation | web | V(semgrep_scan, dpdpa.v2.header.hsts-disabled, direct) | configure-security-headers |
| DPDPA-8.4-COOKIE-01 | 8(4) | Cookies carrying personal data are hardened | high | 4 | violation | web | V(semgrep_scan, dpdpa.v2.cookie.missing-secure-flag, direct) | harden-cookie-flags |
| DPDPA-8.4-CMP-01 | 8(4) | Consent management platform is enabled | high | 4 | violation | web | V(semgrep_scan, dpdpa.v2.cmp.consent-mode-disabled, direct) | enable-cmp-consent-mode |
| DPDPA-8.4-DEP-01 | 8(4) | Dependencies with known personal-data risk are pinned | medium | 3 | absence | - | A(dep_scan, vulnerable_dependency, inferred) | pin-dependency-versions |
| DPDPA-8.4-ECOSYSTEM-01 | 8(4) | Framework-specific safeguards are applied | medium | 3 | absence | web | A(dep_scan, ecosystem_pattern, inferred) | apply-framework-safeguards |
| DPDPA-8.5-BREACH-01 | 8(5) | Breach detection and alerting hooks exist | medium | 3 | violation | - | V(semgrep_scan, dpdpa.generic.breach-alert-missing, inferred) | add-breach-alert-hook |
| DPDPA-8.5-RUNBOOK-01 | 8(5) | Breach response runbook artefact exists | medium | 2 | absence | - | A(artefact_scan, breach_runbook, inferred) | publish-breach-runbook |
| DPDPA-8.5-ENCRYPTION-01 | 8(5) | Encryption safeguards are evidenced for the safeguards register | high | 4 | violation | - | V(checkov_scan, ckv_dpdp_a_1, direct) | enable-encryption-at-rest |
| DPDPA-8.6-BREACH-01 | 8(6) | Breach intimation path is documented | medium | 3 | absence | - | A(artefact_scan, breach_intimation, inferred) | document-breach-intimation |
| DPDPA-8.6-ALERT-01 | 8(6) | Security events escalate to the response owner | medium | 3 | violation | - | V(semgrep_scan, dpdpa.generic.breach-alert-missing, inferred) | route-security-events |
| DPDPA-8.7-ERASE-01 | 8(7) | Erasure is implemented as hard deletion | high | 4 | violation | - | V(semgrep_scan, dpdpa.generic.hard-delete-missing, inferred) | implement-hard-delete |
| DPDPA-8.7-RET-01 | 8(7) | Retention schedule artefact exists | medium | 2 | absence | - | A(artefact_scan, retention_schedule, advisory) | publish-retention-schedule |
| DPDPA-8.9-CONTACT-01 | 8(9) | Published data protection contact exists | medium | 2 | absence | - | A(artefact_scan, privacy_contact, inferred) | publish-privacy-contact |
| DPDPA-8.10-GRIEVANCE-01 | 8(10) | Grievance mechanism is published | medium | 2 | absence | - | A(artefact_scan, grievance_mechanism, inferred) | publish-grievance-mechanism |
| DPDPA-9-CHILD-01 | 9 | Children's data includes verifiable consent | high | 4 | violation | - | V(semgrep_scan, dpdpa.generic.children-data-no-age-gate, advisory) | add-child-consent-gate |
| DPDPA-9-AGEGATE-01 | 9 | Age gate is present on child-directed surfaces | high | 4 | absence | web | A(form_scan, age_gate, advisory) | add-age-gate |
| DPDPA-10-SDF-01 | 10 | SDF governance artefacts are present | low | 1 | manual | - | none | document-sdf-governance |
| DPDPA-12-ACCESS-01 | 12 | Data access and export endpoint exists | medium | 1 | manual | - | none | add-access-export |
| DPDPA-13-ERASE-01 | 13 | Correction and erasure endpoints exist | high | 4 | positive | - | P(schema_scan, erase_endpoint, inferred) | add-erasure-endpoint |
| DPDPA-13-GRIEVANCE-01 | 13 | Grievance redressal path exists for data principals | medium | 2 | absence | - | A(mechanism_scan, grievance_form, inferred) | add-grievance-redressal |
| DPDPA-16-XBORDER-01 | 16 | Cross-border transfer is restricted or disclosed | high | 4 | violation | - | V(semgrep_scan, dpdpa.javascript.cross-border-sdk, inferred) | restrict-cross-border-transfer |
| DPDPA-16-REGION-01 | 16 | Data stores are pinned to India regions | high | 4 | absence | - | A(region_scan, ap-south-1, inferred) | pin-india-region |

Write the first control exactly in this shape, then apply the table rules to the remaining rows:

```yaml
  - code: DPDPA-5-NOTICE-01
    section: '5'
    actRef: DPDPA Section 5
    ruleRef: publish-privacy-notice
    title: Privacy notice is present at collection
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
        confidence: advisory
    positiveRules: []
    partialCredit: false
    remediationKey: publish-privacy-notice
    legalRefs:
      - DPDPA Section 5
```

Do not add source text, snippets, values, or matched content to any control entry.

- [x] **Step 4: Regenerate the manifest and run GREEN**

```bash
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-controls.test.mjs
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: `v2-controls.test.mjs` passes 3 tests; full gates pass. Record the exact test counts in `.superpowers/sdd/2026-11-27-dpdp-evidence-backed-readiness-phase-d/progress.md` (gitignored local ledger).

- [x] **Step 5: Commit**

```bash
git add packages/rule-packs/v2/controls.yaml packages/rule-packs/v2/manifest.yaml packages/rule-packs/test/v2-controls.test.mjs
git commit -m "feat(rule-packs): grow v2 pack to 47 readiness controls"
```

---

### Task 2: Populate CMP, cookie, and security-header catalogues

**Files:**
- Modify: `packages/rule-packs/v2/cmp_catalog.yaml`, `cookie_catalog.yaml`, `security_headers.yaml`
- Create: `packages/rule-packs/test/v2-catalogues.test.mjs`

**Interfaces:**
- Consumes: `catalogFileSchema` from `@dpdpa/contracts`; `cmp_scan`, `cookie_scan`, and `header_scan` detector ids declared in Task 4.
- Produces: allowlisted `entries` keyed by tokens used by Tasks 4 and 5; catalogue keys consumed by `computeConsentGatingRatio` indirectly through detector signals.

- [x] **Step 1: Write the failing catalogue test**

```js
// packages/rule-packs/test/v2-catalogues.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import YAML from 'yaml';
import { catalogFileSchema } from '@dpdpa/contracts';

const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'v2');

async function load(name) {
  const raw = await readFile(join(packDir, name), 'utf8');
  const value = YAML.parse(raw);
  assert.doesNotThrow(() => catalogFileSchema.parse(value), `${name} must match catalogFileSchema`);
  return new Map(value.entries.map((entry) => [entry.key, entry.label]));
}

test('CMP catalogue contains consent platform tokens', async () => {
  const entries = await load('cmp_catalog.yaml');
  for (const key of ['oneTrust', 'cookiebot', 'gtm.consentMode', 'consent_gate']) {
    assert.ok(entries.has(key), `missing CMP key ${key}`);
  }
  assert.ok(entries.size >= 4);
});

test('cookie catalogue contains hardening tokens', async () => {
  const entries = await load('cookie_catalog.yaml');
  for (const key of ['session_id', 'analytics_id', 'secure', 'httpOnly', 'sameSite']) {
    assert.ok(entries.has(key), `missing cookie key ${key}`);
  }
  assert.ok(entries.size >= 5);
});

test('security header catalogue contains web-surface headers', async () => {
  const entries = await load('security_headers.yaml');
  for (const key of [
    'strict-transport-security',
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
  ]) {
    assert.ok(entries.has(key), `missing header key ${key}`);
  }
  assert.ok(entries.size >= 4);
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-catalogues.test.mjs
```

Expected RED: `AssertionError: missing CMP key oneTrust` (first empty catalogue).

- [x] **Step 3: Populate the three catalogues**

`packages/rule-packs/v2/cmp_catalog.yaml`:

```yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: oneTrust
    label: OneTrust consent banner initialisation
  - key: cookiebot
    label: Cookiebot consent banner initialisation
  - key: gtm.consentMode
    label: Google Tag Manager consent mode configuration
  - key: consent_gate
    label: Recorded consent gate before personal data collection
```

`packages/rule-packs/v2/cookie_catalog.yaml`:

```yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: session_id
    label: Session identifier cookie
  - key: analytics_id
    label: Analytics identifier cookie
  - key: secure
    label: Secure cookie flag
  - key: httpOnly
    label: HttpOnly cookie flag
  - key: sameSite
    label: SameSite cookie attribute
```

`packages/rule-packs/v2/security_headers.yaml`:

```yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: strict-transport-security
    label: HTTP Strict Transport Security response header
  - key: content-security-policy
    label: Content Security Policy response header
  - key: x-content-type-options
    label: X-Content-Type-Options response header
  - key: x-frame-options
    label: X-Frame-Options response header
```

- [x] **Step 4: Regenerate the manifest and run GREEN**

```bash
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-catalogues.test.mjs
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: 3 catalogue tests pass; full gates pass.

- [x] **Step 5: Commit**

```bash
git add packages/rule-packs/v2/cmp_catalog.yaml packages/rule-packs/v2/cookie_catalog.yaml packages/rule-packs/v2/security_headers.yaml packages/rule-packs/v2/manifest.yaml packages/rule-packs/test/v2-catalogues.test.mjs
git commit -m "feat(rule-packs): populate CMP cookie and header catalogues"
```

---

### Task 3: Populate SDK, ecosystem, region, field, and mechanism catalogues

**Files:**
- Modify: `packages/rule-packs/v2/sdk_catalog.yaml`, `ecosystem_patterns/web.yaml`, `india-regions.yaml`, `field_dictionary.yaml`, `mechanism_catalog.yaml`
- Modify: `packages/rule-packs/test/v2-catalogues.test.mjs`

**Interfaces:**
- Consumes: `catalogFileSchema` from `@dpdpa/contracts`.
- Produces: tokens used by `sdk_init_scan`, `dep_scan`, `region_scan`, `pii_literal_scan`, and `mechanism_scan` rules in Task 4.

- [x] **Step 1: Extend the failing catalogue test**

Append to `packages/rule-packs/test/v2-catalogues.test.mjs`:

```js
test('SDK catalogue contains personal-data SDK tokens', async () => {
  const entries = await load('sdk_catalog.yaml');
  for (const key of ['googleAnalytics', 'metaPixel', 'sentry']) {
    assert.ok(entries.has(key), `missing SDK key ${key}`);
  }
  assert.ok(entries.size >= 3);
});

test('web ecosystem catalogue contains framework safeguards', async () => {
  const entries = await load('ecosystem_patterns/web.yaml');
  for (const key of ['express.helmet', 'next.middleware', 'vue.composition']) {
    assert.ok(entries.has(key), `missing ecosystem key ${key}`);
  }
  assert.ok(entries.size >= 3);
});

test('India region catalogue contains approved region tokens', async () => {
  const entries = await load('india-regions.yaml');
  for (const key of ['ap-south-1', 'ap-south-2', 'in']) {
    assert.ok(entries.has(key), `missing region key ${key}`);
  }
  assert.ok(entries.size >= 3);
});

test('field dictionary contains personal-data field tokens', async () => {
  const entries = await load('field_dictionary.yaml');
  for (const key of ['email', 'phone', 'aadhaar', 'pan', 'address', 'dob']) {
    assert.ok(entries.has(key), `missing field key ${key}`);
  }
  assert.ok(entries.size >= 6);
});

test('mechanism catalogue contains safeguards and rights tokens', async () => {
  const entries = await load('mechanism_catalog.yaml');
  for (const key of ['consent_gate', 'erase_endpoint', 'grievance_form', 'audit_log']) {
    assert.ok(entries.has(key), `missing mechanism key ${key}`);
  }
  assert.ok(entries.size >= 4);
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-catalogues.test.mjs
```

Expected RED: `AssertionError: missing SDK key googleAnalytics`.

- [x] **Step 3: Populate the five catalogues**

```yaml
# packages/rule-packs/v2/sdk_catalog.yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: googleAnalytics
    label: Google Analytics browser SDK
  - key: metaPixel
    label: Meta Pixel browser SDK
  - key: sentry
    label: Sentry error-reporting SDK
```

```yaml
# packages/rule-packs/v2/ecosystem_patterns/web.yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: express.helmet
    label: Express Helmet security-header middleware
  - key: next.middleware
    label: Next.js middleware safeguards
  - key: vue.composition
    label: Vue composition API form safeguards
```

```yaml
# packages/rule-packs/v2/india-regions.yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: ap-south-1
    label: AWS Mumbai region
  - key: ap-south-2
    label: AWS Hyderabad region
  - key: in
    label: India-prefixed region identifier
```

```yaml
# packages/rule-packs/v2/field_dictionary.yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: email
    label: Email address field
  - key: phone
    label: Phone number field
  - key: aadhaar
    label: Aadhaar identifier field
  - key: pan
    label: PAN identifier field
  - key: address
    label: Postal address field
  - key: dob
    label: Date of birth field
```

```yaml
# packages/rule-packs/v2/mechanism_catalog.yaml
version: 1
pack: dpdpa-2026.11.0
entries:
  - key: consent_gate
    label: Recorded consent gate
  - key: erase_endpoint
    label: Erasure or correction endpoint
  - key: grievance_form
    label: Grievance submission mechanism
  - key: audit_log
    label: Access and audit logging
```

- [x] **Step 4: Regenerate the manifest and run GREEN**

```bash
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-catalogues.test.mjs
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: 8 catalogue tests pass; full gates pass.

- [x] **Step 5: Commit**

```bash
git add packages/rule-packs/v2/sdk_catalog.yaml packages/rule-packs/v2/ecosystem_patterns/web.yaml packages/rule-packs/v2/india-regions.yaml packages/rule-packs/v2/field_dictionary.yaml packages/rule-packs/v2/mechanism_catalog.yaml packages/rule-packs/v2/manifest.yaml packages/rule-packs/test/v2-catalogues.test.mjs
git commit -m "feat(rule-packs): populate SDK ecosystem region and field catalogues"
```

---

### Task 4: Declare web-surface detectors and their control mappings

**Files:**
- Modify: `packages/rule-packs/v2/detectors.yaml`
- Modify: `packages/rule-packs/v2/mappings/inventory.yaml`
- Create: `packages/rule-packs/test/v2-detectors.test.mjs`

**Interfaces:**
- Consumes: `detectorsFileV2Schema`, `mappingsFileV2Schema`, `INVENTORY_MODULE_KEYS` from `@dpdpa/contracts`; control codes from Task 1.
- Produces: detector entries for `dep_scan`, `sdk_init_scan`, `region_scan`, `pii_literal_scan`, `cookie_scan`, `cmp_scan`, `header_scan`, `cms_scan`; mapping entries used by Phase C's evaluator bridge and by Task 9's detector-status gate.

- [x] **Step 1: Write the failing detector test**

```js
// packages/rule-packs/test/v2-detectors.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import YAML from 'yaml';
import {
  detectorsFileV2Schema,
  INVENTORY_MODULE_KEYS,
  mappingsFileV2Schema,
} from '@dpdpa/contracts';

const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'v2');
const detectorsDoc = YAML.parse(await readFile(join(packDir, 'detectors.yaml'), 'utf8'));
const mappingsDoc = YAML.parse(
  await readFile(join(packDir, 'mappings', 'inventory.yaml'), 'utf8'),
);

test('all detector entries satisfy the v2 contract', () => {
  assert.doesNotThrow(() => detectorsFileV2Schema.parse(detectorsDoc));
});

test('second-phase web-surface detectors are declared exactly once', () => {
  const ids = detectorsDoc.detectors.map((detector) => detector.id);
  assert.equal(new Set(ids).size, ids.length);
  const required = [
    'dep_scan', 'sdk_init_scan', 'region_scan', 'pii_literal_scan',
    'cookie_scan', 'cmp_scan', 'header_scan', 'cms_scan',
  ];
  for (const id of required) {
    assert.ok(ids.includes(id), `missing detector ${id}`);
    assert.ok(INVENTORY_MODULE_KEYS.includes(id));
  }
  const allowedInputs = new Set(['source', 'dependencies', 'config', 'artefacts', 'headers', 'runtime']);
  for (const detector of detectorsDoc.detectors) {
    if (!INVENTORY_MODULE_KEYS.includes(detector.id)) continue;
    assert.ok(detector.inputs.length >= 1);
    for (const input of detector.inputs) assert.ok(allowedInputs.has(input), `bad input ${input}`);
    assert.deepEqual(detector.outputs, ['fact', 'status']);
    assert.equal(detector.failureMode, 'UNKNOWN');
    assert.ok(detector.timeoutMs >= 100 && detector.timeoutMs <= 30000);
  }
});

test('web-surface mappings reference declared detectors and real controls', async () => {
  assert.doesNotThrow(() => mappingsFileV2Schema.parse(mappingsDoc));
  const declared = new Set(detectorsDoc.detectors.map((detector) => detector.id));
  const controlsDoc = YAML.parse(await readFile(join(packDir, 'controls.yaml'), 'utf8'));
  const codes = new Set(controlsDoc.controls.map((control) => control.code));
  const required = ['cmp_scan', 'header_scan', 'cookie_scan', 'sdk_init_scan'];
  for (const detector of required) {
    assert.ok(
      mappingsDoc.mappings.some((mapping) => mapping.detector === detector),
      `missing mapping for ${detector}`,
    );
  }
  for (const mapping of mappingsDoc.mappings) {
    assert.ok(declared.has(mapping.detector), `orphan detector ${mapping.detector}`);
    assert.ok(codes.has(mapping.control), `orphan control ${mapping.control}`);
    assert.ok(mapping.rationale.length > 0);
  }
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-detectors.test.mjs
```

Expected RED: `AssertionError: missing detector dep_scan`.

- [x] **Step 3: Add detector declarations**

Append these entries to `detectors.yaml` under the existing `detectors:` key. If a Phase C entry with the same `id` already exists, replace it with this exact value rather than appending a duplicate.

```yaml
  - id: dep_scan
    module: inventory
    inputs: [source, dependencies]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: []
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-8.4-DEP-01, DPDPA-8.4-ECOSYSTEM-01]
  - id: sdk_init_scan
    module: inventory
    inputs: [source]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: [web]
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-6-SDK-01]
  - id: region_scan
    module: inventory
    inputs: [source, config]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: []
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-16-REGION-01]
  - id: pii_literal_scan
    module: inventory
    inputs: [source]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: []
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-6-PII-LITERAL-01]
  - id: cookie_scan
    module: inventory
    inputs: [source]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: [web]
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-8.4-COOKIE-01]
  - id: cmp_scan
    module: inventory
    inputs: [source]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: [web]
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-8.4-CMP-01, DPDPA-6-CONSENT-GATE-01]
  - id: header_scan
    module: inventory
    inputs: [source, config]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: [web]
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-8.4-HEADER-01, DPDPA-8.4-TLS-01, DPDPA-8.4-SESSION-01]
  - id: cms_scan
    module: inventory
    inputs: [source, dependencies]
    outputs: [fact, status]
    timeoutMs: 30000
    stacks: [web]
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-6-CMS-01]
```

Also add these scanner detector declarations if Phase C did not already add them:

```yaml
  - id: gitleaks_scan
    module: scanner
    inputs: [source]
    outputs: [finding, status]
    timeoutMs: 60000
    stacks: []
    confidence: direct
    failureMode: UNKNOWN
    controlRefs: [DPDPA-8.4-SECRET-01]
  - id: semgrep_scan
    module: scanner
    inputs: [source]
    outputs: [finding, status]
    timeoutMs: 120000
    stacks: []
    confidence: inferred
    failureMode: UNKNOWN
    controlRefs: [DPDPA-6-CONSENT-01, DPDPA-8.4-LOG-01, DPDPA-8.4-HEADER-01]
  - id: checkov_scan
    module: scanner
    inputs: [source, config]
    outputs: [finding, status]
    timeoutMs: 120000
    stacks: []
    confidence: direct
    failureMode: UNKNOWN
    controlRefs: [DPDPA-8.4-ENC-01, DPDPA-8.5-ENCRYPTION-01]
```

- [x] **Step 4: Add inventory mappings**

Replace `mappings/inventory.yaml` with:

```yaml
version: 1
pack: dpdpa-2026.11.0
mappings:
  - detector: dep_scan
    control: DPDPA-8.4-DEP-01
    confidence: inferred
    rationale: Dependency manifests reveal unpinned libraries that process personal data.
  - detector: dep_scan
    control: DPDPA-8.4-ECOSYSTEM-01
    confidence: inferred
    rationale: Dependency manifests identify the web framework whose safeguards must be checked.
  - detector: sdk_init_scan
    control: DPDPA-6-SDK-01
    confidence: inferred
    rationale: SDK initialisation calls show third-party collection surfaces in browser code.
  - detector: region_scan
    control: DPDPA-16-REGION-01
    confidence: inferred
    rationale: Region strings in source and config show where data stores are pinned.
  - detector: pii_literal_scan
    control: DPDPA-6-PII-LITERAL-01
    confidence: inferred
    rationale: Allowlisted personal-data field names show literals that need purpose documentation.
  - detector: cookie_scan
    control: DPDPA-8.4-COOKIE-01
    confidence: inferred
    rationale: Cookie configuration calls show flags applied to personal-data cookies.
  - detector: cmp_scan
    control: DPDPA-8.4-CMP-01
    confidence: inferred
    rationale: CMP configuration calls show whether a consent platform is enabled.
  - detector: cmp_scan
    control: DPDPA-6-CONSENT-GATE-01
    confidence: inferred
    rationale: CMP signal paths identify forms that have a recorded consent gate.
  - detector: header_scan
    control: DPDPA-8.4-HEADER-01
    confidence: inferred
    rationale: Response-header configuration shows which security headers are set.
  - detector: header_scan
    control: DPDPA-8.4-TLS-01
    confidence: inferred
    rationale: Strict-Transport-Security configuration shows enforced transport encryption.
  - detector: header_scan
    control: DPDPA-8.4-SESSION-01
    confidence: inferred
    rationale: Session cookie and header settings show how sessions are protected.
  - detector: cms_scan
    control: DPDPA-6-CMS-01
    confidence: inferred
    rationale: CMS dependency and plugin tokens show personal-data handling surfaces to review.
```

- [x] **Step 5: Regenerate the manifest and run GREEN**

```bash
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs validate
pnpm --filter @dpdpa/rule-packs exec node --test test/v2-detectors.test.mjs
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: validator prints `{"pack":"dpdpa-2026.11.0","issues":[]}`; 3 detector tests pass; full gates pass.

- [x] **Step 6: Commit**

```bash
git add packages/rule-packs/v2/detectors.yaml packages/rule-packs/v2/mappings/inventory.yaml packages/rule-packs/v2/manifest.yaml packages/rule-packs/test/v2-detectors.test.mjs
git commit -m "feat(rule-packs): declare web-surface detectors and mappings"
```

---

### Task 5: Add pinned custom Semgrep rules with positive and negative fixtures

**Files:**
- Create: `packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml`
- Create: `packages/rule-packs/test/custom-semgrep-rules.test.mjs`
- Create: `tests/semgrep/dpdpa.v2-web.js`
- Modify: `tests/semgrep/check.py`
- Create: `apps/scan-runner/tests/test_custom_rule_pins.py`

**Interfaces:**
- Consumes: pinned Semgrep version `1.95.0` from `apps/scan-runner/src/scan_runner/versions.py`; detector `semgrep_scan` from Task 4; control codes `DPDPA-8.4-CMP-01`, `DPDPA-8.4-HEADER-01`, and `DPDPA-8.4-COOKIE-01` from Task 1.
- Produces: rule ids `dpdpa.v2.cmp.consent-mode-disabled`, `dpdpa.v2.header.hsts-disabled`, `dpdpa.v2.cookie.missing-secure-flag` consumed by Task 1 violation rules and by the annotated fixture harness.

- [x] **Step 1: Write the failing static rule/pin test**

```js
// packages/rule-packs/test/custom-semgrep-rules.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import YAML from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..');
const rulesPath = join(root, 'custom', 'semgrep', 'dpdpa-v2-web.yaml');

test('custom Semgrep rules pin the scanner version from versions.py', async () => {
  const raw = await readFile(rulesPath, 'utf8');
  const pins = await readFile(
    join(repoRoot, 'apps', 'scan-runner', 'src', 'scan_runner', 'versions.py'),
    'utf8',
  );
  assert.match(pins, /"semgrep": "1\.95\.0"/);
  assert.match(raw, /^# semgrep==1\.95\.0$/m);
});

test('custom Semgrep rules cover CMP HSTS and cookie flags', async () => {
  const doc = YAML.parse(await readFile(rulesPath, 'utf8'));
  const ids = doc.rules.map((rule) => rule.id);
  assert.deepEqual(ids, [
    'dpdpa.v2.cmp.consent-mode-disabled',
    'dpdpa.v2.header.hsts-disabled',
    'dpdpa.v2.cookie.missing-secure-flag',
  ]);
  for (const rule of doc.rules) {
    assert.deepEqual(rule.languages, ['generic']);
    assert.equal(rule.severity, 'ERROR');
    assert.ok(rule.message.includes('readiness gap'));
  }
});

test('fixture has positive and negative annotations for every custom rule', async () => {
  const raw = await readFile(
    join(repoRoot, 'tests', 'semgrep', 'dpdpa.v2-web.js'),
    'utf8',
  );
  const ids = [
    'dpdpa.v2.cmp.consent-mode-disabled',
    'dpdpa.v2.header.hsts-disabled',
    'dpdpa.v2.cookie.missing-secure-flag',
  ];
  for (const id of ids) {
    assert.ok(raw.includes(`ruleid: ${id}`), `missing positive annotation for ${id}`);
    assert.ok(raw.includes(`ok: ${id}`), `missing negative annotation for ${id}`);
  }
});
```

Create `apps/scan-runner/tests/test_custom_rule_pins.py`:

```python
"""Custom scanner rule pins must match the image and adapter pins."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_semgrep_custom_rules_pin_the_pinned_version() -> None:
    raw = (ROOT / "packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml").read_text()
    pins = (ROOT / "apps/scan-runner/src/scan_runner/versions.py").read_text()
    assert re.search(r'^# semgrep==1\.95\.0$', raw, re.MULTILINE)
    assert '"semgrep": "1.95.0"' in pins


def test_checkov_custom_rules_pin_the_pinned_version() -> None:
    raw = (
        ROOT / "packages/rule-packs/custom/checkov/dpdp_security_checks.py"
    ).read_text()
    pins = (ROOT / "apps/scan-runner/src/scan_runner/versions.py").read_text()
    assert re.search(r'^# checkov==3\.2\.0$', raw, re.MULTILINE)
    assert '"checkov": "3.2.0"' in pins


def test_installed_semgrep_matches_pin() -> None:
    version = subprocess.check_output(["semgrep", "--version"], text=True).strip()
    assert version == "1.95.0", f"expected semgrep 1.95.0, got {version}"
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/custom-semgrep-rules.test.mjs
python3 -m pytest apps/scan-runner/tests/test_custom_rule_pins.py -q
```

Expected RED: `ENOENT: no such file or directory, open '.../packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml'` and `FileNotFoundError: [Errno 2] No such file or directory: '...dpdpa-v2-web.yaml'`.

- [x] **Step 3: Write the custom Semgrep rule file**

```yaml
# semgrep==1.95.0
# Custom readiness-gap rules for web-surface controls. Rule ids are mapped in
# packages/rule-packs/v2/detectors.yaml via detector semgrep_scan.
rules:
  - id: dpdpa.v2.cmp.consent-mode-disabled
    languages: [generic]
    severity: ERROR
    message: Consent mode is disabled; this is evidence of a readiness gap for DPDPA Section 8(4).
    patterns:
      - pattern-regex: '(?i)\b(?:consentMode|cmpConfig)\b.{0,60}\benabled\s*:\s*false\b'

  - id: dpdpa.v2.header.hsts-disabled
    languages: [generic]
    severity: ERROR
    message: Transport hardening is disabled; this is evidence of a readiness gap for DPDPA Section 8(4).
    patterns:
      - pattern-regex: '(?i)\bhsts\s*:\s*false\b'

  - id: dpdpa.v2.cookie.missing-secure-flag
    languages: [generic]
    severity: ERROR
    message: A personal-data cookie is missing the Secure flag; this is evidence of a readiness gap for DPDPA Section 8(4).
    patterns:
      - pattern-regex: '(?i)\b[a-z_]*cookie\s*\([^\n]{0,160}\bsecure\s*:\s*false\b'
```

- [x] **Step 4: Write the annotated fixture**

Create `tests/semgrep/dpdpa.v2-web.js`:

```js
// Positive fixture for custom DPDPA v2 Semgrep rules. Test input only.
const cmpConfig = { enabled: false }; // ruleid: dpdpa.v2.cmp.consent-mode-disabled
const safeCmpConfig = { enabled: true }; // ok: dpdpa.v2.cmp.consent-mode-disabled

const helmetOptions = { hsts: false }; // ruleid: dpdpa.v2.header.hsts-disabled
const safeHelmetOptions = { hsts: true }; // ok: dpdpa.v2.header.hsts-disabled

setCookie("session_id", token, { secure: false }); // ruleid: dpdpa.v2.cookie.missing-secure-flag
setCookie("session_id", token, { secure: true }); // ok: dpdpa.v2.cookie.missing-secure-flag
```

- [x] **Step 5: Extend the fixture harness to load both rule files**

Replace `tests/semgrep/check.py` with this exact content:

```python
"""Run with Semgrep 1.95.0 on PATH: python3 tests/semgrep/check.py."""

import json
import re
import subprocess
from pathlib import Path

fixtures = Path(__file__).resolve().parent
configs = [
    fixtures.parents[1] / "packages/rule-packs/semgrep/dpdpa.yaml",
    fixtures.parents[1] / "packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml",
]
targets = sorted(fixtures.glob("dpdpa.*"))
expected = set()
rules = set()
for target in targets:
    lines = target.read_text().splitlines()
    for number, line in enumerate(lines, start=1):
        annotation = re.search(r"(ruleid|ok): (dpdpa\.[\w.-]+)", line)
        if annotation:
            kind, rule = annotation.groups()
            rules.add(rule)
            if kind == "ruleid":
                while not lines[number].strip():
                    number += 1
                expected.add((target.name, number + 1, rule))

command = [
    "semgrep",
    "scan",
    "--metrics=off",
    "--no-rewrite-rule-ids",
    "--json",
    "--quiet",
]
for config in configs:
    command += ["--config", str(config)]
command += [str(target) for target in targets]
result = subprocess.check_output(command, text=True)
scan = json.loads(result)
if scan["errors"]:
    raise SystemExit(scan["errors"])
if {Path(path).resolve() for path in scan["paths"]["scanned"]} != set(targets):
    raise SystemExit("Semgrep did not scan every fixture")
actual = {
    (Path(match["path"]).name, match["start"]["line"], match["check_id"])
    for match in scan["results"]
    if match["check_id"] in rules
}
if actual != expected:
    raise SystemExit(f"Missing: {sorted(expected - actual)}\nUnexpected: {sorted(actual - expected)}")
print(f"Semgrep fixtures passed ({len(targets)} files, {len(rules)} rules)")
```

- [x] **Step 6: Run GREEN with the pinned Semgrep binary**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/custom-semgrep-rules.test.mjs
python3 -m pytest apps/scan-runner/tests/test_custom_rule_pins.py -q
python3 tests/semgrep/check.py
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: 3 Node tests pass; 3 pin tests pass; fixture harness prints `Semgrep fixtures passed (6 files, 6 rules)` (the five existing `dpdpa.*` fixtures and new `dpdpa.v2-web.js`; three annotated rule ids from the existing pack plus the three new ids); full gates pass. Do not weaken the version assertion to accommodate an unpinned local binary; install Semgrep 1.95.0 or run inside the pinned image.

- [x] **Step 7: Commit**

```bash
git add packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml packages/rule-packs/test/custom-semgrep-rules.test.mjs tests/semgrep/dpdpa.v2-web.js tests/semgrep/check.py apps/scan-runner/tests/test_custom_rule_pins.py
git commit -m "feat(rules): add pinned Semgrep web-surface rules and fixtures"
```

---

### Task 6: Add a pinned custom Checkov policy with Terraform fixtures

**Files:**
- Create: `packages/rule-packs/custom/checkov/__init__.py`
- Create: `packages/rule-packs/custom/checkov/dpdp_security_checks.py`
- Create: `tests/golden-repos/fx-cmp-header/main.tf`
- Create: `tests/golden-repos/fx-gtm-web/main.tf`
- Create: `apps/scan-runner/tests/test_custom_checkov_policies.py`

**Interfaces:**
- Consumes: pinned Checkov version `3.2.0` from `apps/scan-runner/src/scan_runner/versions.py`; detector `checkov_scan` from Task 4; control `DPDPA-8.4-ENC-01` from Task 1.
- Produces: check id `ckv_dpdp_a_1` referenced by Task 1 controls and exercised by the exit gate. The id is lowercase because `ruleProvenanceSchema.search` only permits `[a-z0-9_.:/-]`; Checkov preserves a custom check's id verbatim in its JSON `check_id` field, so the runner's normalised `scannerRuleId` matches the control rule exactly. Do not change the id to uppercase or edit the Phase B schema.

- [x] **Step 1: Write the failing Checkov fixture test**

```python
"""Custom Checkov policy must fail the bad fixture and pass the good fixture."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CHECKS = ROOT / "packages/rule-packs/custom/checkov"
CHECK_ID = "ckv_dpdp_a_1"


def _failed_ids(fixture: Path) -> set[str]:
    result = subprocess.run(
        [
            "checkov",
            "-d",
            str(fixture),
            "--external-checks-dir",
            str(CHECKS),
            "--framework",
            "terraform",
            "--output",
            "json",
            "--quiet",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode in (0, 1), result.stderr
    report = json.loads(result.stdout)
    return {
        check["check_id"]
        for check in report["results"].get("failed_checks", [])
    }


def test_installed_checkov_matches_pin() -> None:
    output = subprocess.check_output(["checkov", "--version"], text=True).strip()
    version = output.split()[-1]
    assert version == "3.2.0", f"expected checkov 3.2.0, got {version}"


def test_custom_policy_fails_unencrypted_personal_data_bucket() -> None:
    assert CHECK_ID in _failed_ids(ROOT / "tests/golden-repos/fx-cmp-header")


def test_custom_policy_passes_encrypted_personal_data_bucket() -> None:
    assert CHECK_ID not in _failed_ids(ROOT / "tests/golden-repos/fx-gtm-web")
```

- [x] **Step 2: Run the test to verify it fails**

```bash
python3 -m pytest apps/scan-runner/tests/test_custom_checkov_policies.py -q
```

Expected RED: `AssertionError: ckv_dpdp_a_1 not found in set()` and `FileNotFoundError` for the fixture directories.

- [x] **Step 3: Write the custom Checkov policy**

Create `packages/rule-packs/custom/checkov/__init__.py` as an empty file.

Create `packages/rule-packs/custom/checkov/dpdp_security_checks.py`:

```python
# checkov==3.2.0
"""Custom readiness-gap policies. Test fixtures are inputs only."""

from __future__ import annotations

from typing import Any

from checkov.common.models.enums import CheckCategories, CheckResult
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck


class S3BucketPersonalDataEncrypted(BaseResourceCheck):
    def __init__(self) -> None:
        super().__init__(
            name="Ensure buckets holding personal data enable server-side encryption",
            id="ckv_dpdp_a_1",
            categories=(CheckCategories.ENCRYPTION,),
            supported_resources=("aws_s3_bucket",),
        )

    def scan_resource_conf(self, conf: dict[str, list[Any]]) -> CheckResult:
        if conf.get("server_side_encryption_configuration"):
            return CheckResult.PASSED
        return CheckResult.FAILED


check = S3BucketPersonalDataEncrypted()
```

- [x] **Step 4: Write the two Terraform fixtures**

`tests/golden-repos/fx-cmp-header/main.tf`:

```hcl
resource "aws_s3_bucket" "personal_data" {
  bucket = "fixture-personal-data"
}
```

`tests/golden-repos/fx-gtm-web/main.tf`:

```hcl
resource "aws_s3_bucket" "personal_data" {
  bucket = "fixture-personal-data"

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}
```

These fixture directories are test inputs only. Never upload them as pilot data or reference them in runtime configuration.

- [x] **Step 5: Run GREEN with the pinned Checkov binary**

```bash
python3 -m pytest apps/scan-runner/tests/test_custom_checkov_policies.py -q
python3 -m pytest apps/scan-runner/tests/test_custom_rule_pins.py -q
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: 3 Checkov fixture tests pass, 3 pin tests pass, full gates pass. If the installed Checkov is not 3.2.0, the version test fails by design; run inside the pinned runner image.

- [x] **Step 6: Commit**

```bash
git add packages/rule-packs/custom/checkov apps/scan-runner/tests/test_custom_checkov_policies.py tests/golden-repos/fx-cmp-header tests/golden-repos/fx-gtm-web
git commit -m "feat(rules): add pinned Checkov policy and Terraform fixtures"
```

---

### Task 7: Generate structured remediation with one concrete snippet per FAIL-capable control

**Files:**
- Create: `packages/rule-packs/scripts/generate-remediation-v2.mjs`
- Create: `packages/rule-packs/v2/templates/remediation.md`
- Create: `packages/rule-packs/test/remediation.test.mjs`
- Modify: `packages/rule-packs/package.json` (add `remediation:v2` script)

**Interfaces:**
- Consumes: `remediationKey` values from Task 1; `controlsFileV2Schema` from `@dpdpa/contracts`.
- Produces: `generateRemediationV2(controls)` returning a deterministic Markdown string; `templates/remediation.md` consumed by report/fix-plan code in Phase E and by the exit gate in Task 10.

- [x] **Step 1: Write the failing remediation test**

```js
// packages/rule-packs/test/remediation.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import YAML from 'yaml';
import { generateRemediationV2 } from '../scripts/generate-remediation-v2.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const controlsDoc = YAML.parse(await readFile(join(root, 'v2', 'controls.yaml'), 'utf8'));
const checkedIn = await readFile(join(root, 'v2', 'templates', 'remediation.md'), 'utf8');
const headings = [
  '### Summary',
  '### Why it matters',
  '### Steps',
  '### Code example',
  '### Verification',
  '### Effort',
  '### Owner',
  '### References',
  '### Framework snippets',
];

test('remediation.md is deterministic and generated from controls', () => {
  assert.equal(checkedIn, generateRemediationV2(controlsDoc.controls));
});

test('every FAIL-capable control has a structured section with code', () => {
  for (const control of controlsDoc.controls) {
    if (control.evidenceMode === 'manual' || control.evidenceMode === 'attestation') continue;
    const marker = `## ${control.remediationKey}`;
    assert.ok(checkedIn.includes(marker), `missing remediation for ${control.code}`);
    const start = checkedIn.indexOf(marker);
    const end = checkedIn.indexOf('\n## ', start + marker.length);
    const section = checkedIn.slice(start, end === -1 ? checkedIn.length : end);
    for (const heading of headings) {
      assert.ok(section.includes(heading), `${control.code} missing ${heading}`);
    }
    assert.match(section, /```(?:ts|js|python|hcl|yaml|md|html)\n[\s\S]+?\n```/);
  }
});

test('remediation output contains no source-content keys', () => {
  for (const key of ['snippet:', 'value:', 'content:', 'context:', 'raw:', 'match:']) {
    assert.ok(!checkedIn.includes(key), `forbidden key ${key} in remediation.md`);
  }
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/remediation.test.mjs
```

Expected RED: `Cannot find module '../scripts/generate-remediation-v2.mjs'` and `ENOENT: ... templates/remediation.md`.

- [x] **Step 3: Write the generator**

Create `packages/rule-packs/scripts/generate-remediation-v2.mjs`. The `SNIPPETS` map must contain one entry for every distinct `remediationKey` in Task 1; there are 46 unique keys covering 47 controls (`enable-encryption-at-rest` is shared by two controls), and each value is the concrete code shown in the fenced block.

```js
import { writeFile } from 'node:fs/promises';

const SNIPPETS = {
  'publish-privacy-notice': { lang: 'md', code: '# Privacy notice\nPublished at: {{NOTICE_URL}}' },
  'complete-notice-content': { lang: 'md', code: 'Purposes: {{PURPOSES}}\nRights: {{RIGHTS}}' },
  'gate-processing-on-consent': { lang: 'python', code: 'if not consent.granted("{{PURPOSE}}"):\n    return None' },
  'gate-web-forms-on-consent': { lang: 'ts', code: 'if (!consent.granted("{{PURPOSE}}")) return;' },
  'remove-unnecessary-fields': { lang: 'ts', code: 'const allowedFields = ["email"] as const;' },
  'add-consent-withdrawal': { lang: 'python', code: 'def withdraw(consent_id: str) -> None:\n    store.record_withdrawal(consent_id)' },
  'record-lawful-basis': { lang: 'python', code: 'processing.lawful_basis = "consent"' },
  'enable-encryption-at-rest': { lang: 'hcl', code: 'server_side_encryption_configuration {\n  rule {\n    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }\n  }\n}' },
  'restrict-public-access': { lang: 'hcl', code: 'resource "aws_s3_bucket_public_access_block" "personal_data" {\n  bucket = aws_s3_bucket.personal_data.id\n  block_public_acls = true\n}' },
  'remove-hardcoded-secrets': { lang: 'python', code: 'api_key = os.environ["API_KEY"]' },
  'redact-personal-data-from-logs': { lang: 'python', code: 'logger.info("user_id=%s", hash_user_id(user.id))' },
  'add-audit-logging': { lang: 'python', code: 'audit.log(event="personal_data_read", actor=actor_id)' },
  'add-backup-policy': { lang: 'yaml', code: 'backup:\n  retentionDays: 30\n  encrypted: true' },
  'enforce-retention-limit': { lang: 'python', code: 'delete_expired(rows, ttl_days=30)' },
  'enforce-password-policy': { lang: 'yaml', code: 'passwordPolicy:\n  minLength: 12\n  rotateDays: 90' },
  'secure-session-config': { lang: 'ts', code: 'cookie: { secure: true, httpOnly: true, sameSite: "strict" }' },
  'configure-security-headers': { lang: 'ts', code: 'app.use(helmet({ hsts: true, contentSecurityPolicy: { useDefaults: true } }))' },
  'harden-cookie-flags': { lang: 'js', code: 'res.cookie("session_id", token, { secure: true, httpOnly: true, sameSite: "strict" })' },
  'enable-cmp-consent-mode': { lang: 'js', code: 'const cmpConfig = { enabled: true, mode: "advanced" };' },
  'pin-dependency-versions': { lang: 'yaml', code: 'dependencies:\n  lodash: "4.17.21"' },
  'apply-framework-safeguards': { lang: 'js', code: 'app.use(helmet());' },
  'add-breach-alert-hook': { lang: 'python', code: 'on_security_event(notify_incident)' },
  'publish-breach-runbook': { lang: 'md', code: '# Breach runbook\nOwner: {{INCIDENT_OWNER}}' },
  'document-breach-intimation': { lang: 'md', code: 'Intimation window: {{INTIMATION_WINDOW}}' },
  'route-security-events': { lang: 'python', code: 'security_events.subscribe(notify_incident)' },
  'implement-hard-delete': { lang: 'python', code: 'db.execute("DELETE FROM users WHERE id = %s", (user_id,))' },
  'publish-retention-schedule': { lang: 'md', code: '| Data | Retention |\n|---|---|\n| {{DATA_TYPE}} | {{DAYS}} days |' },
  'publish-privacy-contact': { lang: 'md', code: 'Data protection contact: {{CONTACT_EMAIL}}' },
  'publish-grievance-mechanism': { lang: 'md', code: 'Grievance intake: {{GRIEVANCE_URL}}' },
  'add-grievance-redressal': { lang: 'ts', code: 'await grievanceStore.create({ principalId, text });' },
  'add-child-consent-gate': { lang: 'python', code: 'if subject.is_minor and not guardian_consent: return reject()' },
  'add-age-gate': { lang: 'ts', code: 'if (age < 18) showAgeGate();' },
  'document-sdf-governance': { lang: 'md', code: 'DPIA reference: {{DPIA_URL}}' },
  'add-access-export': { lang: 'ts', code: 'router.get("/dsr/export", requirePrincipal, exportPersonalData);' },
  'add-erasure-endpoint': { lang: 'ts', code: 'router.post("/dsr/erase", requirePrincipal, erasePersonalData);' },
  'restrict-cross-border-transfer': { lang: 'yaml', code: 'transfer:\n  allowedRegions: [ap-south-1]' },
  'pin-india-region': { lang: 'hcl', code: 'region = "ap-south-1"' },
  'publish-processor-list': { lang: 'md', code: '| Processor | Purpose |\n|---|---|\n| {{PROCESSOR}} | {{PURPOSE}} |' },
  'document-sdk-purpose': { lang: 'js', code: 'initAnalytics({ purpose: "{{PURPOSE}}", consentRequired: true });' },
  'review-cms-plugins': { lang: 'yaml', code: 'allowedPlugins:\n  - name: "{{PLUGIN}}"\n    personalData: false' },
  'link-privacy-notice-from-forms': { lang: 'html', code: '<a href="/privacy-notice">Privacy notice</a>' },
  'document-pii-literals': { lang: 'ts', code: 'const FIELD_PURPOSE: Record<string, string> = { email: "{{PURPOSE}}" };' },
  'add-form-purpose': { lang: 'html', code: '<p>Purpose: {{PURPOSE}}</p>' },
  'add-privacy-artefacts': { lang: 'md', code: 'docs/privacy/notice.md\ndocs/privacy/dsr-sop.md' },
  'publish-dsr-sop': { lang: 'md', code: '# DSR SOP\nStep 1: verify {{PRINCIPAL_ID}}' },
  'enforce-tls': { lang: 'ts', code: 'app.use(helmet({ hsts: { maxAge: 15552000 } }));' },
};

export function generateRemediationV2(controls) {
  const sections = [];
  for (const control of controls) {
    if (control.evidenceMode === 'manual' || control.evidenceMode === 'attestation') continue;
    const snippet = SNIPPETS[control.remediationKey];
    if (snippet === undefined) {
      throw new Error(`missing remediation snippet for ${control.code}`);
    }
    sections.push(`## ${control.remediationKey}\n
### Summary
${control.title}.

### Why it matters
This control is part of the readiness assessment for ${control.actRef}.

### Steps
1. Locate the evidence referenced by ${control.code}.
2. Apply the change shown below.
3. Re-run the scan and confirm the cited gap is gone.

### Code example
\`\`\`${snippet.lang}
${snippet.code}
\`\`\`

### Verification
Confirm the changed path appears in the next scan with a recorded safeguard or no cited gap.

### Effort
Small to medium, depending on the number of affected paths.

### Owner
{{SERVICE_OWNER}}

### References
${control.legalRefs.join(', ')}

### Framework snippets
Use the same change in the matching framework path listed in \`ecosystem_patterns/web.yaml\`.
`);
  }
  return `# Structured remediation library\n\nGenerated by \`pnpm --filter @dpdpa/rule-packs remediation:v2\`.\n\n${sections.join('\n')}`;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFile } = await import('node:fs/promises');
  const YAML = (await import('yaml')).default;
  const controls = YAML.parse(
    await readFile(new URL('../v2/controls.yaml', import.meta.url), 'utf8'),
  ).controls;
  await writeFile(
    new URL('../v2/templates/remediation.md', import.meta.url),
    generateRemediationV2(controls),
    'utf8',
  );
  process.stdout.write(`remediation.md: ${controls.length} controls\n`);
}
```

Add to `packages/rule-packs/package.json` scripts:

```json
"remediation:v2": "node scripts/generate-remediation-v2.mjs"
```

- [x] **Step 4: Generate the file and run GREEN**

```bash
pnpm --filter @dpdpa/rule-packs remediation:v2
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs exec node --test test/remediation.test.mjs
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: stdout `remediation.md: 47 controls`; 3 remediation tests pass; full gates pass. If the generator throws `missing remediation snippet for <code>`, add a concrete snippet for that exact key to `SNIPPETS` before rerunning; never emit an empty code block.

- [x] **Step 5: Commit**

```bash
git add packages/rule-packs/scripts/generate-remediation-v2.mjs packages/rule-packs/v2/templates/remediation.md packages/rule-packs/test/remediation.test.mjs packages/rule-packs/package.json packages/rule-packs/v2/manifest.yaml
git commit -m "feat(rule-packs): add structured remediation with concrete snippets"
```

---

### Task 8: Fill the five readiness document templates

**Files:**
- Create: `packages/rule-packs/v2/templates/privacy-notice.md`
- Create: `packages/rule-packs/v2/templates/breach-runbook.md`
- Create: `packages/rule-packs/v2/templates/dsr-sop.md`
- Create: `packages/rule-packs/v2/templates/retention-schedule.md`
- Create: `packages/rule-packs/v2/templates/processor-list.md`
- Create: `packages/rule-packs/test/document-templates.test.mjs`

**Interfaces:**
- Consumes: `templates/*.md` checksum allowance in `validatePackV2`; control codes from Task 1.
- Produces: five placeholder-only templates consumed by the Phase E fix-plan/report views.

- [x] **Step 1: Write the failing template test**

```js
// packages/rule-packs/test/document-templates.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'v2', 'templates');

const REQUIRED = {
  'privacy-notice.md': ['# Privacy notice', '{{ORGANISATION_NAME}}', 'Purposes', 'Data principal rights'],
  'breach-runbook.md': ['# Breach runbook', '{{INCIDENT_OWNER}}', 'Detection', 'Intimation'],
  'dsr-sop.md': ['# Data subject request SOP', '{{REQUEST_ID}}', 'Verify identity', 'Close request'],
  'retention-schedule.md': ['# Retention schedule', '{{DATA_TYPE}}', 'Retention period', 'Disposal'],
  'processor-list.md': ['# Processor list', '{{PROCESSOR_NAME}}', 'Purpose', 'Location'],
};

for (const [name, needles] of Object.entries(REQUIRED)) {
  test(`${name} has the required readiness sections`, async () => {
    const raw = await readFile(join(templates, name), 'utf8');
    for (const needle of needles) {
      assert.ok(raw.includes(needle), `${name} missing ${needle}`);
    }
  });
}

test('templates contain placeholders but no source or matched values', async () => {
  for (const name of Object.keys(REQUIRED)) {
    const raw = await readFile(join(templates, name), 'utf8');
    assert.match(raw, /\{\{[A-Z_]+\}\}/);
    for (const banned of ['CANARY_LOCAL_FIXTURE', 'password=', 'api_key=']) {
      assert.ok(!raw.includes(banned), `${name} contains ${banned}`);
    }
  }
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/rule-packs exec node --test test/document-templates.test.mjs
```

Expected RED: `ENOENT: no such file or directory, open '.../v2/templates/privacy-notice.md'`.

- [x] **Step 3: Write the five templates**

```md
<!-- packages/rule-packs/v2/templates/privacy-notice.md -->
# Privacy notice

Organisation: {{ORGANISATION_NAME}}
Contact: {{CONTACT_EMAIL}}

## Purposes
{{PURPOSE_LIST}}

## Categories of personal data
{{DATA_CATEGORIES}}

## Data principal rights
Access, correction, erasure, and grievance contact: {{GRIEVANCE_URL}}
```

```md
<!-- packages/rule-packs/v2/templates/breach-runbook.md -->
# Breach runbook

Incident owner: {{INCIDENT_OWNER}}

## Detection
Record the first signal, time, and affected system: {{DETECTION_SOURCE}}

## Containment
Contain access and preserve the evidence trail: {{CONTAINMENT_STEP}}

## Intimation
Notify the named owner within {{INTIMATION_WINDOW}} and record the acknowledgement.
```

```md
<!-- packages/rule-packs/v2/templates/dsr-sop.md -->
# Data subject request SOP

Request id: {{REQUEST_ID}}

## Verify identity
Confirm the requester with {{IDENTITY_METHOD}}.

## Fulfil
Export or correct {{DATA_CATEGORIES}} for the verified principal.

## Close request
Record the closure decision and date in {{REQUEST_LOG}}.
```

```md
<!-- packages/rule-packs/v2/templates/retention-schedule.md -->
# Retention schedule

| Data type | Retention period | Disposal |
|---|---|---|
| {{DATA_TYPE}} | {{RETENTION_DAYS}} days | {{DISPOSAL_METHOD}} |
```

```md
<!-- packages/rule-packs/v2/templates/processor-list.md -->
# Processor list

| Processor | Purpose | Location |
|---|---|---|
| {{PROCESSOR_NAME}} | {{PROCESSOR_PURPOSE}} | {{PROCESSOR_LOCATION}} |
```

- [x] **Step 4: Regenerate the manifest and run GREEN**

```bash
pnpm --filter @dpdpa/rule-packs manifest:v2
pnpm --filter @dpdpa/rule-packs validate
pnpm --filter @dpdpa/rule-packs exec node --test test/document-templates.test.mjs
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: validator issues `[]`; 6 template tests pass; full gates pass.

- [x] **Step 5: Commit**

```bash
git add packages/rule-packs/v2/templates packages/rule-packs/v2/manifest.yaml packages/rule-packs/test/document-templates.test.mjs
git commit -m "feat(rule-packs): fill readiness document templates"
```

---

### Task 9: Compute and persist the consent-gating ratio

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/consent-gating.ts`
- Create: `apps/orchestrator/test/consent-gating.test.ts`
- Modify: `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`
- Modify: `apps/orchestrator/src/modules/scans/scans.service.ts`
- Create: `apps/orchestrator/test/phase-d-consent-wiring.test.ts`

**Interfaces:**
- Consumes: `inventoryFactSchema` and `DetectorStatus` from `@dpdpa/contracts`; Phase C `inventory` array on the completion payload; `buildDetectorStatuses` from `control-evaluator.ts`; `scans.consentGatingRatio` column from Phase B.
- Produces: `computeConsentGatingRatio(input: ConsentGatingInput): number | null`; `MapAndScoreResult.consentGatingRatio: number | null`; persisted `scans.consent_gating_ratio`; `assessment.consentGatingRatio` no longer hardcoded to `null`.

- [x] **Step 1: Write the failing pure-function test**

```ts
// apps/orchestrator/test/consent-gating.test.ts
import { describe, expect, it } from 'vitest';
import { computeConsentGatingRatio } from '../src/modules/scoring/consent-gating.js';

const fact = (key: string, signals: Array<Record<string, unknown>>) => ({
  key,
  signals,
  detectedAt: '2026-11-27T10:00:00.000Z',
});

describe('computeConsentGatingRatio', () => {
  it('counts unique personal-data paths and matches gates by path', () => {
    const ratio = computeConsentGatingRatio({
      facts: {
        inventory: [
          fact('form_scan', [
            { detector: 'form_scan', kind: 'route', path: 'src/signup.ts', line: 12, token: 'email' },
            { detector: 'form_scan', kind: 'field', path: 'src/signup.ts', line: 13, token: 'phone' },
            { detector: 'form_scan', kind: 'route', path: 'src/contact.ts', line: 8, token: 'email' },
          ]),
          fact('cmp_scan', [
            { detector: 'cmp_scan', kind: 'route', path: 'src/signup.ts', line: 4, token: 'consent_gate' },
          ]),
        ],
      },
      detectorStatuses: { form_scan: 'completed', cmp_scan: 'completed' },
    });
    expect(ratio).toBe(0.5);
  });

  it('returns null when a required detector did not complete', () => {
    const ratio = computeConsentGatingRatio({
      facts: {
        inventory: [
          fact('form_scan', [
            { detector: 'form_scan', kind: 'route', path: 'src/signup.ts', line: 12, token: 'email' },
          ]),
        ],
      },
      detectorStatuses: { form_scan: 'completed', cmp_scan: 'failed' },
    });
    expect(ratio).toBeNull();
  });

  it('returns null when no personal-data collection surface was detected', () => {
    const ratio = computeConsentGatingRatio({
      facts: { inventory: [] },
      detectorStatuses: { form_scan: 'completed', cmp_scan: 'completed' },
    });
    expect(ratio).toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/consent-gating.test.ts
```

Expected RED: `Cannot find module '../src/modules/scoring/consent-gating.js'`.

- [x] **Step 3: Implement the pure function**

```ts
// apps/orchestrator/src/modules/scoring/consent-gating.ts
import { inventoryFactSchema, type DetectorStatus, type InventoryFact } from '@dpdpa/contracts';

export interface ConsentGatingInput {
  facts: unknown;
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
}

const PII_TOKENS = new Set(['email', 'phone', 'aadhaar', 'pan', 'address', 'dob']);
const GATE_TOKEN = 'consent_gate';

function inventoryFrom(value: unknown): InventoryFact[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const parsed = inventoryFactSchema.array().safeParse(record.inventory ?? []);
  return parsed.success ? parsed.data : [];
}

export function computeConsentGatingRatio(input: ConsentGatingInput): number | null {
  if (input.detectorStatuses.form_scan !== 'completed') return null;
  if (input.detectorStatuses.cmp_scan !== 'completed') return null;

  const facts = inventoryFrom(input.facts);
  const surfaces = new Set<string>();
  const gates = new Set<string>();

  for (const item of facts) {
    if (item.key === 'form_scan') {
      for (const signal of item.signals) {
        if ((signal.kind === 'route' || signal.kind === 'field') && PII_TOKENS.has(signal.token)) {
          surfaces.add(signal.path);
        }
      }
    }
    if (item.key === 'cmp_scan' || item.key === 'mechanism_scan') {
      for (const signal of item.signals) {
        if (signal.token === GATE_TOKEN) gates.add(signal.path);
      }
    }
  }

  if (surfaces.size === 0) return null;
  let gated = 0;
  for (const path of surfaces) if (gates.has(path)) gated += 1;
  return Math.round((gated / surfaces.size) * 10000) / 10000;
}
```

- [x] **Step 4: Run the pure-function test GREEN**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/consent-gating.test.ts
```

Expected GREEN: 3 tests pass.

- [x] **Step 5: Write the failing wiring test**

```ts
// apps/orchestrator/test/phase-d-consent-wiring.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Phase D consent-gating wiring', () => {
  it('returns the ratio from mapAndScore and writes it with the scan', () => {
    const scoring = read('src/modules/scoring/scan-scoring.service.ts');
    const scans = read('src/modules/scans/scans.service.ts');
    expect(scoring).toContain('consentGatingRatio: number | null;');
    expect(scoring).toContain("import { computeConsentGatingRatio } from './consent-gating.js';");
    expect(scoring).toMatch(/const consentGatingRatio = isScoringV2\(scoringVersion\)/);
    expect(scoring).toMatch(/^\s+consentGatingRatio,$/m);
    expect(scans).toMatch(
      /consentGatingRatio:\s*scored\.consentGatingRatio === null\s*\? null\s*: new Prisma\.Decimal\(scored\.consentGatingRatio\)/,
    );
  });

  it('exposes the stored ratio in the assessment summary', () => {
    const scans = read('src/modules/scans/scans.service.ts');
    expect(scans).not.toContain('consentGatingRatio: null,');
    expect(scans).toMatch(
      /consentGatingRatio:\s*scan\.consentGatingRatio === null\s*\? null\s*: Number\(scan\.consentGatingRatio\),/,
    );
  });
});
```

- [x] **Step 6: Run the wiring test to verify it fails**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/phase-d-consent-wiring.test.ts
```

Expected RED: `AssertionError: expected '...' to contain 'consentGatingRatio: number | null;'`.

- [x] **Step 7: Wire the ratio into scoring and persistence**

In `apps/orchestrator/src/modules/scoring/scan-scoring.service.ts`:

1. Add the import after the `control-evaluator.js` import:

```ts
import { computeConsentGatingRatio } from './consent-gating.js';
```

2. Add this field to `MapAndScoreResult` after `gradeWithheldReason`:

```ts
  consentGatingRatio: number | null;
```

3. Inside `mapAndScore`, after the existing `const scoringVersion = scoringVersionForNewScan(...)` declaration (three lines ending in `);`) and before `const evaluation = evaluateControls({`, add:

```ts
    const detectorStatuses = buildDetectorStatuses(coverage);
    const consentGatingRatio = isScoringV2(scoringVersion)
      ? computeConsentGatingRatio({ facts, detectorStatuses })
      : null;
```

   Then change the `evaluateControls` argument `detectorStatuses: buildDetectorStatuses(coverage),` to `detectorStatuses,` so the statuses are computed once and reused.

4. In the object returned at the end of `mapAndScore`, add after `gradeWithheldReason`:

```ts
      consentGatingRatio,
```

In `apps/orchestrator/src/modules/scans/scans.service.ts`:

5. In `completeScan`'s `scans.update` call, after the `gradeWithheldReason` line, add:

```ts
          consentGatingRatio:
            scored.consentGatingRatio === null
              ? null
              : new Prisma.Decimal(scored.consentGatingRatio),
```

6. In `toAssessment`, replace `consentGatingRatio: null,` with:

```ts
    consentGatingRatio:
      scan.consentGatingRatio === null ? null : Number(scan.consentGatingRatio),
```

Keep the formatting of the surrounding file; run `pnpm exec prettier --write` on the two files if the gate reports a formatting diff.

- [x] **Step 8: Run GREEN and the full gates**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/consent-gating.test.ts test/phase-d-consent-wiring.test.ts
pnpm lint && pnpm typecheck && pnpm test
```

Expected GREEN: 5 orchestrator tests pass; full gates pass.

- [x] **Step 9: Commit**

```bash
git add apps/orchestrator/src/modules/scoring/consent-gating.ts apps/orchestrator/src/modules/scoring/scan-scoring.service.ts apps/orchestrator/src/modules/scans/scans.service.ts apps/orchestrator/test/consent-gating.test.ts apps/orchestrator/test/phase-d-consent-wiring.test.ts
git commit -m "feat(scoring): persist consent-gating ratio for v2 scans"
```

---

### Task 10: Phase D exit gate, fresh review, and final commit

**Files:**
- Create: `apps/orchestrator/test/phase-d-exit-gate.test.ts`
- Modify: `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-d.md` (check boxes and evidence)
- Create: `.superpowers/sdd/2026-11-27-dpdp-evidence-backed-readiness-phase-d/progress.md` (local, gitignored)

**Interfaces:**
- Consumes: every artifact from Tasks 1–9; `loadRulePack` from `rule-pack.loader.ts`; `validatePackV2` and `buildManifestV2` from Phase B; fixture harnesses from Tasks 5 and 6.
- Produces: recorded Phase D exit-gate evidence, fresh-review outcome, and one implementation commit set on `feat/dpdp-readiness-phase-d`.

- [x] **Step 1: Write the failing exit-gate test**

```ts
// apps/orchestrator/test/phase-d-exit-gate.test.ts
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { validatePackV2 } from '@dpdpa/contracts';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const packDir = join(repo, 'packages', 'rule-packs');
const v2 = join(packDir, 'v2');

function listV2Files(dir = v2, base = v2): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return listV2Files(full, base);
      const rel = relative(base, full).split('\\').join('/');
      return rel === 'manifest.yaml' ? [] : [rel];
    })
    .sort();
}

function readYaml(relativePath: string): unknown {
  return YAML.parse(readFileSync(join(v2, ...relativePath.split('/')), 'utf8'));
}

describe('Phase D exit gate', () => {
  it('shipped v2 pack validates with no issues and at least 45 controls', () => {
    const supplied = listV2Files().map((path) => {
      const bytes = readFileSync(join(v2, ...path.split('/')));
      return {
        path,
        value: path.endsWith('.yaml') ? YAML.parse(bytes.toString('utf8')) : null,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    expect(validatePackV2({ files: supplied, manifest: readYaml('manifest.yaml') })).toEqual([]);
    const controls = readYaml('controls.yaml') as { controls: unknown[] };
    expect(controls.controls.length).toBeGreaterThanOrEqual(45);
  });

  it('checksum manifest covers exactly the shipped v2 files', () => {
    const manifest = readYaml('manifest.yaml') as {
      files: Array<{ path: string; sha256: string }>;
    };
    expect(manifest.files.map((file) => file.path)).toEqual(listV2Files());
    for (const file of manifest.files) {
      const bytes = readFileSync(join(v2, ...file.path.split('/')));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
  });

  it('v1 pack still loads with its legacy scoring version', async () => {
    const pack = await loadRulePack(packDir);
    expect(pack.pack).toBe('dpdpa-2026.10.6');
    expect(pack.scoringVersion).toBe('1.0.0');
    expect(pack.controls.length).toBeGreaterThanOrEqual(19);
  });

  it('CMP GTM and header fixtures pass with pinned scanner rules', () => {
    const semgrep = execFileSync('python3', ['tests/semgrep/check.py'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(semgrep).toMatch(/^Semgrep fixtures passed /m);
    const checkov = execFileSync(
      'python3',
      ['-m', 'pytest', 'apps/scan-runner/tests/test_custom_checkov_policies.py', '-q'],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(checkov).toMatch(/3 passed/);
  });

  it('no forbidden product wording is present in v2 pack content', () => {
    const forbidden = ['compliant', 'non-compliant', 'violation of the Act', 'certified'];
    for (const path of [
      'controls.yaml', 'detectors.yaml', 'templates/remediation.md',
      'templates/privacy-notice.md', 'templates/breach-runbook.md',
      'templates/dsr-sop.md', 'templates/retention-schedule.md',
      'templates/processor-list.md',
    ]) {
      const raw = readFileSync(join(v2, ...path.split('/')), 'utf8').toLowerCase();
      for (const word of forbidden) {
        expect(raw.includes(word), `${path} contains forbidden wording: ${word}`).toBe(false);
      }
    }
  });
});
```

The orchestrator test script is `vitest run`, so this file uses Vitest imports directly and is invoked with `pnpm --filter @dpdpa/orchestrator exec vitest run test/phase-d-exit-gate.test.ts`. Do not weaken any assertion.

- [x] **Step 2: Run the exit gate to verify it fails early, then GREEN after Tasks 1–9**

```bash
pnpm --filter @dpdpa/orchestrator exec vitest run test/phase-d-exit-gate.test.ts
```

Expected RED before implementation: `ENOENT` for `v2/templates/remediation.md` or `expected 20 to be greater than or equal to 45`.  
Expected GREEN after Tasks 1–9: 5 exit-gate tests pass; fixture output includes `Semgrep fixtures passed` and `3 passed`.

- [x] **Step 3: Run every gate and record exact output**

```bash
pnpm --filter @dpdpa/rule-packs test
pnpm --filter @dpdpa/rule-packs validate
python3 tests/semgrep/check.py
python3 -m pytest apps/scan-runner/tests/test_custom_rule_pins.py apps/scan-runner/tests/test_custom_checkov_policies.py -q
python3 scripts/check_versions.py
pnpm --filter @dpdpa/orchestrator exec vitest run test/rule-pack.loader.test.ts test/phase-d-exit-gate.test.ts test/phase-d-consent-wiring.test.ts test/consent-gating.test.ts
pnpm lint && pnpm typecheck && pnpm test
git diff --check
```

Expected: all commands exit 0. Record counts and exact command output in `.superpowers/sdd/2026-11-27-dpdp-evidence-backed-readiness-phase-d/progress.md`. Full-gate logs may contain intentional error-path fixtures; those are not failures.

- [x] **Step 4: Fresh-context review**

Dispatch one fresh-context general subagent with read-only tools. Prompt:

```text
Review ONLY the Phase D diff on branch feat/dpdp-readiness-phase-d relative to its Phase C base. Do not modify files. Check for Required defects: (1) v2 controls <45, duplicate codes, draft-style codes, or missing legal refs; (2) a FAIL-capable control without a concrete remediation snippet; (3) manifest checksum drift or a v2 file not covered by manifest.yaml; (4) source/file content, canary, secret values, or matched values in pack files, fixtures, logs, or callbacks; (5) custom Semgrep/Checkov rules not pinned to semgrep==1.95.0/checkov==3.2.0 or fixtures without positive and negative cases; (6) consent-gating ratio not persisted on scans or not exposed in assessment; (7) any change to Phase B contracts, v1 loader, scoring.yaml, legacy scores, image pins, infra/, or deployment config; (8) forbidden product wording outside quoted disclaimers. Return findings as Required or Advisory with exact file paths. Do not approve merge, push, or deploy.
```

Fix every Required finding with its own RED test, GREEN implementation, and full gate rerun before proceeding. Advisory findings go into the local ledger only.

- [x] **Step 5: Update the plan checkboxes and commit the evidence**

Mark every completed checkbox in this plan file as `[x]`. Then:

```bash
git add docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-d.md
git commit -m "docs(plan): record Phase D completion evidence"
```

- [x] **Step 6: Report and request explicit approval**

Report: branch name, commit SHAs, exact gate counts, fixture results, and the fresh-review outcome. Ask explicitly before any push, PR creation, rebase, merge, tag, deploy, image-pin update, or `infra/` change. Do not perform any of those actions in this task.

---

## Definition of done

- [x] Tasks 1–10 are GREEN with RED evidence recorded in the local ledger.
- [x] `packages/rule-packs/v2/controls.yaml` contains at least 45 unique valid v2 control codes and no draft-style codes.
- [x] CMP, cookie, security-header, SDK, ecosystem, region, field, and mechanism catalogues contain the exact keys tested in Tasks 2 and 3.
- [x] All eight second-phase inventory detectors and their mappings are declared; no orphan detector or control remains.
- [x] Custom Semgrep rules and Checkov policies are pinned to `1.95.0` and `3.2.0`; positive and negative fixtures pass.
- [x] Every FAIL-capable control has a structured remediation section with at least one concrete fenced-code snippet.
- [x] Privacy notice, breach runbook, DSR SOP, retention schedule, and processor list templates are filled with placeholders only.
- [x] `computeConsentGatingRatio` returns `null` for incomplete detectors and no surfaces, and a four-decimal ratio otherwise; the ratio is persisted on `scans.consent_gating_ratio` and exposed as `assessment.consentGatingRatio`.
- [x] `pnpm --filter @dpdpa/rule-packs validate` reports `issues: []`; regenerating `v2/manifest.yaml` changes only `generatedAt` and leaves the file list and every SHA-256 checksum unchanged.
- [x] CMP/GTM/header fixture commands exit 0.
- [x] v1 pack loads with 19+ controls and `scoringVersion: '1.0.0'`; `scoring.yaml` and legacy scores are unchanged.
- [x] `pnpm lint && pnpm typecheck && pnpm test`, rule-pack tests, and Python tests are green at every commit boundary.
- [x] No canary, source content, matched value, secret value, or pilot data entered the pack, DB, callbacks, logs, or API responses.
- [x] Fresh-context review has no Required defects.
- [x] No push, PR creation, merge, deploy, image-pin change, or `infra/` change occurred without explicit user approval.
