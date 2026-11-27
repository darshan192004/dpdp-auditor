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
