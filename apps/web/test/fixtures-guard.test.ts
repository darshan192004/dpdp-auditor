import { describe, expect, it } from 'vitest';

import { FIXTURE_ORG_ID, FIXTURE_USER_ID, fixturesEnabled } from '../server/utils/fixtures/guard';

describe('fixturesEnabled (dev/test only)', () => {
  it('is off unless the flag is exactly 1', () => {
    const original = process.env.NUXT_FIXTURES;

    try {
      delete process.env.NUXT_FIXTURES;
      expect(fixturesEnabled()).toBe(false);

      process.env.NUXT_FIXTURES = '0';
      expect(fixturesEnabled()).toBe(false);

      process.env.NUXT_FIXTURES = 'true';
      expect(fixturesEnabled()).toBe(false);

      process.env.NUXT_FIXTURES = '1';
      expect(fixturesEnabled()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.NUXT_FIXTURES;
      else process.env.NUXT_FIXTURES = original;
    }
  });

  it('exposes a deterministic org and user for the seeded session', () => {
    expect(FIXTURE_ORG_ID).toMatch(/^[0-9a-f-]{36}$/i);
    expect(FIXTURE_USER_ID).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
