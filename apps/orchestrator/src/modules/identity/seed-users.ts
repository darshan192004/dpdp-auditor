import { z } from 'zod';

import { PASSWORD_MIN_LENGTH } from './password.js';

/** Deploy-time Secret shape for the internal pilot's initial accounts. */
export const seedUserSchema = z.strictObject({
  email: z.email(),
  name: z.string().min(1),
  password: z.string().min(PASSWORD_MIN_LENGTH),
  orgSlug: z.string().min(1),
  role: z.enum(['owner', 'admin', 'auditor']),
});

export type SeedUser = z.infer<typeof seedUserSchema>;

export function parseSeedUsers(json: string): SeedUser[] {
  return z.array(seedUserSchema).parse(JSON.parse(json));
}
