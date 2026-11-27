import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateBetaGate, type BetaReviewRecord } from '../src/modules/scoring/beta-gate.js';
import { canonicalControlResultsBytes } from '../src/modules/scoring/control-results-canonical.js';
import { buildCoverageBanners } from '../src/modules/scoring/coverage-banners.js';
import { redactedSinks } from '../src/modules/scoring/redacted-sinks.js';
import { fixtureDirs, hostileSinkInputs, runFixture } from './helpers/phase-f-fixture.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Phase F exit gate (all Definition of Done items except Phase G)', () => {
  it('covers the full fixture corpus with deterministic, canary-contained results', async () => {
    expect(fixtureDirs()).toHaveLength(21);
    for (const dir of fixtureDirs()) {
      const first = await runFixture(dir);
      const second = await runFixture(dir);
      expect(canonicalControlResultsBytes(first.evaluation.results)).toBe(
        canonicalControlResultsBytes(second.evaluation.results),
      );
      expect(
        first.evaluation.results.every((result) => result.scoringVersion === 'scoring-2.0.0'),
      ).toBe(true);
      const hostile = hostileSinkInputs(dir, first);
      expect(hostile.markerPresentInHostileFields).toBe(true);
      const sinks = redactedSinks(hostile.input);
      expect(Object.values(sinks).some((text) => text.includes(hostile.marker))).toBe(false);
      expect(first.scored.counts.unmapped).toBe(first.name === 'unmapped-rule' ? 1 : 0);
    }
  });

  it('keeps detector errors UNKNOWN with a named banner', () => {
    expect(buildCoverageBanners({ gitleaks: 'timed_out' }, ['DPDPA-8.4-SECRET-01'])).toEqual([
      {
        detector: 'gitleaks',
        status: 'timed_out',
        reasonCode: 'detector_unavailable',
        controlCodes: ['DPDPA-8.4-SECRET-01'],
        message: 'Could not determine from code: gitleaks timed_out.',
      },
    ]);
  });

  it('keeps the inventory and scan deadlines explicit', () => {
    const budgets = readFileSync(join(root, 'apps/scan-runner/src/scan_runner/budgets.py'), 'utf8');
    expect(budgets).toMatch(/INVENTORY_BUDGET_SECONDS:\s*Final\s*=\s*120/);
    expect(budgets).toMatch(/SCAN_DEADLINE_SECONDS:\s*Final\s*=\s*900/);
    expect(budgets).toContain('def enforce_inventory_budget(');
  });

  it('records the legal review and official URLs before release', () => {
    const changelog = readFileSync(join(root, 'packages/rule-packs/v2/CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('## Legal review — 2026.11.0');
    expect(changelog).toMatch(/^- Reviewer: .+/m);
    expect(changelog).toMatch(/^- Review date: \d{4}-\d{2}-\d{2}$/m);
    expect(changelog).toContain('G.S.R. 892(E)');
  });

  it('blocks beta default display and makes no pilot sign-off or Phase G claim', () => {
    const review = JSON.parse(
      readFileSync(join(root, 'docs/records/phase-f-beta-false-positive-review.json'), 'utf8'),
    ) as BetaReviewRecord;
    expect(evaluateBetaGate(review).allowed).toBe(false);
    expect(review.defaultDisplayEnabled).toBe(false);

    const status = readFileSync(join(root, 'docs/records/phase-f-readiness-status.md'), 'utf8');
    expect(status).toContain('No pilot sign-off is claimed');
    expect(status).toContain('Phase G live verification is not performed');
    expect(status).toContain('Pending — deferred for internal pilot');
  });
});
