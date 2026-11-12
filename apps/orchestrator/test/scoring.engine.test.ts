import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import { loadRulePack, type LoadedRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';
import type { FindingStatus, MappedFinding } from '../src/modules/scoring/mapping.resolver.js';
import {
  DEFAULT_SECTION_WEIGHTS,
  gradeFor,
  round2,
  scoreScan,
} from '../src/modules/scoring/scoring.engine.js';

const PACK_DIR = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));

/** Facts that make every control in the shipped pack applicable. */
const ALL_FACTS = {
  languages: ['python', 'javascript', 'typescript'],
  frameworks: ['django'],
  resourceTypes: [
    'aws_s3_bucket',
    'aws_db_instance',
    'azurerm_storage_account',
    'google_storage_bucket',
    'aws_lb_listener',
    'aws_cloudfront_distribution',
    'aws_security_group',
    'aws_instance',
    'kubernetes_deployment',
    'aws_cloudtrail',
    'azurerm_monitor_diagnostic_setting',
  ],
};

function finding(
  controlCode: string | null,
  status: FindingStatus = 'open',
  severity: MappedFinding['severity'] = 'high',
): Pick<MappedFinding, 'controlCode' | 'severity' | 'status'> {
  return { controlCode, severity, status };
}

function control(code: string, weight: number, section = '8(4)'): Control {
  return {
    code,
    section,
    title: 'title',
    summary: 'summary',
    obligation: 'obligation',
    legalReference: 'DPDPA Section 8(4)',
    severity: 'high',
    weight,
    evidenceStrength: 'direct',
    scored: true,
    appliesWhen: {},
    remediation: 'fix it',
    tags: [],
  };
}

describe('scoreScan (P4-08, P4-12)', () => {
  let pack: LoadedRulePack;

  beforeAll(async () => {
    pack = await loadRulePack(PACK_DIR);
  });

  const workedExample = [
    finding('DPDPA-6-CONSENT-01'),
    finding('DPDPA-6-WD-01'),
    finding('DPDPA-8.4-ENC-01'),
    finding('DPDPA-8.4-ACCESS-01'),
    finding('DPDPA-8.4-LOG-01'),
    finding('DPDPA-8.4-BACKUP-01'),
  ];

  function score(overrides: Partial<Parameters<typeof scoreScan>[0]> = {}) {
    return scoreScan({
      findings: workedExample,
      controls: pack.controls,
      facts: ALL_FACTS,
      sectionWeights: pack.sectionWeights,
      grades: pack.grades,
      ...overrides,
    });
  }

  it('matches the rules.md §9.7 worked example exactly', () => {
    const result = score();
    expect(result.sectionScores['6']).toBe(33.33);
    expect(result.sectionScores['8(4)']).toBe(47.62);
    expect(result.sectionScores['5']).toBe(100);
    expect(result.score).toBe(70.95);
    expect(result.grade).toBe('C');
    expect(result.coverage).toBe('full');
  });

  it('withholds the grade but keeps the provisional score on partial coverage', () => {
    const result = score({ coverage: 'partial' });
    expect(result.score).toBe(70.95);
    expect(result.grade).toBeNull();
    expect(result.coverage).toBe('partial');
  });

  it('scores 100 for applicable sections with no findings', () => {
    const result = score({ findings: [] });
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.counts.total).toBe(0);
  });

  it('excludes false_positive and fixed findings, but counts accepted_risk as a failure', () => {
    const falsePositive = score({ findings: [finding('DPDPA-8.4-ENC-01', 'false_positive')] });
    expect(falsePositive.sectionScores['8(4)']).toBe(100);
    expect(falsePositive.counts.total).toBe(0);

    const fixed = score({ findings: [finding('DPDPA-8.4-ENC-01', 'fixed')] });
    expect(fixed.sectionScores['8(4)']).toBe(100);

    const accepted = score({ findings: [finding('DPDPA-8.4-ENC-01', 'accepted_risk')] });
    expect(accepted.sectionScores['8(4)']).toBe(88.1);
    expect(accepted.counts.acceptedRisk).toBe(1);
  });

  it('excludes unscored controls from the numerator and denominator', () => {
    const result = score({ findings: [finding('DPDPA-12-ACCESS-01', 'open', 'medium')] });
    expect(result.sectionScores['12']).toBeUndefined();
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('ignores unmapped findings in the score and reports them separately', () => {
    const result = score({ findings: [finding(null, 'open', 'critical')] });
    expect(result.score).toBe(100);
    expect(result.counts.mapped).toBe(0);
    expect(result.counts.unmapped).toBe(1);
    expect(result.counts.critical).toBe(1);
  });

  it('applies applicability facts to both numerator and denominator', () => {
    const noIaC = score({
      findings: [finding('DPDPA-8.4-ENC-01')],
      facts: { languages: ['python'] },
    });
    expect(noIaC.sectionScores['8(4)']).toBe(100);
    expect(noIaC.sections.find((s) => s.section === '8(4)')?.applicableWeight).toBe(24);
  });

  it('returns null score and grade when nothing is assessed', () => {
    const result = score({ controls: [], findings: [] });
    expect(result.score).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.sectionScores).toEqual({});
    expect(result.sections).toEqual([]);
  });

  it('rounds half-up at two decimals', () => {
    const result = scoreScan({
      findings: [finding('DPDPA-8.4-ENC-01')],
      controls: [control('DPDPA-8.4-ENC-01', 1), control('DPDPA-8.4-TLS-01', 2)],
      facts: {},
    });
    expect(result.sectionScores['8(4)']).toBe(66.67);
    expect(result.score).toBe(66.67);
    expect(result.grade).toBe('D');
    expect(result.sections[0]?.sectionWeight).toBe(30);
    expect(result.sections[0]?.assessed).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    expect(score()).toEqual(score());
  });

  it('maps grades at the band boundaries', () => {
    expect(gradeFor(90, pack.grades)).toBe('A');
    expect(gradeFor(89.99, pack.grades)).toBe('B');
    expect(gradeFor(79.99, pack.grades)).toBe('C');
    expect(gradeFor(60, pack.grades)).toBe('D');
    expect(gradeFor(59.99, pack.grades)).toBe('F');
    expect(round2(47.619047)).toBe(47.62);
    expect(round2(33.333333)).toBe(33.33);
    expect(DEFAULT_SECTION_WEIGHTS['8(4)']).toBe(30);
  });
});
