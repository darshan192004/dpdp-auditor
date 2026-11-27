import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DPDPA_PACK_V2_VERSION } from '@dpdpa/contracts';

import { loadRulePackV2, RulePackV2Error } from '../src/modules/rule-pack/rule-pack-v2.loader.js';

const PACK_DIR = fileURLToPath(new URL('../../../packages/rule-packs/v2', import.meta.url));
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('loadRulePackV2', () => {
  it('loads the validated Phase C pack using legacy scoring bands', async () => {
    const loaded = await loadRulePackV2(PACK_DIR);

    expect(loaded.pack).toBe(DPDPA_PACK_V2_VERSION);
    expect(loaded.effectiveFrom).toBe('2026-11-15');
    expect(loaded.scoringVersion).toBe('2.0.0');
    expect(loaded.controls.map((control) => control.code)).toEqual(
      expect.arrayContaining([
        'DPDPA-5-NOTICE-01',
        'DPDPA-6-CONSENTGATE-01',
        'DPDPA-6-FORMPURPOSE-01',
        'DPDPA-8.4-MON-01',
        'DPDPA-8.4-BACKUP-01',
      ]),
    );
    expect(loaded.mappings.length).toBeGreaterThanOrEqual(6);
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

  it('loads pack-authored key-to-control mappings', async () => {
    const loaded = await loadRulePackV2(PACK_DIR);
    expect(loaded.pack).toBe(DPDPA_PACK_V2_VERSION);
    expect(loaded.attestationsByKey.get('secrets.managed_store')?.map((c) => c.code)).toEqual([
      'DPDPA-8.4-SECRET-01',
    ]);
  });

  it('fails closed on checksum drift', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'phase-e-loader-')), 'v2');
    created.push(dir);
    await cp(PACK_DIR, dir, { recursive: true });
    const controls = await readFile(join(dir, 'controls.yaml'), 'utf8');
    await writeFile(join(dir, 'controls.yaml'), `${controls}\n# drift\n`, 'utf8');

    await expect(loadRulePackV2(dir)).rejects.toMatchObject({
      name: 'RulePackV2Error',
      code: 'RULE_PACK_HASH_MISMATCH',
    });
  });

  it('never returns raw file content from a validation failure', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'phase-e-loader-')), 'v2');
    created.push(dir);
    await cp(PACK_DIR, dir, { recursive: true });
    const controls = await readFile(join(dir, 'controls.yaml'), 'utf8');
    const canary = 'CANARY_LOADER_SOURCE_MUST_NOT_ESCAPE';
    await writeFile(join(dir, 'controls.yaml'), `${controls}\n# ${canary}\n`, 'utf8');

    const error = await loadRulePackV2(dir).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(RulePackV2Error);
    expect(JSON.stringify(error)).not.toContain(canary);
  });
});
