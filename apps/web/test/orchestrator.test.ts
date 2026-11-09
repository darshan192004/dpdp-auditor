import { describe, expect, it, vi } from 'vitest';
import { buildInternalRequest, callOrchestrator, signHmac } from '../server/utils/orchestrator';

const SECRET = 'a'.repeat(32);
const INTERNAL_KEY = 'b'.repeat(32);
const CONFIG = { url: 'http://orchestrator.test', hmacKey: SECRET, internalKey: INTERNAL_KEY };
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
      { headers: Record<string, string>; signal: AbortSignal },
    ];
    expect(url).toBe('http://orchestrator.test/internal/v1/scans/scn_1');
    expect(init.headers['x-internal-signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
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
