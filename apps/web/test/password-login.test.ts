import { describe, expect, it } from 'vitest';

import { passwordLoginError } from '../app/utils/password-login';

describe('password login copy', () => {
  it('uses one generic error for every failure', () => {
    expect(passwordLoginError('UNAUTHENTICATED')).toBe('Invalid email or password.');
    expect(passwordLoginError('RATE_LIMITED')).toBe('Invalid email or password.');
    expect(passwordLoginError('UNKNOWN')).toBe('Invalid email or password.');
  });
});
