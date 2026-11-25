import type { OrgPlan } from '@prisma/client';

/**
 * Plan quotas from docs/PRD.md §10. `null` means unlimited.
 *
 * The orchestrator is authoritative for plan limits (architecture.md §9);
 * Nitro's pre-checks are defence in depth only.
 */
export interface PlanLimits {
  repositories: number | null;
  scansPerMonth: number | null;
  reportsPerMonth: number | null;
}

export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  free: { repositories: 2, scansPerMonth: 5, reportsPerMonth: 3 },
  starter: { repositories: 10, scansPerMonth: 50, reportsPerMonth: 20 },
  growth: { repositories: 50, scansPerMonth: 300, reportsPerMonth: 100 },
  enterprise: { repositories: null, scansPerMonth: null, reportsPerMonth: null },
};

/** First instant of the UTC month containing `now`; quotas reset monthly. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Effective limits for a plan.
 *
 * Development runs with every quota removed (null = unlimited) so local and
 * E2E work never blocks on the per-plan caps; `NODE_ENV=production` keeps the
 * PRD §10 limits enforced. Tests (`NODE_ENV=test`) exercise the real caps.
 */
export function planLimits(plan: OrgPlan): PlanLimits {
  if (process.env.NODE_ENV === 'development') {
    return { repositories: null, scansPerMonth: null, reportsPerMonth: null };
  }
  return PLAN_LIMITS[plan];
}
