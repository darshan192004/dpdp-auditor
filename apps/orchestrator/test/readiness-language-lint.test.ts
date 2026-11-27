import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const FORBIDDEN: Array<[string, RegExp]> = [
  ['compliant', /\bcompliant\b/i],
  ['non-compliant', /\bnon-compliant\b/i],
  ['violation of the Act', /violation of the act/i],
  ['certified', /\bcertified\b/i],
];

function stripExemptions(source: string): string {
  return source
    .replace(/status-compliant-[a-z]+/g, '')
    .replace(/(['"`])[^'"`\n]*disclaimer[^'"`\n]*\1/gi, '');
}

describe('report and export language lint', () => {
  it('contains no forbidden wording in v2 renderers or export messages', async () => {
    const files = [
      'apps/orchestrator/src/modules/reports/report-view-model-v2.ts',
      'apps/orchestrator/src/modules/reports/report-template-v2.ts',
      'apps/orchestrator/src/modules/reports/report-pdf-v2.ts',
      'apps/orchestrator/src/modules/exports/sarif.service.ts',
      'apps/orchestrator/src/modules/exports/markdown.service.ts',
      'packages/rule-packs/v2/controls.yaml',
      'packages/rule-packs/v2/detectors.yaml',
      'packages/rule-packs/v2/commencement.yaml',
    ];
    const hits: string[] = [];
    for (const path of files) {
      const text = stripExemptions(await readFile(join(root, path), 'utf8'));
      for (const [phrase, pattern] of FORBIDDEN) {
        if (pattern.test(text)) hits.push(`${path}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
