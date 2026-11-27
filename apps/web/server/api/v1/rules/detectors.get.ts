import { fixturesAnswer, requireIdentity } from '../../../utils/org-request';
import { callOrchestrator } from '../../../utils/orchestrator';

/** Bounded detector metadata; guarded fixtures keep the Rules page verifiable. */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) {
    return {
      data: {
        pack: 'dpdpa-2026.11.0',
        detectors: [
          {
            id: 'form_scan',
            module: 'inventory',
            inputs: ['source'],
            outputs: ['fact', 'status'],
            timeoutMs: 30_000,
            confidence: 'inferred',
            failureMode: 'UNKNOWN',
            controls: [
              {
                code: 'DPDPA-6-CONSENT-01',
                evidenceMode: 'absence',
                absenceTokens: ['consent_checkbox'],
              },
            ],
          },
        ],
      },
    };
  }
  const identity = requireIdentity(event);
  event.context.orgId = identity.orgId;
  event.context.userId = identity.userId;
  return callOrchestrator(event, {
    method: 'GET',
    path: '/internal/v1/detectors',
  });
});
