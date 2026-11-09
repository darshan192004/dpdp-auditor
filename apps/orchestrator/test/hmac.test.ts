import { describe, expect, it } from 'vitest';
import { computeSignature, verifyInternalRequest } from '../src/common/hmac.js';

const SECRET = 'a'.repeat(32);
const INTERNAL_KEY = 'b'.repeat(32);
const NOW = 1_762_245_120;

function input(overrides: Partial<Parameters<typeof verifyInternalRequest>[0]> = {}) {
  const timestamp = String(NOW);
  const rawBody = '{"orgId":"org_test"}';
  return {
    secret: SECRET,
    internalKey: INTERNAL_KEY,
    providedInternalKey: INTERNAL_KEY,
    timestamp,
    signature: computeSignature(SECRET, timestamp, rawBody),
    rawBody,
    nowSeconds: NOW,
    maxSkewSeconds: 300,
    ...overrides,
  };
}

describe('computeSignature', () => {
  it('matches the cross-package vector for a JSON body', () => {
    expect(computeSignature(SECRET, '1762245120', '{"orgId":"org_test"}')).toBe(
      '5b0e36c0aeaa047bde4c0db1c4e256fc56a7f0d8a6bf30481ae8fb1a6effbb0a',
    );
  });

  it('matches the cross-package vector for an empty body', () => {
    expect(computeSignature(SECRET, '1762245120', '')).toBe(
      'dd01d99f9b90fba783626aa0bb7b2e6127fa67be9796449cb88a6f758af8e51b',
    );
  });
});

describe('verifyInternalRequest', () => {
  it('accepts a valid request', () => {
    expect(verifyInternalRequest(input())).toEqual({ ok: true });
  });

  it('accepts exactly 300 seconds of skew', () => {
    expect(verifyInternalRequest(input({ nowSeconds: NOW + 300 }))).toEqual({ ok: true });
    expect(verifyInternalRequest(input({ nowSeconds: NOW - 300 }))).toEqual({ ok: true });
  });

  it('rejects missing headers', () => {
    expect(verifyInternalRequest(input({ providedInternalKey: undefined })).ok).toBe(false);
    expect(verifyInternalRequest(input({ timestamp: undefined })).ok).toBe(false);
    expect(verifyInternalRequest(input({ signature: undefined })).ok).toBe(false);
  });

  it('rejects a wrong internal key', () => {
    expect(
      verifyInternalRequest(input({ providedInternalKey: 'x'.repeat(INTERNAL_KEY.length) })),
    ).toEqual({ ok: false, reason: 'invalid_internal_key' });
  });

  it('rejects non-numeric timestamps', () => {
    expect(verifyInternalRequest(input({ timestamp: 'soon' }))).toEqual({
      ok: false,
      reason: 'invalid_timestamp',
    });
  });

  it('rejects skew beyond 300 seconds in both directions', () => {
    expect(verifyInternalRequest(input({ nowSeconds: NOW + 301 }))).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
    expect(verifyInternalRequest(input({ nowSeconds: NOW - 301 }))).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('rejects a tampered body and a wrong-length signature without throwing', () => {
    expect(verifyInternalRequest(input({ rawBody: '{"orgId":"org_evil"}' }))).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
    expect(verifyInternalRequest(input({ signature: 'abc' }))).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('accepts uppercase hex signatures', () => {
    const signature = computeSignature(SECRET, String(NOW), '{"orgId":"org_test"}');
    expect(verifyInternalRequest(input({ signature: signature.toUpperCase() }))).toEqual({
      ok: true,
    });
  });
});
