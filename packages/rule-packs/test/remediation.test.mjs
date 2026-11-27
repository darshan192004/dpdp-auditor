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

test('remediation.md is deterministic and generated from controls', async () => {
  assert.equal(checkedIn, await generateRemediationV2(controlsDoc.controls));
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
