// packages/rule-packs/test/document-templates.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'v2', 'templates');

const REQUIRED = {
  'privacy-notice.md': [
    '# Privacy notice',
    '{{ORGANISATION_NAME}}',
    'Purposes',
    'Data principal rights',
  ],
  'breach-runbook.md': ['# Breach runbook', '{{INCIDENT_OWNER}}', 'Detection', 'Intimation'],
  'dsr-sop.md': [
    '# Data subject request SOP',
    '{{REQUEST_ID}}',
    'Verify identity',
    'Close request',
  ],
  'retention-schedule.md': [
    '# Retention schedule',
    '{{DATA_TYPE}}',
    'Retention period',
    'Disposal',
  ],
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
