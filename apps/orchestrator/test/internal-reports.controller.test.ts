import { describe, expect, it, vi } from 'vitest';
import { InternalReportsController } from '../src/modules/reports/internal-reports.controller.js';
import type { ReportsService } from '../src/modules/reports/reports.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '99999999-9999-4999-8999-999999999999';

function make() {
  const service = {
    viewModel: vi.fn().mockResolvedValue({ report: { id: REPORT_ID } }),
    content: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')),
  };
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

describe('authenticated PDF content transport', () => {
  it('forwards the trusted tenant and grant then preserves the binary bytes', async () => {
    const { controller, service } = make();
    await expect(controller.content(ORG_ID, REPORT_ID, 'token', 'expires')).resolves.toEqual({
      data: { buffer: Buffer.from('%PDF-test').toString('base64') },
    });
    expect(service.content).toHaveBeenCalledExactlyOnceWith(ORG_ID, REPORT_ID, 'token', 'expires');
  });
  it('rejects missing tenant before requesting content', async () => {
    const { controller, service } = make();
    await expect(
      controller.content(undefined, REPORT_ID, 'token', 'expires'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(service.content).not.toHaveBeenCalled();
  });
});
