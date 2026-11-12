import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ConfidenceBadge from '../app/components/findings/ConfidenceBadge.vue';
import EmptyState from '../app/components/ui/EmptyState.vue';
import FindingsTable from '../app/components/findings/FindingsTable.vue';
import ScannerLabel from '../app/components/findings/ScannerLabel.vue';
import SeverityBadge from '../app/components/findings/SeverityBadge.vue';
import StatusBadge from '../app/components/findings/StatusBadge.vue';
import { DEFAULT_FINDINGS_FILTERS } from '../shared/findings';
import { FIXTURE_FINDINGS } from '../server/utils/fixtures/findings';

const pagination = { page: 1, pageSize: 25, totalItems: 35, totalPages: 2 };

describe('finding badges (docs/design.md §5.7)', () => {
  it('always pair the colour with a text label', async () => {
    const severity = await mountSuspended(SeverityBadge, {
      props: { severity: 'critical' },
    });
    expect(severity.text()).toBe('Critical');

    const status = await mountSuspended(StatusBadge, { props: { status: 'accepted_risk' } });
    expect(status.text()).toBe('Accepted risk');

    const confidence = await mountSuspended(ConfidenceBadge, { props: { confidence: 'inferred' } });
    expect(confidence.text()).toBe('Inferred');
  });

  it('explain confidence in a tooltip title', async () => {
    const badge = await mountSuspended(ConfidenceBadge, { props: { confidence: 'advisory' } });

    expect(badge.attributes('title')).toMatch(/suggests a review/i);
  });

  it('name the scanner', async () => {
    const scanner = await mountSuspended(ScannerLabel, { props: { scanner: 'gitleaks' } });
    expect(scanner.text()).toBe('Gitleaks');
  });
});

describe('FindingsTable (docs/design.md §5.3)', () => {
  const findings = FIXTURE_FINDINGS.slice(0, 3);

  it('renders a captioned, semantic table with scoped headers', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: {
        findings,
        pagination,
        sort: '-severity',
        caption: 'Findings for this scan',
      },
    });

    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.find('caption').text()).toContain('Findings for this scan');

    const headers = wrapper.findAll('thead th');
    expect(headers.length).toBe(7);
    for (const header of headers) {
      expect(header.attributes('scope')).toBe('col');
    }
  });

  it('marks the active sort column with aria-sort', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings, pagination, sort: '-severity' },
    });

    const sorted = wrapper.find('th[aria-sort="descending"]');
    expect(sorted.exists()).toBe(true);
    expect(sorted.text()).toContain('Severity');
  });

  it('emits the toggled sort from the file header', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings, pagination, sort: '-severity' },
    });

    const fileHeaderButton = wrapper
      .findAll('thead button')
      .find((button) => button.text().includes('Finding'));
    await fileHeaderButton?.trigger('click');

    expect(wrapper.emitted('update:sort')?.[0]).toEqual(['file']);
  });

  it('makes each row keyboard-focusable and opens it on Enter', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings, pagination, sort: '-severity' },
    });

    const firstRow = wrapper.findAll('tbody tr')[0]!;
    expect(firstRow.attributes('tabindex')).toBe('0');

    await firstRow.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: findings[0]!.id });
  });

  it('opens a row on click', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings, pagination, sort: '-severity' },
    });

    await wrapper.findAll('tbody tr')[1]!.trigger('click');
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: findings[1]!.id });
  });

  it('shows a text alternative for the row action', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings, pagination, sort: '-severity' },
    });

    const action = wrapper.find('tbody button');
    expect(action.attributes('aria-label')).toMatch(/open finding/i);
  });

  it('reports the server-side window and pages forward', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings, pagination, sort: '-severity' },
    });

    expect(wrapper.text()).toContain('1–3 of 35');

    const next = wrapper.findAll('button').find((button) => button.text() === 'Next');
    await next?.trigger('click');
    expect(wrapper.emitted('update:page')?.[0]).toEqual([2]);
  });

  it('renders skeleton rows and aria-busy while loading', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings: [], pagination, sort: '-severity', loading: true },
    });

    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.findAll('tbody tr').length).toBeGreaterThan(0);
    expect(wrapper.text()).not.toContain('No findings match these filters');
  });

  it('shows the empty state with a clear action', async () => {
    const wrapper = await mountSuspended(FindingsTable, {
      props: { findings: [], pagination, sort: '-severity' },
    });

    expect(wrapper.text()).toContain('No findings match these filters');
    const clear = wrapper.findAll('button').find((button) => button.text() === 'Clear filters');
    await clear?.trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });
});

describe('EmptyState', () => {
  it('is a sentence plus one action, never a blank panel', async () => {
    const wrapper = await mountSuspended(EmptyState, {
      props: {
        title: 'No findings match these filters',
        description: 'Remove a filter or search for a different rule.',
        actionLabel: 'Clear filters',
      },
    });

    expect(wrapper.text()).toContain('No findings match these filters');
    expect(wrapper.text()).toContain('Remove a filter');
    expect(wrapper.findAll('button')).toHaveLength(1);
  });
});

describe('default filters', () => {
  it('match the API default sort and page size', () => {
    expect(DEFAULT_FINDINGS_FILTERS.sort).toBe('-severity');
    expect(DEFAULT_FINDINGS_FILTERS.pageSize).toBe(50);
  });
});
