import { describe, expect, it } from 'vitest';
import type { Control } from '../src/modules/rule-pack/rule-pack.schemas.js';
import {
  evaluateControls,
  type ControlEvaluatorInput,
} from '../src/modules/scoring/control-evaluator.js';

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

function input(overrides: Partial<ControlEvaluatorInput> = {}): ControlEvaluatorInput {
  return {
    controls: [control],
    facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
    mappings: [{ scanner: 'gitleaks', controlCode: control.code }],
    detectorStatuses: { gitleaks: 'completed' },
    findings: [],
    rulePackVersion: 'dpdpa-2026.11.0',
    scoringVersion: 'scoring-2.0.0',
    ...overrides,
  };
}

describe('attestation evaluator semantics', () => {
  it('lets code evidence win over an attested answer', () => {
    const result = evaluateControls(
      input({
        findings: [
          {
            controlCode: control.code,
            kind: 'violation',
            scanner: 'gitleaks',
            scannerRuleId: 'generic-api-key',
            evidenceHash: 'sha256:code-only',
            severity: 'critical',
            confidence: 'direct',
            status: 'open',
          },
        ],
        attestationsByControl: new Map([
          [
            control.code,
            [{ key: 'secrets.managed_store', answer: true, attestedAt: '2026-11-27T00:00:00Z' }],
          ],
        ]),
      }),
    ).results[0]!;

    expect(result.verdict).toBe('FAIL');
    expect(result.reasonCode).toBe('cited_gap');
    expect(result.evidence.map((item) => item.evidenceHash)).toEqual(['sha256:code-only']);
  });

  it('uses an unexpired attested answer only when no code evidence is determinable', () => {
    const result = evaluateControls(
      input({
        attestationsByControl: new Map([
          [
            control.code,
            [{ key: 'secrets.managed_store', answer: true, attestedAt: '2026-11-27T00:00:00Z' }],
          ],
        ]),
      }),
    ).results[0]!;

    expect(result.verdict).toBe('ATTESTED_PASS');
    expect(result.reasonCode).toBe('attested_pass');
    expect(result.confidence).toBeNull();
    expect(result.evidence).toEqual([]);
  });

  it('uses a false attested answer when a required detector is unavailable', () => {
    const result = evaluateControls(
      input({
        detectorStatuses: { gitleaks: 'timed_out' },
        attestationsByControl: new Map([
          [
            control.code,
            [{ key: 'secrets.managed_store', answer: false, attestedAt: '2026-11-27T00:00:00Z' }],
          ],
        ]),
      }),
    ).results[0]!;

    expect(result.verdict).toBe('ATTESTED_FAIL');
    expect(result.reasonCode).toBe('attested_fail');
    expect(result.evidence).toEqual([]);
  });

  it('keeps UNKNOWN when no determinable evidence or attestation exists', () => {
    const result = evaluateControls(input()).results[0]!;
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCode).toBe('no_determinable_evidence');
  });
});
