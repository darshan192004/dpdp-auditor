import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTROL_CODE_PATTERN } from '@dpdpa/contracts';
import { canaryMarker, fixtureDirs, loadManifest, readSources } from './helpers/phase-f-fixture.js';

describe('Phase F golden fixture corpus (test inputs only)', () => {
  it('contains the full 21-fixture corpus with parseable manifests', () => {
    const dirs = fixtureDirs();
    expect(dirs).toHaveLength(21);
    for (const dir of dirs) expect(() => loadManifest(dir)).not.toThrow();
  });

  it('gives every fixture exactly one canary marker in source, never in its manifest', () => {
    for (const dir of fixtureDirs()) {
      const marker = canaryMarker(dir);
      const manifestText = readFileSync(join(dir, 'manifest.yaml'), 'utf8');
      expect(manifestText.includes(marker), `${dir}: manifest must not contain the canary`).toBe(
        false,
      );
    }
  });

  it('keeps fixture source local and free of live repository URLs', () => {
    for (const dir of fixtureDirs()) {
      for (const file of readSources(dir)) {
        expect(readFileSync(file, 'utf8'), `${file}: no live GitHub URL`).not.toMatch(
          /https?:\/\/github\.com\//,
        );
      }
    }
  });

  it('maps every expected finding to a control except the explicit unmapped fixture', () => {
    for (const dir of fixtureDirs()) {
      const manifest = loadManifest(dir);
      for (const finding of manifest.expectedFindings) {
        if (manifest.name === 'unmapped-rule') {
          expect(finding.control).toBeUndefined();
          expect(manifest.tolerances.extraFindings).toBeGreaterThan(0);
        } else {
          expect(finding.control, `${dir}: ${finding.ruleId} needs a control`).toMatch(
            CONTROL_CODE_PATTERN,
          );
        }
      }
    }
  });
});
