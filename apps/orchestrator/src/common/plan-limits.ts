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
}

export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  free: { repositories: 2, scansPerMonth: 5 },
  starter: { repositories: 10, scansPerMonth: 50 },
  growth: { repositories: 50, scansPerMonth: 300 },
  enterprise: { repositories: null, scansPerMonth: null },
};

/** First instant of the UTC month containing `now`; quotas reset monthly. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
