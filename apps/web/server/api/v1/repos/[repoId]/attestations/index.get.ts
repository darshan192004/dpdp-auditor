import { getRouterParam } from 'h3';
import { requireIdentity } from '../../../../../utils/session';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { fixtureAttestations } from '../../../../../utils/fixtures/attestations';
import { callOrchestrator } from '../../../../../utils/orchestrator';

export default defineEventHandler(async (event) => {
  const repoId = getRouterParam(event, 'repoId');
  if (fixturesAnswer(event)) return { data: fixtureAttestations(repoId) };
  const identity = requireIdentity(event);
  // The shared helper signs these trusted scope values as request headers.
  event.context.orgId = identity.orgId;
  event.context.userId = identity.userId;
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/repos/${repoId}/attestations`,
  });
});
