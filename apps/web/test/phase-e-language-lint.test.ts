import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanReadinessLanguage } from '../scripts/lint-readiness-language.mjs';

const webRoot = process.cwd();

const files = [
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

describe('Phase E language lint', () => {
  it('reports every forbidden user-facing phrase in the targeted surfaces', async () => {
    const sources = await Promise.all(
      files.map(async (path) => ({
        path,
        content: await readFile(join(webRoot, path), 'utf8'),
      })),
    );
    expect(scanReadinessLanguage(sources)).toEqual([]);
  });

  it('is not vacuous: it catches a synthetic forbidden phrase', () => {
    const hits = scanReadinessLanguage([
      { path: 'app/pages/app/readiness/gaps.vue', content: '<p>This is compliant.</p>' },
    ]);
    expect(hits).toEqual([
      { path: 'app/pages/app/readiness/gaps.vue', line: 1, phrase: 'compliant' },
    ]);
  });

  it('exempts CSS token names and quoted disclaimers only', () => {
    const hits = scanReadinessLanguage([
      {
        path: 'app/pages/app/readiness/gaps.vue',
        content: [
          '<div class="bg-status-compliant-bg text-status-compliant-text">Gaps</div>',
          "const disclaimer = 'This is not a certification of compliance.';",
        ].join('\n'),
      },
    ]);
    expect(hits).toEqual([]);
  });
});
