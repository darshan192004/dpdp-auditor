import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  BETA_MAX_FALSE_POSITIVE_RATE,
  BETA_MAX_REPOSITORIES,
  BETA_MIN_REPOSITORIES,
  defaultScoreDisplayAllowed,
  evaluateBetaGate,
  loadBetaReviewRecord,
  type BetaReviewRecord,
} from '../src/modules/scoring/beta-gate.js';

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

  it('rejects repeated repository identities before counting reviews', () => {
    const duplicated = reviewSet(4, 0).concat({
      ...reviewSet(1, 0)[0]!,
      repository: 'test-repo-0',
    });
    expect(evaluateBetaGate(record(duplicated))).toEqual({
      allowed: false,
      falsePositiveRate: null,
      reason: 'duplicate_repositories',
    });
    expect(
      evaluateBetaGate(
        record(reviewSet(5, 0).map((repo, index) => ({ ...repo, repository: `REPO-${index}` }))),
      ).allowed,
    ).toBe(true);
  });

  it('enforces the fixed 5–10 repository and ≤10% policy regardless of review settings', () => {
    expect(BETA_MIN_REPOSITORIES).toBe(5);
    expect(BETA_MAX_REPOSITORIES).toBe(10);
    expect(BETA_MAX_FALSE_POSITIVE_RATE).toBe(0.1);

    expect(
      evaluateBetaGate({
        ...record(reviewSet(1, 0)),
        minRepositories: 1,
      }).reason,
    ).toBe('repository_count_out_of_range');
    expect(
      evaluateBetaGate({
        ...record(reviewSet(11, 0)),
        maxRepositories: 20,
      }).reason,
    ).toBe('repository_count_out_of_range');
    expect(
      evaluateBetaGate({
        ...record(reviewSet(5, 5)),
        targetMaxFalsePositiveRate: 1,
      }).reason,
    ).toBe('false_positive_rate_too_high');
  });

  it('keeps default display disabled unless enabled and approved by the gate', () => {
    const shipped = loadBetaReviewRecord();
    expect(shipped.status).toBe('pending_explicit_approval');
    expect(shipped.defaultDisplayEnabled).toBe(false);
    expect(shipped.repositories).toEqual([]);
    expect(evaluateBetaGate(shipped).allowed).toBe(false);
    expect(defaultScoreDisplayAllowed()).toBe(false);

    expect(defaultScoreDisplayAllowed(record(reviewSet(10, 2)))).toBe(false);
    expect(
      defaultScoreDisplayAllowed({
        ...record(reviewSet(10, 2)),
        defaultDisplayEnabled: true,
      }),
    ).toBe(true);
    expect(
      defaultScoreDisplayAllowed({
        ...record(reviewSet(10, 2)),
        defaultDisplayEnabled: true,
        status: 'pending_explicit_approval',
      }),
    ).toBe(false);
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

  it('ships the reviewed record at the path the compiled loader reads in the image', () => {
    const loader = readFileSync(
      join(root, 'apps/orchestrator/src/modules/scoring/beta-gate.ts'),
      'utf8',
    );
    const loaderRelativePath =
      '../../../../../docs/records/phase-f-beta-false-positive-review.json';
    expect(loader).toContain(loaderRelativePath);

    const compiledDir = join(root, 'apps/orchestrator/dist/modules/scoring');
    const imagePath = relative(root, resolve(compiledDir, loaderRelativePath)).split(sep).join('/');
    expect(imagePath).toBe('docs/records/phase-f-beta-false-positive-review.json');

    const dockerfile = readFileSync(join(root, 'docker/orchestrator.Dockerfile'), 'utf8');
    expect(dockerfile).toContain(
      `COPY --from=build --chown=nonroot:nonroot /repo/${imagePath} ./${imagePath}`,
    );

    // The build context must actually contain the file: .dockerignore applies
    // last-match-wins, so the directory re-include has to precede the file
    // exclusion, which in turn has to precede the file re-include.
    const ignoreLines = readFileSync(join(root, '.dockerignore'), 'utf8').split(/\r?\n/);
    expect(ignoreLines).not.toContain('docs');
    expect(ignoreLines.indexOf('!docs/records/')).toBeLessThan(
      ignoreLines.indexOf('docs/records/*'),
    );
    expect(ignoreLines.indexOf('docs/records/*')).toBeLessThan(
      ignoreLines.indexOf(`!${imagePath}`),
    );
  });
});
