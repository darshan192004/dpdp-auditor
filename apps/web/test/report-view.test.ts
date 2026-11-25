import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fixtures: false,
  requireIdentity: vi.fn(),
  requireRole: vi.fn(),
  callOrchestrator: vi.fn(),
}));
vi.mock('../server/utils/org-request', async (original) => ({
  ...(await original<typeof import('../server/utils/org-request')>()),
  fixturesAnswer: () => mocks.fixtures,
}));
vi.mock('../server/utils/session', () => ({
  requireIdentity: mocks.requireIdentity,
  requireRole: mocks.requireRole,
}));
vi.mock('../server/utils/orchestrator', () => ({ callOrchestrator: mocks.callOrchestrator }));
import view from '../server/api/v1/report/pdf/[reportId]/view.get';
import { FIXTURE_REPORT_ID } from '../server/utils/fixtures/reports';

function event(reportId = 'report-id') {
  const request = new IncomingMessage(new Socket());
  request.url = `/api/v1/report/pdf/${reportId}/view`;
  const result = createEvent(request, new ServerResponse(request));
  result.context.params = { reportId };
  return result;
}

beforeEach(() => {
  mocks.fixtures = false;
  vi.clearAllMocks();
});

describe('report view endpoint', () => {
  it('reads an existing report for viewers without reserving a report', async () => {
    const model = { data: { report: { id: 'report-id' } } };
    mocks.callOrchestrator.mockResolvedValue(model);
    const request = event();

    expect(await view(request)).toBe(model);
    expect(mocks.requireIdentity).toHaveBeenCalledWith(request);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.callOrchestrator).toHaveBeenCalledTimes(1);
    expect(mocks.callOrchestrator).toHaveBeenCalledWith(request, {
      method: 'GET',
      path: '/internal/v1/reports/report-id/view-model',
    });
  });

  it('answers 404 NOT_FOUND for an unknown report id without reserving a report', async () => {
    mocks.callOrchestrator.mockRejectedValue({
      data: { error: { code: 'NOT_FOUND', message: 'Report not found.' } },
    });
    const request = event('unknown-report');
    await expect(view(request)).rejects.toMatchObject({
      statusCode: 404,
      data: { error: { code: 'NOT_FOUND', message: 'Report not found.' } },
    });
    expect(mocks.callOrchestrator).toHaveBeenCalledTimes(1);
    expect(mocks.callOrchestrator).toHaveBeenCalledWith(request, {
      method: 'GET',
      path: '/internal/v1/reports/unknown-report/view-model',
    });
  });

  it('propagates non-not-found upstream failures unchanged', async () => {
    const failure = { data: { error: { code: 'FORBIDDEN', message: 'Denied.' } } };
    mocks.callOrchestrator.mockRejectedValue(failure);

    await expect(view(event())).rejects.toBe(failure);
    expect(mocks.callOrchestrator).toHaveBeenCalledTimes(1);
  });

  it('keeps fixture-mode previews read-only', async () => {
    mocks.fixtures = true;
    const result = await view(event(FIXTURE_REPORT_ID));

    expect(result).toMatchObject({ data: { report: { id: FIXTURE_REPORT_ID } } });
    expect(mocks.requireIdentity).not.toHaveBeenCalled();
    expect(mocks.callOrchestrator).not.toHaveBeenCalled();
  });
});
