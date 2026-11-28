import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const readYaml = (name) => YAML.parse(readFileSync(join(root, name), 'utf8'));

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
  const codes = controls.controls.map((control) => control.code);
  for (const code of EXPECTED_CODES) {
    assert.ok(codes.includes(code), `Phase C control ${code} was dropped by Phase D`);
  }
  const detectorIds = detectors.detectors.map((detector) => detector.id);
  for (const id of EXPECTED_DETECTORS) {
    assert.ok(detectorIds.includes(id), `Phase C detector ${id} was dropped by Phase D`);
  }
  const dictionaryKeys = dictionary.entries.map((entry) => entry.key);
  for (const key of ['email', 'phone', 'full_name', 'address', 'date_of_birth', 'aadhaar']) {
    assert.ok(dictionaryKeys.includes(key), `Phase C field ${key} was dropped by Phase D`);
  }

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

test('Phase D secret evidence rule and Phase E attestation mapping coexist', () => {
  const controls = controlsFileV2Schema.parse(readYamlResult('controls.yaml'));
  const secret = controls.controls.find((control) => control.code === 'DPDPA-8.4-SECRET-01');

  assert.ok(secret, 'Phase D secret control must remain in the catalogue');
  assert.deepEqual(
    secret.violationRules.map((rule) => rule.detector),
    ['gitleaks_scan'],
    'Phase D violation evidence must be preserved',
  );
  assert.equal(secret.violationRules[0]?.provenance.search, 'generic-api-key');
  assert.equal(
    secret.attestationKey,
    'secrets.managed_store',
    'Phase E must map the attestation key onto the existing control',
  );
});

function readYamlResult(name) {
  // Read synchronously so every test gets a fresh object and node:test cannot
  // observe an uninitialised module-level cache.
  return readYaml(name);
}
