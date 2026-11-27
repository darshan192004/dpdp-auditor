import { z } from 'zod';
import { CONTROL_CODE_PATTERN } from './fingerprint';

export const READINESS_CONFIDENCES = ['direct', 'inferred', 'advisory'] as const;
export const readinessConfidenceSchema = z.enum(READINESS_CONFIDENCES);
export type ReadinessConfidence = z.infer<typeof readinessConfidenceSchema>;

export const READINESS_VERDICTS = [
  'PASS',
  'FAIL',
  'PARTIAL',
  'UNKNOWN',
  'NOT_APPLICABLE',
  'MANUAL',
  'ATTESTED_PASS',
  'ATTESTED_FAIL',
] as const;
export const readinessVerdictSchema = z.enum(READINESS_VERDICTS);
export type ReadinessVerdict = z.infer<typeof readinessVerdictSchema>;

export const FINDING_KINDS = [
  'violation',
  'missing_control',
  'weak_control',
  'positive',
  'unverified',
] as const;
export const findingKindSchema = z.enum(FINDING_KINDS);
export type FindingKind = z.infer<typeof findingKindSchema>;

export const DETECTOR_STATUSES = ['completed', 'failed', 'timed_out', 'skipped'] as const;
export const detectorStatusSchema = z.enum(DETECTOR_STATUSES);
export type DetectorStatus = z.infer<typeof detectorStatusSchema>;

export const evidenceReferenceSchema = z
  .object({
    kind: findingKindSchema,
    scanner: z.enum(['semgrep', 'checkov', 'gitleaks', 'inventory']).optional(),
    scannerRuleId: z.string().min(1).optional(),
    evidenceHash: z
      .string()
      .regex(/^sha256:[0-9a-f]{64}$/)
      .nullable()
      .optional(),
    filePath: z.string().min(1).nullable().optional(),
    lineStart: z.number().int().positive().nullable().optional(),
    lineEnd: z.number().int().positive().nullable().optional(),
    fingerprint: z.string().min(1).optional(),
  })
  .strict();
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const controlResultSchema = z
  .object({
    controlCode: z.string().regex(CONTROL_CODE_PATTERN),
    verdict: readinessVerdictSchema,
    reasonCode: z.string().min(1),
    confidence: readinessConfidenceSchema.nullable(),
    evidence: z.array(evidenceReferenceSchema),
    rulePackVersion: z.string().min(1),
    scoringVersion: z.string().min(1),
  })
  .strict();
export type ControlResult = z.infer<typeof controlResultSchema>;

export const GRADE_WITHHELD_REASONS = ['partial_coverage', 'insufficient_evidence'] as const;
export const gradeWithheldReasonSchema = z.enum(GRADE_WITHHELD_REASONS);
export type GradeWithheldReason = z.infer<typeof gradeWithheldReasonSchema>;

export const assessmentSummarySchema = z
  .object({
    score: z.number().min(0).max(100).nullable(),
    evidenceCoverage: z.number().min(0).max(1).nullable(),
    openGaps: z.number().int().nonnegative(),
    verdictCounts: z.partialRecord(readinessVerdictSchema, z.number().int().nonnegative()),
    unknownControls: z.array(z.string().regex(CONTROL_CODE_PATTERN)),
    detectorStatuses: z.record(z.string().min(1), detectorStatusSchema),
    gradeWithheldReason: gradeWithheldReasonSchema.nullable(),
    consentGatingRatio: z.number().min(0).max(1).nullable(),
  })
  .strict();
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;
