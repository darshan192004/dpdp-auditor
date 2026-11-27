import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadRulePackV2 } from '../src/modules/rule-pack/rule-pack-v2.loader.js';

const PACK_DIR = fileURLToPath(new URL('../../../packages/rule-packs/v2', import.meta.url));

describe('loadRulePackV2', () => {
  it('loads the validated Phase C pack using legacy scoring bands', async () => {
    const loaded = await loadRulePackV2(PACK_DIR);

    expect(loaded.pack).toBe('dpdpa-2026.11.0');
    expect(loaded.effectiveFrom).toBe('2026-11-15');
    expect(loaded.scoringVersion).toBe('2.0.0');
    expect(loaded.controls.map((control) => control.code)).toEqual([
      'DPDPA-5-NOTICE-01',
      'DPDPA-6-CONSENTGATE-01',
      'DPDPA-6-FORMPURPOSE-01',
      'DPDPA-8.4-MON-01',
      'DPDPA-8.4-BACKUP-01',
    ]);
    expect(loaded.mappings).toHaveLength(6);
    expect(loaded.inventoryRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          controlCode: 'DPDPA-8.4-MON-01',
          detector: 'schema_scan',
          token: 'audit_log',
          mode: 'absence',
          confidence: 'direct',
        }),
      ]),
    );
    expect(loaded.sectionWeights['8(4)']).toBe(30);
    expect(loaded.grades[0]).toMatchObject({ grade: 'A', min: 90, max: 100 });
  });
});
