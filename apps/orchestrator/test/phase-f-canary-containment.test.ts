import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { redactedSinks } from '../src/modules/scoring/redacted-sinks.js';
import { fixtureDirs, hostileSinkInputs, runFixture } from './helpers/phase-f-fixture.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Phase F canary containment (offline sinks)', () => {
  it('never emits a fixture canary into DB rows, reports, logs, callbacks, or API fields', async () => {
    for (const dir of fixtureDirs()) {
      const run = await runFixture(dir);
      const hostile = hostileSinkInputs(dir, run);
      expect(hostile.markerPresentInHostileFields).toBe(true);
      const sinks = redactedSinks(hostile.input);
      for (const [name, text] of Object.entries(sinks)) {
        expect(text.includes(hostile.marker), `${dir}: canary leaked into ${name}`).toBe(false);
      }
    }
  });

  it('keeps live WebGoat, Juice-Shop and API smoke steps out of CI', () => {
    const doc = readFileSync(join(root, 'docs/records/phase-f-manual-smoke-gate.md'), 'utf8');
    expect(doc).toContain('REQUIRES EXPLICIT APPROVAL');
    const workflowDir = join(root, '.github/workflows');
    for (const file of readdirSync(workflowDir)) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
      expect(
        readFileSync(join(workflowDir, file), 'utf8'),
        `${file}: no live smoke in CI`,
      ).not.toMatch(/webgoat|juice-shop/i);
    }
  });
});
