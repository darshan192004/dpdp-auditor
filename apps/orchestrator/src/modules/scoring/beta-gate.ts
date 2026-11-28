import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    | 'duplicate_repositories'
    | 'no_direct_controls'
    | 'false_positive_rate_too_high';
}

/** Release policy limits, enforced independently of the review record. */
export const BETA_MIN_REPOSITORIES = 5;
export const BETA_MAX_REPOSITORIES = 10;
export const BETA_MAX_FALSE_POSITIVE_RATE = 0.1;

const SHIPPED_REVIEW_PATH = fileURLToPath(
  new URL('../../../../../docs/records/phase-f-beta-false-positive-review.json', import.meta.url),
);

/** Load the shipped review record. Fail closed to a pending record if unavailable. */
export function loadBetaReviewRecord(): BetaReviewRecord {
  try {
    return JSON.parse(readFileSync(SHIPPED_REVIEW_PATH, 'utf8')) as BetaReviewRecord;
  } catch {
    return {
      status: 'pending_explicit_approval',
      defaultDisplayEnabled: false,
      targetMaxFalsePositiveRate: BETA_MAX_FALSE_POSITIVE_RATE,
      minRepositories: BETA_MIN_REPOSITORIES,
      maxRepositories: BETA_MAX_REPOSITORIES,
      repositories: [],
    };
  }
}

/**
 * Production default-display decision. Scores may be shown by default only
 * when the operator explicitly enabled display AND the gate approves the
 * review under the fixed release policy.
 */
export function defaultScoreDisplayAllowed(
  record: BetaReviewRecord = loadBetaReviewRecord(),
): boolean {
  return record.defaultDisplayEnabled && evaluateBetaGate(record).allowed;
}

/** Pure gate: direct-confidence controls only, no fixtures and no pilot data. */
export function evaluateBetaGate(record: BetaReviewRecord): BetaGateDecision {
  if (record.status !== 'approved') {
    return { allowed: false, falsePositiveRate: null, reason: 'not_approved' };
  }

  const identities = new Set(
    record.repositories.map((repo) => repo.repository.trim().toLowerCase()),
  );
  if (identities.size !== record.repositories.length) {
    return { allowed: false, falsePositiveRate: null, reason: 'duplicate_repositories' };
  }

  const count = record.repositories.length;
  if (count < BETA_MIN_REPOSITORIES || count > BETA_MAX_REPOSITORIES) {
    return { allowed: false, falsePositiveRate: null, reason: 'repository_count_out_of_range' };
  }

  const controls = record.repositories.flatMap((repo) => repo.directConfidenceControls);
  if (controls.length === 0) {
    return { allowed: false, falsePositiveRate: null, reason: 'no_direct_controls' };
  }
  const falsePositiveRate =
    controls.filter((control) => control.falsePositive).length / controls.length;
  if (falsePositiveRate > BETA_MAX_FALSE_POSITIVE_RATE) {
    return { allowed: false, falsePositiveRate, reason: 'false_positive_rate_too_high' };
  }
  return { allowed: true, falsePositiveRate, reason: 'approved' };
}
