import { z } from 'zod';

/**
 * Non-functional budgets as code (tasks.md P0-19 / P6-17).
 *
 * - `webAppGzipBytes` — `/app` bundle budget, gzipped (P5 exit: under 180 KB)
 * - `apiP95Ms` — API latency p95 (P6-17: < 400 ms)
 * - `scanP95Ms` — end-to-end scan p95 (P6-17: < 10 min)
 * - `pdfP95Ms` — PDF render p95 for a 500-finding scan (P6-17: < 10 s)
 *
 * CI scripts in later phases read `budgets.json` against this schema.
 * Ranges are capped at sane ceilings so a typo cannot silently disable a budget.
 */
export const budgetsSchema = z.strictObject({
  webAppGzipBytes: z.number().int().positive().max(1_048_576),
  apiP95Ms: z.number().int().positive().max(5_000),
  scanP95Ms: z.number().int().positive().max(3_600_000),
  pdfP95Ms: z.number().int().positive().max(60_000),
});

export type Budgets = z.infer<typeof budgetsSchema>;
