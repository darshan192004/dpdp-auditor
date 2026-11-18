import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScoreCoverageDrilldown from '../app/components/new/ScoreCoverageDrilldown.vue';

describe('ScoreCoverageDrilldown', () => {
  it('explains section weights and contributing findings', async () => {
    const wrapper = await mountSuspended(ScoreCoverageDrilldown, {
      props: {
        score: 100,
        grade: 'A',
        coverage: 'full',
        sections: [{ code: '8(4)', title: 'Security safeguards', score: 100 }],
        findings: [{ id: 'fnd_1', severity: 'high', message: 'Root user' }],
      },
    });
    expect(wrapper.text()).toContain('8(4)');
    expect(wrapper.text()).toContain('Root user');
    expect(wrapper.text()).toContain('100.0');
  });
});
