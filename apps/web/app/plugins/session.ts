import { useRequestEvent } from '#imports';
import { toMePayload, toOrgContext, type MePayload } from '~~/shared/auth';
import { useAppContext } from '~/composables/useAppContext';

function apply(payload: MePayload): void {
  const { user, org, features } = useAppContext();
  user.value = payload.user;
  org.value = toOrgContext(payload);
  features.value = payload.featureFlags;
}

/**
 * Hydrates the app context once per request/page (design §7.6).
 *
 * On the server the session middleware has already resolved `/api/v1/me`, so
 * we reuse `event.context.session` instead of making a second orchestrator
 * call. On the client (and after client-side navigation) we ask the BFF.
 */
export default defineNuxtPlugin(async () => {
  if (import.meta.server) {
    if (process.env.NUXT_FIXTURES === '1') return;

    const event = useRequestEvent();
    if (event?.context.session) {
      apply(toMePayload(event.context.session));
      return;
    }
  }

  const { user } = useAppContext();
  if (user.value !== null) return;

  const response = await useRequestFetch()<{ data: MePayload }>('/api/v1/me').catch(() => null);
  if (response !== null) apply(response.data);
});
