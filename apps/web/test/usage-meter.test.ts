import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import UsageMeter from '../app/components/glass/UsageMeter.vue';
import type { OrgSummary } from '../shared/org';

describe('usage meter quota labels', () => {
  it('shows usage alongside bounded quotas', async () => {
    const summary = {
      plan: 'free',
      scansUsedThisMonth: 2,
      scansPerMonth: 10,
      reportsUsedThisMonth: 1,
      reportsPerMonth: 3,
    } as OrgSummary;
    const wrapper = await mountSuspended(UsageMeter, { props: { summary } });
    expect(wrapper.text()).toContain('2 / 10');
    expect(wrapper.text()).toContain('1 / 3');
  });
  it('describes unlimited plans without a zero quota', async () => {
    const summary = {
      plan: 'enterprise',
      scansUsedThisMonth: 2,
      scansPerMonth: null,
      reportsUsedThisMonth: 1,
      reportsPerMonth: null,
    } as OrgSummary;
    const wrapper = await mountSuspended(UsageMeter, { props: { summary } });
    expect(wrapper.text()).toContain('2 / Unlimited');
    expect(
      wrapper.findAll('[role="progressbar"]').map((item) => item.attributes('aria-label')),
    ).toEqual(['Scans this month: 2 of unlimited', 'Reports this month: 1 of unlimited']);
  });
});
