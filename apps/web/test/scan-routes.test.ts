import { createApp, toWebHandler } from 'h3';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { upstream } = vi.hoisted(() => ({ upstream: vi.fn() }));
vi.mock('../server/utils/org-request', () => ({ fixturesAnswer: () => false }));
vi.mock('../server/utils/session', () => ({ requireRole: vi.fn() }));
vi.mock('../server/utils/orchestrator', () => ({ callOrchestrator: upstream }));

let request: ReturnType<typeof toWebHandler>;
beforeAll(async () => {
  const create = (await import('../server/api/v1/scan.post')).default;
  const cancel = (await import('../server/api/v1/scan/[scanId]/cancel.post')).default;
  request = toWebHandler(createApp().use('/cancel', cancel).use('/create', create));
});
beforeEach(() => {
  upstream.mockReset().mockResolvedValue({
    data: {
      scanId: 'scan_1',
      status: 'queued',
      createdAt: '2026-11-17T00:00:00Z',
      replayed: false,
    },
  });
});

const KEY = '0f000000-0000-4000-8000-000000000012';
function post(path: string, body?: string, key?: string) {
  return request(
    new Request(`http://localhost/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      ...(body === undefined ? {} : { body }),
    }),
  );
}

describe('scan BFF request contracts', () => {
  it('carries the header key into the internal service body and returns the public scan id', async () => {
    const response = await post(
      'create',
      JSON.stringify({ githubUrl: 'https://github.com/acme/example' }),
      KEY,
    );
    expect(response.status).toBe(202);
    expect(response.headers.get('location')).toBe('/api/v1/scan/scan_1');
    expect(await response.json()).toEqual({
      data: { id: 'scan_1', status: 'queued', createdAt: '2026-11-17T00:00:00Z', replayed: false },
    });
    expect(upstream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: {
          githubUrl: 'https://github.com/acme/example',
          profile: 'standard',
          idempotencyKey: KEY,
        },
        idempotencyKey: KEY,
      }),
    );
  });

  it('accepts the documented commit-SHA keys used by API clients', async () => {
    const key = 'a'.repeat(40);
    expect((await post('create', JSON.stringify({ repositoryId: 'repo_1' }), key)).status).toBe(
      202,
    );
    expect(upstream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.objectContaining({ idempotencyKey: key }) }),
    );
  });

  it('rejects malformed keys and unknown request fields before contacting the orchestrator', async () => {
    expect(
      (await post('create', JSON.stringify({ repositoryId: 'repo_1' }), 'x'.repeat(129))).status,
    ).toBe(422);
    expect(
      (await post('create', JSON.stringify({ repositoryId: 'repo_1', idempotencyKey: KEY })))
        .status,
    ).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects malformed cancellation JSON while preserving bodyless cancellation', async () => {
    expect((await post('cancel', '{')).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    expect((await post('cancel')).status).toBe(202);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
