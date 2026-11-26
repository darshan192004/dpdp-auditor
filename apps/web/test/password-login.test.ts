import { describe, expect, it } from 'vitest';

import { passwordChangeError, passwordLoginError } from '../app/utils/password-login';

describe('password login copy', () => {
  it('uses one generic error for every failure', () => {
    expect(passwordLoginError('UNAUTHENTICATED')).toBe('Invalid email or password.');
    expect(passwordLoginError('RATE_LIMITED')).toBe('Invalid email or password.');
    expect(passwordLoginError('UNKNOWN')).toBe('Invalid email or password.');
  });
});

describe('password rotation copy', () => {
  it('requires a 12-character new password and a matching confirmation', () => {
    expect(passwordChangeError('short', 'short')).toBe(
      'New password must be at least 12 characters.',
    );
    expect(passwordChangeError('correct horse battery', 'different phrase here')).toBe(
      'Passwords do not match.',
    );
    expect(passwordChangeError('correct horse battery', 'correct horse battery')).toBeNull();
  });
});
