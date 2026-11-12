import type { Control, GradeBand, Severity } from '../rule-pack/rule-pack.schemas.js';
import { isApplicable, type RepoFacts } from './applicability.js';
import type { FindingStatus, MappedFinding } from './mapping.resolver.js';

/** rules.md §9.3. Sections 12, 14, and 15 carry no weight. */
export const DEFAULT_SECTION_WEIGHTS: Record<string, number> = {
  '8(4)': 30,
  '6': 20,
  '5': 10,
  '7': 10,
  '9': 10,
  '10': 5,
  '13': 5,
  '8(5)': 5,
  '16': 5,
};

/** rules.md §9.4. Bands are inclusive and contiguous at two decimals. */
export const DEFAULT_GRADES: GradeBand[] = [
  { grade: 'A', min: 90, max: 100 },
  { grade: 'B', min: 80, max: 89.99 },
  { grade: 'C', min: 70, max: 79.99 },
  { grade: 'D', min: 60, max: 69.99 },
  { grade: 'F', min: 0, max: 59.99 },
];

export interface ScoreInput {
  findings: readonly Pick<MappedFinding, 'controlCode' | 'severity' | 'status'>[];
  controls: readonly Control[];
  facts: RepoFacts;
  coverage?: 'full' | 'partial' | undefined;
  sectionWeights?: Record<string, number> | undefined;
  grades?: readonly GradeBand[] | undefined;
}

export interface SectionResult {
  section: string;
  score: number | null;
  applicableWeight: number;
  failedWeight: number;
  sectionWeight: number;
  assessed: boolean;
}

export interface ScoreCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
  mapped: number;
  unmapped: number;
  acceptedRisk: number;
}

export interface ScoreResult {
  score: number | null;
  grade: string | null;
  sectionScores: Record<string, number | null>;
  sections: SectionResult[];
  counts: ScoreCounts;
  coverage: 'full' | 'partial';
}

/**
 * P4-08. Pure and deterministic: no database, clock, or randomness. The
 * coverage flag only withholds the grade; the provisional score is still
 * computed from the evidence that was actually collected (rules.md §9.5).
 */
export function scoreScan(input: ScoreInput): ScoreResult {
  const coverage = input.coverage ?? 'full';
  const active = input.findings.filter(
    (finding) => finding.status !== 'false_positive' && finding.status !== 'fixed',
  );
  const counts = countFindings(active);

  const buckets = new Map<string, { applicable: number; failed: number }>();
  for (const control of input.controls) {
    if (!control.scored) continue;
    if (!isApplicable(control.appliesWhen, input.facts)) continue;
    const bucket = buckets.get(control.section) ?? { applicable: 0, failed: 0 };
    bucket.applicable += control.weight;
    if (active.some((finding) => finding.controlCode === control.code)) {
      bucket.failed += control.weight;
    }
    buckets.set(control.section, bucket);
  }

  const sectionWeights = input.sectionWeights ?? DEFAULT_SECTION_WEIGHTS;
  const sections: SectionResult[] = [...buckets.entries()]
    .map(([section, bucket]) => ({
      section,
      score: bucket.applicable === 0 ? null : round2(100 * (1 - bucket.failed / bucket.applicable)),
      applicableWeight: bucket.applicable,
      failedWeight: bucket.failed,
      sectionWeight: sectionWeights[section] ?? 0,
      assessed: bucket.applicable > 0,
    }))
    .sort((a, b) => (a.section < b.section ? -1 : 1));

  const sectionScores: Record<string, number | null> = {};
  for (const section of sections) {
    sectionScores[section.section] = section.score;
  }

  let numerator = 0;
  let denominator = 0;
  for (const section of sections) {
    if (section.score === null) continue;
    numerator += section.score * section.sectionWeight;
    denominator += section.sectionWeight;
  }
  const score = denominator === 0 ? null : round2(numerator / denominator);
  const grade =
    score === null || coverage === 'partial'
      ? null
      : gradeFor(score, input.grades ?? DEFAULT_GRADES);

  return { score, grade, sectionScores, sections, counts, coverage };
}

export function gradeFor(score: number, grades: readonly GradeBand[]): string | null {
  return grades.find((band) => score >= band.min && score <= band.max)?.grade ?? null;
}

/** Half-up rounding at two decimals (rules.md §9.6). */
export function round2(value: number): number {
  return Math.round((value + 1e-9) * 100) / 100;
}

function countFindings(
  findings: readonly Pick<MappedFinding, 'controlCode' | 'severity' | 'status'>[],
): ScoreCounts {
  const counts: ScoreCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: findings.length,
    mapped: 0,
    unmapped: 0,
    acceptedRisk: 0,
  };
  for (const finding of findings) {
    counts[finding.severity as Severity] += 1;
    if (finding.controlCode === null) counts.unmapped += 1;
    else counts.mapped += 1;
    if ((finding.status as FindingStatus) === 'accepted_risk') counts.acceptedRisk += 1;
  }
  return counts;
}
