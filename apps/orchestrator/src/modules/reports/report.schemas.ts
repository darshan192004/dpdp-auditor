import { z } from 'zod';

export const createReportSchema = z.object({
  orgId: z.uuid(),
  scanId: z.uuid(),
  template: z.enum(['standard', 'executive']).default('standard'),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const completeReportSchema = z.object({
  buffer: z.string(), // base64-encoded PDF
});
