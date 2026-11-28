import { getRouterParam, setHeader } from 'h3';
import { fixturesAnswer, requireIdentity } from '../../../../../utils/org-request';
import { callOrchestrator } from '../../../../../utils/orchestrator';

/** SARIF 2.1.0 download; no issue or PR is opened on the target repository. */
export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId');
  if (fixturesAnswer(event)) {
    setHeader(event, 'content-disposition', 'attachment; filename="readiness.sarif.json"');
    return {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [],
    };
  }
  const identity = requireIdentity(event);
  event.context.orgId = identity.orgId;
  event.context.userId = identity.userId;
  const response = await callOrchestrator<{ data: unknown }>(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/export/sarif`,
  });
  setHeader(event, 'content-disposition', 'attachment; filename="readiness.sarif.json"');
  return response.data;
});
