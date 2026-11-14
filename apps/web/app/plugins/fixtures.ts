import { FIXTURE_ORG_ID, FIXTURE_USER_ID } from '~~/shared/fixtures';
import { useAppContext } from '~/composables/useAppContext';

/**
 * Seeds the app context on the server under fixtures so the `/app/**` guard
 * passes during SSR and the values hydrate from the payload. Guarded by
 * `import.meta.server`, so no fixture identity is ever bundled into the client.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.server) return;
  if (process.env.NUXT_FIXTURES !== '1') return;

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
    plan: 'pro',
    role: 'auditor',
    retentionDays: 365,
  };
});
