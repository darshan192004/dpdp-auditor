import { describe, expect, it } from 'vitest';
import { effectivePlanLimits, PLAN_LIMITS } from '../src/common/plan-limits.js';

describe('effectivePlanLimits', () => {
  it('returns plan quotas by default', () => {
    expect(effectivePlanLimits('free')).toEqual(PLAN_LIMITS.free);
    expect(effectivePlanLimits('growth', false)).toEqual(PLAN_LIMITS.growth);
  });

  it('returns unlimited quotas when the development override is set', () => {
    expect(effectivePlanLimits('free', true)).toEqual({
      repositories: null,
      scansPerMonth: null,
      reportsPerMonth: null,
    });
  });

  it('does not let a caller mutate the shared unlimited preset', () => {
    const first = effectivePlanLimits('free', true);
    first.repositories = 1;
    expect(effectivePlanLimits('free', true).repositories).toBeNull();
  });
});
