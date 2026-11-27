import type { ControlResultLike } from './control-evaluator.js';

interface CanonicalEvidence {
  kind: string;
  scanner: string | null;
  scannerRuleId: string | null;
  evidenceHash: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  fingerprint: string | null;
}

interface CanonicalResult {
  controlCode: string;
  verdict: string;
  reasonCode: string;
  confidence: string | null;
  rulePackVersion: string;
  scoringVersion: string;
  evidence: CanonicalEvidence[];
}

function compareBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Byte-stable serialization of control_results for CI determinism gates.
 * Volatile fields (timestamps, generated UUIDs, raw source) are not part of
 * the contract and are therefore never serialized here.
 */
export function canonicalControlResultsBytes(results: readonly ControlResultLike[]): string {
  const canonical: CanonicalResult[] = results
    .map((result) => ({
      controlCode: result.controlCode,
      verdict: result.verdict,
      reasonCode: result.reasonCode,
      confidence: result.confidence ?? null,
      rulePackVersion: result.rulePackVersion,
      scoringVersion: result.scoringVersion,
      evidence: result.evidence
        .map((item): CanonicalEvidence => ({
          kind: item.kind,
          scanner: item.scanner ?? null,
          scannerRuleId: item.scannerRuleId ?? null,
          evidenceHash: item.evidenceHash ?? null,
          filePath: item.filePath ?? null,
          lineStart: item.lineStart ?? null,
          lineEnd: item.lineEnd ?? null,
          fingerprint: item.fingerprint ?? null,
        }))
        .sort((a, b) => compareBytes(JSON.stringify(a), JSON.stringify(b))),
    }))
    .sort((a, b) => compareBytes(a.controlCode, b.controlCode));
  return JSON.stringify(canonical);
}
