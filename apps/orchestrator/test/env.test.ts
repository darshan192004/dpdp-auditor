import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const KEYS = {
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(KEYS)).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      // architecture.md §11: production driver + Job spec defaults
      RUNNER_DRIVER: 'kubernetes',
      SCANNERS_NAMESPACE: 'scanners',
      RUNNER_IMAGE: 'registry.example.com/dpdpa/scan-runner@sha256:<digest>',
      ...KEYS,
    });
  });

  it('accepts an explicit RUNNER_DRIVER', () => {
    expect(loadEnv({ ...KEYS, RUNNER_DRIVER: 'docker' }).RUNNER_DRIVER).toBe('docker');
  });

  it.each([
    'wss://browser.internal/devtools/browser/id',
    'ws://localhost:9222/devtools/browser/id',
    'ws://127.0.0.1:9222/devtools/browser/id',
    'ws://[::1]:9222/devtools/browser/id',
  ])('accepts protected browser transport %s', (endpoint) => {
    expect(
      loadEnv({ ...KEYS, REPORTS_BROWSER_WS_ENDPOINT: endpoint }).REPORTS_BROWSER_WS_ENDPOINT,
    ).toBe(endpoint);
  });

  it.each(['', 'ws://browser.internal/devtools/browser/id', 'https://browser.internal'])(
    'rejects an invalid or cleartext remote browser endpoint %s',
    (endpoint) => {
      expect(() => loadEnv({ ...KEYS, REPORTS_BROWSER_WS_ENDPOINT: endpoint })).toThrow(
        /REPORTS_BROWSER_WS_ENDPOINT/,
      );
    },
  );

  it('rejects an unknown RUNNER_DRIVER', () => {
    expect(() => loadEnv({ ...KEYS, RUNNER_DRIVER: 'nomad' })).toThrow(/RUNNER_DRIVER/);
  });

  it('coerces PORT', () => {
    expect(loadEnv({ ...KEYS, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects an invalid PORT with the field path in the message', () => {
    expect(() => loadEnv({ ...KEYS, PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ ...KEYS, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('requires the HMAC and internal keys', () => {
    expect(() => loadEnv({})).toThrow(/ORCHESTRATOR_HMAC_KEY/);
    expect(loadEnv(KEYS)).toMatchObject(KEYS);
  });

  it('requires DATABASE_URL', () => {
    const { DATABASE_URL: _url, ...rest } = KEYS;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('requires REDIS_URL', () => {
    const { REDIS_URL: _redis, ...rest } = KEYS;
    expect(() => loadEnv(rest)).toThrow(/REDIS_URL/);
    expect(loadEnv(KEYS).REDIS_URL).toBe('redis://127.0.0.1:6379');
  });

  it('rejects short keys', () => {
    expect(() => loadEnv({ ...KEYS, ORCHESTRATOR_HMAC_KEY: 'short' })).toThrow(
      /ORCHESTRATOR_HMAC_KEY/,
    );
  });
});
