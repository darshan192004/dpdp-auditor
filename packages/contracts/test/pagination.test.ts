import { describe, expect, it } from 'vitest';
import { paginationMetaSchema, paginationQuerySchema } from '../src/pagination';

describe('paginationQuerySchema', () => {
  it('applies defaults page=1 and pageSize=20', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('passes through valid values', () => {
    expect(paginationQuerySchema.parse({ page: 3, pageSize: 50 })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('accepts the offset budget boundary (100 × 100 = 10,000)', () => {
    expect(paginationQuerySchema.safeParse({ page: 100, pageSize: 100 }).success).toBe(true);
  });

  it('rejects pageSize above the maximum of 100', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('rejects non-positive page and pageSize', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ pageSize: 0 }).success).toBe(false);
  });

  it('rejects a non-integer page', () => {
    expect(paginationQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
  });

  it('issues PAGINATION_LIMIT when page × pageSize exceeds 10,000', () => {
    const result = paginationQuerySchema.safeParse({ page: 101, pageSize: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue).toBeDefined();
      if (issue?.code !== 'custom') throw new Error('expected a custom issue');
      expect(issue.params).toMatchObject({ code: 'PAGINATION_LIMIT' });
    }
  });

  it('issues PAGINATION_LIMIT for a huge page even with pageSize 1', () => {
    const result = paginationQuerySchema.safeParse({ page: 100000, pageSize: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      if (issue?.code !== 'custom') throw new Error('expected a custom issue');
      expect(issue.params).toMatchObject({ code: 'PAGINATION_LIMIT' });
    }
  });
});

describe('paginationMetaSchema', () => {
  it('accepts the api.md §1.6 response example', () => {
    expect(
      paginationMetaSchema.parse({ page: 1, pageSize: 20, totalItems: 142, totalPages: 8 }),
    ).toEqual({ page: 1, pageSize: 20, totalItems: 142, totalPages: 8 });
  });

  it('rejects a negative totalItems', () => {
    expect(
      paginationMetaSchema.safeParse({ page: 1, pageSize: 20, totalItems: -1, totalPages: 0 })
        .success,
    ).toBe(false);
  });

  it('rejects a fractional pageSize', () => {
    expect(
      paginationMetaSchema.safeParse({
        page: 1,
        pageSize: 20.5,
        totalItems: 0,
        totalPages: 0,
      }).success,
    ).toBe(false);
  });
});
