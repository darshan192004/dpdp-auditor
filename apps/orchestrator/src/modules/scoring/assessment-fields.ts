import { Prisma } from '@prisma/client';
import type { VersionedScoreResult } from './scoring.engine.js';

type V2ScoreResult = Extract<VersionedScoreResult, { evidenceCoverage: number | null }>;

function v2Result(result: VersionedScoreResult): V2ScoreResult | null {
  return 'evidenceCoverage' in result ? result : null;
}

/** Fields persisted on scans.evidenceCoverage/verdictCounts/unknownControls/gradeWithheldReason. */
export function scanAssessmentUpdate(result: VersionedScoreResult) {
  const v2 = v2Result(result);
  if (v2 === null) return {};
  return {
    evidenceCoverage: v2.evidenceCoverage === null ? null : new Prisma.Decimal(v2.evidenceCoverage),
    verdictCounts: v2.verdictCounts,
    unknownControls: v2.unknownControls,
    gradeWithheldReason: v2.gradeWithheldReason,
  };
}

/** Same assessment in JSON-safe form for score_recomputed events and API responses. */
export function assessmentEventFields(result: VersionedScoreResult) {
  const v2 = v2Result(result);
  if (v2 === null) return {};
  return {
    evidenceCoverage: v2.evidenceCoverage,
    verdictCounts: v2.verdictCounts,
    unknownControls: v2.unknownControls,
    openGaps: v2.openGaps,
    gradeWithheldReason: v2.gradeWithheldReason,
  };
}
