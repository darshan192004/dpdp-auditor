import { z } from 'zod';
import { CONTROL_CODE_PATTERN } from './fingerprint';
import { FINDING_SEVERITIES } from './finding';

/** Confidence labels per rules.md §10. */
export const CONFIDENCE_LABELS = ['direct', 'inferred', 'advisory'] as const;

/** Coverage levels reported when a scanner succeeds, fails, or times out (rules.md §14). */
export const COVERAGE_LEVELS = ['full', 'partial'] as const;

/**
 * One expected scanner result in a golden-repo manifest (tasks.md P0-13).
 * `control` is omitted for unmapped rules (rules.md §7.4).
 */
export const expectedFindingSchema = z
  .object({
    scanner: z.string().min(1),
    ruleId: z.string().min(1),
    control: z.string().regex(CONTROL_CODE_PATTERN).optional(),
    confidence: z.enum(CONFIDENCE_LABELS),
    severity: z.enum(FINDING_SEVERITIES),
    minCount: z.number().int().nonnegative(),
    maxCount: z.number().int().nonnegative(),
  })
  .superRefine((finding, ctx) => {
    if (finding.maxCount < finding.minCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxCount'],
        message: 'maxCount must be greater than or equal to minCount.',
      });
    }
  });

/**
 * Golden-repo manifest schema — read by Phase 4's golden runner (P4-12).
 * Every `tests/golden-repos/<dir>/manifest.yaml` must parse against this schema.
 */
export const goldenManifestSchema = z.object({
  name: z.string().min(1),
  languages: z.array(z.string().min(1)).min(1),
  scanners: z.array(z.string().min(1)).min(1),
  expectedFindings: z.array(expectedFindingSchema),
  expectedCoverage: z.enum(COVERAGE_LEVELS),
  expectedSectionScores: z.record(z.string(), z.number()).optional(),
  tolerances: z.object({
    extraFindings: z.number().int().nonnegative(),
  }),
});

export type ExpectedFinding = z.infer<typeof expectedFindingSchema>;
export type GoldenManifest = z.infer<typeof goldenManifestSchema>;
