import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import YAML from 'yaml';
import { DPDPA_PACK_V2_VERSION, validatePackV2 } from '@dpdpa/contracts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PACK_DIR = join(root, 'v2');

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

async function readPack(packDir) {
  const manifestRaw = await readFile(join(packDir, 'manifest.yaml'));
  const manifest = YAML.parse(manifestRaw.toString('utf8'));
  const files = [];
  for (const path of await listFiles(packDir)) {
    const bytes = await readFile(join(packDir, ...path.split('/')));
    files.push({
      path,
      value: YAML.parse(bytes.toString('utf8')),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return { manifest, files };
}

function emit(issues, quiet) {
  if (!quiet) {
    process.stdout.write(`${JSON.stringify({ pack: DPDPA_PACK_V2_VERSION, issues })}\n`);
  }
  process.exit(issues.length === 0 ? 0 : 1);
}

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const positional = args.filter((arg) => arg !== '--quiet');
const packDir = positional[0] ? resolve(positional[0]) : DEFAULT_PACK_DIR;

try {
  const { manifest, files } = await readPack(packDir);
  emit(validatePackV2({ manifest, files }), quiet);
} catch {
  emit(
    [
      {
        path: '<root>',
        code: 'io_error',
        message: 'pack validation could not be completed',
      },
    ],
    quiet,
  );
}
