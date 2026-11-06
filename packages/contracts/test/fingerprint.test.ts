import { describe, expect, it } from 'vitest';
import vectors from './vectors/fingerprint-vectors.json';
import { computeFingerprint, FINGERPRINT_VERSION } from '../src/fingerprint';

const SHARED_INPUT = {
  scanner: 'checkov',
  scannerRuleId: 'CKV_AWS_19',
  normalisedPath: 'infra/storage.tf',
  snippetHash: '3aab96fbde7521e294952426e2c0e53569279b746e9e7b1dc77236f638bef266',
  occurrenceIndex: 0,
};

describe('computeFingerprint', () => {
  for (const vector of vectors) {
    it(`matches pinned vector: ${vector.name}`, () => {
      expect(computeFingerprint(vector.input)).toBe(vector.expected);
    });
  }

  it('fans out with the :DPDPA-8.4-ENC-01 control suffix', () => {
    const withControl = computeFingerprint({ ...SHARED_INPUT, controlCode: 'DPDPA-8.4-ENC-01' });
    expect(withControl).toBe(`${computeFingerprint(SHARED_INPUT)}:DPDPA-8.4-ENC-01`);
  });

  it('changes when occurrenceIndex changes', () => {
    expect(computeFingerprint({ ...SHARED_INPUT, occurrenceIndex: 1 })).not.toBe(
      computeFingerprint(SHARED_INPUT),
    );
  });

  it('is deterministic for identical inputs', () => {
    expect(computeFingerprint(SHARED_INPUT)).toBe(computeFingerprint({ ...SHARED_INPUT }));
  });

  it('excludes line numbers — they are not §8 inputs', () => {
    // @ts-expect-error lineStart/lineEnd are deliberately not FingerprintInput fields
    expect(computeFingerprint({ ...SHARED_INPUT, lineStart: 14, lineEnd: 28 })).toBe(
      computeFingerprint(SHARED_INPUT),
    );
  });

  it('pins fingerprintVersion 1 — changing the algorithm requires a version bump', () => {
    expect(FINGERPRINT_VERSION).toBe(1);
  });
});
