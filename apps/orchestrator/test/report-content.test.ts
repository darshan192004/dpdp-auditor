import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsService } from '../src/modules/reports/reports.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const REPORT = '99999999-9999-4999-8999-999999999999';
const data = { findById: vi.fn() };
const storage = { read: vi.fn() };
const deps = [data, {}, {}, {}, {}, storage, {}, {}] as unknown as ConstructorParameters<
  typeof ReportsService
>;
const service = new ReportsService(...deps);
const ready = () => ({
  id: REPORT,
  status: 'ready',
  storageKey: `reports/${REPORT}.pdf`,
  expiresAt: new Date(Date.now() + 60_000),
});

beforeEach(() => vi.resetAllMocks());
describe('report content access', () => {
  it('loads by tenant before verifying the grant and returning bytes', async () => {
    data.findById.mockResolvedValue(ready());
    storage.read.mockReturnValue(Buffer.from('%PDF-content'));
    await expect(service.content(ORG, REPORT, 'token', 'expires')).resolves.toEqual(
      Buffer.from('%PDF-content'),
    );
    expect(data.findById).toHaveBeenCalledExactlyOnceWith(ORG, REPORT);
    expect(storage.read).toHaveBeenCalledExactlyOnceWith(
      `reports/${REPORT}.pdf`,
      'token',
      'expires',
    );
  });
  it('does not read bytes for a report in another tenant', async () => {
    data.findById.mockResolvedValue(null);
    await expect(service.content(ORG, REPORT, 'token', 'expires')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(storage.read).not.toHaveBeenCalled();
  });
  it.each([
    { patch: { status: 'expired' }, code: 'REPORT_EXPIRED' },
    { patch: { expiresAt: new Date(0) }, code: 'REPORT_EXPIRED' },
    { patch: { status: 'rendering' }, code: 'REPORT_NOT_READY' },
    { patch: { storageKey: null }, code: 'NOT_FOUND' },
  ])('blocks $code before reading storage', async ({ patch, code }) => {
    data.findById.mockResolvedValue({ ...ready(), ...patch });
    await expect(service.content(ORG, REPORT, 'token', 'expires')).rejects.toMatchObject({ code });
    expect(storage.read).not.toHaveBeenCalled();
  });
});
