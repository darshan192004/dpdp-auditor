import { describe, expect, it } from 'vitest';
import { isApplicable } from '../src/modules/scoring/applicability.js';

describe('isApplicable (P4-05)', () => {
  const facts = {
    languages: ['Python', 'TypeScript'],
    frameworks: ['Django'],
    resourceTypes: ['aws_s3_bucket'],
  };

  it('treats an empty predicate as always applicable', () => {
    expect(isApplicable({}, facts)).toBe(true);
  });

  it('matches when any child matches', () => {
    expect(
      isApplicable({ any: [{ language: 'java' }, { resourceType: 'aws_s3_bucket' }] }, facts),
    ).toBe(true);
  });

  it('does not match when no child matches', () => {
    expect(isApplicable({ any: [{ language: 'java' }, { framework: 'rails' }] }, facts)).toBe(
      false,
    );
  });

  it('requires every child for all', () => {
    expect(isApplicable({ all: [{ language: 'python' }, { framework: 'django' }] }, facts)).toBe(
      true,
    );
    expect(isApplicable({ all: [{ language: 'python' }, { framework: 'rails' }] }, facts)).toBe(
      false,
    );
  });

  it('compares fact values case-insensitively', () => {
    expect(isApplicable({ language: 'PYTHON' }, facts)).toBe(true);
    expect(isApplicable({ resourceType: 'AWS_S3_BUCKET' }, facts)).toBe(true);
  });

  it('treats absent fact arrays as empty', () => {
    expect(isApplicable({ language: 'python' }, {})).toBe(false);
  });
});
