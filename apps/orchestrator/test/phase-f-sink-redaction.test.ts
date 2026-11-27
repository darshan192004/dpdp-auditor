import { describe, expect, it } from 'vitest';
import { redactedSinks } from '../src/modules/scoring/redacted-sinks.js';
import { fixtureDirs, hostileSinkInputs, runFixture } from './helpers/phase-f-fixture.js';

describe('Phase F hostile sink inputs', () => {
  it('proves the marker is present in unallowlisted fields and absent from every sink', async () => {
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
});
