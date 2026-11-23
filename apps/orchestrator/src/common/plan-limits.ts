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

const UNLIMITED: PlanLimits = {
  repositories: null,
  scansPerMonth: null,
  reportsPerMonth: null,
};

/**
 * Development-only override: `UNLIMITED_PLAN_QUOTA=true` removes all quota
 * checks. Production boot refuses this flag (see config/env.ts).
 */
export function effectivePlanLimits(plan: OrgPlan, unlimited = false): PlanLimits {
  return unlimited ? UNLIMITED : PLAN_LIMITS[plan];
}

/** First instant of the UTC month containing `now`; quotas reset monthly. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
