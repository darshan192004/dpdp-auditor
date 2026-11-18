import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import DsBadge from '../app/components/ds/DsBadge.vue';
import DsScoreCard from '../app/components/ds/DsScoreCard.vue';

describe('design-system primitives', () => {
  it('never shows a score without coverage and findings link', async () => {
    const wrapper = await mountSuspended(DsScoreCard, {
      props: {
        score: 100,
        grade: 'A',
        coverage: 'full',
        findingsHref: '/app/scans/scan-1/findings',
      },
    });

    expect(wrapper.text()).toContain('100.0');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('coverage: full');
    expect(wrapper.find('a[href="/app/scans/scan-1/findings"]').exists()).toBe(true);
  });

  it('uses static Tailwind classes for badge tones', async () => {
    const wrapper = await mountSuspended(DsBadge, {
      props: { tone: 'high' },
      slots: { default: 'High' },
    });

    expect(wrapper.classes().join(' ')).toContain('--color-risk-high-bg');
  });
});
