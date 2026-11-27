import { getRouterParam, readBody } from 'h3';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { requireRole } from '../../../../../utils/session';
import { callOrchestrator } from '../../../../../utils/orchestrator';

export default defineEventHandler(async (event) => {
  const repoId = getRouterParam(event, 'repoId');
  const key = getRouterParam(event, 'key');
  const body = await readBody<Record<string, unknown>>(event);
  if (fixturesAnswer(event)) return { data: { ...body, repositoryId: repoId, key } };

  const identity = requireRole(event, ['owner', 'admin']);
  event.context.orgId = identity.orgId;
  event.context.userId = identity.userId;
  return callOrchestrator(event, {
    method: 'PUT',
    path: `/internal/v1/repos/${repoId}/attestations/${encodeURIComponent(key ?? '')}`,
    body: { ...body, actorUserId: identity.userId },
  });
});
