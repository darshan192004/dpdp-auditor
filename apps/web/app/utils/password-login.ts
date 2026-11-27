/**
 * Password-login failures intentionally share one generic message so an
 * unknown email, a wrong password, and a rate-limited attempt are
 * indistinguishable to the caller (security.md §3.4, anti-enumeration).
 */
export function passwordLoginError(_code: string): string {
  return 'Invalid email or password.';
}

type NavigateTo = (
  to: string,
  options: { replace: boolean; external: boolean },
) => Promise<unknown> | unknown;

/**
 * A successful password login sets the cookie on the server, but the client's
 * `useState` app context still holds the signed-out values from page load. A
 * client-side `navigateTo` therefore hits the auth guard with a null user and
 * bounces straight back to /login. A full document load re-runs the session
 * plugin so the new cookie is resolved before the guard sees the route.
 */
export async function navigateAfterPasswordLogin(
  destination: string,
  navigateTo: NavigateTo,
): Promise<void> {
  await navigateTo(destination, { replace: true, external: true });
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
