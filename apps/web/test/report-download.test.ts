import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createEvent } from 'h3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

const mocks = vi.hoisted(() => ({
  fixtures: false,
  requireIdentity: vi.fn(),
  callOrchestrator: vi.fn(),
}));
vi.mock('../server/utils/org-request', () => ({
  fixturesAnswer: () => mocks.fixtures,
  requireIdentity: mocks.requireIdentity,
}));
vi.mock('../server/utils/orchestrator', () => ({ callOrchestrator: mocks.callOrchestrator }));
import content from '../server/api/v1/report/pdf/[reportId]/content.get';
import download from '../server/api/v1/report/pdf/[reportId]/download.get';
import { FIXTURE_REPORT_ID } from '../server/utils/fixtures/reports';

function event(id = 'report-id', query = '?token=abc&expires=123') {
  const request = new IncomingMessage(new Socket());
  request.url = `/api/v1/report/pdf/${id}/content${query}`;
  const response = new ServerResponse(request);
  const result = createEvent(request, response);
  result.context.params = { reportId: id };
  return result;
}
beforeEach(() => {
  mocks.fixtures = false;
  vi.clearAllMocks();
});
describe('report file delivery', () => {
  it('requires identity and serves byte-for-byte PDF content without caching', async () => {
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    mocks.callOrchestrator.mockResolvedValue({ data: { buffer: bytes.toString('base64') } });
    const request = event();
    expect(await content(request)).toEqual(bytes);
    expect(mocks.requireIdentity).toHaveBeenCalledWith(request);
    expect(mocks.callOrchestrator).toHaveBeenCalledWith(request, {
      method: 'GET',
      path: '/internal/v1/reports/report-id/content?token=abc&expires=123',
    });
    expect(request.node.res.getHeader('content-type')).toBe('application/pdf');
    expect(request.node.res.getHeader('cache-control')).toBe('private, no-store');
  });
  it('rejects missing grants before requesting file content', async () => {
    await expect(content(event('report-id', ''))).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.callOrchestrator).not.toHaveBeenCalled();
  });
  it('returns a marked sample PDF in guarded fixture mode', async () => {
    mocks.fixtures = true;
    const bytes = await content(event(FIXTURE_REPORT_ID, ''));
    expect(bytes.toString()).toContain('%PDF-1.4');
    expect(bytes.toString()).toContain('Development fixture report - sample data only');
    expect(mocks.callOrchestrator).not.toHaveBeenCalled();
    const request = event(FIXTURE_REPORT_ID, '');
    await download(request);
    expect(request.node.res.getHeader('location')).toBe(
      `/api/v1/report/pdf/${FIXTURE_REPORT_ID}/content`,
    );
  });
});
