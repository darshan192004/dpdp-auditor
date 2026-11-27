// packages/rule-packs/test/custom-semgrep-rules.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import YAML from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
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
  const raw = await readFile(join(repoRoot, 'tests', 'semgrep', 'dpdpa.v2-web.js'), 'utf8');
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
