import { describe, expect, it } from 'vitest';

import {
  coverageFor,
  formatDuration,
  formatScore,
  formatTimestamp,
  scanSections,
  sectionStatus,
  shortCommit,
  trendFor,
} from '../shared/scan';
import {
  FIXTURE_PARTIAL_SCAN_ID,
  FIXTURE_SCANS,
  getFixtureScan,
} from '../server/utils/fixtures/scans';
import {
  FIXTURE_FINDINGS,
  FIXTURE_SCAN_ID,
  FixtureNotFoundError,
} from '../server/utils/fixtures/findings';

describe('coverageFor (docs/api.md §3.2)', () => {
  it('is full only when every scanner completed', () => {
    expect(
      coverageFor({ semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' }),
    ).toEqual({ state: 'full', note: null });
  });

  it('explains which scanner held coverage back', () => {
    const coverage = coverageFor({
      semgrep: 'completed',
      checkov: 'completed',
      gitleaks: 'timed_out',
    });

    expect(coverage.state).toBe('partial');
    expect(coverage.note).toBe('Coverage incomplete: Gitleaks timed out.');
  });

  it('treats a scanner that never reported as not run', () => {
    expect(coverageFor({ semgrep: 'completed' })).toEqual({
      state: 'partial',
      note: 'Coverage incomplete: Checkov did not run, Gitleaks did not run.',
    });
  });

  it('lists every incomplete scanner in catalog order', () => {
    const coverage = coverageFor({ semgrep: 'failed', checkov: 'skipped', gitleaks: 'completed' });

    expect(coverage.note).toBe('Coverage incomplete: Semgrep failed, Checkov was skipped.');
  });
});

describe('sectionStatus (docs/design.md §5.2)', () => {
  it('maps the design examples to statuses', () => {
    expect(sectionStatus(100)).toBe('compliant');
    expect(sectionStatus(90)).toBe('compliant');
    expect(sectionStatus(89.9)).toBe('partial');
    expect(sectionStatus(85)).toBe('partial');
    expect(sectionStatus(75)).toBe('partial');
    expect(sectionStatus(68.2)).toBe('non_compliant');
    expect(sectionStatus(null)).toBe('not_assessed');
  });
});

describe('scanSections', () => {
  const rows = scanSections({
    '8(4)': 68.2,
    '6': 61.5,
    '5': 85,
    '16': 100,
    '12': null,
    '99': 50,
  });

  it('sorts worst first and sinks unassessed sections to the bottom', () => {
    expect(rows.map((row) => row.section)).toEqual(['99', '6', '8(4)', '5', '16', '12']);
  });

  it('labels known sections and falls back to the raw code', () => {
    expect(rows.find((row) => row.section === '8(4)')?.label).toBe('Security safeguards');
    expect(rows.find((row) => row.section === '99')?.label).toBe('99');
    expect(rows.find((row) => row.section === '12')?.status).toBe('not_assessed');
  });
});

describe('trendFor', () => {
  it('reports a rounded delta and direction', () => {
    expect(trendFor(82.6, 78.4)).toEqual({ delta: 4.2, direction: 'up' });
    expect(trendFor(72.4, 78.4)).toEqual({ delta: -6, direction: 'down' });
    expect(trendFor(80, 80)).toEqual({ delta: 0, direction: 'flat' });
  });

  it('has no trend without a current or previous score', () => {
    expect(trendFor(null, 78.4)).toBeNull();
    expect(trendFor(82.6, null)).toBeNull();
    expect(trendFor(82.6, undefined)).toBeNull();
  });
});

describe('scan formatting', () => {
  it('never renders a missing score as zero', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(82.64)).toBe('82.6');
  });

  it('formats timestamps in UTC and durations compactly', () => {
    expect(formatTimestamp('2026-11-04T09:37:04.903Z')).toBe('2026-11-04 09:37 UTC');
    expect(formatTimestamp(null)).toBe('—');
    expect(formatDuration(322_422)).toBe('5m 22s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(120_000)).toBe('2m');
    expect(formatDuration(null)).toBe('—');
  });

  it('shortens a commit to seven characters', () => {
    expect(shortCommit('9f2c1d7e4b8a6c0f')).toBe('9f2c1d7');
    expect(shortCommit(null)).toBe('—');
  });
});

describe('fixture scans', () => {
  it('agree with the findings fixtures on counts and scan id', () => {
    const full = getFixtureScan(FIXTURE_SCAN_ID);
    const counts = FIXTURE_FINDINGS.reduce<Record<string, number>>((totals, finding) => {
      totals[finding.severity] = (totals[finding.severity] ?? 0) + 1;
      return totals;
    }, {});

    expect(full.id).toBe(FIXTURE_SCAN_ID);
    expect(full.counts).toEqual({
      critical: counts.critical,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      info: counts.info,
      total: FIXTURE_FINDINGS.length,
    });
  });

  it('include one graded scan and one with withheld grade', () => {
    const full = getFixtureScan(FIXTURE_SCAN_ID);
    const partial = getFixtureScan(FIXTURE_PARTIAL_SCAN_ID);

    expect(full.grade).toBe('B');
    expect(full.previousScore).not.toBeNull();
    expect(partial.grade).toBeNull();
    expect(coverageFor(partial.coverage).state).toBe('partial');
  });

  it('returns a copy so callers cannot mutate fixture state', () => {
    const first = getFixtureScan(FIXTURE_SCAN_ID);
    first.counts.critical = 99;

    expect(getFixtureScan(FIXTURE_SCAN_ID).counts.critical).not.toBe(99);
    expect(FIXTURE_SCANS).toHaveLength(2);
  });

  it('rejects an unknown scan', () => {
    expect(() => getFixtureScan('0f000000-0000-4000-8000-0000000000ff')).toThrow(
      FixtureNotFoundError,
    );
  });
});
