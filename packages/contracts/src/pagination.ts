import { z } from 'zod';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const OFFSET_BUDGET = 10_000;

export const paginationQuerySchema = z
  .object({
    page: z.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .superRefine((value, ctx) => {
    if (value.page * value.pageSize > OFFSET_BUDGET) {
      ctx.addIssue({
        code: 'custom',
        params: { code: 'PAGINATION_LIMIT' },
        message: `page × pageSize must not exceed ${OFFSET_BUDGET}.`,
      });
    }
  });

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
