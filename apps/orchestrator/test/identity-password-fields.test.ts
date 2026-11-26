import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('password auth migration', () => {
  it('adds both columns with safe defaults', () => {
    const sql = readFileSync(
      new URL('../prisma/migrations/20261127000000_password_auth/migration.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('"password_hash" TEXT');
    expect(sql).toContain('"must_change_password" BOOLEAN NOT NULL DEFAULT false');
  });
});
