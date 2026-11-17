import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScanTimeline from '../app/components/scan/ScanTimeline.vue';
import type { ScanEvent } from '../shared/scan';

const EVENTS: ScanEvent[] = [
  { type: 'queued', at: '2026-11-04T09:31:22.481Z', payload: { ref: 'main', profile: 'standard' } },
  {
    type: 'scanner_completed',
    at: '2026-11-04T09:34:58.220Z',
    payload: { scanner: 'semgrep', findings: 22 },
  },
  { type: 'mystery_event', at: '2026-11-04T09:36:00.000Z', payload: { internal: true } },
  { type: 'completed', at: '2026-11-04T09:37:04.903Z', payload: { score: 82.6 } },
];

describe('ScanTimeline (docs/api.md §3.5)', () => {
  it('renders events oldest first with a label, detail, and timestamp', async () => {
    const wrapper = await mountSuspended(ScanTimeline, { props: { events: EVENTS } });
    const items = wrapper.findAll('ol[aria-label="Scan timeline"] li');

    expect(items).toHaveLength(4);
    expect(items[0]?.text()).toContain('Queued');
    expect(items[0]?.text()).toContain('main · standard');
    expect(items[0]?.text()).toContain('2026-11-04 09:31 UTC');
    expect(items[1]?.text()).toContain('Scanner completed');
    expect(items[1]?.text()).toContain('Semgrep · 22 findings');
    expect(items[3]?.text()).toContain('Completed');
    expect(items[3]?.text()).toContain('Score 82.6');
  });

  it('humanises an unknown event and omits an unhelpful payload', async () => {
    const wrapper = await mountSuspended(ScanTimeline, { props: { events: EVENTS } });
    const items = wrapper.findAll('ol[aria-label="Scan timeline"] li');

    expect(items[2]?.text()).toContain('Mystery event');
    expect(items[2]?.text()).not.toContain('internal');
  });

  it('explains the empty state instead of rendering a blank list', async () => {
    const wrapper = await mountSuspended(ScanTimeline, { props: { events: [] } });

    expect(wrapper.find('ol').exists()).toBe(false);
    expect(wrapper.text()).toContain('No events yet');
  });

  it('marks the timeline busy while it loads', async () => {
    const wrapper = await mountSuspended(ScanTimeline, { props: { events: [], isLoading: true } });

    const busy = wrapper.find('[aria-busy="true"]');
    expect(busy.exists()).toBe(true);
    expect(busy.text()).toContain('Loading scan events');
  });
});
