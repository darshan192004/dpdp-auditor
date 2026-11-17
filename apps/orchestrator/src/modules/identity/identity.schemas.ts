import { z } from 'zod';

/** database.md §4.3: member_role. */
export const memberRoleSchema = z.enum(['owner', 'admin', 'auditor', 'viewer']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/** database.md §4.3: membership_status. */
export const membershipStatusSchema = z.enum(['invited', 'active', 'suspended']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

/**
 * GitHub OAuth profile (api.md §2 `/api/auth/github`). `github_user_id` is the
 * stable external identity; email is the join key for invitations
 * (database.md §4.2).
 */
export const githubProfileSchema = z.strictObject({
  githubUserId: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((value) => BigInt(value)),
  email: z.email().max(320),
  name: z.string().trim().min(1).max(120).nullable().optional(),
  avatarUrl: z.url().max(2048).nullable().optional(),
});
export type GithubProfileInput = z.input<typeof githubProfileSchema>;
export type GithubProfile = z.output<typeof githubProfileSchema>;

/** database.md §4.1: name length and slug grammar. */
export const createOrganizationSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'invalid slug'),
  ownerUserId: z.uuid(),
});
export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

/**
 * api.md §7.2: `PATCH /api/v1/org` accepts the profile, retention, and
 * notification settings only. Plan and data-region changes are billing
 * operations and are rejected by the service with `FORBIDDEN`.
 */
export const updateOrganizationSchema = z.strictObject({
  name: z.string().trim().min(2).max(120).optional(),
  retentionDays: z.number().int().min(7).max(365).optional(),
  settings: z
    .strictObject({
      notifications: z.boolean().optional(),
    })
    .optional(),
});
export type UpdateOrganizationInput = z.input<typeof updateOrganizationSchema>;

/** api.md §7.3: add an existing account to the organisation by email. */
export const addMemberByEmailSchema = z.strictObject({
  email: z.email().max(320),
  role: memberRoleSchema.default('viewer'),
});
export type AddMemberByEmailInput = z.input<typeof addMemberByEmailSchema>;

export const addMembershipSchema = z.strictObject({
  orgId: z.uuid(),
  userId: z.uuid(),
  role: memberRoleSchema.default('viewer'),
  status: membershipStatusSchema.default('invited'),
  invitedBy: z.uuid().nullable().optional(),
});
export type AddMembershipInput = z.input<typeof addMembershipSchema>;

export const changeRoleSchema = z.strictObject({
  orgId: z.uuid(),
  userId: z.uuid(),
  role: memberRoleSchema,
});
export type ChangeRoleInput = z.input<typeof changeRoleSchema>;

/**
 * Server-side session creation (security.md §3.1). Nitro mints the sealed
 * cookie; the orchestrator owns the record that makes it revocable.
 */
export const createSessionSchema = z.strictObject({
  userId: z.uuid(),
  activeOrgId: z.uuid().nullable().optional(),
  ip: z.string().trim().max(64).nullable().optional(),
  userAgent: z.string().trim().max(1024).nullable().optional(),
});
export type CreateSessionInput = z.input<typeof createSessionSchema>;
