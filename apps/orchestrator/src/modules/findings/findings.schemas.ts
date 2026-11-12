import { z } from 'zod';
import { findingSeveritySchema, scannerNameSchema } from '../scans/scan.schemas.js';

export const findingStatusSchema = z.enum([
  'open',
  'false_positive',
  'accepted_risk',
  'fixed',
  'reopened',
]);
export type FindingStatusValue = z.infer<typeof findingStatusSchema>;

/** api.md §4.1. `section` filters on the control code prefix, not a join. */
export const listFindingsSchema = z.strictObject({
  orgId: z.uuid(),
  scanId: z.uuid(),
  severity: z.array(findingSeveritySchema).max(5).optional(),
  scanner: z.array(scannerNameSchema).max(3).optional(),
  section: z.array(z.string().trim().min(1).max(16)).max(16).optional(),
  status: z.array(findingStatusSchema).max(5).optional(),
  file: z.string().trim().min(1).max(512).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['-severity', 'file', '-lineStart', '-createdAt']).default('-severity'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type ListFindingsInput = z.input<typeof listFindingsSchema>;
export type ListFindings = z.output<typeof listFindingsSchema>;

/** api.md §4.2: a note is mandatory for the two dispositions that hide risk. */
export const triageFindingSchema = z
  .strictObject({
    orgId: z.uuid(),
    findingId: z.uuid(),
    actorUserId: z.uuid().optional(),
    status: findingStatusSchema,
    note: z.string().trim().max(2000).optional(),
    externalUrl: z
      .url()
      .refine((value) => value.startsWith('https://'), 'externalUrl must use HTTPS.')
      .optional(),
  })
  .superRefine((value, ctx) => {
    const minimum =
      value.status === 'accepted_risk' ? 20 : value.status === 'false_positive' ? 10 : 0;
    if (minimum > 0 && (value.note?.length ?? 0) < minimum) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: `A note of at least ${minimum} characters is required for ${value.status}.`,
      });
    }
  });
export type TriageFindingInput = z.input<typeof triageFindingSchema>;
export type TriageFinding = z.output<typeof triageFindingSchema>;

/** api.md §7.1. */
export const listRulesSchema = z.strictObject({
  section: z.string().trim().min(1).max(16).optional(),
  scanner: scannerNameSchema.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type ListRulesInput = z.input<typeof listRulesSchema>;
export type ListRules = z.output<typeof listRulesSchema>;

/** `8(4)` -> `DPDPA-8.4-`, `6` -> `DPDPA-6-`. */
export function sectionCodePrefix(section: string): string {
  return `DPDPA-${section.replace('(', '.').replaceAll(')', '')}-`;
}
