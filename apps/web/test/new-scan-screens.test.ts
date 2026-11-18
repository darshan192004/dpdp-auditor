import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewScanDetail from '../app/components/new/NewScanDetail.vue';

describe('NewScanDetail', () => {
  it('renders score, grade and coverage together', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_1',
          status: 'completed',
          score: 100,
          grade: 'A',
          coverage: 'full',
          repository: 'acme/repo',
        },
      },
    });
    expect(wrapper.text()).toContain('100.0');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('coverage: full');
    expect(wrapper.findAll('h1')).toHaveLength(1);
  });
});
