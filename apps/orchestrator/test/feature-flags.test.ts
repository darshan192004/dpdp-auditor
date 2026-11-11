import { describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env.js';
import {
  FeatureFlagsService,
  parseFeatureFlags,
} from '../src/modules/feature-flags/feature-flags.service.js';

function serviceWith(raw: string | undefined): FeatureFlagsService {
  const env = { FEATURE_FLAGS: raw } as Env;
  return new FeatureFlagsService(env);
}

describe('parseFeatureFlags', () => {
  it('treats unset or blank as "all off" (env-driven MVP default)', () => {
    expect(parseFeatureFlags(undefined)).toEqual({});
    expect(parseFeatureFlags('')).toEqual({});
    expect(parseFeatureFlags('   ')).toEqual({});
  });

  it('parses a JSON flag map', () => {
    expect(parseFeatureFlags('{"newReports":true,"betaApi":false}')).toEqual({
      newReports: true,
      betaApi: false,
    });
  });

  it('rejects non-JSON and non-boolean values fast (boot-time failure)', () => {
    expect(() => parseFeatureFlags('not-json')).toThrow(/not valid JSON/);
    expect(() => parseFeatureFlags('{"flag":"yes"}')).toThrow(/string -> boolean/);
    expect(() => parseFeatureFlags('[true]')).toThrow(/string -> boolean/);
  });
});

describe('FeatureFlagsService', () => {
  it('reads flags from the boot env', () => {
    const service = serviceWith('{"newReports":true}');
    expect(service.isEnabled('newReports')).toBe(true);
    expect(service.isEnabled('missing')).toBe(false);
    expect(service.isEnabled('missing', true)).toBe(true);
    expect(service.all()).toEqual({ newReports: true });
  });

  it('returns a copy from all() so callers cannot mutate the flag map', () => {
    const service = serviceWith('{"a":true}');
    service.all().a = false;
    expect(service.isEnabled('a')).toBe(true);
  });

  it('defaults to all-off without FEATURE_FLAGS', () => {
    const service = serviceWith(undefined);
    expect(service.all()).toEqual({});
    expect(service.isEnabled('anything')).toBe(false);
  });
});
