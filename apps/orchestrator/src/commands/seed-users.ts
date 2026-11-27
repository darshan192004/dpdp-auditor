import 'reflect-metadata';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../modules/identity/password.js';
import { parseSeedUsers } from '../modules/identity/seed-users.js';

/**
 * One-shot internal-pilot account import.
 *
 * Reads the sealed deploy-time Secret `SEED_USERS_JSON`, argon2id-hashes each
 * temporary password, upserts the user and organisation, and grants an active
 * membership. Re-running is safe: an existing password is never overwritten,
 * so a user who has already rotated their temporary password stays rotated.
 */
async function main(): Promise<void> {
  const raw = process.env.SEED_USERS_JSON;
  if (!raw) throw new Error('SEED_USERS_JSON is required.');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const seeds = parseSeedUsers(raw);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    for (const seed of seeds) {
      const passwordHash = await hashPassword(seed.password);

      const existing = await prisma.user.findUnique({ where: { email: seed.email } });
      const user =
        existing === null
          ? await prisma.user.create({
              data: {
                email: seed.email,
                name: seed.name,
                passwordHash,
                mustChangePassword: true,
              },
            })
          : await prisma.user.update({
              where: { id: existing.id },
              data: {
                name: seed.name,
                deletedAt: null,
                // Never reset a credential for an account that already has one.
                ...(existing.passwordHash === null
                  ? { passwordHash, mustChangePassword: true }
                  : {}),
              },
            });

      const org = await prisma.organization.upsert({
        where: { slug: seed.orgSlug },
        update: {},
        create: { name: seed.orgSlug, slug: seed.orgSlug },
      });

      await prisma.membership.upsert({
        where: { orgId_userId: { orgId: org.id, userId: user.id } },
        update: { role: seed.role, status: 'active' },
        create: { orgId: org.id, userId: user.id, role: seed.role, status: 'active' },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('seed-users failed:', error);
  process.exitCode = 1;
});
