import { describe, expect, it } from 'vitest';

import { DEFAULT_FINDINGS_FILTERS } from '../shared/findings';
import {
  hasActiveFilters,
  parseFindingsQuery,
  serialiseFindingsQuery,
} from '../shared/findings-query';

describe('parseFindingsQuery (docs/design.md §7.4)', () => {
  it('returns defaults for an empty query', () => {
    expect(parseFindingsQuery({})).toEqual(DEFAULT_FINDINGS_FILTERS);
  });

  it('reads repeatable params supplied as arrays', () => {
    const filters = parseFindingsQuery({
      severity: ['critical', 'high'],
      scanner: ['semgrep'],
      section: ['8(4)'],
      status: ['open'],
    });

    expect(filters.severity).toEqual(['critical', 'high']);
    expect(filters.scanner).toEqual(['semgrep']);
    expect(filters.section).toEqual(['8(4)']);
    expect(filters.status).toEqual(['open']);
  });

  it('accepts a single value for a repeatable param', () => {
    expect(parseFindingsQuery({ severity: 'critical' }).severity).toEqual(['critical']);
  });

  it('drops values outside the allowed enums', () => {
    const filters = parseFindingsQuery({
      severity: ['critical', 'nope'],
      scanner: ['semgrep', 'trivy'],
      status: ['open', 'deleted'],
    });

    expect(filters.severity).toEqual(['critical']);
    expect(filters.scanner).toEqual(['semgrep']);
    expect(filters.status).toEqual(['open']);
  });

  it('de-duplicates repeatable values', () => {
    expect(parseFindingsQuery({ severity: ['high', 'high', 'low'] }).severity).toEqual([
      'high',
      'low',
    ]);
  });

  it('trims text filters and enforces their maximum length', () => {
    const filters = parseFindingsQuery({
      q: `  ${'a'.repeat(250)}  `,
      file: `  ${'b'.repeat(600)}  `,
      section: [' 8(4) ', ''],
    });

    expect(filters.q).toHaveLength(200);
    expect(filters.file).toHaveLength(512);
    expect(filters.section).toEqual(['8(4)']);
  });

  it('clamps page and pageSize into the API range', () => {
    expect(parseFindingsQuery({ page: '0' }).page).toBe(1);
    expect(parseFindingsQuery({ page: '-3' }).page).toBe(1);
    expect(parseFindingsQuery({ page: 'abc' }).page).toBe(1);
    expect(parseFindingsQuery({ pageSize: '1000' }).pageSize).toBe(100);
    expect(parseFindingsQuery({ pageSize: '0' }).pageSize).toBe(50);
    expect(parseFindingsQuery({ page: '4', pageSize: '25' })).toMatchObject({
      page: 4,
      pageSize: 25,
    });
  });

  it('falls back to the default sort for an unknown value', () => {
    expect(parseFindingsQuery({ sort: 'severity' }).sort).toBe('-severity');
    expect(parseFindingsQuery({ sort: 'file' }).sort).toBe('file');
  });

  it('ignores unknown keys', () => {
    const filters = parseFindingsQuery({ severity: 'high', orgId: 'attacker' });
    expect(filters).not.toHaveProperty('orgId');
  });
});

describe('serialiseFindingsQuery', () => {
  it('omits every default so a clean URL stays clean', () => {
    expect(serialiseFindingsQuery(DEFAULT_FINDINGS_FILTERS)).toEqual({});
  });

  it('keeps repeatable params as arrays for repeated query keys', () => {
    const query = serialiseFindingsQuery({
      ...DEFAULT_FINDINGS_FILTERS,
      severity: ['critical', 'high'],
      status: ['open'],
      q: 'logger',
      page: 2,
      pageSize: 25,
      sort: 'file',
    });

    expect(query).toEqual({
      severity: ['critical', 'high'],
      status: ['open'],
      q: 'logger',
      page: '2',
      pageSize: '25',
      sort: 'file',
    });
  });

  it('round-trips through parse without losing state', () => {
    const filters = {
      ...DEFAULT_FINDINGS_FILTERS,
      severity: ['critical'] as const,
      scanner: ['gitleaks'] as const,
      section: ['8(4)'],
      status: ['accepted_risk'] as const,
      file: 'services/payments',
      q: 'card',
      page: 3,
      pageSize: 25,
      sort: '-createdAt' as const,
    };

    expect(parseFindingsQuery(serialiseFindingsQuery({ ...filters }))).toEqual({ ...filters });
  });
});

describe('hasActiveFilters', () => {
  it('is false for defaults and for paging-only state', () => {
    expect(hasActiveFilters(DEFAULT_FINDINGS_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FINDINGS_FILTERS, page: 4, sort: 'file' })).toBe(false);
  });

  it('is true when any filter narrows the result set', () => {
    expect(hasActiveFilters({ ...DEFAULT_FINDINGS_FILTERS, severity: ['high'] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FINDINGS_FILTERS, q: 'log' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FINDINGS_FILTERS, file: 'src/' })).toBe(true);
  });
});
