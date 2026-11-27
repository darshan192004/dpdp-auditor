import {
  DEFAULT_GRADES,
  DEFAULT_SECTION_WEIGHTS,
  gradeFor,
  round2,
  type ScoreCounts,
  type ScoreInput,
  type ScoreResult,
  type SectionResult,
} from './scoring.engine.js';
import type { ControlResultLike } from './control-evaluator.js';

export interface SectionResultV2 extends SectionResult {
  evidenceCoverage: number | null;
  verdictCounts: Partial<Record<ControlResultLike['verdict'], number>>;
}

export interface ScoreResultV2 extends ScoreResult {
  sections: SectionResultV2[];
  evidenceCoverage: number | null;
  verdictCounts: Record<ControlResultLike['verdict'], number>;
  unknownControls: string[];
  openGaps: number;
  gradeWithheldReason: 'partial_coverage' | 'insufficient_evidence' | null;
}

export interface ScoreInputV2 extends ScoreInput {
  results: readonly ControlResultLike[];
  partialCredit?: number | undefined;
}

interface Bucket {
  applicable: number;
  scoredWeight: number;
  creditWeight: number;
  determinableWeight: number;
  failedWeight: number;
  verdicts: Partial<Record<ControlResultLike['verdict'], number>>;
}

function emptyBucket(): Bucket {
  return {
    applicable: 0,
    scoredWeight: 0,
    creditWeight: 0,
    determinableWeight: 0,
    failedWeight: 0,
    verdicts: {},
  };
}

function round4(value: number): number {
  return Math.round((value + 1e-9) * 10000) / 10000;
}

function countFindingsV2(findings: ScoreInput['findings']): ScoreCounts {
  const active = findings.filter(
    (finding) => finding.status !== 'false_positive' && finding.status !== 'fixed',
  );
  const counts: ScoreCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: active.length,
    mapped: 0,
    unmapped: 0,
    acceptedRisk: 0,
  };
  for (const finding of active) {
    counts[finding.severity] += 1;
    if (finding.controlCode === null) counts.unmapped += 1;
    else counts.mapped += 1;
    if (finding.status === 'accepted_risk') counts.acceptedRisk += 1;
  }
  return counts;
}

/**
 * Evidence-backed scoring. UNKNOWN controls stay in the applicability
 * denominator (so they lower evidence coverage) but never enter the score
 * numerator or denominator, so missing evidence cannot earn credit.
 */
export function scoreScanV2(input: ScoreInputV2): ScoreResultV2 {
  const coverage = input.coverage ?? 'full';
  const sectionWeights = input.sectionWeights ?? DEFAULT_SECTION_WEIGHTS;
  const grades = input.grades ?? DEFAULT_GRADES;
  const partialCredit = input.partialCredit ?? 0.5;
  const controlByCode = new Map(input.controls.map((control) => [control.code, control]));
  const verdictCounts: ScoreResultV2['verdictCounts'] = {
    PASS: 0,
    FAIL: 0,
    PARTIAL: 0,
    UNKNOWN: 0,
    NOT_APPLICABLE: 0,
    MANUAL: 0,
    ATTESTED_PASS: 0,
    ATTESTED_FAIL: 0,
  };
  const buckets = new Map<string, Bucket>();

  for (const result of input.results) {
    verdictCounts[result.verdict] += 1;
    const control = controlByCode.get(result.controlCode);
    if (!control || !control.scored) continue;
    const bucket = buckets.get(control.section) ?? emptyBucket();

    const inapplicable = result.verdict === 'NOT_APPLICABLE' || result.verdict === 'MANUAL';
    if (!inapplicable) bucket.applicable += control.weight;
    if (inapplicable) {
      buckets.set(control.section, bucket);
      continue;
    }

    bucket.verdicts[result.verdict] = (bucket.verdicts[result.verdict] ?? 0) + 1;
    if (result.verdict === 'UNKNOWN') {
      buckets.set(control.section, bucket);
      continue;
    }

    const attested = result.verdict === 'ATTESTED_PASS' || result.verdict === 'ATTESTED_FAIL';
    const effectiveWeight = attested ? control.weight * 0.5 : control.weight;
    const multiplier = result.confidence === 'direct' || result.confidence === null ? 1 : 0.5;
    const credit =
      result.verdict === 'PASS' || result.verdict === 'ATTESTED_PASS'
        ? 1
        : result.verdict === 'PARTIAL'
          ? partialCredit * multiplier
          : 0;

    bucket.scoredWeight += effectiveWeight;
    bucket.creditWeight += credit * effectiveWeight;
    if (result.verdict === 'FAIL') bucket.failedWeight += control.weight;
    if (!attested) bucket.determinableWeight += control.weight;
    buckets.set(control.section, bucket);
  }

  const sectionCodes = [...new Set(input.controls.map((control) => control.section))];
  const sections: SectionResultV2[] = sectionCodes
    .map((section) => {
      const bucket = buckets.get(section) ?? emptyBucket();
      const assessed = bucket.scoredWeight > 0;
      return {
        section,
        score: assessed ? round2((100 * bucket.creditWeight) / bucket.scoredWeight) : null,
        applicableWeight: bucket.applicable,
        failedWeight: bucket.failedWeight,
        sectionWeight: sectionWeights[section] ?? 0,
        assessed,
        evidenceCoverage:
          bucket.applicable === 0 ? null : round4(bucket.determinableWeight / bucket.applicable),
        verdictCounts: bucket.verdicts,
      };
    })
    .sort((a, b) => a.section.localeCompare(b.section));

  const sectionScores: Record<string, number | null> = {};
  for (const section of sections) sectionScores[section.section] = section.score;

  let numerator = 0;
  let denominator = 0;
  let coverageNumerator = 0;
  let coverageDenominator = 0;
  for (const section of sections) {
    const weight = section.sectionWeight;
    if (section.assessed) {
      numerator += (section.score ?? 0) * weight;
      denominator += weight;
    }
    // Applicable sections with no determinable verdict still count as zero
    // coverage; they must not be excluded from the coverage denominator.
    if (section.evidenceCoverage !== null) {
      coverageNumerator += section.evidenceCoverage * weight;
      coverageDenominator += weight;
    }
  }

  const score = denominator === 0 ? null : round2(numerator / denominator);
  const evidenceCoverage =
    coverageDenominator === 0 ? null : round4(coverageNumerator / coverageDenominator);
  const hasCriticalFail = input.results.some(
    (result) =>
      result.verdict === 'FAIL' && controlByCode.get(result.controlCode)?.severity === 'critical',
  );

  let gradeWithheldReason: ScoreResultV2['gradeWithheldReason'] = null;
  let grade: string | null = null;
  if (coverage === 'partial') {
    gradeWithheldReason = 'partial_coverage';
  } else if (score === null || evidenceCoverage === null || evidenceCoverage < 0.5) {
    gradeWithheldReason = 'insufficient_evidence';
  } else {
    grade = gradeFor(score, grades);
    if (evidenceCoverage < 0.75 && grade !== null && ['A', 'B'].includes(grade)) grade = 'C';
    if (hasCriticalFail && grade !== null && ['A', 'B', 'C'].includes(grade)) grade = 'D';
  }

  return {
    score,
    grade,
    sectionScores,
    sections,
    counts: countFindingsV2(input.findings),
    coverage,
    evidenceCoverage,
    verdictCounts,
    unknownControls: input.results
      .filter((result) => result.verdict === 'UNKNOWN')
      .map((result) => result.controlCode),
    openGaps: verdictCounts.FAIL,
    gradeWithheldReason,
  };
}
