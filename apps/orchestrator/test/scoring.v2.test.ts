import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import type { ControlResultLike } from '../src/modules/scoring/control-evaluator.js';
import { scoreScanV2 } from '../src/modules/scoring/scoring.v2.js';

const control = (code: string, section: string, weight: number): Control => ({
  code,
  section,
  title: 'title',
  summary: 'summary',
  obligation: 'obligation',
  legalReference: 'DPDPA',
  severity: 'high',
  weight,
  evidenceStrength: 'direct',
  scored: true,
  appliesWhen: {},
  remediation: 'fix',
  tags: [],
});

const result = (
  controlCode: string,
  verdict: ControlResultLike['verdict'],
  reasonCode = 'test',
): ControlResultLike => ({
  controlCode,
  verdict,
  reasonCode,
  confidence: null,
  evidence: [],
  rulePackVersion: 'dpdpa-2026.10.6',
  scoringVersion: 'scoring-2.0.0',
});

describe('scoreScanV2', () => {
  it('excludes UNKNOWN from the score and reports zero evidence coverage', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      results: [result('DPDPA-8.4-SECRET-01', 'UNKNOWN', 'no_determinable_evidence')],
      coverage: 'full',
    });
    expect(scored.score).toBeNull();
    expect(scored.grade).toBeNull();
    expect(scored.gradeWithheldReason).toBe('insufficient_evidence');
    expect(scored.evidenceCoverage).toBe(0);
    expect(scored.verdictCounts.UNKNOWN).toBe(1);
  });

  it('counts only active findings, matching the legacy engine', () => {
    const scored = scoreScanV2({
      findings: [
        { controlCode: 'DPDPA-8.4-SECRET-01', severity: 'critical', status: 'open' },
        { controlCode: 'DPDPA-8.4-ENC-01', severity: 'high', status: 'false_positive' },
        { controlCode: null, severity: 'medium', status: 'fixed' },
      ],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      results: [result('DPDPA-8.4-SECRET-01', 'PASS', 'positive_evidence')],
      coverage: 'full',
    });
    expect(scored.counts).toEqual({
      critical: 1,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      total: 1,
      mapped: 1,
      unmapped: 0,
      acceptedRisk: 0,
    });
  });

  it('gives no credit to a FAIL control', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      results: [result('DPDPA-8.4-SECRET-01', 'FAIL', 'cited_gap')],
      coverage: 'full',
    });
    expect(scored.score).toBe(0);
    expect(scored.grade).toBe('F');
    expect(scored.gradeWithheldReason).toBeNull();
    expect(scored.verdictCounts.FAIL).toBe(1);
  });

  it('caps the grade at C when evidence coverage is below 0.75', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [
        control('DPDPA-8.4-SECRET-01', '8(4)', 10),
        control('DPDPA-8.4-ENC-01', '8(4)', 10),
      ],
      facts: { languages: ['java'] },
      results: [
        result('DPDPA-8.4-SECRET-01', 'PASS', 'positive_evidence'),
        result('DPDPA-8.4-ENC-01', 'UNKNOWN', 'no_determinable_evidence'),
      ],
      coverage: 'full',
    });
    expect(scored.score).toBe(100);
    expect(scored.evidenceCoverage).toBe(0.5);
    expect(scored.grade).toBe('C');
  });

  it('withholds the grade when scanner coverage is partial', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      results: [result('DPDPA-8.4-SECRET-01', 'PASS', 'positive_evidence')],
      coverage: 'partial',
    });
    expect(scored.score).toBe(100);
    expect(scored.grade).toBeNull();
    expect(scored.gradeWithheldReason).toBe('partial_coverage');
  });

  it('preserves the legacy false-pass behaviour through version dispatch', async () => {
    const { scoreScanVersioned } = await import('../src/modules/scoring/scoring.engine.js');
    const legacy = scoreScanVersioned({
      findings: [],
      controls: [control('DPDPA-8.4-SECRET-01', '8(4)', 10)],
      facts: { languages: ['java'] },
      scoringVersion: '1.0.0',
    });
    expect(legacy.score).toBe(100);
    expect(legacy.grade).toBe('A');
  });
});
