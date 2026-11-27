import { useAppContext } from '~/composables/useAppContext';
import { resolveRouteAccess } from '~/utils/resolveRouteAccess';

// Global guard for the /app area (plan Task 6, P1-29). The rule itself lives in
// the pure resolver so the redirect table stays unit-testable.
export default defineNuxtRouteMiddleware((to) => {
  // Seeded accounts must rotate their temporary password before using the app.
  const { user: sessionUser } = useUserSession();
  const mustRotate = (sessionUser.value as unknown as { mustChangePassword?: boolean } | null)
    ?.mustChangePassword;
  if (mustRotate === true && to.path !== '/change-password') {
    return navigateTo('/change-password', { redirectCode: 302, replace: true });
  }

  const { user, org } = useAppContext();

  const redirect = resolveRouteAccess(to.path, {
    hasUser: user.value !== null,
    hasOrg: org.value !== null,
  });

  if (redirect) return navigateTo(redirect, { redirectCode: 302, replace: true });
});
