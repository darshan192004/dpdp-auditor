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
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
          ref: 'main',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: null,
          scoringVersion: null,
          assessment: null,
          error: null,
          timestamps: {
            queuedAt: '2026-11-19T05:00:00Z',
            startedAt: '2026-11-19T05:00:10Z',
            completedAt: '2026-11-19T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });
    expect(wrapper.text()).toContain('100.0');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('full coverage');
    expect(wrapper.findAll('h1')).toHaveLength(1);
  });

  it('shows insufficient evidence with no letter for a v2 silent scan', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_v2',
          status: 'completed',
          score: null,
          grade: null,
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/fx-silent-app', visibility: 'public' },
          ref: '',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: 'scoring-2.0.0',
          assessment: {
            score: null,
            evidenceCoverage: 0,
            openGaps: 0,
            verdictCounts: { UNKNOWN: 12 },
            unknownControls: [],
            detectorStatuses: { gitleaks: 'completed' },
            gradeWithheldReason: 'insufficient_evidence',
            consentGatingRatio: null,
          },
          error: null,
          timestamps: {
            queuedAt: '2026-11-27T05:00:00Z',
            startedAt: '2026-11-27T05:00:10Z',
            completedAt: '2026-11-27T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });
    expect(wrapper.text()).toContain('Insufficient evidence');
    expect(wrapper.text()).toContain('No letter');
    expect(wrapper.text()).not.toContain('Compliant');
    expect(wrapper.text()).not.toContain('Non-compliant');
  });
});
