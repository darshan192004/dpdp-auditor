import { describe, expect, it, vi } from 'vitest';
import { InternalRulesController } from '../src/modules/rules/internal-rules.controller.js';
import type { RulesService } from '../src/modules/rules/rules.service.js';

function make() {
  const service = {
    list: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
    detail: vi.fn().mockResolvedValue({ code: 'DPDPA-8.4-ENC-01' }),
  };
  const controller = new InternalRulesController(service as unknown as RulesService);
  return { controller, service };
}

describe('InternalRulesController (P4-16)', () => {
  it('defaults pagination when the query is empty', async () => {
    const { controller, service } = make();

    await controller.list({});

    expect(service.list).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it('normalises filters and numeric strings', async () => {
    const { controller, service } = make();

    await controller.list({
      section: ['8(4)'],
      scanner: 'checkov',
      page: '2',
      pageSize: '10',
    });

    expect(service.list).toHaveBeenCalledWith({
      section: '8(4)',
      scanner: 'checkov',
      page: 2,
      pageSize: 10,
    });
  });

  it('returns a single control', async () => {
    const { controller } = make();

    await expect(controller.detail('DPDPA-8.4-ENC-01')).resolves.toEqual({
      data: { code: 'DPDPA-8.4-ENC-01' },
    });
  });
});
