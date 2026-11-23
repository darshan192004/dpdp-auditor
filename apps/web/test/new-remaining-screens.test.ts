import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewReport from '../app/components/new/NewReport.vue';
import NewRules from '../app/components/new/NewRules.vue';

describe('remaining rebuilt screens', () => {
  it('renders one h1 on report and rules screens', async () => {
    const report = await mountSuspended(NewReport, {
      props: {
        report: {
          report: {
            id: 'report_1',
            format: 'pdf',
            templateVersion: 'standard',
            createdAt: '2026-11-23T09:43:04Z',
          },
          organization: { name: 'Local Dev Org', slug: 'local-dev-org', dataRegion: 'ap-south-1' },
          scan: {
            id: 'scan_1',
            repository: { fullName: 'acme/repo', visibility: 'public' },
            ref: 'main',
            commitSha: null,
            status: 'completed',
            score: 100,
            grade: 'A',
            sectionScores: {},
            counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
            coverage: {},
            rulePackVersion: null,
            scoringVersion: null,
            timestamps: {
              queuedAt: '2026-11-23T09:00:00Z',
              startedAt: null,
              completedAt: null,
              durationMs: null,
            },
          },
          topFindings: [],
          methodology: { scoringVersion: null, rulePackVersion: null, summary: 'Summary' },
          disclaimer: 'Not legal advice.',
          generatedAt: '2026-11-23T09:43:04Z',
        },
      },
    });
    const rules = await mountSuspended(NewRules, { props: { rules: [] } });
    expect(report.findAll('h1')).toHaveLength(1);
    expect(rules.findAll('h1')).toHaveLength(1);
    expect(rules.text()).toContain('No rules found');
  });
});
