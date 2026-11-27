import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildManifestV2 } from '../scripts/generate-manifest-v2.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packDir = join(root, 'v2');
const REQUIRED_PATHS = [
  'controls.yaml',
  'detectors.yaml',
  'mappings/inventory.yaml',
  'commencement.yaml',
  'penalties.yaml',
  'india-regions.yaml',
  'sdk_catalog.yaml',
  'field_dictionary.yaml',
  'mechanism_catalog.yaml',
  'cmp_catalog.yaml',
  'cookie_catalog.yaml',
  'security_headers.yaml',
  'ecosystem_patterns/web.yaml',
  'templates/README.md',
  'manifest.yaml',
];

function parseManifest(raw) {
  const files = [];
  let current = null;
  for (const line of raw.split('\n')) {
    const path = /^\s*- path: (\S+)\s*$/.exec(line);
    if (path) {
      current = { path: path[1] };
      files.push(current);
      continue;
    }
    const hash = /^\s*sha256: ([0-9a-f]{64})\s*$/.exec(line);
    if (hash && current) current.sha256 = hash[1];
  }
  return { pack: /^pack: (\S+)$/m.exec(raw)?.[1], files };
}

test('v2 pack contains the required file structure', async () => {
  for (const path of REQUIRED_PATHS) {
    const info = await stat(join(packDir, ...path.split('/')));
    assert.ok(info.isFile(), `${path} must be a file`);
  }
});

test('every v2 pack file is manifest-covered with a matching hash', async () => {
  const raw = await readFile(join(packDir, 'manifest.yaml'), 'utf8');
  const manifest = parseManifest(raw);
  assert.equal(manifest.pack, 'dpdpa-2026.11.0');
  assert.match(raw, /^generatedAt: '/m);

  const built = await buildManifestV2(packDir);
  const listed = manifest.files.map((file) => file.path).sort();
  const generated = built.files.map((file) => file.path).sort();
  assert.deepEqual(listed, generated);

  for (const file of manifest.files) {
    const digest = createHash('sha256')
      .update(await readFile(join(packDir, ...file.path.split('/'))))
      .digest('hex');
    assert.equal(file.sha256, digest, `${file.path} hash mismatch`);
  }
});

test('manifest generation is deterministic for file entries', async () => {
  const first = await buildManifestV2(packDir);
  const second = await buildManifestV2(packDir);
  assert.deepEqual(first.files, second.files);
  assert.equal(first.pack, 'dpdpa-2026.11.0');
  assert.ok(
    first.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)),
    'all entries must be SHA-256 digests',
  );
  assert.ok(
    first.files.every((file) => !relative(packDir, join(packDir, file.path)).startsWith('..')),
    'all manifest paths must stay inside the pack',
  );
});

test('controls.yaml declares the v2 pack name', async () => {
  const raw = await readFile(join(packDir, 'controls.yaml'), 'utf8');
  assert.match(raw, /^pack: dpdpa-2026\.11\.0$/m);
});

test('helper uses POSIX-style relative paths', async () => {
  const built = await buildManifestV2(packDir);
  assert.ok(
    built.files.every((file) => !file.path.includes('\\')),
    'paths use forward slashes',
  );
});
