import { describe, expect, it } from 'vitest';
import {
  assessmentSummarySchema,
  controlResultSchema,
  DETECTOR_STATUSES,
  FINDING_KINDS,
  READINESS_VERDICTS,
} from '../src/readiness';

describe('readiness contracts', () => {
  it('exposes the eight canonical verdicts', () => {
    expect(READINESS_VERDICTS).toEqual([
      'PASS',
      'FAIL',
      'PARTIAL',
      'UNKNOWN',
      'NOT_APPLICABLE',
      'MANUAL',
      'ATTESTED_PASS',
      'ATTESTED_FAIL',
    ]);
  });

  it('exposes the five finding kinds and four detector states', () => {
    expect(FINDING_KINDS).toEqual([
      'violation',
      'missing_control',
      'weak_control',
      'positive',
      'unverified',
    ]);
    expect(DETECTOR_STATUSES).toEqual(['completed', 'failed', 'timed_out', 'skipped']);
  });

  it('accepts a control result with hash-only evidence', () => {
    const result = controlResultSchema.parse({
      controlCode: 'DPDPA-8.4-SECRET-01',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      confidence: 'direct',
      evidence: [
        {
          kind: 'violation',
          scanner: 'gitleaks',
          scannerRuleId: 'generic-api-key',
          evidenceHash: 'sha256:2389c7fb2b3b53c985eba440fc8f23bc38c62d4abe0b6f857dc698dd8468f876',
          filePath: 'src/DOMInjection.java',
          lineStart: 63,
          lineEnd: 63,
          fingerprint: 'fp:webgoat:secret',
        },
      ],
      rulePackVersion: 'dpdpa-2026.10.6',
      scoringVersion: 'scoring-2.0.0',
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('rejects evidence carrying file contents', () => {
    const parsed = controlResultSchema.safeParse({
      controlCode: 'DPDPA-8.4-SECRET-01',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      confidence: 'direct',
      evidence: [
        {
          kind: 'violation',
          scanner: 'gitleaks',
          scannerRuleId: 'generic-api-key',
          snippet: 'token = "secret"',
        },
      ],
      rulePackVersion: 'dpdpa-2026.10.6',
      scoringVersion: 'scoring-2.0.0',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts the assessment summary shape', () => {
    const summary = assessmentSummarySchema.parse({
      score: null,
      evidenceCoverage: 0,
      openGaps: 0,
      verdictCounts: { UNKNOWN: 12 },
      unknownControls: [],
      detectorStatuses: { gitleaks: 'completed' },
      gradeWithheldReason: 'insufficient_evidence',
      consentGatingRatio: null,
    });
    expect(summary.gradeWithheldReason).toBe('insufficient_evidence');
  });
});
