import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import {
  buildDetectorStatuses,
  evaluateControls,
  type ControlEvaluatorInput,
  type EvidenceLike,
} from '../src/modules/scoring/control-evaluator.js';

function control(code: string): Control {
  return {
    code,
    section: '8(4)',
    title: 'Fixture control',
    summary: 'Fixture control',
    obligation: 'Fixture obligation',
    legalReference: 'DPDPA Section 8(4)',
    severity: 'high',
    weight: 1,
    evidenceStrength: 'direct',
    scored: true,
    appliesWhen: {},
    remediation: 'fixture-remediation',
    tags: [],
  };
}

const secret: Control = {
  code: 'DPDPA-8.4-SECRET-01',
  section: '8(4)',
  title: 'Secrets are not in source',
  summary: 'No service credential should be stored in source.',
  obligation: 'Use managed secret storage.',
  legalReference: 'DPDPA 8(4)',
  severity: 'critical',
  weight: 4,
  evidenceStrength: 'direct',
  scored: true,
  appliesWhen: {},
  remediation: 'Rotate the key and store it in a secret manager.',
  tags: [],
};

const input = (overrides: Partial<ControlEvaluatorInput> = {}): ControlEvaluatorInput => ({
  controls: [secret],
  facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
  mappings: [{ scanner: 'gitleaks', controlCode: secret.code }],
  detectorStatuses: { gitleaks: 'completed' },
  findings: [],
  rulePackVersion: 'dpdpa-2026.10.6',
  scoringVersion: 'scoring-2.0.0',
  ...overrides,
});

const directFinding = (): EvidenceLike => ({
  controlCode: secret.code,
  kind: 'violation',
  scanner: 'gitleaks',
  scannerRuleId: 'generic-api-key',
  evidenceHash: 'sha256:2389c7fb2b3b53c985eba440fc8f23bc38c62d4abe0b6f857dc698dd8468f876',
  filePath: 'src/DOMInjection.java',
  lineStart: 63,
  lineEnd: 63,
  fingerprint: 'fp:webgoat:secret',
  severity: 'critical',
  confidence: 'direct',
  status: 'open',
});

describe('evaluateControls', () => {
  it('returns UNKNOWN with no determinable evidence', () => {
    const result = evaluateControls(input()).results[0];
    expect(result).toMatchObject({
      controlCode: secret.code,
      verdict: 'UNKNOWN',
      reasonCode: 'no_determinable_evidence',
      evidence: [],
    });
  });

  it('returns FAIL with cited evidence for a direct violation', () => {
    const result = evaluateControls(input({ findings: [directFinding()] })).results[0];
    expect(result?.verdict).toBe('FAIL');
    expect(result?.reasonCode).toBe('cited_gap');
    expect(result?.evidence[0]?.evidenceHash).toBe(directFinding().evidenceHash);
  });

  it('returns PARTIAL for a single inferred finding and excludes it from FAIL counts', () => {
    const result = evaluateControls(
      input({ findings: [{ ...directFinding(), confidence: 'inferred' }] }),
    );
    expect(result.results[0]?.verdict).toBe('PARTIAL');
    expect(result.openGaps).toBe(0);
  });

  it('returns UNKNOWN detector_unavailable when a required detector failed', () => {
    const result = evaluateControls(input({ detectorStatuses: { gitleaks: 'failed' } })).results[0];
    expect(result?.verdict).toBe('UNKNOWN');
    expect(result?.reasonCode).toBe('detector_unavailable');
  });

  it('stays UNKNOWN when only inferred positive evidence exists and a required detector failed', () => {
    const result = evaluateControls(
      input({
        detectorStatuses: { gitleaks: 'failed', semgrep: 'completed' },
        findings: [
          {
            ...directFinding(),
            scanner: 'semgrep',
            kind: 'positive',
            confidence: 'inferred',
          },
        ],
      }),
    ).results[0];
    expect(result?.verdict).toBe('UNKNOWN');
    expect(result?.reasonCode).toBe('detector_unavailable');
  });

  it('still returns FAIL when a detector failed but another completed detector cited a gap', () => {
    const result = evaluateControls(
      input({
        detectorStatuses: { gitleaks: 'failed', semgrep: 'completed' },
        findings: [{ ...directFinding(), scanner: 'semgrep' }],
      }),
    ).results[0];
    expect(result?.verdict).toBe('FAIL');
  });

  it('returns NOT_APPLICABLE when appliesWhen is false', () => {
    const result = evaluateControls(
      input({ controls: [{ ...secret, appliesWhen: { language: 'ruby' } }] }),
    ).results[0];
    expect(result?.verdict).toBe('NOT_APPLICABLE');
  });

  it('returns UNKNOWN applicability_unavailable when facts are absent', () => {
    const result = evaluateControls(input({ facts: {} })).results[0];
    expect(result?.reasonCode).toBe('applicability_unavailable');
  });

  it('builds detector statuses from scan coverage', () => {
    expect(
      buildDetectorStatuses({ semgrep: 'completed', checkov: 'failed', gitleaks: 'timed_out' }),
    ).toEqual({ semgrep: 'completed', checkov: 'failed', gitleaks: 'timed_out' });
  });

  it('returns FAIL for cited missing_control evidence', () => {
    const result = evaluateControls({
      controls: [
        {
          ...control('DPDPA-8.4-MON-01'),
          appliesWhen: {},
        },
      ],
      facts: { languages: ['python'], frameworks: [], resourceTypes: [] },
      mappings: [{ scanner: 'schema_scan', controlCode: 'DPDPA-8.4-MON-01' }],
      detectorStatuses: { schema_scan: 'completed' },
      findings: [
        {
          controlCode: 'DPDPA-8.4-MON-01',
          kind: 'missing_control',
          scanner: 'schema_scan',
          severity: 'high',
          confidence: 'direct',
          status: 'open',
        },
      ],
      rulePackVersion: 'dpdpa-2026.11.0',
      scoringVersion: 'scoring-2.0.0',
    });

    expect(result.results[0]).toMatchObject({
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
    });
  });
});
