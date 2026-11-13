import { FIXTURE_ORG_ID, FIXTURE_USER_ID, fixturesEnabled } from '../utils/fixtures/guard';

/**
 * Phase 2 auth is not implemented yet, so `event.context.orgId/userId` would be
 * empty and every orchestrator call would fail validation. Under fixtures we
 * seed the same fields the real session will populate — no fake auth ships in
 * the production path.
 */
export default defineEventHandler((event) => {
  if (!fixturesEnabled()) return;
  event.context.orgId ??= FIXTURE_ORG_ID;
  event.context.userId ??= FIXTURE_USER_ID;
});
