import { useAppContext } from '~/composables/useAppContext';
import { resolveRouteAccess } from '~/utils/resolveRouteAccess';

// Global guard for the /app area (plan Task 6, P1-29). The rule itself lives in
// the pure resolver so the redirect table stays unit-testable.
export default defineNuxtRouteMiddleware((to) => {
  const { user, org } = useAppContext();

  const redirect = resolveRouteAccess(to.path, {
    hasUser: user.value !== null,
    hasOrg: org.value !== null,
  });

  if (redirect) return navigateTo(redirect, { redirectCode: 302, replace: true });
});
