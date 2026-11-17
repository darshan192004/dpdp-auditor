import { describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { $fetch as nodeFetch } from 'ofetch/node';
import { buildInternalRequest, callOrchestrator, signHmac } from '../server/utils/orchestrator';

const SECRET = 'a'.repeat(32);
const INTERNAL_KEY = 'b'.repeat(32);
const CONFIG = { url: 'https://orchestrator.test', hmacKey: SECRET, internalKey: INTERNAL_KEY };
const EVENT = {
  context: { requestId: 'req_test_1234', orgId: 'org_test', userId: 'usr_test' },
} as never;

describe('signHmac', () => {
  it('matches the cross-package vectors', () => {
    expect(signHmac('1762245120.{"orgId":"org_test"}', SECRET)).toBe(
      '5b0e36c0aeaa047bde4c0db1c4e256fc56a7f0d8a6bf30481ae8fb1a6effbb0a',
    );
    expect(signHmac('1762245120.', SECRET)).toBe(
      'dd01d99f9b90fba783626aa0bb7b2e6127fa67be9796449cb88a6f758af8e51b',
    );
  });
});

describe('buildInternalRequest', () => {
  it('serialises the body once and signs exactly those bytes', () => {
    const request = buildInternalRequest(
      EVENT,
      {
        method: 'POST',
        path: '/internal/v1/scans',
        body: { orgId: 'org_test' },
        idempotencyKey: 'idem_1',
      },
      CONFIG,
      () => 1_762_245_120_000,
    );
    expect(request.body).toBe('{"orgId":"org_test"}');
    expect(request.headers['x-internal-timestamp']).toBe('1762245120');
    expect(request.headers['x-internal-signature']).toBe(
      '5b0e36c0aeaa047bde4c0db1c4e256fc56a7f0d8a6bf30481ae8fb1a6effbb0a',
    );
    expect(request.headers['x-internal-key']).toBe(INTERNAL_KEY);
    expect(request.headers['x-request-id']).toBe('req_test_1234');
    expect(request.headers['x-org-id']).toBe('org_test');
    expect(request.headers['x-user-id']).toBe('usr_test');
    expect(request.headers['idempotency-key']).toBe('idem_1');
    expect(request.headers['content-type']).toBe('application/json');
  });

  it('signs an empty body for GET and does not claim a JSON body', () => {
    const request = buildInternalRequest(
      EVENT,
      { method: 'GET', path: '/internal/v1/health' },
      CONFIG,
      () => 1_762_245_120_000,
    );
    expect(request.body).toBeUndefined();
    expect(request.headers['content-type']).toBeUndefined();
    expect(request.headers['x-internal-signature']).toBe(
      'dd01d99f9b90fba783626aa0bb7b2e6127fa67be9796449cb88a6f758af8e51b',
    );
  });
});

describe('callOrchestrator', () => {
  it('calls the orchestrator with a timeout signal and returns the payload', async () => {
    const fetch = vi.fn().mockResolvedValue({ data: { scanId: 'scn_1' } });
    const result = await callOrchestrator<{ data: { scanId: string } }>(
      EVENT,
      { method: 'GET', path: '/internal/v1/scans/scn_1' },
      { fetch, config: CONFIG, now: () => 1_762_245_120_000 },
    );
    expect(result.data.scanId).toBe('scn_1');
    const [url, init] = fetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; signal: AbortSignal; redirect: string },
    ];
    expect(url).toBe('https://orchestrator.test/internal/v1/scans/scn_1');
    expect(init.headers['x-internal-signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe('error');
  });

  it('maps an upstream failure to 503 UPSTREAM_UNAVAILABLE without leaking the URL', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED http://orchestrator.test'));
    await expect(
      callOrchestrator(
        EVENT,
        { method: 'GET', path: '/internal/v1/health' },
        { fetch, config: CONFIG, now: () => 1_762_245_120_000 },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { error: { code: 'UPSTREAM_UNAVAILABLE', requestId: 'req_test_1234' } },
    });
    try {
      await callOrchestrator(
        EVENT,
        { method: 'GET', path: '/internal/v1/health' },
        { fetch, config: CONFIG, now: () => 1_762_245_120_000 },
      );
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('orchestrator.test');
    }
  });

  it('passes a 4xx domain envelope through with the local request id', async () => {
    const fetch = vi.fn().mockRejectedValue({
      response: { status: 403 },
      data: {
        error: {
          code: 'FORBIDDEN',
          message: 'Only an owner can remove an owner.',
          requestId: 'req_upstream_ignored',
        },
      },
    });
    await expect(
      callOrchestrator(
        EVENT,
        { method: 'DELETE', path: '/internal/v1/identity/org/members/usr_1' },
        { fetch, config: CONFIG, now: () => 1_762_245_120_000 },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      data: {
        error: {
          code: 'FORBIDDEN',
          message: 'Only an owner can remove an owner.',
          requestId: 'req_test_1234',
        },
      },
    });
  });

  it('keeps field details from a validation failure and drops malformed entries', async () => {
    const fetch = vi.fn().mockRejectedValue({
      response: { status: 422 },
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Enter a valid email address.',
          details: [
            { path: 'email', message: 'Enter a valid email address.' },
            { path: 7, message: 'not a path' },
            'nope',
          ],
        },
      },
    });
    await expect(
      callOrchestrator(
        EVENT,
        { method: 'POST', path: '/internal/v1/identity/org/members' },
        { fetch, config: CONFIG, now: () => 1_762_245_120_000 },
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      data: {
        error: {
          code: 'VALIDATION_ERROR',
          details: [{ path: 'email', message: 'Enter a valid email address.' }],
        },
      },
    });
  });

  it('masks upstream 5xx and non-contract 4xx responses', async () => {
    const failures = [
      { response: { status: 500 }, data: { error: { code: 'INTERNAL_ERROR', message: 'boom' } } },
      { response: { status: 422 }, data: { error: { code: 'NOT_A_CODE', message: 'unknown' } } },
      { response: { status: 404 }, data: { message: 'not the envelope' } },
    ];

    for (const failure of failures) {
      const fetch = vi.fn().mockRejectedValue(failure);
      await expect(
        callOrchestrator(
          EVENT,
          { method: 'GET', path: '/internal/v1/identity/org' },
          { fetch, config: CONFIG, now: () => 1_762_245_120_000 },
        ),
      ).rejects.toMatchObject({
        statusCode: 503,
        data: { error: { code: 'UPSTREAM_UNAVAILABLE', requestId: 'req_test_1234' } },
      });
    }
  });

  it('fails fast with INTERNAL_ERROR when configuration is missing', async () => {
    const fetch = vi.fn();
    await expect(
      callOrchestrator(
        EVENT,
        { method: 'GET', path: '/internal/v1/health' },
        { fetch, config: { url: '', hmacKey: '', internalKey: '' }, now: () => 0 },
      ),
    ).rejects.toMatchObject({ statusCode: 500, data: { error: { code: 'INTERNAL_ERROR' } } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe('orchestrator credential transport', () => {
  it.each([
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://127.0.0.2:3001',
    'http://[::1]:3001',
    'https://orchestrator.internal',
  ])('permits the configured secure or loopback destination %s', async (url) => {
    const fetch = vi.fn().mockResolvedValue({ data: 'ok' });
    await expect(
      callOrchestrator(
        EVENT,
        { method: 'GET', path: '/internal/v1/health' },
        {
          fetch,
          config: { ...CONFIG, url },
        },
      ),
    ).resolves.toEqual({ data: 'ok' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    'http://orchestrator.internal',
    'http://192.168.1.5',
    'http://localhost.evil.test',
    'http://127.evil.test',
    'ftp://localhost',
    'not a URL',
  ])('rejects unsafe or invalid destination %s before sending credentials', async (url) => {
    const fetch = vi.fn();
    await expect(
      callOrchestrator(
        EVENT,
        { method: 'GET', path: '/internal/v1/health' },
        {
          fetch,
          config: { ...CONFIG, url },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 500, data: { error: { code: 'INTERNAL_ERROR' } } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses a real cross-origin redirect without delivering credentials to its target', async () => {
    const destinationRequests = vi.fn();
    const destination = createServer((request, response) => {
      destinationRequests(request.headers);
      response.end('{}');
    });
    const destinationUrl = await listen(destination);
    const sourceRequests = vi.fn();
    const source = createServer((request, response) => {
      sourceRequests(request.headers);
      response.writeHead(302, { location: `${destinationUrl}/capture` });
      response.end();
    });
    try {
      const sourceUrl = await listen(source);
      await expect(
        callOrchestrator(
          EVENT,
          { method: 'GET', path: '/redirect' },
          {
            config: { ...CONFIG, url: sourceUrl },
            fetch: nodeFetch,
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 503,
        data: { error: { code: 'UPSTREAM_UNAVAILABLE' } },
      });
      expect(sourceRequests).toHaveBeenCalled();
      expect(sourceRequests.mock.calls[0]?.[0]).toMatchObject({ 'x-internal-key': INTERNAL_KEY });
      expect(destinationRequests).not.toHaveBeenCalled();
    } finally {
      await close(source);
      await close(destination);
    }
  });
});
