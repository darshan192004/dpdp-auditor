import { z } from 'zod';

export const repoVisibilitySchema = z.enum(['public', 'private', 'internal']);
export type RepoVisibilityValue = z.infer<typeof repoVisibilitySchema>;

export const resolveRepoSchema = z.strictObject({
  orgId: z.uuid(),
  githubUrl: z.string().trim().min(1).max(2048),
});
export type ResolveRepoInput = z.input<typeof resolveRepoSchema>;

export const saveRepoSchema = z.strictObject({
  orgId: z.uuid(),
  githubUrl: z.string().trim().min(1).max(2048),
  actorUserId: z.uuid().nullable().optional(),
});
export type SaveRepoInput = z.input<typeof saveRepoSchema>;

export const disconnectRepoSchema = z.strictObject({
  orgId: z.uuid(),
  repoId: z.uuid(),
  actorUserId: z.uuid().nullable().optional(),
  force: z.boolean().default(false),
});
export type DisconnectRepoInput = z.input<typeof disconnectRepoSchema>;

export const repoListSchema = z.strictObject({
  orgId: z.uuid(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type RepoListInput = z.input<typeof repoListSchema>;
