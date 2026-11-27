import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { evaluateBetaGate, type BetaReviewRecord } from '../src/modules/scoring/beta-gate.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function record(repositories: BetaReviewRecord['repositories']): BetaReviewRecord {
  return {
    status: 'approved',
    defaultDisplayEnabled: false,
    targetMaxFalsePositiveRate: 0.1,
    minRepositories: 5,
    maxRepositories: 10,
    repositories,
  };
}

/** Synthetic test inputs only; never pilot evidence or sign-off data. */
function reviewSet(count: number, falsePositives: number): BetaReviewRecord['repositories'] {
  return Array.from({ length: count }, (_, repoIndex) => ({
    repository: `test-repo-${repoIndex}`,
    directConfidenceControls: Array.from({ length: 4 }, (_, controlIndex) => ({
      controlCode: `DPDPA-8.4-SECRET-${String(controlIndex + 1).padStart(2, '0')}`,
      falsePositive: repoIndex * 4 + controlIndex < falsePositives,
    })),
  }));
}

describe('Phase F beta false-positive gate', () => {
  it('allows default display at 5% false positives across 10 reviewed repositories', () => {
    expect(evaluateBetaGate(record(reviewSet(10, 2)))).toEqual({
      allowed: true,
      falsePositiveRate: 0.05,
      reason: 'approved',
    });
  });

  it('blocks default display at 15% false positives', () => {
    expect(evaluateBetaGate(record(reviewSet(5, 3)))).toEqual({
      allowed: false,
      falsePositiveRate: 0.15,
      reason: 'false_positive_rate_too_high',
    });
  });

  it('blocks fewer than 5 or more than 10 repositories', () => {
    expect(evaluateBetaGate(record(reviewSet(4, 0))).reason).toBe('repository_count_out_of_range');
    expect(evaluateBetaGate(record(reviewSet(11, 0))).reason).toBe('repository_count_out_of_range');
  });

  it('blocks a pending or empty review and a review with no direct controls', () => {
    expect(
      evaluateBetaGate({ ...record(reviewSet(8, 0)), status: 'pending_explicit_approval' }),
    ).toEqual({
      allowed: false,
      falsePositiveRate: null,
      reason: 'not_approved',
    });
    expect(evaluateBetaGate(record([])).reason).toBe('repository_count_out_of_range');
    expect(
      evaluateBetaGate(
        record(reviewSet(5, 0).map((repo) => ({ ...repo, directConfidenceControls: [] }))),
      ).reason,
    ).toBe('no_direct_controls');
  });

  it('ships with default display disabled and no pilot evidence', () => {
    const shipped = JSON.parse(
      readFileSync(join(root, 'docs/records/phase-f-beta-false-positive-review.json'), 'utf8'),
    ) as BetaReviewRecord;
    expect(shipped.status).toBe('pending_explicit_approval');
    expect(shipped.defaultDisplayEnabled).toBe(false);
    expect(shipped.repositories).toEqual([]);
    expect(evaluateBetaGate(shipped).allowed).toBe(false);
  });
});
