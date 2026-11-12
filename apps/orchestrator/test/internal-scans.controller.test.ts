import { describe, expect, it, vi } from 'vitest';
import { InternalScansController } from '../src/modules/scans/internal-scans.controller.js';
import type { ScansService } from '../src/modules/scans/scans.service.js';
import { PLAN_LIMITS, monthStart } from '../src/common/plan-limits.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';

function make() {
  const scans = {
    create: vi.fn().mockResolvedValue({ scanId: SCAN_ID, status: 'queued', replayed: false }),
    detail: vi.fn().mockResolvedValue({ id: SCAN_ID }),
    events: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue({ id: SCAN_ID, status: 'cancelled' }),
    recordFindings: vi.fn().mockResolvedValue({ accepted: 1, duplicates: 0 }),
    complete: vi.fn().mockResolvedValue({ scanId: SCAN_ID, status: 'mapping' }),
  };
  return {
    controller: new InternalScansController(scans as unknown as ScansService),
    scans,
  };
}

describe('InternalScansController', () => {
  it('scopes creation to X-Org-Id', async () => {
    const { controller, scans } = make();

    await expect(
      controller.create(ORG_ID, { repositoryId: '55555555-5555-4555-8555-555555555555' }),
    ).resolves.toEqual({
      data: { scanId: SCAN_ID, status: 'queued', replayed: false },
    });
    expect(scans.create).toHaveBeenCalledWith({
      repositoryId: '55555555-5555-4555-8555-555555555555',
      orgId: ORG_ID,
    });
  });

  it('requires the org header on every route', async () => {
    const { controller } = make();
    await expect(controller.detail(undefined, SCAN_ID)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(controller.events(undefined, SCAN_ID)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(controller.cancel(undefined, SCAN_ID, {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(controller.findings(undefined, SCAN_ID, {} as never)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(controller.complete(undefined, SCAN_ID, {} as never)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('delegates read, cancel, findings, and completion calls', async () => {
    const { controller, scans } = make();
    const batch = {
      batchId: 'bat_1',
      scanner: 'semgrep' as const,
      scannerVersion: '1.95.0',
      findings: [],
    };

    await expect(controller.detail(ORG_ID, SCAN_ID)).resolves.toEqual({ data: { id: SCAN_ID } });
    await expect(controller.events(ORG_ID, SCAN_ID)).resolves.toEqual({ data: [] });
    await expect(controller.cancel(ORG_ID, SCAN_ID, { reason: 'superseded' })).resolves.toEqual({
      data: { id: SCAN_ID, status: 'cancelled' },
    });
    await expect(controller.findings(ORG_ID, SCAN_ID, batch)).resolves.toEqual({
      data: { accepted: 1, duplicates: 0 },
    });
    await expect(
      controller.complete(ORG_ID, SCAN_ID, {
        scanners: [{ name: 'semgrep', status: 'completed', findings: 0 }],
      }),
    ).resolves.toEqual({ data: { scanId: SCAN_ID, status: 'mapping' } });

    expect(scans.cancel).toHaveBeenCalledWith(ORG_ID, SCAN_ID, { reason: 'superseded' });
    expect(scans.recordFindings).toHaveBeenCalledWith(ORG_ID, SCAN_ID, batch);
  });

  it('tolerates a missing cancel body', async () => {
    const { controller, scans } = make();
    await controller.cancel(ORG_ID, SCAN_ID, undefined as never);
    expect(scans.cancel).toHaveBeenCalledWith(ORG_ID, SCAN_ID, { reason: undefined });
  });
});

describe('plan limits', () => {
  it('matches the published plan table', () => {
    expect(PLAN_LIMITS.free).toEqual({ repositories: 2, scansPerMonth: 5 });
    expect(PLAN_LIMITS.starter).toEqual({ repositories: 10, scansPerMonth: 50 });
    expect(PLAN_LIMITS.growth).toEqual({ repositories: 50, scansPerMonth: 300 });
    expect(PLAN_LIMITS.enterprise).toEqual({ repositories: null, scansPerMonth: null });
  });

  it('resets quotas at the start of the UTC month', () => {
    expect(monthStart(new Date('2026-11-12T23:59:59.999Z'))).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
  });
});
