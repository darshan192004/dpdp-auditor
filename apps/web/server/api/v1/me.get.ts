import { FIXTURE_ORG_ID, FIXTURE_USER_ID } from '~~/shared/fixtures';
import { toMePayload, type MePayload } from '~~/shared/auth';
import { fixturesEnabled } from '../../utils/fixtures/guard';

/**
 * GET /api/v1/me — docs/api.md §8.
 *
 * The session middleware already resolved the cookie into `event.context`, so
 * this is a pure projection: no second orchestrator call per page load.
 */
export default defineEventHandler((event): { data: MePayload } => {
  if (event.context.session) {
    return { data: toMePayload(event.context.session) };
  }

  // Fixtures have no sealed cookie; keep the dev/CI surface honest.
  if (fixturesEnabled()) {
    return {
      data: toMePayload({
        session: { activeOrgId: FIXTURE_ORG_ID },
        user: {
          id: FIXTURE_USER_ID,
          name: 'Fixture auditor',
          email: 'auditor@example.test',
          avatarUrl: null,
        },
        memberships: [
          {
            orgId: FIXTURE_ORG_ID,
            role: 'auditor',
            organization: {
              id: FIXTURE_ORG_ID,
              name: 'Acme Payments',
              slug: 'acme-payments',
              plan: 'pro',
              retentionDays: 365,
            },
          },
        ],
        featureFlags: {},
      }),
    };
  }

  return apiError(event, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
});
