import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewReport from '../app/components/new/NewReport.vue';

const viewModel = {
  report: {
    id: 'report_1',
    format: 'pdf',
    templateVersion: 'standard',
    createdAt: '2026-11-23T09:43:04.604Z',
  },
  organization: {
    name: 'Local Dev Org',
    slug: 'local-dev-org',
    dataRegion: 'ap-south-1',
  },
  scan: {
    id: 'scan_1',
    repository: { fullName: 'improwised/jovVix', visibility: 'public' },
    ref: 'main',
    commitSha: 'd581ea1c3619d5635445dfb7e151846cc6e12619',
    status: 'completed',
    score: 100,
    grade: 'A',
    sectionScores: { '10': 100, '8(4)': 100 },
    counts: { critical: 0, high: 2, medium: 43, low: 0, info: 0, total: 45 },
    coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
    coverageStatus: 'full',
    scannerVersions: { semgrep: '1.95.0', checkov: '3.2.0', gitleaks: '8.21.0' },
    rulePackVersion: 'dpdpa-2026.10.1',
    scoringVersion: '1.0.0',
    timestamps: {
      queuedAt: '2026-11-23T09:26:02.707Z',
      startedAt: '2026-11-23T09:28:57.299Z',
      completedAt: '2026-11-23T09:28:57.483Z',
      durationMs: 184,
    },
  },
  topFindings: [
    {
      id: 'finding_1',
      message: 'Container runs as root',
      severity: 'high',
      scanner: 'semgrep',
      section: '8(4)',
      status: 'open',
    },
  ],
  methodology: {
    scoringVersion: '1.0.0',
    rulePackVersion: 'dpdpa-2026.10.1',
    summary: 'Scores are derived from the signed DPDPA rule pack.',
  },
  disclaimer: 'Engineering signals, not legal advice.',
  generatedAt: '2026-11-23T09:43:04.604Z',
};

describe('NewReport', () => {
  it('renders the accessible report preview with the scan numbers and findings', async () => {
    const wrapper = await mountSuspended(NewReport, {
      props: { report: viewModel },
    });

    const text = wrapper.text();
    expect(text).toContain('improwised/jovVix');
    expect(text).toContain('100.0');
    expect(text).toContain('Container runs as root');
    expect(text).toContain('Engineering signals, not legal advice.');
    expect(wrapper.find('a[href="/api/v1/report/pdf/report_1/download"]').exists()).toBe(true);
    expect(wrapper.find('button').text()).toContain('Print');
  });

  it('shows a clear empty state when the report cannot be loaded', async () => {
    const wrapper = await mountSuspended(NewReport, {
      props: { report: null, error: 'The report does not exist.' },
    });

    expect(wrapper.text()).toContain('The report does not exist.');
  });
});
