import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { ScansRepository } from '../src/modules/scans/scans.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const REPO_ID = '55555555-5555-4555-8555-555555555555';

function make() {
  const scan = {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  };
  const scanEvent = {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const scannerFinding = { createMany: vi.fn().mockResolvedValue({ count: 1 }) };
  const usageEvent = { create: vi.fn().mockResolvedValue({}) };
  const prisma = { scan, scanEvent, scannerFinding, usageEvent } as unknown as PrismaService;
  return {
    repo: new ScansRepository(prisma),
    scan,
    scanEvent,
    scannerFinding,
    usageEvent,
  };
}

const BATCH = {
  batchId: 'bat_1',
  scanner: 'semgrep' as const,
  scannerVersion: '1.95.0',
  findings: [
    {
      scannerRuleId: 'rule-1',
      severity: 'high' as const,
      message: 'Personal data logged',
      fingerprint: 'fpt_1',
      context: {},
    },
  ],
};

describe('ScansRepository', () => {
  it('looks up by idempotency key, id, and active ref', async () => {
    const { repo, scan } = make();

    await repo.findByIdempotencyKey(ORG_ID, 'key-1');
    await repo.findById(ORG_ID, SCAN_ID);
    await repo.findActiveForRef(ORG_ID, REPO_ID, 'main', ['queued', 'scanning']);
    await repo.countCreatedSince(ORG_ID, new Date('2026-11-01T00:00:00.000Z'));

    expect(scan.findFirst).toHaveBeenNthCalledWith(1, {
      where: { orgId: ORG_ID, idempotencyKey: 'key-1' },
    });
    expect(scan.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: SCAN_ID, orgId: ORG_ID },
      include: { repository: true },
    });
    expect(scan.findFirst).toHaveBeenNthCalledWith(3, {
      where: {
        orgId: ORG_ID,
        repositoryId: REPO_ID,
        ref: 'main',
        status: { in: ['queued', 'scanning'] },
      },
    });
    expect(scan.count).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, createdAt: { gte: new Date('2026-11-01T00:00:00.000Z') } },
    });
  });

  it('finds the previous completed score for the same repository', async () => {
    const { repo, scan } = make();
    scan.findFirst.mockResolvedValueOnce({ score: '68.3' });

    const createdAt = new Date('2026-11-12T00:00:00.000Z');
    await repo.findPreviousCompletedScore(ORG_ID, {
      id: SCAN_ID,
      repositoryId: REPO_ID,
      createdAt,
    });

    expect(scan.findFirst).toHaveBeenCalledWith({
      where: {
        orgId: ORG_ID,
        repositoryId: REPO_ID,
        status: 'completed',
        id: { not: SCAN_ID },
        createdAt: { lt: createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { score: true },
    });
  });

  it('creates a scan with nullable fields defaulted', async () => {
    const { repo, scan } = make();

    await repo.create({
      orgId: ORG_ID,
      repositoryId: REPO_ID,
      ref: 'main',
      trigger: 'manual',
    });

    expect(scan.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        repositoryId: REPO_ID,
        requestedBy: null,
        apiKeyId: null,
        ref: 'main',
        trigger: 'manual',
        idempotencyKey: null,
        idempotencyHash: null,
      },
    });
  });

  it('lists with filters and both sort directions', async () => {
    const { repo, scan } = make();
    scan.count.mockResolvedValue(3);

    await repo.list(ORG_ID, {
      repositoryId: REPO_ID,
      status: ['completed'],
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-11-01T00:00:00.000Z'),
      page: 2,
      pageSize: 2,
      sort: '-score',
    });
    await repo.list(ORG_ID, { page: 1, pageSize: 20, sort: 'createdAt' });

    expect(scan.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          orgId: ORG_ID,
          repositoryId: REPO_ID,
          status: { in: ['completed'] },
          createdAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-11-01T00:00:00.000Z'),
          },
        },
        orderBy: { score: 'desc' },
        skip: 2,
        take: 2,
      }),
    );
    expect(scan.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { orgId: ORG_ID }, orderBy: { createdAt: 'asc' }, skip: 0 }),
    );
  });

  it('updates scans and appends events', async () => {
    const { repo, scan, scanEvent } = make();

    await repo.update(SCAN_ID, { status: 'scanning' });
    await repo.appendEvent(SCAN_ID, ORG_ID, 'queued', { ref: 'main' });
    await repo.listEvents(SCAN_ID);

    expect(scan.update).toHaveBeenCalledWith({
      where: { id: SCAN_ID },
      data: { status: 'scanning' },
    });
    expect(scanEvent.create).toHaveBeenCalledWith({
      data: { scanId: SCAN_ID, orgId: ORG_ID, type: 'queued', payload: { ref: 'main' } },
    });
    expect(scanEvent.findMany).toHaveBeenCalledWith({
      where: { scanId: SCAN_ID },
      orderBy: { id: 'asc' },
    });
  });

  it('counts and finds runner batches by id', async () => {
    const { repo, scanEvent } = make();

    await repo.countBatches(SCAN_ID);
    await repo.findBatch(SCAN_ID, 'bat_1');

    expect(scanEvent.count).toHaveBeenCalledWith({
      where: { scanId: SCAN_ID, type: 'findings_batch' },
    });
    expect(scanEvent.findFirst).toHaveBeenCalledWith({
      where: {
        scanId: SCAN_ID,
        type: 'findings_batch',
        payload: { path: ['batchId'], equals: 'bat_1' },
      },
    });
  });

  it('inserts findings with scanner defaults and counts duplicates', async () => {
    const { repo, scannerFinding } = make();
    scannerFinding.createMany.mockResolvedValue({ count: 0 });

    await expect(repo.insertFindings(SCAN_ID, ORG_ID, BATCH)).resolves.toEqual({
      accepted: 0,
      duplicates: 1,
    });
    expect(scannerFinding.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scanId: SCAN_ID,
          orgId: ORG_ID,
          scanner: 'semgrep',
          scannerRuleVersion: '1.95.0',
          filePath: null,
          lineStart: null,
          context: {},
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('skips the insert for an empty batch', async () => {
    const { repo, scannerFinding } = make();
    await expect(repo.insertFindings(SCAN_ID, ORG_ID, { ...BATCH, findings: [] })).resolves.toEqual(
      { accepted: 0, duplicates: 0 },
    );
    expect(scannerFinding.createMany).not.toHaveBeenCalled();
  });

  it('treats a usage unique violation as success and rethrows other errors', async () => {
    const { repo, usageEvent } = make();
    const usage = {
      orgId: ORG_ID,
      scanId: SCAN_ID,
      eventType: 'storage_byte_hour' as const,
      eventId: '99999999-9999-4999-8999-999999999999',
      quantity: 0.5,
      metadata: {},
    };

    await expect(repo.recordUsage(usage)).resolves.toBe(true);

    usageEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );
    await expect(repo.recordUsage(usage)).resolves.toBe(false);

    usageEvent.create.mockRejectedValue(new Error('connection lost'));
    await expect(repo.recordUsage(usage)).rejects.toThrow('connection lost');
  });

  it('uses a caller-provided transaction client', async () => {
    const { repo } = make();
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { scan: { findFirst } } as unknown as PrismaTypes.TransactionClient;

    await repo.findById(ORG_ID, SCAN_ID, tx);

    expect(findFirst).toHaveBeenCalledOnce();
  });
});
