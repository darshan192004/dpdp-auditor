import { describe, expect, it } from 'vitest';
import { canonicalControlResultsBytes } from '../src/modules/scoring/control-results-canonical.js';
import { fixtureDirs, runFixture } from './helpers/phase-f-fixture.js';

describe('Phase F determinism', () => {
  it('runs every fixture twice with byte-identical canonical control_results', async () => {
    for (const dir of fixtureDirs()) {
      const first = canonicalControlResultsBytes((await runFixture(dir)).evaluation.results);
      const second = canonicalControlResultsBytes((await runFixture(dir)).evaluation.results);
      expect(second === first, `${dir}: control_results drifted`).toBe(true);
    }
  });

  it('keeps canonical control_results free of wall-clock times and generated UUIDs', async () => {
    const run = await runFixture(fixtureDirs()[0]!);
    const bytes = canonicalControlResultsBytes(run.evaluation.results);
    expect(bytes).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(bytes).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  });

  it('records versioned scoring on every result', async () => {
    for (const dir of fixtureDirs()) {
      const run = await runFixture(dir);
      for (const result of run.evaluation.results) {
        expect(result.rulePackVersion).toMatch(/^dpdpa-\d{4}\.\d{2}\.\d+$/);
        expect(result.scoringVersion).toBe('scoring-2.0.0');
      }
    }
  });
});
