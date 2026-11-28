import { describe, expect, it } from 'vitest';
import { fixtureFixPlan, fixtureGaps, fixtureInventory } from '../server/utils/fixtures/readiness';

describe('readiness read fixtures', () => {
  it('match the shared wire contracts', () => {
    expect(fixtureInventory().signals[0]?.token).toBe('email_address');
    expect(fixtureGaps()[0]?.verdict).toBe('FAIL');
    expect(fixtureFixPlan().steps[0]?.controlCode).toBe('DPDPA-8.4-SECRET-01');
  });
});
