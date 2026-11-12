import { describe, expect, it, vi } from 'vitest';
import { InternalReportsController } from '../src/modules/reports/internal-reports.controller.js';
import type { ReportsService } from '../src/modules/reports/reports.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '99999999-9999-4999-8999-999999999999';

function make() {
  const service = { viewModel: vi.fn().mockResolvedValue({ report: { id: REPORT_ID } }) };
  const controller = new InternalReportsController(service as unknown as ReportsService);
  return { controller, service };
}

describe('InternalReportsController (P4-20)', () => {
  it('returns the view model for the organisation', async () => {
    const { controller, service } = make();

    await expect(controller.viewModel(ORG_ID, REPORT_ID)).resolves.toEqual({
      data: { report: { id: REPORT_ID } },
    });
    expect(service.viewModel).toHaveBeenCalledWith(ORG_ID, REPORT_ID);
  });

  it('rejects a request without an organisation header', async () => {
    const { controller } = make();

    await expect(controller.viewModel(undefined, REPORT_ID)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
