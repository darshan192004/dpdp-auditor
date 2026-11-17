import {
  SCAN_STATUSES,
  ScanInputError,
  type ScanDetail,
  type ScanEvent,
  type ScanListPage,
} from '~~/shared/scan';
import { FIXTURE_SCAN_ID, FixtureNotFoundError } from './findings';

/**
 * Contract-shaped scan fixtures (docs/api.md §3.2, §3.5) for the scorecard,
 * progress view, and timeline.
 *
 * Three scans exist so the page can be exercised in every state the design
 * calls out: full coverage with a grade and a trend, partial coverage where the
 * grade is withheld, and a scan that is still running. Enabled only when
 * NUXT_FIXTURES=1 and no orchestrator is configured.
 */

const REPOSITORY = {
  id: '0f000000-0000-4000-8000-000000000020',
  fullName: 'acme/payments-service',
  visibility: 'private',
};

/** A completed scan where one scanner timed out: the grade is withheld. */
export const FIXTURE_PARTIAL_SCAN_ID = '0f000000-0000-4000-8000-000000000011';

/** A scan still in flight, so the progress view and polling have a subject. */
export const FIXTURE_RUNNING_SCAN_ID = '0f000000-0000-4000-8000-000000000012';

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

const RUNNING: ScanDetail = {
  id: FIXTURE_RUNNING_SCAN_ID,
  repository: REPOSITORY,
  status: 'scanning',
  ref: 'main',
  commitSha: '4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d',
  score: null,
  grade: null,
  previousScore: null,
  sectionScores: {},
  counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  coverage: { semgrep: 'completed', checkov: 'running', gitleaks: 'pending' },
  scannerVersions: { semgrep: '1.95.0', checkov: '3.2.0', gitleaks: '8.21.0' },
  rulePackVersion: '2026.10.1',
  scoringVersion: null,
  error: null,
  timestamps: {
    queuedAt: '2026-11-07T14:20:05.118Z',
    startedAt: '2026-11-07T14:20:31.907Z',
    completedAt: null,
    durationMs: null,
  },
  links: {
    findings: `/api/v1/scan/${FIXTURE_RUNNING_SCAN_ID}/findings`,
    events: `/api/v1/scan/${FIXTURE_RUNNING_SCAN_ID}/events`,
    report: '/api/v1/report/pdf',
  },
};

export const FIXTURE_SCANS: readonly ScanDetail[] = [FULL, PARTIAL, RUNNING];

export function getFixtureScan(scanId: string): ScanDetail {
  const scan = FIXTURE_SCANS.find((candidate) => candidate.id === scanId);
  if (scan === undefined) throw new FixtureNotFoundError('The scan does not exist.');
  return structuredClone(scan);
}

/*
 * Timelines follow docs/api.md §3.5: one row per lifecycle event with no file
 * contents or secret values in the payload.
 */
const FULL_EVENTS: ScanEvent[] = [
  { type: 'queued', at: '2026-11-04T09:31:22.481Z', payload: { ref: 'main', profile: 'standard' } },
  {
    type: 'job_created',
    at: '2026-11-04T09:31:49.112Z',
    payload: { jobName: 'scan-01j8z4a1' },
  },
  {
    type: 'clone_completed',
    at: '2026-11-04T09:32:31.884Z',
    payload: { durationMs: 41_800 },
  },
  {
    type: 'scanner_completed',
    at: '2026-11-04T09:34:58.220Z',
    payload: { scanner: 'semgrep', findings: 22 },
  },
  {
    type: 'scanner_completed',
    at: '2026-11-04T09:35:41.770Z',
    payload: { scanner: 'checkov', findings: 11 },
  },
  {
    type: 'scanner_completed',
    at: '2026-11-04T09:36:50.003Z',
    payload: { scanner: 'gitleaks', findings: 3 },
  },
  {
    type: 'score_computed',
    at: '2026-11-04T09:37:01.442Z',
    payload: { score: 82.6, grade: 'B' },
  },
  { type: 'completed', at: '2026-11-04T09:37:04.903Z', payload: { score: 82.6 } },
];

const PARTIAL_EVENTS: ScanEvent[] = [
  { type: 'queued', at: '2026-11-06T08:02:11.004Z', payload: { ref: 'main', profile: 'standard' } },
  {
    type: 'job_created',
    at: '2026-11-06T08:02:38.771Z',
    payload: { jobName: 'scan-01j8z9c4' },
  },
  {
    type: 'clone_completed',
    at: '2026-11-06T08:03:19.502Z',
    payload: { durationMs: 38_400 },
  },
  {
    type: 'scanner_completed',
    at: '2026-11-06T08:06:12.665Z',
    payload: { scanner: 'semgrep', findings: 9 },
  },
  {
    type: 'scanner_completed',
    at: '2026-11-06T08:07:44.130Z',
    payload: { scanner: 'checkov', findings: 4 },
  },
  {
    type: 'scanner_timed_out',
    at: '2026-11-06T08:09:48.771Z',
    payload: { scanner: 'gitleaks' },
  },
  { type: 'completed', at: '2026-11-06T08:09:52.318Z', payload: { score: 74.1 } },
];

