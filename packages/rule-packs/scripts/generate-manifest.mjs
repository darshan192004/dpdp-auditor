import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function listYaml(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listYaml(full, base)));
    else if (/\.ya?ml$/.test(entry.name)) files.push(relative(base, full).split(sep).join('/'));
  }
  return files.sort();
}

const controls = await readFile(join(root, 'dpdpa-controls.yaml'), 'utf8');
const pack = /^pack:\s*(\S+)/m.exec(controls)?.[1];
if (!pack) throw new Error('dpdpa-controls.yaml has no pack name');

const files = [];
for (const path of (await listYaml(root)).filter((path) => path !== 'manifest.yaml')) {
  const sha256 = createHash('sha256')
    .update(await readFile(join(root, ...path.split('/'))))
    .digest('hex');
  files.push({ path, sha256 });
}

const generatedAt = new Date().toISOString();
const body = files.map((file) => `  - path: ${file.path}\n    sha256: ${file.sha256}`).join('\n');
await writeFile(
  join(root, 'manifest.yaml'),
  `version: 1\npack: ${pack}\ngeneratedAt: "${generatedAt}"\nfiles:\n${body}\n`,
  'utf8',
);
process.stdout.write(`manifest.yaml: ${files.length} files for ${pack}\n`);
