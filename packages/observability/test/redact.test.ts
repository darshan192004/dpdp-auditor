import { describe, expect, it } from 'vitest';
import { REDACTED, redact } from '../src/redact';

const SENSITIVE_KEYS = [
  'password',
  'userSecret',
  'auth_token',
  'authorization',
  'cookie',
  'api_key',
  'apikey',
  'Email',
  'ssn',
  'dpk_live_abc123',
  'PASSWORD',
];

describe('redact', () => {
  for (const key of SENSITIVE_KEYS) {
    it(`redacts the "${key}" key`, () => {
      const out = redact({ [key]: 'sensitive-value', safe: 1 });
      expect(out).toEqual({ [key]: REDACTED, safe: 1 });
    });
  }

  it('preserves the allowlisted correlation keys', () => {
    const correlation = { requestId: 'req_01', orgId: 'org_01', scanId: 'scn_01' };
    expect(redact(correlation)).toEqual(correlation);
  });

  it('redacts nested objects and arrays', () => {
    const input = {
      route: '/login',
      entries: [{ email: 'a@example.com', userId: 'usr_1', meta: { token: 'tok' } }],
    };
    expect(redact(input)).toEqual({
      route: '/login',
      entries: [{ email: REDACTED, userId: 'usr_1', meta: { token: REDACTED } }],
    });
  });

  it('never mutates the input', () => {
    const input = { nested: { password: 'x' }, list: [{ secret: 'y' }] };
    const snapshot = structuredClone(input);
    redact(input);
    expect(input).toEqual(snapshot);
  });

  it('handles circular references without blowing the stack', () => {
    const input: Record<string, unknown> = { name: 'loop' };
    input.self = input;
    const out = redact(input) as Record<string, unknown>;
    expect(out.name).toBe('loop');
    expect(out.self).toBe(out);
    expect(input.self).toBe(input);
  });

  it('keeps Date instances as Dates', () => {
    const at = new Date('2026-11-06T00:00:00.000Z');
    const out = redact({ at }) as { at: Date };
    expect(out.at).toBeInstanceOf(Date);
    expect(out.at.toISOString()).toBe(at.toISOString());
    expect(out.at).not.toBe(at);
  });

  it('passes scalars through unchanged', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});
