import { describe, expect, it } from 'vitest';
import { planDatabase } from './integration/helpers/resolve-db-url.js';

describe('planDatabase', () => {
  it('prefers an explicit TEST_DATABASE_URL', () => {
    expect(planDatabase('postgresql://x/y', true)).toEqual({
      mode: 'existing',
      url: 'postgresql://x/y',
    });
  });

  it('falls back to a container when Docker is available', () => {
    expect(planDatabase(undefined, true)).toEqual({ mode: 'container' });
  });

  it('skips when neither is available', () => {
    const plan = planDatabase(undefined, false);
    expect(plan.mode).toBe('skip');
    expect(plan).toHaveProperty('reason');
  });
});
