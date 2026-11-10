import { PrismaClient } from '@prisma/client';
import { describe, it } from 'vitest';

export const dbUrl: string | null = process.env.TEST_DATABASE_URL || null;

/**
 * Registers an integration suite only when a database is available.
 * `describe.skip` still executes its body (suite bodies may create clients
 * eagerly), so when skipping we register a placeholder instead of running
 * the real body.
 */
export function describeDb(name: string, fn: () => void): void {
  if (dbUrl) {
    describe(name, fn);
  } else {
    describe.skip(name, () => {
      it('skipped: no integration database available', () => {});
    });
  }
}

export function makeClient(): PrismaClient {
  if (!dbUrl)
    throw new Error('Integration database unavailable (see test/integration/helpers/db.ts)');
  return new PrismaClient({ datasourceUrl: dbUrl });
}
