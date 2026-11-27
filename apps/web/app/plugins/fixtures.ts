import { getQuery } from 'h3';
import { useRequestEvent } from '#imports';
import { fixtureRoleFor, FIXTURE_ORG_ID, FIXTURE_USER_ID } from '~~/shared/fixtures';
import { useAppContext } from '~/composables/useAppContext';

/**
 * Seeds the app context on the server under fixtures so the `/app/**` guard
 * passes during SSR and the values hydrate from the payload. Guarded by
 * `import.meta.server`, so no fixture identity is ever bundled into the client.
 *
 * `?fixtureRole=owner|admin` is a fixtures-only override that makes the owner
 * write control observable during the live walkthrough; the default session
 * stays read-only (auditor).
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.server) return;
  if (process.env.NUXT_FIXTURES !== '1') return;

  const event = useRequestEvent();
  const requested = event === undefined ? undefined : getQuery(event).fixtureRole;
  const role = fixtureRoleFor(Array.isArray(requested) ? (requested[0] ?? undefined) : requested);

  const { user, org } = useAppContext();
  user.value = {
    id: FIXTURE_USER_ID,
    name: 'Fixture auditor',
    email: 'auditor@example.test',
    avatarUrl: null,
  };
  org.value = {
    id: FIXTURE_ORG_ID,
    name: 'Acme Payments',
    slug: 'acme-payments',
    plan: 'starter',
    role,
    retentionDays: 365,
  };
});
