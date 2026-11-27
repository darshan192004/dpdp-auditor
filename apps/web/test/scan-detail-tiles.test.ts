import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import NewScanDetail from '../app/components/new/NewScanDetail.vue';
import type { ScanDetail } from '../shared/scan';

const base = {
  id: 'scn_tiles',
  status: 'completed',
  coverage: { semgrep: 'completed', gitleaks: 'timed_out' },
  repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
  ref: 'main',
  commitSha: null,
  previousScore: null,
  score: null,
  grade: null,
  sectionScores: { '8(4)': 0 },
  counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  scannerVersions: {},
  rulePackVersion: 'dpdpa-2026.11.0',
  scoringVersion: 'scoring-2.0.0',
  error: null,
  timestamps: {
    queuedAt: '2026-11-27T05:00:00Z',
    startedAt: '2026-11-27T05:00:10Z',
    completedAt: '2026-11-27T05:01:00Z',
    durationMs: 50_000,
  },
  links: { findings: '', events: '', report: '' },
  assessment: {
    score: null,
    evidenceCoverage: 0,
    openGaps: 0,
    verdictCounts: { ATTESTED_PASS: 2, ATTESTED_FAIL: 1, UNKNOWN: 3 },
    unknownControls: ['DPDPA-8.4-SECRET-01'],
    detectorStatuses: { semgrep: 'completed', gitleaks: 'timed_out' },
    gradeWithheldReason: 'insufficient_evidence',
    consentGatingRatio: 0.75,
  },
} as unknown as ScanDetail;

describe('scan detail attestation tiles', () => {
  it('shows attested statements as human statements, not evidence', async () => {
    const page = await mountSuspended(NewScanDetail, { props: { scan: base } });
    const tile = page.find('[data-testid="attested-statements-tile"]');
    expect(tile.exists()).toBe(true);
    expect(tile.text()).toContain('Attested statements');
    expect(tile.text()).toContain('3');
    expect(tile.text()).toContain('Human statements; not code evidence');
  });

  it('names unavailable detectors and links to attestations', async () => {
    const page = await mountSuspended(NewScanDetail, { props: { scan: base } });
    expect(page.find('[data-testid="detectors-unavailable-tile"]').text()).toContain('gitleaks');
    const links = page.findAll('a');
    const link = links.find((candidate) => candidate.text() === 'Attestations');
    expect(link?.attributes('href')).toBe('/app/readiness/attestations?repoId=r1');
  });
});
