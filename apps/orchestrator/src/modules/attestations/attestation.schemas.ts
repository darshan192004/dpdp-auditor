import { z } from 'zod';

export const writeAttestationSchema = z
  .object({
    orgId: z.uuid(),
    repositoryId: z.uuid(),
    key: z.string().regex(/^[a-z][a-z0-9_.:-]{2,96}$/),
    answer: z.boolean(),
    note: z.string().max(2000).nullable().optional(),
    attestedBy: z.uuid(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict();

export type WriteAttestationInput = z.infer<typeof writeAttestationSchema>;

export function toAttestationView(row: {
  id: string;
  repositoryId: string;
  key: string;
  answer: boolean;
  note: string | null;
  attestedBy: string;
  attestedAt: Date;
  expiresAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    key: row.key,
    answer: row.answer,
    note: row.note,
    attestedBy: row.attestedBy,
    attestedAt: row.attestedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type AttestationView = ReturnType<typeof toAttestationView>;
