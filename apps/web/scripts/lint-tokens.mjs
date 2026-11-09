#!/usr/bin/env node
/**
 * Fails the build when a raw hex colour appears outside the token file.
 *
 * Design tokens live in `app/assets/css/main.css` (docs/design.md §6). Every
 * other file must consume them through Tailwind/Nuxt UI classes or
 * `var(--color-*)`; writing `#0d9488` in a component bypasses the theme and
 * drifts from the spec.
 *
 * Known limitation: a 3- or 4-digit run of hex characters that is not a colour
 * (for example `#feed`) is reported too. Rename the fragment or move it into a
 * token — do not weaken the rule.
 *
 * Usage: node scripts/lint-tokens.mjs [root]   (root defaults to apps/web)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const SCANNED_EXTENSIONS = new Set(['.vue', '.ts', '.css', '.html']);
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.nuxt',
  '.output',
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'scripts',
  'test',
  // Playwright run artifacts (regenerated every `test:e2e` run; the HTML report
  // contains raw hex colors by design).
  'playwright-report',
  'test-results',
]);
const EXEMPT_PATH = 'app/assets/css/main.css';

// Resolved lazily: inside the Nuxt test environment `import.meta.url` is not a
// `file:` URL, and the tests only import `scanForRawHex`.
const defaultRoot = () => resolve(dirname(fileURLToPath(import.meta.url)), '..');

const toPosix = (path) => path.split(sep).join('/');

/**
 * @param {Array<{ path: string; content: string }>} entries
 * @param {string} exemptPath
 * @returns {Array<{ path: string; line: number }>}
 */
export function scanForRawHex(entries, exemptPath) {
  const exempt = toPosix(exemptPath);
  const hits = [];

  for (const entry of entries) {
    const path = toPosix(entry.path);
    if (path === exempt) continue;

    for (const match of entry.content.matchAll(HEX)) {
      const line = entry.content.slice(0, match.index).split('\n').length;
      hits.push({ path, line });
    }
  }

  return hits;
}

function collectEntries(root) {
  const entries = [];

  const walk = (directory) => {
    for (const dirent of readdirSync(directory, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(dirent.name)) walk(join(directory, dirent.name));
        continue;
      }

      if (!dirent.isFile() || !SCANNED_EXTENSIONS.has(extname(dirent.name))) continue;

      const file = join(directory, dirent.name);
      entries.push({ path: toPosix(relative(root, file)), content: readFileSync(file, 'utf8') });
    }
  };

  walk(root);
  return entries;
}

function main() {
  const root = resolve(process.argv[2] ?? defaultRoot());
  const hits = scanForRawHex(collectEntries(root), EXEMPT_PATH);

  for (const hit of hits) {
    process.stdout.write(`${hit.path}:${hit.line}\n`);
  }

  if (hits.length > 0) {
    process.stderr.write(
      `\n${hits.length} raw hex colour${hits.length === 1 ? '' : 's'} found. ` +
        'Use design tokens from app/assets/css/main.css instead (docs/design.md §6).\n',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
