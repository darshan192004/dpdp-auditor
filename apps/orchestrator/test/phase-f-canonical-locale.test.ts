import { describe, expect, it } from 'vitest';
import type { ControlResultLike } from '../src/modules/scoring/control-evaluator.js';
import { canonicalControlResultsBytes } from '../src/modules/scoring/control-results-canonical.js';

const results: ControlResultLike[] = [
  {
    controlCode: 'DPDPA-B',
    verdict: 'PASS',
    reasonCode: 'ok',
    confidence: null,
    rulePackVersion: 'pack-1',
    scoringVersion: 'scoring-2.0.0',
    evidence: [
      {
        kind: 'violation',
        scanner: 'semgrep',
        scannerRuleId: 'rule-b',
        evidenceHash: 'sha256:b',
        filePath: 'src/b.ts',
        lineStart: 2,
        lineEnd: 2,
        fingerprint: 'b',
      },
    ],
  },
  {
    controlCode: 'DPDPA-A',
    verdict: 'UNKNOWN',
    reasonCode: 'detector_unavailable',
    confidence: null,
    rulePackVersion: 'pack-1',
    scoringVersion: 'scoring-2.0.0',
    evidence: [],
  },
];

describe('Phase F canonical control_results', () => {
  it('sorts byte-stably without locale-aware comparison', () => {
    const original = String.prototype.localeCompare;
    String.prototype.localeCompare = () => {
      throw new Error('localeCompare is not byte-stable');
    };
    try {
      const bytes = canonicalControlResultsBytes(results);
      expect(bytes.indexOf('"controlCode":"DPDPA-A"')).toBeLessThan(
        bytes.indexOf('"controlCode":"DPDPA-B"'),
      );
    } finally {
      String.prototype.localeCompare = original;
    }
  });
});
