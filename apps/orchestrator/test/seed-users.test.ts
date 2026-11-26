import { describe, expect, it } from 'vitest';

import { parseSeedUsers } from '../src/modules/identity/seed-users.js';

describe('seed user parsing', () => {
  it('accepts valid seed entries', () => {
    const parsed = parseSeedUsers(
      JSON.stringify([
        {
          email: 'a@b.test',
          name: 'A',
          password: 'correct horse battery staple',
          orgSlug: 'internal',
          role: 'owner',
        },
      ]),
    );
    expect(parsed[0]?.role).toBe('owner');
  });

  it('rejects a short temporary password', () => {
    expect(() =>
      parseSeedUsers(
        JSON.stringify([
          { email: 'a@b.test', name: 'A', password: 'short', orgSlug: 'internal', role: 'owner' },
        ]),
      ),
    ).toThrow();
  });
});
