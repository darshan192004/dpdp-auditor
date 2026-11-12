import { describe, expect, it } from 'vitest';
import type { Control, Mapping } from '../src/modules/rule-pack/rule-pack.schemas.js';
import { maxSeverity, resolveMappings } from '../src/modules/scoring/mapping.resolver.js';

function control(code: string, severity: Control['severity'] = 'high', section = '8(4)'): Control {
  return {
    code,
    section,
    title: 'title',
    summary: 'summary',
    obligation: 'obligation',
    legalReference: 'DPDPA Section 8(4)',
    severity,
    weight: 5,
    evidenceStrength: 'direct',
    scored: true,
    appliesWhen: {},
    remediation: 'fix it',
    tags: [],
  };
}

function mapping(overrides: Partial<Mapping> = {}): Mapping {
  return {
    scanner: 'checkov',
    ruleId: 'CKV_AWS_19',
    scannerRuleVersion: '*',
    controlCode: 'DPDPA-8.4-ENC-01',
    confidence: 'direct',
    rationale: 'rationale',
    remediationTemplate: 'template',
    ...overrides,
  };
}

const finding = {
  scanner: 'checkov' as const,
  scannerRuleId: 'CKV_AWS_19',
  scannerRuleVersion: '3.2.334',
  scannerSeverity: 'medium' as const,
  filePath: 'infra/storage.tf',
  lineStart: 14,
  lineEnd: 28,
  message: 'S3 bucket is unencrypted',
  evidenceHash: 'sha256:abc',
  fingerprint: 'fpt_base',
  context: { resourceType: 'aws_s3_bucket' },
};

const ENC = control('DPDPA-8.4-ENC-01');
const TLS = control('DPDPA-8.4-TLS-01');
const controls = new Map([
  [ENC.code, ENC],
  [TLS.code, TLS],
]);

describe('resolveMappings (P4-04, P4-07)', () => {
  it('maps a wildcard match and suffixes the fingerprint with the control code', () => {
    const [mapped] = resolveMappings(finding, [mapping()], controls);
    expect(mapped?.controlCode).toBe('DPDPA-8.4-ENC-01');
    expect(mapped?.fingerprint).toBe('fpt_base:DPDPA-8.4-ENC-01');
    expect(mapped?.confidence).toBe('direct');
    expect(mapped?.remediation).toBe('template');
    expect(mapped?.status).toBe('open');
  });

  it('uses the higher of scanner and control severity and keeps the original', () => {
    const [mapped] = resolveMappings(finding, [mapping()], controls);
    expect(mapped?.severity).toBe('high');
    expect(mapped?.scannerSeverity).toBe('medium');
    expect(mapped?.context.scannerSeverity).toBe('medium');
    expect(mapped?.context.resourceType).toBe('aws_s3_bucket');
  });

  it('prefers exact-version mappings over wildcards without merging', () => {
    const exact = mapping({ scannerRuleVersion: '3.2.334', controlCode: 'DPDPA-8.4-TLS-01' });
    const wildcard = mapping();
    const mapped = resolveMappings(finding, [wildcard, exact], controls);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.controlCode).toBe('DPDPA-8.4-TLS-01');
  });

  it('falls back to a wildcard when no exact version exists', () => {
    const exact = mapping({ scannerRuleVersion: '9.9.9', controlCode: 'DPDPA-8.4-TLS-01' });
    const wildcard = mapping();
    const mapped = resolveMappings(finding, [wildcard, exact], controls);
    expect(mapped.map((m) => m.controlCode)).toEqual(['DPDPA-8.4-ENC-01']);
  });

  it('fans out to every matching control and dedupes repeated controls', () => {
    const mapped = resolveMappings(
      finding,
      [
        mapping(),
        mapping({ controlCode: 'DPDPA-8.4-TLS-01' }),
        mapping({ controlCode: 'DPDPA-8.4-ENC-01' }),
      ],
      controls,
    );
    expect(mapped.map((m) => m.controlCode)).toEqual(['DPDPA-8.4-ENC-01', 'DPDPA-8.4-TLS-01']);
  });

  it('returns an unmapped finding when no mapping matches', () => {
    const [mapped] = resolveMappings(
      { ...finding, scannerRuleId: 'UNKNOWN' },
      [mapping()],
      controls,
    );
    expect(mapped?.controlCode).toBeNull();
    expect(mapped?.control).toBeNull();
    expect(mapped?.fingerprint).toBe('fpt_base');
    expect(mapped?.severity).toBe('medium');
    expect(mapped?.rationale).toBeNull();
  });

  it('fails closed when a mapping references an unknown control', () => {
    expect(() =>
      resolveMappings(finding, [mapping({ controlCode: 'DPDPA-9.9-XXX-99' })], controls),
    ).toThrow(/unknown control/);
  });

  it('ranks severities critical > high > medium > low > info', () => {
    expect(maxSeverity('info', 'critical')).toBe('critical');
    expect(maxSeverity('high', 'medium')).toBe('high');
    expect(maxSeverity('low', 'low')).toBe('low');
  });
});
