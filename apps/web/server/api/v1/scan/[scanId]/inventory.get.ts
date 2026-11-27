import { getRouterParam } from 'h3';
import { fixturesAnswer } from '../../../../utils/org-request';
import { fixtureInventory } from '../../../../utils/fixtures/readiness';
import { callOrchestrator } from '../../../../utils/orchestrator';
import { requireIdentity } from '../../../../utils/session';

export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) return { data: fixtureInventory() };
  const identity = requireIdentity(event);
  event.context.orgId = identity.orgId;
  event.context.userId = identity.userId;
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/inventory`,
  });
});
