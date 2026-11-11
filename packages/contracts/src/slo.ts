import { z } from 'zod';

/**
 * SLOs as code (tasks.md P1-31).
 *
 * `monitoring/slos.yaml` is the machine-readable mirror of
 * `docs/operations.md` §1. Prometheus/Grafana provisioning in `monitoring/`
 * and CI drift checks parse it through `sloPolicySchema`, so a typo in the
 * YAML fails the build instead of silently disabling an alert.
 */

const kebabId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'expected a kebab-case identifier')
  .max(64);

const duration = z.string().regex(/^\d+[smhd]$/, 'expected e.g. 5m, 1h, 6h, 720h');

export const SLO_WINDOWS = ['calendar_month', 'rolling_7d'] as const;
export const sloWindowSchema = z.enum(SLO_WINDOWS);

const sloBase = {
  id: kebabId,
  name: z.string().min(1).max(120),
  window: sloWindowSchema,
  measurement: z.string().min(1).max(500),
  exclusions: z.array(kebabId).min(1),
};

export const ratioSloSchema = z.strictObject({
  ...sloBase,
  kind: z.literal('ratio'),
  /** Availability target, e.g. 0.995 for 99.5%. */
  target: z.number().gt(0).lt(1),
  /** PromQL ratio expression; `WINDOW` is substituted per burn-rate window. */
  expression: z.string().min(1),
});

export const latencySloSchema = z.strictObject({
  ...sloBase,
  kind: z.literal('latency'),
  /** Percentile threshold, e.g. 95 for p95. */
  percentile: z.number().gt(0).lt(100),
  thresholdMs: z.number().int().positive().max(3_600_000),
  /** Base metric name, e.g. `scan_duration_seconds` (histogram). */
  metric: z.string().regex(/^[a-z][a-z0-9_]*$/),
});

export const sloSchema = z.discriminatedUnion('kind', [ratioSloSchema, latencySloSchema]);

export const exclusionSchema = z.strictObject({
  id: kebabId,
  description: z.string().min(1).max(500),
});

export const burnWindowSchema = z.strictObject({
  /** Fraction of the monthly budget consumed inside `windowHours`. */
  budgetFraction: z.number().gt(0).lte(1),
  windowHours: z.number().positive().max(720),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']),
  confirmation: z.strictObject({ short: duration, long: duration }),
});

export const errorBudgetPolicySchema = z.strictObject({
  /** SLO window in hours (calendar month ≈ 720 h). */
  sloWindowHours: z.number().int().positive().max(8760),
  fast: burnWindowSchema,
  slow: burnWindowSchema,
});

export const sloPolicySchema = z
  .strictObject({
    version: z.literal(1),
    exclusions: z.array(exclusionSchema).min(1),
    slos: z.array(sloSchema).min(1),
    errorBudget: errorBudgetPolicySchema,
  })
  .superRefine((policy, ctx) => {
    const seenSlo = new Set<string>();
    for (const [index, slo] of policy.slos.entries()) {
      if (seenSlo.has(slo.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate SLO id "${slo.id}"`,
          path: ['slos', index, 'id'],
        });
      }
      seenSlo.add(slo.id);
    }

    const seenExclusion = new Set<string>();
    for (const [index, exclusion] of policy.exclusions.entries()) {
      if (seenExclusion.has(exclusion.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate exclusion id "${exclusion.id}"`,
          path: ['exclusions', index, 'id'],
        });
      }
      seenExclusion.add(exclusion.id);
    }

    for (const [sloIndex, slo] of policy.slos.entries()) {
      for (const [exclusionIndex, id] of slo.exclusions.entries()) {
        if (!seenExclusion.has(id)) {
          ctx.addIssue({
            code: 'custom',
            message: `unknown exclusion "${id}"`,
            path: ['slos', sloIndex, 'exclusions', exclusionIndex],
          });
        }
      }
    }

    const { fast, slow } = policy.errorBudget;
    if (slow.windowHours <= fast.windowHours) {
      ctx.addIssue({
        code: 'custom',
        message: 'slow burn window must be longer than the fast window',
        path: ['errorBudget', 'slow', 'windowHours'],
      });
    }
    if (slow.budgetFraction <= fast.budgetFraction) {
      ctx.addIssue({
        code: 'custom',
        message: 'slow burn must consume more budget than fast',
        path: ['errorBudget', 'slow', 'budgetFraction'],
      });
    }
  });

export type SloWindow = z.infer<typeof sloWindowSchema>;
export type RatioSlo = z.infer<typeof ratioSloSchema>;
export type LatencySlo = z.infer<typeof latencySloSchema>;
export type Slo = z.infer<typeof sloSchema>;
export type BurnWindow = z.infer<typeof burnWindowSchema>;
export type ErrorBudgetPolicy = z.infer<typeof errorBudgetPolicySchema>;
export type SloPolicy = z.infer<typeof sloPolicySchema>;

/**
 * Burn-rate multiplier for a window: budgetFraction × sloWindowHours / windowHours.
 * 2% of a 720 h budget in 1 h → 14.4×; 5% in 6 h → 6× (operations.md §1).
 */
export function burnRateMultiplier(window: BurnWindow, sloWindowHours: number): number {
  return (window.budgetFraction * sloWindowHours) / window.windowHours;
}

/** Fraction of operations allowed to fail before the SLO is missed. */
export function allowedFailureFraction(slo: Slo): number {
  return slo.kind === 'ratio' ? 1 - slo.target : 1 - slo.percentile / 100;
}

/**
 * Alert threshold for a burn window: multiplier × allowed-failure-fraction.
 * 14.4 × 0.5% = 7.2% error ratio for the 99.5% SLO; 14.4 × 1% = 14.4% for 99.0%.
 */
export function burnRateThreshold(slo: Slo, window: BurnWindow, sloWindowHours: number): number {
  return burnRateMultiplier(window, sloWindowHours) * allowedFailureFraction(slo);
}

/** Parse an already-decoded `monitoring/slos.yaml` document. */
export function parseSloPolicy(document: unknown): SloPolicy {
  return sloPolicySchema.parse(document);
}
