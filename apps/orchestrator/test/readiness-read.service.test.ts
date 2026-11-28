import { describe, expect, it, vi } from 'vitest';
import { ReadinessReadService } from '../src/modules/readiness/readiness-read.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCAN = '88888888-8888-4888-8888-888888888888';

function scanRow() {
  return {
    id: SCAN,
    orgId: ORG,
    inventoryVersion: 'inventory-1.0.0',
    inventoryStatus: 'completed',
    consentGatingRatio: { toString: () => '0.75' },
    facts: {
      inventory: {
        signals: [
          {
            detector: 'form_scan',
            kind: 'field',
            path: 'src/api/user.ts',
            line: 12,
            token: 'email_address',
            count: 1,
            detectedAt: '2026-11-27T00:00:00.000Z',
          },
        ],
      },
    },
  };
}

describe('readiness read service', () => {
  it('returns bounded inventory signals without source values', async () => {
    const prisma = {
      scan: { findFirst: vi.fn().mockResolvedValue(scanRow()) },
      controlResult: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new ReadinessReadService(prisma as never);
    const view = await service.inventory(ORG, SCAN);

    expect(view.version).toBe('inventory-1.0.0');
    expect(view.status).toBe('completed');
    expect(view.consentGatingRatio).toBe(0.75);
    expect(view.signals).toEqual([
      expect.objectContaining({
        detector: 'form_scan',
        token: 'email_address',
        path: 'src/api/user.ts',
        line: 12,
      }),
    ]);
    expect(JSON.stringify(view)).not.toContain('value');
  });

  it('maps gaps from non-passing persisted verdicts', async () => {
    const prisma = {
      scan: { findFirst: vi.fn().mockResolvedValue(scanRow()) },
      controlResult: {
        findMany: vi.fn().mockResolvedValue([
          {
            controlCode: 'DPDPA-8.4-SECRET-01',
            verdict: 'FAIL',
            reasonCode: 'cited_gap',
            evidence: [{ kind: 'violation', scanner: 'gitleaks' }],
            rule: {
              section: '8(4)',
              title: 'Secrets are not stored in source',
              remediationGuidance: 'Use a secret manager.',
            },
          },
          {
            controlCode: 'DPDPA-6-CONSENT-01',
            verdict: 'ATTESTED_FAIL',
            reasonCode: 'attested_fail',
            evidence: [],
            rule: {
              section: '6',
              title: 'Consent gate is present',
              remediationGuidance: 'Add a consent gate.',
            },
          },
        ]),
      },
    };
    const service = new ReadinessReadService(prisma as never);
    const gaps = await service.gaps(ORG, SCAN);

    expect(gaps.map((gap) => gap.verdict)).toEqual(['FAIL', 'ATTESTED_FAIL']);
    expect(gaps[0]?.evidence[0]).toEqual({ kind: 'violation', scanner: 'gitleaks' });
    expect(gaps[1]?.evidence).toEqual([]);
  });

  it('builds a fix plan from gap remediation guidance only', async () => {
    const prisma = {
      scan: { findFirst: vi.fn().mockResolvedValue(scanRow()) },
      controlResult: {
        findMany: vi.fn().mockResolvedValue([
          {
            controlCode: 'DPDPA-8.4-SECRET-01',
            verdict: 'FAIL',
            reasonCode: 'cited_gap',
            evidence: [],
            rule: {
              section: '8(4)',
              title: 'Secrets are not stored in source',
              remediationGuidance: 'Use a secret manager.',
            },
          },
        ]),
      },
    };
    const service = new ReadinessReadService(prisma as never);
    const plan = await service.fixPlan(ORG, SCAN);

    expect(plan.steps).toEqual([
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        title: 'Secrets are not stored in source',
        remedy: 'Use a secret manager.',
      },
    ]);
  });
});
