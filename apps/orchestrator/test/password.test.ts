import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from '../src/modules/identity/password.js';

describe('password hashing', () => {
  it('hashes with argon2id and verifies the same password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  it('produces a different salt for every hash', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).not.toBe(b);
  });

  it('exposes the minimum length contract', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});
