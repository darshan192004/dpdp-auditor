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

  it('accepts a zero repository size cap for unlimited development scans', () => {
    expect(loadEnv({ ...KEYS, REPO_SIZE_CAP_MB: '0' }).REPO_SIZE_CAP_MB).toBe(0);
  });

  it('rejects a negative repository size cap', () => {
    expect(() => loadEnv({ ...KEYS, REPO_SIZE_CAP_MB: '-1' })).toThrow(/REPO_SIZE_CAP_MB/);
  });

  it('treats an empty numeric override as unset, not zero', () => {
    expect(loadEnv({ ...KEYS, REPO_SIZE_CAP_MB: '' }).REPO_SIZE_CAP_MB).toBeUndefined();
    expect(loadEnv({ ...KEYS, TIMEOUT_CLONE: '' }).TIMEOUT_CLONE).toBeUndefined();
    // An empty value must not trip the production cap guard either.
    expect(loadEnv({ ...KEYS, NODE_ENV: 'production', REPO_SIZE_CAP_MB: '' })).toMatchObject({
      NODE_ENV: 'production',
    });
  });

  it('parses UNLIMITED_PLAN_QUOTA as a boolean', () => {
    expect(loadEnv({ ...KEYS, UNLIMITED_PLAN_QUOTA: 'true' }).UNLIMITED_PLAN_QUOTA).toBe(true);
    expect(loadEnv({ ...KEYS, UNLIMITED_PLAN_QUOTA: 'false' }).UNLIMITED_PLAN_QUOTA).toBe(false);
    expect(() => loadEnv({ ...KEYS, UNLIMITED_PLAN_QUOTA: 'yes' })).toThrow(/UNLIMITED_PLAN_QUOTA/);
  });

  it.each(['TIMEOUT_CLONE', 'TIMEOUT_SEMGREP', 'TIMEOUT_CHECKOV', 'TIMEOUT_GITLEAKS'])(
    'coerces %s into a positive timeout',
    (key) => {
      expect(loadEnv({ ...KEYS, [key]: '600' })[key as keyof ReturnType<typeof loadEnv>]).toBe(600);
      expect(() => loadEnv({ ...KEYS, [key]: '0' })).toThrow(new RegExp(key));
    },
  );

  it('refuses development-only limit overrides in production', () => {
    expect(() => loadEnv({ ...KEYS, NODE_ENV: 'production', REPO_SIZE_CAP_MB: '0' })).toThrow(
      /REPO_SIZE_CAP_MB/,
    );
    // A huge positive value is an effective unlimited cap, so no explicit cap
    // may be set in production.
    expect(() =>
      loadEnv({ ...KEYS, NODE_ENV: 'production', REPO_SIZE_CAP_MB: '9007199254740991' }),
    ).toThrow(/REPO_SIZE_CAP_MB/);
    expect(() =>
      loadEnv({ ...KEYS, NODE_ENV: 'production', UNLIMITED_PLAN_QUOTA: 'true' }),
    ).toThrow(/UNLIMITED_PLAN_QUOTA/);
    expect(loadEnv({ ...KEYS, NODE_ENV: 'production' })).toMatchObject({ NODE_ENV: 'production' });
  });
});
