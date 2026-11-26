import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ReportPage from '../app/pages/report/[reportId].vue';

mockNuxtImport('useRoute', () => () => ({ params: { reportId: 'report_1' } }));
mockNuxtImport('useFetch', () => () => ({
  data: {
    value: {
      data: {
        report: { id: 'report_1', format: 'html', templateVersion: '1' },
        organization: { name: 'internal-pilot', slug: 'internal-pilot', dataRegion: 'in' },
        scan: {
          id: 'scan_1',
          repository: { fullName: 'Improwised/jovVix', visibility: 'public' },
          ref: 'main',
          commitSha: '190f1a428421a0bb73731a04a927f493b706a4cb',
          status: 'completed',
          score: 90,
          grade: 'A',
          sectionScores: { '8(4)': null },
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          coverage: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: '1.0.0',
          timestamps: {
            queuedAt: '2026-11-26T17:18:00.000Z',
            startedAt: null,
            completedAt: null,
            durationMs: null,
          },
        },
        topFindings: [],
        methodology: {
          summary: 'Static analysis',
          scoringVersion: '1.0.0',
          rulePackVersion: 'dpdpa-2026.10.6',
        },
        disclaimer: 'Engineering signals, not legal advice.',
        generatedAt: '2026-11-26T17:19:05.000Z',
      },
    },
  },
  status: { value: 'success' },
}));

describe('report page hydration', () => {
  it('renders the generated time deterministically in UTC', async () => {
    const wrapper = await mountSuspended(ReportPage);

    expect(wrapper.text()).toContain('2026-11-26 17:19 UTC');
    expect(wrapper.text()).not.toContain('toLocaleString');
  });
});
