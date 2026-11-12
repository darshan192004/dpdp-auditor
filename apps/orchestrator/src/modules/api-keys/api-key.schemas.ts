import { z } from 'zod';

/** database.md §4.8: the only scopes an API key may carry. */
export const apiKeyScopeSchema = z.enum(['scan:read', 'scan:write', 'report:read', 'repo:read']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const API_KEY_SCOPES = apiKeyScopeSchema.options;

export const createApiKeySchema = z.strictObject({
  orgId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  scopes: z
    .array(apiKeyScopeSchema)
    .min(1)
    .max(API_KEY_SCOPES.length)
    .refine((scopes) => new Set(scopes).size === scopes.length, 'duplicate scope')
    .default(['scan:read']),
  createdBy: z.uuid().nullable().optional(),
  /** api.md §7.5: optional expiry, must be in the future when supplied. */
  expiresAt: z.iso
    .datetime()
    .refine((value) => Date.parse(value) > Date.now(), 'expiresAt must be in the future')
    .nullable()
    .optional(),
});
export type CreateApiKeyInput = z.input<typeof createApiKeySchema>;
export type CreateApiKey = z.output<typeof createApiKeySchema>;

export const revokeApiKeySchema = z.strictObject({
  orgId: z.uuid(),
  keyId: z.uuid(),
  actorUserId: z.uuid().nullable().optional(),
});
export type RevokeApiKeyInput = z.input<typeof revokeApiKeySchema>;
