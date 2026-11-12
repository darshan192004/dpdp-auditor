import type { ScanDetail } from '~~/shared/scan';
import { FIXTURE_SCAN_ID, FixtureNotFoundError } from './findings';

/**
 * Contract-shaped scan fixtures (docs/api.md §3.2) for the scorecard.
 *
 * Two scans exist so the page can be exercised in both states the design
 * calls out: full coverage with a grade and a trend, and partial coverage
 * where the grade is withheld. Enabled only when NUXT_FIXTURES=1 and no
 * orchestrator is configured.
 */

const REPOSITORY = {
  id: '0f000000-0000-4000-8000-000000000020',
  fullName: 'acme/payments-service',
  visibility: 'private',
};

/** A completed scan where one scanner timed out: the grade is withheld. */
export const FIXTURE_PARTIAL_SCAN_ID = '0f000000-0000-4000-8000-000000000011';

const FULL: ScanDetail = {
  id: FIXTURE_SCAN_ID,
  repository: REPOSITORY,
  status: 'completed',
  ref: 'main',
  commitSha: '9f2c1d7e4b8a6c0f3e2d1b0a9c8d7e6f5a4b3c2d',
  score: 82.6,
  grade: 'B',
  previousScore: 78.4,
  sectionScores: {
    '5': 85.0,
    '6': 61.5,
    '7': 90.0,
    '8(4)': 68.2,
    '8(5)': 75.0,
    '9': 100.0,
    '10': 80.0,
    '12': null,
    '13': 55.0,
    '16': 88.0,
  },
  counts: { critical: 3, high: 3, medium: 4, low: 3, info: 1, total: 14 },
  coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
  scannerVersions: { semgrep: '1.95.0', checkov: '3.2.0', gitleaks: '8.21.0' },
  rulePackVersion: '2026.10.1',
  scoringVersion: '1.0.0',
  error: null,
  timestamps: {
    queuedAt: '2026-11-04T09:31:22.481Z',
    startedAt: '2026-11-04T09:31:49.112Z',
    completedAt: '2026-11-04T09:37:04.903Z',
    durationMs: 322_422,
  },
  links: {
    findings: `/api/v1/scan/${FIXTURE_SCAN_ID}/findings`,
    events: `/api/v1/scan/${FIXTURE_SCAN_ID}/events`,
    report: '/api/v1/report/pdf',
  },
};

const PARTIAL: ScanDetail = {
  id: FIXTURE_PARTIAL_SCAN_ID,
  repository: REPOSITORY,
  status: 'completed',
  ref: 'main',
  commitSha: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
  score: 74.1,
  grade: null,
  previousScore: null,
  sectionScores: {
    '5': 80.0,
    '6': 58.3,
    '7': 90.0,
    '8(4)': 62.5,
    '8(5)': null,
    '9': 100.0,
    '10': 70.0,
    '12': null,
    '13': 50.0,
    '16': null,
  },
  counts: { critical: 1, high: 2, medium: 3, low: 1, info: 0, total: 7 },
  coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'timed_out' },
  scannerVersions: { semgrep: '1.95.0', checkov: '3.2.0', gitleaks: '8.21.0' },
  rulePackVersion: '2026.10.1',
  scoringVersion: '1.0.0',
  error: null,
  timestamps: {
    queuedAt: '2026-11-06T08:02:11.004Z',
    startedAt: '2026-11-06T08:02:38.771Z',
    completedAt: '2026-11-06T08:09:52.318Z',
    durationMs: 433_547,
  },
  links: {
    findings: `/api/v1/scan/${FIXTURE_PARTIAL_SCAN_ID}/findings`,
    events: `/api/v1/scan/${FIXTURE_PARTIAL_SCAN_ID}/events`,
    report: '/api/v1/report/pdf',
  },
};

export const FIXTURE_SCANS: readonly ScanDetail[] = [FULL, PARTIAL];

export function getFixtureScan(scanId: string): ScanDetail {
  const scan = FIXTURE_SCANS.find((candidate) => candidate.id === scanId);
  if (scan === undefined) throw new FixtureNotFoundError('The scan does not exist.');
  return structuredClone(scan);
}
