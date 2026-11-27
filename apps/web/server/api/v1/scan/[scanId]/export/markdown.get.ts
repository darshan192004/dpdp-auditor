import { getRouterParam, setHeader } from 'h3';
import { fixturesAnswer, requireIdentity } from '../../../../../utils/org-request';
import { callOrchestrator } from '../../../../../utils/orchestrator';

/** Issue-ready Markdown draft for human review; nothing is opened automatically. */
export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) {
    setHeader(event, 'content-type', 'text/markdown; charset=utf-8');
    setHeader(event, 'content-disposition', 'attachment; filename="readiness-gaps.md"');
    return '# Readiness gaps\n\nNo recorded gaps in the fixture.';
  }
  const identity = requireIdentity(event);
  event.context.orgId = identity.orgId;
  event.context.userId = identity.userId;
  const response = await callOrchestrator<{ data: { markdown: string } }>(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/export/markdown`,
  });
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8');
  setHeader(event, 'content-disposition', 'attachment; filename="readiness-gaps.md"');
  return response.data.markdown;
});
