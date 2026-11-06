import { describe, expect, it } from 'vitest';
import * as srcIndex from '../src/index';
import { VERSION } from '@dpdpa/contracts';

describe('@dpdpa/contracts package entry', () => {
  it('is importable by package name and exposes VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('re-exports every primitive from the source index', () => {
    expect(typeof srcIndex.idSchema).toBe('function');
    expect(typeof srcIndex.isoTimestampSchema.safeParse).toBe('function');
    expect(typeof srcIndex.paginationQuerySchema.parse).toBe('function');
    expect(typeof srcIndex.errorEnvelopeSchema.parse).toBe('function');
    expect(srcIndex.ID_PREFIXES).toHaveLength(8);
    expect(typeof srcIndex.computeFingerprint).toBe('function');
    expect(typeof srcIndex.normalisedFindingSchema.parse).toBe('function');
    expect(srcIndex.FINGERPRINT_VERSION).toBe(1);
    expect(srcIndex.ERROR_CODES.PAGINATION_LIMIT.httpStatus).toBe(422);
    expect(srcIndex.VERSION).toBe('0.1.0');
  });
});
