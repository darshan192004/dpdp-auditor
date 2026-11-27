import { describe, expect, it } from 'vitest';
import { DetectorCatalogService } from '../src/modules/readiness/detector-catalog.service.js';

describe('detector catalog', () => {
  it('explains detector inputs, outputs, and failure mode without source content', async () => {
    const pack = {
      loadV2: async () => ({
        pack: 'dpdpa-2026.11.0',
        detectors: [
          {
            id: 'form_scan',
            module: 'inventory',
            inputs: ['source'],
            outputs: ['signal', 'status'],
            timeoutMs: 30_000,
            stacks: [],
            confidence: 'inferred',
            failureMode: 'UNKNOWN',
            controlRefs: ['DPDPA-6-CONSENT-01'],
          },
        ],
        controls: [
          {
            code: 'DPDPA-6-CONSENT-01',
            evidenceMode: 'absence',
            absenceRules: [
              {
                id: 'consent_gate_absent',
                detector: 'form_scan',
                token: 'consent_checkbox',
                confidence: 'inferred',
              },
            ],
          },
        ],
      }),
    };
    const service = new DetectorCatalogService(pack as never);
    const view = await service.list();

    expect(view.detectors[0]).toEqual({
      id: 'form_scan',
      module: 'inventory',
      inputs: ['source'],
      outputs: ['signal', 'status'],
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
    });
    expect(JSON.stringify(view)).not.toContain('value');
    expect(JSON.stringify(view)).not.toContain('snippet');
  });
});
