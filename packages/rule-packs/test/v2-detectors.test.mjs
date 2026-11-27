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
const mappingsDoc = YAML.parse(await readFile(join(packDir, 'mappings', 'inventory.yaml'), 'utf8'));

test('all detector entries satisfy the v2 contract', () => {
  assert.doesNotThrow(() => detectorsFileV2Schema.parse(detectorsDoc));
});

test('second-phase web-surface detectors are declared exactly once', () => {
  const ids = detectorsDoc.detectors.map((detector) => detector.id);
  assert.equal(new Set(ids).size, ids.length);
  const required = [
    'dep_scan',
    'sdk_init_scan',
    'region_scan',
    'pii_literal_scan',
    'cookie_scan',
    'cmp_scan',
    'header_scan',
    'cms_scan',
  ];
  for (const id of required) {
    assert.ok(ids.includes(id), `missing detector ${id}`);
    assert.ok(INVENTORY_MODULE_KEYS.includes(id));
  }
  const allowedInputs = new Set([
    'source',
    'dependencies',
    'config',
    'artefacts',
    'headers',
    'runtime',
  ]);
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
