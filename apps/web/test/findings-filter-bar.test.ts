import { mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FindingsFilterBar from '../app/components/findings/FindingsFilterBar.vue';
import { DEFAULT_FINDINGS_FILTERS } from '../shared/findings';

function filters(overrides: Partial<typeof DEFAULT_FINDINGS_FILTERS> = {}) {
  return { ...DEFAULT_FINDINGS_FILTERS, ...overrides };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('FindingsFilterBar (docs/design.md §7.4)', () => {
  it('labels the search box and reports the result count', async () => {
    const wrapper = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters(), totalItems: 14 },
    });

    const input = wrapper.find('input[type="search"]');
    expect(input.attributes('aria-label')).toBe('Search findings');
    expect(wrapper.text()).toContain('14 findings');
  });

  it('debounces the search box by 300 ms', async () => {
    vi.useFakeTimers();
    const wrapper = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters(), totalItems: 14 },
    });

    await wrapper.find('input[type="search"]').setValue('logger');
    expect(wrapper.emitted('update')).toBeUndefined();

    vi.advanceTimersByTime(299);
    expect(wrapper.emitted('update')).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(wrapper.emitted('update')?.[0]).toEqual([{ q: 'logger' }]);
  });

  it('applies the search immediately on Enter', async () => {
    vi.useFakeTimers();
    const wrapper = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters(), totalItems: 14 },
    });

    const input = wrapper.find('input[type="search"]');
    await input.setValue('card');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update')?.[0]).toEqual([{ q: 'card' }]);
  });

  it('toggles a severity chip and exposes pressed state', async () => {
    const wrapper = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters({ severity: ['critical'] }), totalItems: 14 },
    });

    const critical = wrapper.findAll('button').find((button) => button.text() === 'Critical')!;
    expect(critical.attributes('aria-pressed')).toBe('true');

    await critical.trigger('click');
    expect(wrapper.emitted('update')?.[0]).toEqual([{ severity: [] }]);

    const high = wrapper.findAll('button').find((button) => button.text() === 'High')!;
    await high.trigger('click');
    expect(wrapper.emitted('update')?.[1]).toEqual([{ severity: ['critical', 'high'] }]);
  });

  it('adds and removes scanner and status chips', async () => {
    const wrapper = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters({ scanner: ['semgrep'] }), totalItems: 14 },
    });

    const checkov = wrapper.findAll('button').find((button) => button.text() === 'Checkov')!;
    await checkov.trigger('click');
    expect(wrapper.emitted('update')?.[0]).toEqual([{ scanner: ['semgrep', 'checkov'] }]);

    const open = wrapper.findAll('button').find((button) => button.text() === 'Open')!;
    await open.trigger('click');
    expect(wrapper.emitted('update')?.[1]).toEqual([{ status: ['open'] }]);
  });

  it('applies a section filter on Enter', async () => {
    const wrapper = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters(), totalItems: 14 },
    });

    const section = wrapper.find('input[name="section"]');
    await section.setValue(' 8(4) ');
    await section.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update')?.[0]).toEqual([{ section: ['8(4)'] }]);
  });

  it('only offers Clear filters when a filter is active', async () => {
    const clean = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters(), totalItems: 14 },
    });
    expect(clean.findAll('button').some((button) => button.text() === 'Clear filters')).toBe(false);

    const filtered = await mountSuspended(FindingsFilterBar, {
      props: { filters: filters({ q: 'logger' }), totalItems: 2 },
    });
    const clear = filtered.findAll('button').find((button) => button.text() === 'Clear filters');
    await clear?.trigger('click');

    expect(filtered.emitted('clear')).toHaveLength(1);
  });
});
