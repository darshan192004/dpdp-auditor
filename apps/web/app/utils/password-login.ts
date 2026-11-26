/**
 * Password-login failures intentionally share one generic message so an
 * unknown email, a wrong password, and a rate-limited attempt are
 * indistinguishable to the caller (security.md §3.4, anti-enumeration).
 */
export function passwordLoginError(_code: string): string {
  return 'Invalid email or password.';
}
