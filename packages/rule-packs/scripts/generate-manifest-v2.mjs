import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'v2');
export const DPDPA_PACK_V2_VERSION = 'dpdpa-2026.11.0';

async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)));
    } else if (entry.isFile()) {
      const rel = relative(base, full).split(sep).join('/');
      // CHANGELOG.md is Phase F documentation, not checksum-bearing pack content.
      if (rel !== 'manifest.yaml' && rel !== 'CHANGELOG.md') files.push(rel);
    }
  }
  return files.sort();
}

export async function buildManifestV2(root = DEFAULT_ROOT) {
  const files = [];
  for (const path of await listFiles(root)) {
    const sha256 = createHash('sha256')
      .update(await readFile(join(root, ...path.split('/'))))
      .digest('hex');
    files.push({ path, sha256 });
  }
  return { version: 1, pack: DPDPA_PACK_V2_VERSION, files };
}

export function renderManifestV2(manifest, generatedAt = new Date().toISOString()) {
  const body = manifest.files
    .map((file) => `  - path: ${file.path}\n    sha256: ${file.sha256}`)
    .join('\n');
  return `version: 1\npack: ${manifest.pack}\ngeneratedAt: '${generatedAt}'\nfiles:\n${body}\n`;
}

export async function generateManifestV2(root = DEFAULT_ROOT) {
  const manifest = await buildManifestV2(root);
  await writeFile(join(root, 'manifest.yaml'), renderManifestV2(manifest), 'utf8');
  return manifest;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const manifest = await generateManifestV2();
  process.stdout.write(`manifest.yaml: ${manifest.files.length} files for ${manifest.pack}\n`);
}
