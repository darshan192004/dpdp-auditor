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
  'DPDPA-5-NOTICE-01',
  'DPDPA-5-NOTICE-CONTENT-01',
  'DPDPA-5-NOTICE-LINK-01',
  'DPDPA-5-ARTEFACT-01',
  'DPDPA-6-CONSENT-01',
  'DPDPA-6-CONSENT-GATE-01',
  'DPDPA-6-MIN-01',
  'DPDPA-6-WD-01',
  'DPDPA-7-LAWFUL-01',
  'DPDPA-6-THIRDPARTY-01',
  'DPDPA-6-SDK-01',
  'DPDPA-6-CMS-01',
  'DPDPA-6-PII-LITERAL-01',
  'DPDPA-6-FORM-PURPOSE-01',
  'DPDPA-6-DSR-SOP-01',
  'DPDPA-8.4-ENC-01',
  'DPDPA-8.4-TLS-01',
  'DPDPA-8.4-ACCESS-01',
  'DPDPA-8.4-SECRET-01', // gitleaks:allow control code, not a credential
  'DPDPA-8.4-LOG-01',
  'DPDPA-8.4-MON-01',
  'DPDPA-8.4-BACKUP-01',
  'DPDPA-8.4-RET-01',
  'DPDPA-8.4-PASSWORD-01',
  'DPDPA-8.4-SESSION-01',
  'DPDPA-8.4-HEADER-01',
  'DPDPA-8.4-COOKIE-01',
  'DPDPA-8.4-CMP-01',
  'DPDPA-8.4-DEP-01',
  'DPDPA-8.4-ECOSYSTEM-01',
  'DPDPA-8.5-BREACH-01',
  'DPDPA-8.5-RUNBOOK-01',
  'DPDPA-8.5-ENCRYPTION-01',
  'DPDPA-8.6-BREACH-01',
  'DPDPA-8.6-ALERT-01',
  'DPDPA-8.7-ERASE-01',
  'DPDPA-8.7-RET-01',
  'DPDPA-8.9-CONTACT-01',
  'DPDPA-8.10-GRIEVANCE-01',
  'DPDPA-9-CHILD-01',
  'DPDPA-9-AGEGATE-01',
  'DPDPA-10-SDF-01',
  'DPDPA-12-ACCESS-01',
  'DPDPA-13-ERASE-01',
  'DPDPA-13-GRIEVANCE-01',
  'DPDPA-16-XBORDER-01',
  'DPDPA-16-REGION-01',
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
