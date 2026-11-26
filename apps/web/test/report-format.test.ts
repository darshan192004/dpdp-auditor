import { describe, expect, it } from 'vitest';

import {
  formatFindingControl,
  formatSectionScore,
  type ReportFindingControl,
} from '../app/utils/report-format';

const mapped: ReportFindingControl = {
  code: 'DPDPA-8.4-LOG-01',
  section: '8(4)',
  title: 'Personal data is not written to logs',
  severity: 'critical',
  rationale: 'A request body or user object is logged.',
};

describe('report formatting (explicit attribution)', () => {
  it('labels an unassessed section instead of a bare dash', () => {
    expect(formatSectionScore(null)).toBe('Not assessed');
  });

  it('keeps numeric section scores readable', () => {
    expect(formatSectionScore(0)).toBe('0');
    expect(formatSectionScore(66.67)).toBe('66.67');
    expect(formatSectionScore(100)).toBe('100');
  });

  it('attributes a mapped finding to its full DPDPA control', () => {
    expect(formatFindingControl(mapped)).toBe(
      'DPDPA-8.4-LOG-01 — Personal data is not written to logs',
    );
  });

  it('says a finding is unmapped instead of showing a bare dash', () => {
    expect(formatFindingControl(null)).toBe('Unmapped — no DPDPA control');
  });
});
