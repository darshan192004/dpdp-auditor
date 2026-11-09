/**
 * Route-access rule for the app area (plan Task 6, P1-29).
 *
 * Pure and Nuxt-free so the redirect table can be unit-tested without
 * mounting middleware. The middleware is a thin wrapper around this.
 */
export interface RouteAccessContext {
  hasUser: boolean;
  hasOrg: boolean;
}

const APP_ROOT = '/app';

/** True for `/app` and everything beneath it, and nothing else. */
function isAppPath(path: string): boolean {
  return path === APP_ROOT || path.startsWith(`${APP_ROOT}/`);
}

/**
 * Returns the redirect target for `path`, or `null` when the request may proceed:
 *
 * - `/app/**` without a user → `/login?redirect=<encoded path>`
 * - `/app/**` with a user but no organisation → `/onboarding`
 * - everything else, including `/login`, `/onboarding`, `/health`, `/` → `null`
 *
 * The last rule is what keeps the middleware from redirect-looping.
 */
export function resolveRouteAccess(
  path: string,
  { hasUser, hasOrg }: RouteAccessContext,
): string | null {
  if (!isAppPath(path)) return null;
  if (!hasUser) return `/login?redirect=${encodeURIComponent(path)}`;
  if (!hasOrg) return '/onboarding';
  return null;
}