const RUNNING_EVENTS: ScanEvent[] = [
  { type: 'queued', at: '2026-11-07T14:20:05.118Z', payload: { ref: 'main', profile: 'standard' } },
  {
    type: 'job_created',
    at: '2026-11-07T14:20:31.907Z',
    payload: { jobName: 'scan-01j8zq7m' },
  },
  {
    type: 'clone_completed',
    at: '2026-11-07T14:21:18.442Z',
    payload: { durationMs: 39_100 },
  },
  {
    type: 'scanner_completed',
    at: '2026-11-07T14:23:41.006Z',
    payload: { scanner: 'semgrep', findings: 17 },
  },
];

const FIXTURE_SCAN_EVENTS: Record<string, readonly ScanEvent[]> = {
  [FIXTURE_SCAN_ID]: FULL_EVENTS,
  [FIXTURE_PARTIAL_SCAN_ID]: PARTIAL_EVENTS,
  [FIXTURE_RUNNING_SCAN_ID]: RUNNING_EVENTS,
};

/** `GET /api/v1/scan/:scanId/events` (api.md §3.5), oldest first. */
export function getFixtureScanEvents(scanId: string): ScanEvent[] {
  const events = FIXTURE_SCAN_EVENTS[scanId];
  if (events === undefined) throw new FixtureNotFoundError('The scan does not exist.');
  return structuredClone([...events]);
}

/** Apply the live list contract before pagination, including chronological date bounds. */
export function fixtureScanList(
  query: Record<string, unknown> | string | string[] = {},
  source: readonly ScanDetail[] = FIXTURE_SCANS,
): ScanListPage {
  const input = typeof query === 'string' || Array.isArray(query) ? { status: query } : query;
  function scalar(key: string): string | undefined {
    const value = input[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new ScanInputError('Enter a single query value.', key);
    return value;
  }
  function positive(key: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
    const value = scalar(key);
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number) || number > max) {
      throw new ScanInputError('Enter a valid page or page size.', key);
    }
    return number;
  }
  function timestamp(key: string): number | undefined {
    const value = scalar(key);
    if (value === undefined) return undefined;
    const number = Date.parse(value);
    if (!Number.isFinite(number)) throw new ScanInputError('Enter a valid date.', key);
    return number;
  }
  const rawStatus = input.status;
  const statuses =
    rawStatus === undefined ? [] : Array.isArray(rawStatus) ? rawStatus : [rawStatus];
  if (
    statuses.length > 8 ||
    statuses.some(
      (value) => typeof value !== 'string' || !(SCAN_STATUSES as readonly string[]).includes(value),
    )
  ) {
    throw new ScanInputError('Choose a valid scan status.', 'status');
  }
  const repositoryId = scalar('repositoryId');
  if (
    repositoryId !== undefined &&
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(repositoryId)
  ) {
    throw new ScanInputError('Enter a valid repository ID.', 'repositoryId');
  }
  const from = timestamp('from');
  const to = timestamp('to');
  const page = positive('page', 1);
  const pageSize = positive('pageSize', 20, 100);
  const sort = scalar('sort') ?? '-createdAt';
  if (!['createdAt', '-createdAt', 'score', '-score'].includes(sort)) {
    throw new ScanInputError('Choose a valid sort order.', 'sort');
  }
  const matched = source.filter(
    (scan) =>
      (statuses.length === 0 || statuses.includes(scan.status)) &&
      (repositoryId === undefined ||
        scan.repository.id.toLowerCase() === repositoryId.toLowerCase()) &&
      (from === undefined || Date.parse(scan.timestamps.queuedAt) >= from) &&
      (to === undefined || Date.parse(scan.timestamps.queuedAt) <= to),
  );
  matched.sort((a, b) => {
    let comparison: number;
    if (sort.endsWith('score')) {
      comparison =
        a.score === b.score ? 0 : a.score === null ? 1 : b.score === null ? -1 : a.score - b.score;
    } else {
      comparison = Date.parse(a.timestamps.queuedAt) - Date.parse(b.timestamps.queuedAt);
    }
    return (sort.startsWith('-') ? -comparison : comparison) || a.id.localeCompare(b.id);
  });
  return {
    items: matched.slice((page - 1) * pageSize, page * pageSize).map((scan) => ({
      id: scan.id,
      repositoryId: scan.repository.id,
      repositoryFullName: scan.repository.fullName,
      status: scan.status,
      score: scan.score,
      grade: scan.grade,
      counts: scan.counts,
      createdAt: scan.timestamps.queuedAt,
      completedAt: scan.timestamps.completedAt,
    })),
    pagination: {
      page,
      pageSize,
      totalItems: matched.length,
      totalPages: Math.ceil(matched.length / pageSize),
    },
  };
}
