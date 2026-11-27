export interface BetaControlReview {
  controlCode: string;
  falsePositive: boolean;
}

export interface BetaRepositoryReview {
  repository: string;
  directConfidenceControls: readonly BetaControlReview[];
}

export interface BetaReviewRecord {
  status: 'pending_explicit_approval' | 'approved';
  defaultDisplayEnabled: boolean;
  targetMaxFalsePositiveRate: number;
  minRepositories: number;
  maxRepositories: number;
  repositories: readonly BetaRepositoryReview[];
}

export interface BetaGateDecision {
  allowed: boolean;
  falsePositiveRate: number | null;
  reason:
    | 'approved'
    | 'not_approved'
    | 'repository_count_out_of_range'
    | 'no_direct_controls'
    | 'false_positive_rate_too_high';
}

/** Pure gate: direct-confidence controls only, no fixtures and no pilot data. */
export function evaluateBetaGate(record: BetaReviewRecord): BetaGateDecision {
  if (record.status !== 'approved') {
    return { allowed: false, falsePositiveRate: null, reason: 'not_approved' };
  }
  const count = record.repositories.length;
  if (count < record.minRepositories || count > record.maxRepositories) {
    return { allowed: false, falsePositiveRate: null, reason: 'repository_count_out_of_range' };
  }
  const controls = record.repositories.flatMap((repo) => repo.directConfidenceControls);
  if (controls.length === 0) {
    return { allowed: false, falsePositiveRate: null, reason: 'no_direct_controls' };
  }
  const falsePositiveRate =
    controls.filter((control) => control.falsePositive).length / controls.length;
  if (falsePositiveRate > record.targetMaxFalsePositiveRate) {
    return { allowed: false, falsePositiveRate, reason: 'false_positive_rate_too_high' };
  }
  return { allowed: true, falsePositiveRate, reason: 'approved' };
}
