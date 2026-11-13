import { beforeEach, describe, expect, it } from 'vitest';

import {
  FIXTURE_FINDINGS,
  FIXTURE_SCAN_ID,
  FixtureNotFoundError,
  FixtureValidationError,
  listFixtureFindings,
  resetFixtureState,
  triageFixtureFinding,
} from '../server/utils/fixtures/findings';
import { DEFAULT_FINDINGS_FILTERS } from '../shared/findings';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function filters(overrides: Partial<typeof DEFAULT_FINDINGS_FILTERS> = {}) {
  return { ...DEFAULT_FINDINGS_FILTERS, ...overrides };
}

beforeEach(() => resetFixtureState());

describe('fixture findings', () => {
  it('are contract-shaped and cover every severity, scanner and status', () => {
    expect(FIXTURE_FINDINGS.length).toBeGreaterThanOrEqual(12);

    for (const finding of FIXTURE_FINDINGS) {
      expect(finding.id).toMatch(UUID);
      expect(finding.scanId).toBe(FIXTURE_SCAN_ID);
      expect(finding.evidence.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(finding.lineEnd).toBeGreaterThanOrEqual(finding.lineStart);
    }

    expect(new Set(FIXTURE_FINDINGS.map((finding) => finding.severity))).toEqual(
      new Set(['critical', 'high', 'medium', 'low', 'info']),
    );
    expect(new Set(FIXTURE_FINDINGS.map((finding) => finding.scanner))).toEqual(
      new Set(['semgrep', 'checkov', 'gitleaks']),
    );
    expect(new Set(FIXTURE_FINDINGS.map((finding) => finding.status))).toEqual(
      new Set(['open', 'false_positive', 'accepted_risk', 'fixed', 'reopened']),
    );
  });

  it('never expose redacted evidence for secret findings', () => {
    for (const finding of FIXTURE_FINDINGS.filter((item) => item.scanner === 'gitleaks')) {
      expect(finding.evidence).not.toHaveProperty('redacted');
    }
  });

  it('default to newest-first critical findings', () => {
    const { data } = listFixtureFindings(filters({ pageSize: 100 }));
    const rank = ['critical', 'high', 'medium', 'low', 'info'];

    expect(data.length).toBe(FIXTURE_FINDINGS.length);
    for (let index = 1; index < data.length; index += 1) {
      const previous = rank.indexOf(data[index - 1]!.severity);
      const current = rank.indexOf(data[index]!.severity);
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });

  it('filter by severity, scanner, section and status', () => {
    const critical = listFixtureFindings(filters({ severity: ['critical'] }));
    expect(critical.data.every((finding) => finding.severity === 'critical')).toBe(true);

    const secrets = listFixtureFindings(filters({ scanner: ['gitleaks'] }));
    expect(secrets.data.every((finding) => finding.scanner === 'gitleaks')).toBe(true);

    const section = listFixtureFindings(filters({ section: ['8(4)'] }));
    expect(section.data.every((finding) => finding.dpdpa?.section === '8(4)')).toBe(true);

    const accepted = listFixtureFindings(filters({ status: ['accepted_risk'] }));
    expect(accepted.data.every((finding) => finding.status === 'accepted_risk')).toBe(true);
  });

  it('prefix-match the file path', () => {
    const { data } = listFixtureFindings(filters({ file: 'services/payments' }));

    expect(data.length).toBeGreaterThan(0);
    expect(data.every((finding) => finding.filePath.startsWith('services/payments'))).toBe(true);
  });

  it('search message and scanner rule id case-insensitively', () => {
    const byMessage = listFixtureFindings(filters({ q: 'PUBLIC READ' }));
    expect(byMessage.data.length).toBeGreaterThan(0);

    const byRuleId = listFixtureFindings(filters({ q: 'CKV_AWS_20' }));
    expect(byRuleId.data.length).toBeGreaterThan(0);
    expect(byRuleId.data.every((finding) => finding.scannerRuleId.includes('CKV_AWS_20'))).toBe(
      true,
    );
  });

  it('paginate on the server and report the full total', () => {
    const first = listFixtureFindings(filters({ pageSize: 5 }));
    const second = listFixtureFindings(filters({ pageSize: 5, page: 2 }));

    expect(first.data).toHaveLength(5);
    expect(second.data).toHaveLength(5);
    expect(first.data[0]!.id).not.toBe(second.data[0]!.id);
    expect(first.pagination).toEqual({
      page: 1,
      pageSize: 5,
      totalItems: FIXTURE_FINDINGS.length,
      totalPages: Math.ceil(FIXTURE_FINDINGS.length / 5),
    });
  });

  it('return an empty page past the end without losing totalPages', () => {
    const { data, pagination } = listFixtureFindings(filters({ page: 99, pageSize: 10 }));

    expect(data).toEqual([]);
    expect(pagination.totalItems).toBe(FIXTURE_FINDINGS.length);
    expect(pagination.totalPages).toBe(Math.ceil(FIXTURE_FINDINGS.length / 10));
  });

  it('sort by file ascending and line descending', () => {
    const byFile = listFixtureFindings(filters({ sort: 'file', pageSize: 100 })).data;
    const files = byFile.map((finding) => finding.filePath);
    expect([...files].sort()).toEqual(files);

    const byLine = listFixtureFindings(filters({ sort: '-lineStart', pageSize: 100 })).data;
    const lines = byLine.map((finding) => finding.lineStart);
    expect([...lines].sort((a, b) => b - a)).toEqual(lines);
  });

  it('reject an unknown scan id', () => {
    expect(() => listFixtureFindings(filters(), '00000000-0000-4000-8000-000000000000')).toThrow(
      FixtureNotFoundError,
    );
  });
});

describe('fixture triage', () => {
  const openFinding = () => FIXTURE_FINDINGS.find((finding) => finding.status === 'open')!;

  it('records the disposition and the note', () => {
    const finding = openFinding();
    const result = triageFixtureFinding(finding.id, {
      status: 'false_positive',
      note: 'Documented dummy credential in a test fixture.',
    });

    expect(result).toMatchObject({ id: finding.id, status: 'false_positive' });
    expect(result.triage.note).toBe('Documented dummy credential in a test fixture.');

    const reloaded = listFixtureFindings(filters({ pageSize: 100 })).data.find(
      (item) => item.id === finding.id,
    );
    expect(reloaded?.status).toBe('false_positive');
  });

  it('requires a note for the dispositions that hide risk', () => {
    const finding = openFinding();

    expect(() =>
      triageFixtureFinding(finding.id, { status: 'false_positive', note: 'too short' }),
    ).toThrow(FixtureValidationError);
    expect(() =>
      triageFixtureFinding(finding.id, { status: 'accepted_risk', note: 'short' }),
    ).toThrow(FixtureValidationError);
    expect(() =>
      triageFixtureFinding(finding.id, { status: 'accepted_risk', note: 'a'.repeat(20) }),
    ).not.toThrow();
  });

  it('rejects a non-HTTPS ticket link', () => {
    const finding = openFinding();

    expect(() =>
      triageFixtureFinding(finding.id, {
        status: 'open',
        externalUrl: 'http://tracker.example.test/T-1',
      }),
    ).toThrow(FixtureValidationError);
  });

  it('rejects an unknown finding id', () => {
    expect(() =>
      triageFixtureFinding('00000000-0000-4000-8000-000000000000', { status: 'open' }),
    ).toThrow(FixtureNotFoundError);
  });
});
