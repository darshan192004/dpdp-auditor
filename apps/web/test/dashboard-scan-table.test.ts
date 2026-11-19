import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScanTable from '../app/components/dashboard/ScanTable.vue';
import type { ScanSummary } from '../shared/scan';

const SCAN = (id: string, status: ScanSummary['status']) =>
  ({
    id,
    repositoryId: 'repo_1',
    repositoryFullName: 'acme/repo',
    status,
    score: 82.6,
    grade: 'B' as const,
    counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    createdAt: '2026-11-19T05:00:00Z',
    completedAt: null,
  }) as ScanSummary;

const PAGINATION = { page: 1, pageSize: 25, totalItems: 40, totalPages: 2 };

describe('ScanTable', () => {
  it('renders dense rows with status, score and repository links', async () => {
    const wrapper = await mountSuspended(ScanTable, {
      props: { scans: [SCAN('scn_1', 'completed')], pagination: PAGINATION, status: '' },
    });
    expect(wrapper.text()).toContain('acme/repo');
    expect(wrapper.text()).toContain('82.6');
    expect(wrapper.find('a[href="/app/scans/scn_1"]').exists()).toBe(true);
  });

  it('emits status and page changes and a new-scan action', async () => {
    const wrapper = await mountSuspended(ScanTable, {
      props: { scans: [], pagination: PAGINATION, status: '' },
    });
    await wrapper.find('button[data-status-filter="completed"]').trigger('click');
    expect(wrapper.emitted('update:status')?.[0]?.[0]).toBe('completed');
    await wrapper.find('button[data-page="2"]').trigger('click');
    expect(wrapper.emitted('update:page')?.[0]?.[0]).toBe(2);
    await wrapper.find('button[data-action="new-scan"]').trigger('click');
    expect(wrapper.emitted('newScan')).toHaveLength(1);
  });

  it('shows an empty state when there are no scans', async () => {
    const wrapper = await mountSuspended(ScanTable, {
      props: { scans: [], pagination: { ...PAGINATION, totalItems: 0, totalPages: 1 }, status: '' },
    });
    expect(wrapper.text()).toContain('No scans yet');
  });
});
