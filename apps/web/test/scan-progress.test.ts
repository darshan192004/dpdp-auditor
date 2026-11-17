import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScanProgress from '../app/components/scan/ScanProgress.vue';

const SCAN_ID = '0f000000-0000-4000-8000-000000000012';

const TIMESTAMPS = {
  queuedAt: '2026-11-07T14:20:05.118Z',
  startedAt: '2026-11-07T14:20:31.907Z',
  completedAt: null,
};

function progress(overrides: Record<string, unknown> = {}) {
  return mountSuspended(ScanProgress, {
    props: {
      scanId: SCAN_ID,
      status: 'scanning',
      coverage: { semgrep: 'completed', checkov: 'running', gitleaks: 'pending' },
      timestamps: TIMESTAMPS,
      nowMs: Date.parse('2026-11-07T14:30:05.118Z'),
      canCancel: true,
      ...overrides,
    },
  });
}

describe('ScanProgress (docs/design.md §5.6)', () => {
  it('walks the five stages and marks the current one', async () => {
    const wrapper = await progress();
    const stages = wrapper.findAll('ol[aria-label="Scan stages"] li');

    expect(stages.map((stage) => stage.text())).toEqual([
      'Queued',
      'Cloning',
      'Scanning',
      'Mapping',
      'Completed',
    ]);
    expect(stages[2]?.attributes('aria-current')).toBe('step');
    expect(stages[0]?.attributes('aria-current')).toBeUndefined();
  });

  it('shows each scanner with its own status', async () => {
    const wrapper = await progress();
    const text = wrapper.text();

    expect(text).toContain('Semgrep');
    expect(text).toContain('Completed');
    expect(text).toContain('Checkov');
    expect(text).toContain('Running');
    expect(text).toContain('Gitleaks');
    expect(text).toContain('Pending');
  });

  it('warns as soon as a scanner fails, without waiting for the scan to finish', async () => {
    const wrapper = await progress({
      coverage: { semgrep: 'completed', checkov: 'failed', gitleaks: 'running' },
    });

    expect(wrapper.text()).toContain('Coverage will be partial: Checkov failed.');
  });

  it('shows elapsed time and never a fake percentage', async () => {
    const wrapper = await progress();
    const text = wrapper.text();

    expect(text).toContain('Elapsed');
    expect(text).toMatch(/Elapsed 9m/);
    expect(text).not.toContain('%');
  });

  it('announces stage changes politely', async () => {
    const wrapper = await progress();

    const live = wrapper.find('[aria-live="polite"]');
    expect(live.exists()).toBe(true);
    expect(live.text()).toContain('Scanning');
  });

  it('asks for confirmation before cancelling', async () => {
    const wrapper = await progress();

    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancel scan')!;
    await cancel.trigger('click');

    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(wrapper.text()).toContain('Cancel this scan?');

    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Confirm cancel')!;
    await confirm.trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });

  it('hides the cancel action from viewers and finished scans', async () => {
    const viewer = await progress({ canCancel: false });
    expect(viewer.findAll('button').some((button) => button.text() === 'Cancel scan')).toBe(false);

    const finished = await progress({ status: 'completed', canCancel: true });
    expect(finished.findAll('button').some((button) => button.text() === 'Cancel scan')).toBe(
      false,
    );
  });
});
