/**
 * Password-login failures intentionally share one generic message so an
 * unknown email, a wrong password, and a rate-limited attempt are
 * indistinguishable to the caller (security.md §3.4, anti-enumeration).
 */
export function passwordLoginError(_code: string): string {
  return 'Invalid email or password.';
}

export { NEW_PASSWORD_MIN_LENGTH } from '~~/shared/auth';
import { NEW_PASSWORD_MIN_LENGTH } from '~~/shared/auth';

/** Client-side checks before posting a first-login password rotation. */
export function passwordChangeError(newPassword: string, confirm: string): string | null {
  if (newPassword.length < NEW_PASSWORD_MIN_LENGTH) {
    return `New password must be at least ${NEW_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (newPassword !== confirm) return 'Passwords do not match.';
  return null;
}
