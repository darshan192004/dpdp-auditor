import { describe, expect, it } from 'vitest';
import { resolveRouteAccess } from '../app/utils/resolveRouteAccess';

// Table pinned from docs/superpowers/plans/2026-11-06-phase-1-web-foundation.md
// Task 6 — Review Focus 4: no redirect loops, no matches outside /app/**.
const CASES: Array<{
  path: string;
  hasUser: boolean;
  hasOrg: boolean;
  expected: string | null;
}> = [
  { path: '/app/scans', hasUser: false, hasOrg: false, expected: '/login?redirect=%2Fapp%2Fscans' },
  { path: '/app/scans', hasUser: true, hasOrg: false, expected: '/onboarding' },
  { path: '/app/scans', hasUser: true, hasOrg: true, expected: null },
  { path: '/login', hasUser: false, hasOrg: false, expected: null },
  { path: '/onboarding', hasUser: true, hasOrg: false, expected: null },
  { path: '/health', hasUser: false, hasOrg: false, expected: null },
  { path: '/', hasUser: false, hasOrg: false, expected: null },
  { path: '/app', hasUser: true, hasOrg: false, expected: '/onboarding' },
];

describe.each(CASES)(
  'resolveRouteAccess($path, hasUser: $hasUser, hasOrg: $hasOrg)',
  ({ path, hasUser, hasOrg, expected }) => {
    it(`returns ${expected ?? 'null'}`, () => {
      expect(resolveRouteAccess(path, { hasUser, hasOrg })).toBe(expected);
    });
  },
);

describe('resolveRouteAccess edge cases', () => {
  it('sends an anonymous visitor to login with the original path encoded', () => {
    expect(resolveRouteAccess('/app/settings/org', { hasUser: false, hasOrg: false })).toBe(
      '/login?redirect=%2Fapp%2Fsettings%2Forg',
    );
  });

  it('never treats a look-alike path as the app area', () => {
    expect(resolveRouteAccess('/application', { hasUser: false, hasOrg: false })).toBeNull();
    expect(resolveRouteAccess('/appetiser', { hasUser: false, hasOrg: false })).toBeNull();
  });

  it('keeps /login and /onboarding out of the redirect chain', () => {
    for (const path of ['/login', '/onboarding']) {
      expect(resolveRouteAccess(path, { hasUser: false, hasOrg: false })).toBeNull();
      expect(resolveRouteAccess(path, { hasUser: true, hasOrg: false })).toBeNull();
      expect(resolveRouteAccess(path, { hasUser: true, hasOrg: true })).toBeNull();
    }
  });

  it('does not redirect a signed-in user who still has an organisation', () => {
    expect(resolveRouteAccess('/app', { hasUser: true, hasOrg: true })).toBeNull();
  });
});
