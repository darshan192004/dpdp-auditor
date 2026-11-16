#!/usr/bin/env node
/**
 * P5-16: bundle budget verification and regression gate.
 *
 * Measures gzipped sizes of the built client chunks in `.output/public/_nuxt`
 * and fails when a budget is exceeded, so a dependency bump that inflates the
 * bundle is caught in CI instead of in production.
 *
 * Budgets (gzip): 400 KB total JS, 150 KB for a single chunk, 60 KB total CSS.
 * Current baseline is ~250 KB JS / ~55 KB CSS with headroom for feature work.
 */
import console from 'node:console';
import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS = {
  totalJsGzip: 400 * 1024,
  maxChunkGzip: 150 * 1024,
  totalCssGzip: 60 * 1024,
};

const nuxtDir = join(process.cwd(), '.output', 'public', '_nuxt');

let entries;
try {
  entries = readdirSync(nuxtDir);
} catch {
  console.error(`bundle-size: ${nuxtDir} not found - run \`nuxt build\` first.`);
  process.exit(1);
}

const js = entries.filter((name) => name.endsWith('.js'));
const css = entries.filter((name) => name.endsWith('.css'));

const gzipSize = (name) => gzipSync(readFileSync(join(nuxtDir, name)), { level: 9 }).length;

const jsSizes = js.map((name) => ({ name, size: gzipSize(name) }));
const totalJs = jsSizes.reduce((sum, entry) => sum + entry.size, 0);
const largest = jsSizes.reduce((max, entry) => (entry.size > max.size ? entry : max), {
  name: '-',
  size: 0,
});
const totalCss = css.reduce((sum, name) => sum + gzipSize(name), 0);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`bundle-size: ${js.length} js chunks, total ${kb(totalJs)} gzip`);
console.log(`bundle-size: largest chunk ${largest.name} ${kb(largest.size)} gzip`);
console.log(`bundle-size: ${css.length} css files, total ${kb(totalCss)} gzip`);

const failures = [];
if (totalJs > BUDGETS.totalJsGzip) {
  failures.push(`total JS ${kb(totalJs)} exceeds budget ${kb(BUDGETS.totalJsGzip)}`);
}
if (largest.size > BUDGETS.maxChunkGzip) {
  failures.push(
    `chunk ${largest.name} ${kb(largest.size)} exceeds budget ${kb(BUDGETS.maxChunkGzip)}`,
  );
}
if (totalCss > BUDGETS.totalCssGzip) {
  failures.push(`total CSS ${kb(totalCss)} exceeds budget ${kb(BUDGETS.totalCssGzip)}`);
}

if (failures.length > 0) {
  console.error('bundle-size: FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('bundle-size: OK');
