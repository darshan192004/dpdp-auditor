import { Prisma, type Scan } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ScanScoringService } from '../src/modules/scoring/scan-scoring.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const REPO = '55555555-5555-4555-8555-555555555555';

const scan = {
  id: '88888888-8888-4888-8888-888888888888',
  orgId: ORG,
  repositoryId: REPO,
  status: 'completed',
  scoringVersion: 'scoring-2.0.0',
  facts: { languages: ['java'], frameworks: [], resourceTypes: [] },
  coverage: { gitleaks: 'completed' },
} as unknown as Scan;

const result = {
  score: 60,
  grade: null,
  sectionScores: { '8(4)': 60 },
  counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  coverage: 'full',
  evidenceCoverage: 0,
  verdictCounts: { ATTESTED_PASS: 1 },
  unknownControls: [],
  gradeWithheldReason: 'insufficient_evidence',
};

describe('attestation-triggered rescore', () => {
  it('rescores completed v2 scans with active attestations only', async () => {
    const tx = {
      scan: {
        findMany: vi.fn().mockResolvedValue([scan]),
        update: vi.fn().mockResolvedValue(scan),
      },
      scanEvent: { create: vi.fn().mockResolvedValue({}) },
      attestation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'a1',
            orgId: ORG,
            repositoryId: REPO,
            key: 'secrets.managed_store',
            answer: true,
            note: 'CANARY_NOTE_MUST_NOT_BE_SCORED',
            attestedBy: '22222222-2222-4222-9222-222222222222',
            attestedAt: new Date('2026-11-27T00:00:00.000Z'),
            expiresAt: null,
          },
        ]),
      },
    };
    const pack = {
      load: vi.fn().mockResolvedValue({ pack: 'dpdpa-2026.10.6' }),
      loadV2: vi.fn().mockResolvedValue({
        pack: 'dpdpa-2026.11.0',
        attestationsByKey: new Map([
          ['secrets.managed_store', [{ code: 'DPDPA-8.4-SECRET-01', section: '8(4)', weight: 4 }]],
        ]),
      }),
    };
    const prisma = {};
    const flags = { isEnabled: vi.fn().mockReturnValue(true) };
    const service = new ScanScoringService(pack as never, prisma as never, flags as never);
    const scorePersisted = vi
      .spyOn(service, 'scorePersisted')
      .mockResolvedValue({ loaded: { pack: 'dpdpa-2026.11.0' }, result } as never);

    await service.rescoreRepository(ORG, REPO, tx as never);

    expect(tx.scan.findMany).toHaveBeenCalledWith({
      where: {
        orgId: ORG,
        repositoryId: REPO,
        status: 'completed',
        scoringVersion: 'scoring-2.0.0',
      },
      orderBy: { completedAt: 'desc' },
    });
    const map = scorePersisted.mock.calls[0]![3]!;
    expect(map.get('DPDPA-8.4-SECRET-01')).toEqual([
      expect.objectContaining({ key: 'secrets.managed_store', answer: true }),
    ]);
    expect(JSON.stringify(map)).not.toContain('CANARY_NOTE_MUST_NOT_BE_SCORED');
    expect(tx.scan.update).toHaveBeenCalledWith({
      where: { id: scan.id },
      data: expect.objectContaining({
        score: expect.any(Prisma.Decimal),
        evidenceCoverage: expect.any(Prisma.Decimal),
        verdictCounts: { ATTESTED_PASS: 1 },
      }),
    });
    expect(tx.scanEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scanId: scan.id,
        orgId: ORG,
        type: 'score_recomputed',
        payload: expect.objectContaining({ evidenceCoverage: 0 }),
      }),
    });
  });
});
