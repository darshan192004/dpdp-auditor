import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createEvent } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ body: { scanId: 'scan' }, callOrchestrator: vi.fn() }));
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  readBody: async () => mocks.body,
}));
vi.mock('../server/utils/org-request', async (original) => ({
  ...(await original<typeof import('../server/utils/org-request')>()),
  fixturesAnswer: () => false,
}));
vi.mock('../server/utils/orchestrator', async (original) => ({
  ...(await original<typeof import('../server/utils/orchestrator')>()),
  callOrchestrator: mocks.callOrchestrator,
}));
import requestPdf from '../server/api/v1/report/pdf.post';
import exportAudit from '../server/api/v1/audit-logs/export.get';

function event(role: string, key?: string) {
  const req = new IncomingMessage(new Socket());
  req.url = '/api/v1/report/pdf';
  if (key) req.headers['idempotency-key'] = key;
  const result = createEvent(req, new ServerResponse(req));
  result.context.session = {
    session: { userId: 'user', activeOrgId: 'org' },
    memberships: [{ orgId: 'org', status: 'active', role }],
  };
  return result;
}
beforeEach(() => vi.clearAllMocks());
describe('report and audit authorization', () => {
  it('forbids viewers from requesting PDFs before any upstream side effect', async () => {
    await expect(requestPdf(event('viewer'))).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.callOrchestrator).not.toHaveBeenCalled();
  });
  it.each(['owner', 'admin', 'auditor'])(
    'allows %s report creation and preserves retry keys',
    async (role) => {
      const request = event(role, 'test-key-1234');
      await requestPdf(request);
      expect(mocks.callOrchestrator).toHaveBeenCalledWith(request, {
        method: 'POST',
        path: '/internal/v1/reports',
        body: mocks.body,
        idempotencyKey: 'test-key-1234',
      });
    },
  );
  it.each(['viewer', 'auditor'])('forbids %s audit export', (role) => {
    expect(() => exportAudit(event(role))).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(mocks.callOrchestrator).not.toHaveBeenCalled();
  });
  it.each(['owner', 'admin'])('allows %s audit export', async (role) => {
    await exportAudit(event(role));
    expect(mocks.callOrchestrator).toHaveBeenCalledOnce();
  });
});
