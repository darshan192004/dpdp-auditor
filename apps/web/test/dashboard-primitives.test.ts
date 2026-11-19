import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScoreRing from '../app/components/dashboard/ScoreRing.vue';
import SeverityBar from '../app/components/dashboard/SeverityBar.vue';
import StatusChip from '../app/components/dashboard/StatusChip.vue';

const COUNTS = { critical: 1, high: 2, medium: 3, low: 4, info: 5, total: 15 };

describe('dashboard primitives', () => {
  it('ScoreRing never shows a score without coverage and grade', async () => {
    const full = await mountSuspended(ScoreRing, {
      props: { score: 82.6, grade: 'B', coverage: { state: 'full', note: null } },
    });
    expect(full.text()).toContain('82.6');
    expect(full.text()).toContain('B');
    expect(full.text()).toContain('full coverage');

    const partial = await mountSuspended(ScoreRing, {
      props: {
        score: 82.6,
        grade: null,
        coverage: { state: 'partial', note: 'Gitleaks did not run' },
      },
    });
    expect(partial.text()).toContain('partial coverage');
    expect(partial.text()).toContain('Gitleaks did not run');
    expect(partial.text()).not.toContain('grade B');
  });

  it('SeverityBar exposes each severity count and total', async () => {
    const wrapper = await mountSuspended(SeverityBar, { props: { counts: COUNTS } });
    for (const label of ['critical', 'high', 'medium', 'low', 'info']) {
      expect(wrapper.text()).toContain(label);
    }
    expect(wrapper.text()).toContain('15');
  });

  it('StatusChip labels every scan status consistently', async () => {
    for (const status of ['queued', 'scanning', 'completed', 'failed'] as const) {
      const wrapper = await mountSuspended(StatusChip, { props: { status } });
      expect(wrapper.find('[data-status]').attributes('data-status')).toBe(status);
      expect(wrapper.text().length).toBeGreaterThan(0);
    }
  });
});
