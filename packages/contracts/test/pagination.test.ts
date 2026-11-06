import { describe, expect, it } from 'vitest';
import { paginationMetaSchema, paginationQuerySchema } from '../src/pagination';

function expectCustomIssue(
  issues: readonly { code: string; params?: unknown }[],
  expectedCode: string,
): void {
  expect(issues[0]?.code).toBe('custom');
  expect(issues[0]?.params).toMatchObject({ code: expectedCode });
}

type RejectionCase = {
  schema: 'query' | 'meta';
  name: string;
  input: Record<string, unknown>;
  issueCode?: string;
};

const rejectionCases: RejectionCase[] = [
  { schema: 'query', name: 'pageSize above the maximum of 100', input: { pageSize: 101 } },
  { schema: 'query', name: 'a zero page', input: { page: 0 } },
  { schema: 'query', name: 'a zero pageSize', input: { pageSize: 0 } },
  { schema: 'query', name: 'a non-integer page', input: { page: 1.5 } },
  {
    schema: 'query',
    name: 'page × pageSize exceeding the 10,000 offset budget',
    input: { page: 101, pageSize: 100 },
    issueCode: 'PAGINATION_LIMIT',
  },
  {
    schema: 'query',
    name: 'a huge page even with pageSize 1',
    input: { page: 100000, pageSize: 1 },
    issueCode: 'PAGINATION_LIMIT',
  },
  {
    schema: 'meta',
    name: 'a negative totalItems',
    input: { page: 1, pageSize: 20, totalItems: -1, totalPages: 0 },
  },
  {
    schema: 'meta',
    name: 'a fractional pageSize',
    input: { page: 1, pageSize: 20.5, totalItems: 0, totalPages: 0 },
  },
];

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
});

describe('paginationMetaSchema', () => {
  it('accepts the api.md §1.6 response example', () => {
    expect(
      paginationMetaSchema.parse({ page: 1, pageSize: 20, totalItems: 142, totalPages: 8 }),
    ).toEqual({ page: 1, pageSize: 20, totalItems: 142, totalPages: 8 });
  });
});

describe('pagination rejections', () => {
  for (const { schema, name, input, issueCode } of rejectionCases) {
    it(`rejects ${name}`, () => {
      const target = schema === 'query' ? paginationQuerySchema : paginationMetaSchema;
      const result = target.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success && issueCode) expectCustomIssue(result.error.issues, issueCode);
    });
  }
});
