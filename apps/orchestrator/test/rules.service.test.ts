import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRulePack, type LoadedRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';
import type { RulePackService } from '../src/modules/rule-pack/rule-pack.service.js';
import { RulesService } from '../src/modules/rules/rules.service.js';

const PACK_DIR = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));

describe('RulesService (P4-16)', () => {
  let pack: LoadedRulePack;
  let service: RulesService;

  beforeAll(async () => {
    pack = await loadRulePack(PACK_DIR);
    service = new RulesService({ load: async () => pack } as unknown as RulePackService);
  });

  it('lists every control from the signed pack', async () => {
    const result = await service.list({ page: 1, pageSize: 100 });

    expect(result.data).toHaveLength(pack.controls.length);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 100,
      totalItems: pack.controls.length,
      totalPages: 1,
    });
    expect(result.data[0]).toMatchObject({
      code: expect.stringMatching(/^DPDPA-/),
      mappings: expect.any(Array),
      remediation: expect.any(String),
    });
  });

  it('filters by section', async () => {
    const result = await service.list({ section: '8(4)', page: 1, pageSize: 100 });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((control) => control.section === '8(4)')).toBe(true);
  });

  it('filters by scanner through the mapping table', async () => {
    const result = await service.list({ scanner: 'gitleaks', page: 1, pageSize: 100 });

    expect(result.data.length).toBeGreaterThan(0);
    for (const control of result.data) {
      expect(control.mappings.some((mapping) => mapping.scanner === 'gitleaks')).toBe(true);
    }
  });

  it('paginates deterministically', async () => {
    const first = await service.list({ page: 1, pageSize: 5 });
    const second = await service.list({ page: 2, pageSize: 5 });

    expect(first.data).toHaveLength(5);
    expect(second.data).toHaveLength(5);
    expect(first.data[0]?.code).not.toBe(second.data[0]?.code);
    expect(first.pagination.totalPages).toBe(Math.ceil(pack.controls.length / 5));
  });

  it('returns control detail with mappings and remediation', async () => {
    const control = pack.controls[0];
    if (!control) throw new Error('pack has no controls');

    const detail = await service.detail(control.code);

    expect(detail).toMatchObject({
      code: control.code,
      section: control.section,
      title: control.title,
      severity: control.severity,
      weight: control.weight,
      remediation: control.remediation,
    });
    expect(detail.mappings.length).toBe(
      pack.mappings.filter((mapping) => mapping.controlCode === control.code).length,
    );
  });

  it('rejects an unknown control code', async () => {
    await expect(service.detail('DPDPA-999-NOPE-01')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
