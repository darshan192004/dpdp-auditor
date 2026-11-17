import { parseCreateOrg } from '~~/shared/org';
import { fixturesAnswer, rethrowOrgInput } from '../../../utils/org-request';

/**
 * POST /api/v1/org — docs/api.md §7.2.
 *
 * Onboarding creates the caller's first organisation; the orchestrator makes
 * the caller its owner. No org header is sent because none exists yet.
 */
export default defineEventHandler(async (event) => {
  const fixtures = fixturesAnswer(event);
  if (!fixtures) requireSession(event);

  const body = await readBody(event).catch(() => undefined);

  if (fixtures) {
    try {
      const input = parseCreateOrg(body);
      return {
        data: {
          id: '0f000000-0000-4000-8000-0000000000aa',
          name: input.name,
          slug: input.slug,
          plan: 'free',
          dataRegion: 'ap-south-1',
          retentionDays: 90,
          scanConcurrency: 3,
          settings: {},
          role: 'owner',
        },
      };
    } catch (error) {
      rethrowOrgInput(event, error);
    }
  }

  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/identity/orgs',
    body,
  });
});
