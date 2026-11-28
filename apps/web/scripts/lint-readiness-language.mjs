/* global URL, console, process */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FORBIDDEN = [
  ['compliant', /\bcompliant\b/i],
  ['non-compliant', /\bnon-compliant\b/i],
  ['violation of the Act', /violation of the act/i],
  ['certified', /\bcertified\b/i],
];

/**
 * Readiness-only language gate. CSS token names (for example
 * `status-compliant-bg`) and quoted disclaimers are the only exemptions.
 */
export function scanReadinessLanguage(files) {
  const hits = [];
  for (const { path, content } of files) {
    const lines = content.split(/\r?\n/);
    for (const [index, raw] of lines.entries()) {
      const line = raw
        .replace(/status-compliant-[a-z]+/g, '')
        .replace(/(['"`])[^'"`\n]*disclaimer[^'"`\n]*\1/gi, '');
      for (const [phrase, pattern] of FORBIDDEN) {
        if (pattern.test(line)) {
          hits.push({ path, line: index + 1, phrase });
        }
      }
    }
  }
  return hits;
}

const targets = [
  'app/components/new/NewScanDetail.vue',
  'app/components/rules/RuleDetectorExplainer.vue',
  'app/components/readiness/ReadinessAttestationList.vue',
  'app/components/readiness/ReadinessDataView.vue',
  'app/pages/app/readiness/inventory.vue',
  'app/pages/app/readiness/gaps.vue',
  'app/pages/app/readiness/fix-plan.vue',
  'app/pages/app/readiness/attestations.vue',
  'app/pages/app/readiness/exports.vue',
  'server/api/v1/scan/[scanId]/export/sarif.get.ts',
  'server/api/v1/scan/[scanId]/export/markdown.get.ts',
  'server/utils/fixtures/attestations.ts',
  'server/utils/fixtures/readiness.ts',
  '../orchestrator/src/modules/reports/report-view-model-v2.ts',
  '../orchestrator/src/modules/reports/report-template-v2.ts',
  '../orchestrator/src/modules/reports/report-pdf-v2.ts',
  '../orchestrator/src/modules/exports/sarif.service.ts',
  '../orchestrator/src/modules/exports/markdown.service.ts',
  '../../packages/rule-packs/v2/controls.yaml',
  '../../packages/rule-packs/v2/detectors.yaml',
  '../../packages/rule-packs/v2/commencement.yaml',
];

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = await Promise.all(
    targets.map(async (path) => ({ path, content: await readFile(join(root, path), 'utf8') })),
  );
  const hits = scanReadinessLanguage(files);
  for (const hit of hits) {
    console.error(`${hit.path}:${hit.line}: forbidden phrase: ${hit.phrase}`);
  }
  if (hits.length === 0) {
    console.log('lint:language: 0 forbidden phrases');
    return;
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
