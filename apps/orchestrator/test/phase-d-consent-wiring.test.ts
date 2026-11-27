// apps/orchestrator/test/phase-d-consent-wiring.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Phase D consent-gating wiring', () => {
  it('returns the ratio from mapAndScore and writes it with the scan', () => {
    const scoring = read('src/modules/scoring/scan-scoring.service.ts');
    const scans = read('src/modules/scans/scans.service.ts');
    expect(scoring).toContain('consentGatingRatio: number | null;');
    expect(scoring).toContain("import { computeConsentGatingRatio } from './consent-gating.js';");
    expect(scoring).toMatch(/const consentGatingRatio = isScoringV2\(scoringVersion\)/);
    expect(scoring).toContain('inventory: inventory?.facts ?? []');
    expect(scoring).toMatch(/^\s+consentGatingRatio,$/m);
    expect(scans).toMatch(
      /consentGatingRatio:\s*scored\.consentGatingRatio === null\s*\? null\s*: new Prisma\.Decimal\(scored\.consentGatingRatio\)/,
    );
  });

  it('exposes the stored ratio in the assessment summary', () => {
    const scans = read('src/modules/scans/scans.service.ts');
    expect(scans).not.toContain('consentGatingRatio: null,');
    expect(scans).toMatch(
      /consentGatingRatio:\s*scan\.consentGatingRatio === null\s*\? null\s*: Number\(scan\.consentGatingRatio\),/,
    );
  });
});
