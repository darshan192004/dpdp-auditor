import type { ControlResultLike, EvidenceLike } from './control-evaluator.js';
import { canonicalControlResultsBytes } from './control-results-canonical.js';
import type { ScoreResultV2 } from './scoring.v2.js';

export interface RedactedSinkInput {
  controlResults: readonly ControlResultLike[];
  findings: readonly EvidenceLike[];
  score: ScoreResultV2;
  verdictCounts: unknown;
  unknownControls: readonly string[];
  detectorStatuses: unknown;
  evidenceCoverage: number | null;
}

export interface RedactedSinks {
  databaseRows: string;
  objectStorageReport: string;
  logLines: string;
  callbackBodies: string;
  apiResponses: string;
}

/**
 * Explicit allow-list projection of the Phase F sink fields. This is a
 * verification aid, not a production writer: the real serializers are
 * exercised by `phase-f-production-sink-containment.test.ts` (DB rows, API
 * views, report HTML, and log fields) and by the runner's signed-callback
 * containment test. Source content, matched values, and raw scanner output
 * never enter these strings.
 */
export function redactedSinks(input: RedactedSinkInput): RedactedSinks {
  const evidence = input.findings.map((finding) => ({
    kind: finding.kind,
    scanner: finding.scanner ?? null,
    scannerRuleId: finding.scannerRuleId ?? null,
    evidenceHash: finding.evidenceHash ?? null,
    filePath: finding.filePath ?? null,
    lineStart: finding.lineStart ?? null,
    lineEnd: finding.lineEnd ?? null,
    fingerprint: finding.fingerprint ?? null,
    severity: finding.severity,
    confidence: finding.confidence,
  }));
  return {
    databaseRows: canonicalControlResultsBytes(input.controlResults),
    objectStorageReport: JSON.stringify({
      score: input.score.score,
      grade: input.score.grade,
      sections: input.score.sections,
      findings: evidence,
    }),
    logLines: evidence
      .map((item) => `${item.fingerprint ?? 'no-fingerprint'} ${item.evidenceHash ?? 'no-hash'}`)
      .join('\n'),
    callbackBodies: JSON.stringify(evidence),
    apiResponses: JSON.stringify({
      score: input.score.score,
      evidenceCoverage: input.evidenceCoverage,
      verdictCounts: input.verdictCounts,
      unknownControls: input.unknownControls,
      detectorStatuses: input.detectorStatuses,
    }),
  };
}
