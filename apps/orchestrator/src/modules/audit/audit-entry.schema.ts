import { z } from 'zod';

export const auditEntrySchema = z.object({
  orgId: z.uuid().nullable(),
  actorType: z.enum(['user', 'api_key', 'system']),
  actorUserId: z.uuid().nullish(),
  action: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
  resourceType: z.string().regex(/^[a-z][a-z0-9_]*$/),
  resourceId: z.uuid().nullish(),
  ip: z.union([z.ipv4(), z.ipv6()]).nullish(),
  userAgent: z.string().max(512).nullish(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEntryInput = z.input<typeof auditEntrySchema>;
export type AuditEntry = z.output<typeof auditEntrySchema>;
