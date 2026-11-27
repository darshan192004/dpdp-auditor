import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import NewScanDetail from '../app/components/new/NewScanDetail.vue';
import type { ScanDetail } from '../shared/scan';

const scan = {
  id: 'scn_phase_f',
  status: 'completed',
  coverage: { gitleaks: 'timed_out' },
  repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
  ref: 'main',
  commitSha: null,
  previousScore: null,
  sectionScores: {},
  counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  scannerVersions: {},
  rulePackVersion: 'dpdpa-2026.10.6',
  scoringVersion: 'scoring-2.0.0',
  score: null,
  grade: null,
  assessment: {
    score: null,
    evidenceCoverage: 0,
    openGaps: 0,
    verdictCounts: { UNKNOWN: 1 },
    unknownControls: ['DPDPA-8.4-SECRET-01'],
    detectorStatuses: { gitleaks: 'timed_out' },
    gradeWithheldReason: 'insufficient_evidence',
    consentGatingRatio: null,
  },
  error: null,
  timestamps: {
    queuedAt: '2026-11-27T00:00:00Z',
    startedAt: '2026-11-27T00:00:10Z',
    completedAt: '2026-11-27T00:01:00Z',
    durationMs: 50_000,
  },
  links: { findings: '', events: '', report: '' },
} as unknown as ScanDetail;

describe('Phase F named coverage banner', () => {
  it('names the timed-out detector next to the unknown control count', async () => {
    const wrapper = await mountSuspended(NewScanDetail, { props: { scan } });
    const banner = wrapper
      .findAll('[role="status"]')
      .find((node) => node.text().includes('Detector status'));
    expect(banner).toBeDefined();
    expect(banner?.text()).toContain('gitleaks timed_out');
    expect(wrapper.text()).toContain('1 controls could not be determined');
  });
});
