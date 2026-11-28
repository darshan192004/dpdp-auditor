import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import type { ControlResultLike } from '../src/modules/scoring/control-evaluator.js';
import { scoreScanV2 } from '../src/modules/scoring/scoring.v2.js';

const control: Control = {
  code: 'DPDPA-8.4-SECRET-01',
  section: '8(4)',
  title: 'Secrets are not stored in source',
  summary: 'No service credential should be stored in source.',
  obligation: 'Use managed secret storage.',
  legalReference: 'DPDPA Section 8(4)',
  severity: 'critical',
  weight: 4,
  evidenceStrength: 'direct',
  scored: true,
  appliesWhen: {},
  remediation: 'Store the credential outside source.',
  tags: [],
};

function result(
  verdict: ControlResultLike['verdict'],
  controlCode = control.code,
): ControlResultLike {
  return {
    controlCode,
    verdict,
    reasonCode: verdict.startsWith('ATTESTED') ? 'attested_pass' : 'positive_evidence',
    confidence: verdict.startsWith('ATTESTED') ? null : 'direct',
    evidence: [],
    rulePackVersion: 'dpdpa-2026.11.0',
    scoringVersion: 'scoring-2.0.0',
  };
}

describe('attestation scoring caps', () => {
  it('gives an attested pass half credit but no evidence coverage', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control],
      facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
      coverage: 'full',
      results: [result('ATTESTED_PASS')],
    });

    expect(scored.score).toBe(50);
    expect(scored.evidenceCoverage).toBe(0);
    expect(scored.grade).toBeNull();
    expect(scored.gradeWithheldReason).toBe('insufficient_evidence');
    expect(scored.verdictCounts.ATTESTED_PASS).toBe(1);
  });

  it('excludes an attested fail from the failure-driven critical cap input', () => {
    const scored = scoreScanV2({
      findings: [],
      controls: [control],
      facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
      coverage: 'full',
      results: [result('ATTESTED_FAIL')],
    });

    expect(scored.score).toBe(0);
    expect(scored.evidenceCoverage).toBe(0);
    expect(scored.sections[0]?.failedWeight).toBe(0);
    expect(scored.verdictCounts.ATTESTED_FAIL).toBe(1);
  });

  it('counts code evidence as coverage alongside an attested control', () => {
    const second: Control = { ...control, code: 'DPDPA-5-NOTICE-01', section: '5' };
    const scored = scoreScanV2({
      findings: [],
      controls: [control, second],
      facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
      coverage: 'full',
      results: [result('ATTESTED_PASS'), result('PASS', second.code)],
    });

    expect(scored.sections.find((section) => section.section === '8(4)')?.evidenceCoverage).toBe(0);
    expect(scored.sections.find((section) => section.section === '5')?.evidenceCoverage).toBe(1);
  });
});
