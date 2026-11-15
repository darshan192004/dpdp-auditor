import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

function makeService() {
  const create = vi.fn().mockResolvedValue({});
  const prisma = { auditLog: { create } } as unknown as PrismaService;
  return { service: new AuditService(prisma), create };
}

const ENTRY = {
  orgId: '11111111-1111-4111-8111-111111111111',
  actorType: 'user' as const,
  actorUserId: '22222222-2222-4222-9222-222222222222',
  action: 'org.created',
  resourceType: 'organization',
  resourceId: '33333333-3333-4333-a333-333333333333',
  ip: '203.0.113.7',
  userAgent: 'vitest',
  metadata: { slug: 'acme' },
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-9222-222222222222';

describe('AuditService', () => {
  it('inserts a validated entry', async () => {
    const { service, create } = makeService();
    const result = await service.record(ENTRY);
    expect(result.action).toBe('org.created');
    expect(create).toHaveBeenCalledWith({
      data: {
        orgId: ENTRY.orgId,
        actorType: 'user',
        actorUserId: ENTRY.actorUserId,
        action: 'org.created',
        resourceType: 'organization',
        resourceId: ENTRY.resourceId,
        ip: ENTRY.ip,
        userAgent: 'vitest',
        metadata: { slug: 'acme' },
      },
    });
  });

  it('rejects an action that is not dotted lowercase', async () => {
    const { service } = makeService();
    await expect(service.record({ ...ENTRY, action: 'Org Created' })).rejects.toThrow();
  });

  it('rejects an unknown actor type', async () => {
    const { service } = makeService();
    await expect(
      // @ts-expect-error intentionally invalid: Zod must reject it at runtime
      service.record({ ...ENTRY, actorType: 'robot' }),
    ).rejects.toThrow();
  });

  it('fills optional fields with null and defaults', async () => {
    const { service, create } = makeService();
    await service.record({
      orgId: null,
      actorType: 'system',
      action: 'system.boot',
      resourceType: 'service',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        orgId: null,
        actorType: 'system',
        actorUserId: null,
        action: 'system.boot',
        resourceType: 'service',
        resourceId: null,
        ip: null,
        userAgent: null,
        metadata: {},
      },
    });
  });

  it('writes through a caller-provided transaction client', async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as never;
    const service = new AuditService({} as PrismaService);
    await service.record(ENTRY, tx);
    expect(create).toHaveBeenCalledOnce();
  });

  describe('list', () => {
    function makeListService() {
      const findMany = vi.fn().mockResolvedValue([]);
      const count = vi.fn().mockResolvedValue(0);
      const prisma = {
        auditLog: { findMany, count },
      } as unknown as PrismaService;
      return { service: new AuditService(prisma), findMany, count };
    }

    it('fetches entries and count in parallel', async () => {
      const { service, findMany, count } = makeListService();
      findMany.mockResolvedValue([
        {
          id: BigInt(1),
          actorType: 'user',
          actorUserId: USER_ID,
          action: 'org.created',
          resourceType: 'organization',
          resourceId: null,
          ip: null,
          userAgent: null,
          metadata: null,
          createdAt: new Date('2026-11-12T00:00:00.000Z'),
          actor: null,
        },
      ]);
      count.mockResolvedValue(1);

      const { entries, total } = await service.list({ orgId: ORG_ID }, 1, 50);

      expect(findMany).toHaveBeenCalledWith({
        where: { orgId: ORG_ID },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
      });
      expect(count).toHaveBeenCalledWith({ where: { orgId: ORG_ID } });
      expect(entries).toHaveLength(1);
      expect(total).toBe(1);
    });

    it('filters by action and actorUserId', async () => {
      const { service, findMany, count } = makeListService();
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);

      await service.list({ orgId: ORG_ID, action: 'scan.started', actorUserId: USER_ID }, 1, 10);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG_ID, action: 'scan.started', actorUserId: USER_ID },
        }),
      );
    });

    it('filters by date range', async () => {
      const { service, findMany, count } = makeListService();
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);

      await service.list(
        { orgId: ORG_ID, from: new Date('2026-01-01'), to: new Date('2026-12-31') },
        1,
        10,
      );

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: ORG_ID,
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-12-31'),
            },
          },
        }),
      );
    });

    it('filters by from-only and to-only ranges', async () => {
      const { service, findMany } = makeListService();
      findMany.mockResolvedValue([]);

      await service.list({ orgId: ORG_ID, from: new Date('2026-01-01') }, 1, 10);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG_ID, createdAt: { gte: new Date('2026-01-01') } },
        }),
      );

      await service.list({ orgId: ORG_ID, to: new Date('2026-12-31') }, 1, 10);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG_ID, createdAt: { lte: new Date('2026-12-31') } },
        }),
      );
    });

    it('uses skip for pagination', async () => {
      const { service, findMany } = makeListService();
      findMany.mockResolvedValue([]);

      await service.list({ orgId: ORG_ID }, 3, 25);

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 25 }));
    });

    it('omits createdAt when no date filters provided', async () => {
      const { service, findMany } = makeListService();
      findMany.mockResolvedValue([]);

      await service.list({ orgId: ORG_ID }, 1, 10);

      const where = findMany.mock.calls[0]?.[0]?.where;
      expect(where).not.toHaveProperty('createdAt');
    });
  });

  describe('export', () => {
    function makeExportService() {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = {
        auditLog: { findMany },
      } as unknown as PrismaService;
      return { service: new AuditService(prisma), findMany };
    }

    it('yields entries in descending id order', async () => {
      const { service, findMany } = makeExportService();
      findMany.mockResolvedValue([
        {
          id: BigInt(2),
          actorType: 'user',
          actorUserId: USER_ID,
          action: 'org.created',
          resourceType: 'organization',
          resourceId: null,
          ip: null,
          userAgent: null,
          metadata: null,
          createdAt: new Date('2026-11-12T00:00:00.000Z'),
          actor: null,
        },
      ]);

      const results: unknown[] = [];
      for await (const entry of service.export({ orgId: ORG_ID })) {
        results.push(entry);
      }

      expect(results).toHaveLength(1);
      expect(findMany).toHaveBeenCalledWith({
        where: { orgId: ORG_ID },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: [{ id: 'desc' }],
        take: 1000,
      });
    });

    it('stops when fewer rows than batch size returned', async () => {
      const { service, findMany } = makeExportService();
      findMany.mockResolvedValue([
        {
          id: BigInt(1),
          actorType: 'user',
          actorUserId: USER_ID,
          action: 'org.created',
          resourceType: 'organization',
          resourceId: null,
          ip: null,
          userAgent: null,
          metadata: null,
          createdAt: new Date('2026-11-12T00:00:00.000Z'),
          actor: null,
        },
      ]);

      const results: unknown[] = [];
      for await (const entry of service.export({ orgId: ORG_ID })) {
        results.push(entry);
      }

      expect(results).toHaveLength(1);
      // batch.length (1) < BATCH_SIZE (1000) → break after first iteration
      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('uses keyset pagination for subsequent batches', async () => {
      const { service, findMany } = makeExportService();
      // First batch must be exactly BATCH_SIZE (1000) to force a second query.
      const fullBatch = Array.from({ length: 1000 }, (_, i) => ({
        id: BigInt(1000 - i),
        actorType: 'user',
        actorUserId: USER_ID,
        action: 'org.created',
        resourceType: 'organization',
        resourceId: null,
        ip: null,
        userAgent: null,
        metadata: null,
        createdAt: new Date('2026-11-12T00:00:00.000Z'),
        actor: null,
      }));
      findMany.mockResolvedValueOnce(fullBatch);
      findMany.mockResolvedValueOnce([]);

      const results: unknown[] = [];
      for await (const entry of service.export({ orgId: ORG_ID })) {
        results.push(entry);
      }

      expect(findMany).toHaveBeenCalledTimes(2);
      // Second call should use keyset pagination with the last id from batch 1.
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { orgId: ORG_ID, id: { lt: BigInt(1) } },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: [{ id: 'desc' }],
        take: 1000,
      });
    });

    it('respects filters in export', async () => {
      const { service, findMany } = makeExportService();
      findMany.mockResolvedValue([]);

      const gen = service.export({
        orgId: ORG_ID,
        action: 'scan.started',
        actorUserId: USER_ID,
        from: new Date('2026-01-01'),
        to: new Date('2026-12-31'),
      });

      const results: unknown[] = [];
      for await (const entry of gen) {
        results.push(entry);
      }

      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: {
          orgId: ORG_ID,
          action: 'scan.started',
          actorUserId: USER_ID,
          createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-12-31') },
        },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: [{ id: 'desc' }],
        take: 1000,
      });
    });

    it('handles from-only and to-only date filters', async () => {
      const { service, findMany } = makeExportService();
      findMany.mockResolvedValue([]);

      for await (const _ of service.export({ orgId: ORG_ID, from: new Date('2026-01-01') })) {
        // drain
      }
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG_ID, createdAt: { gte: new Date('2026-01-01') } },
        }),
      );

      for await (const _ of service.export({ orgId: ORG_ID, to: new Date('2026-12-31') })) {
        // drain
      }
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: ORG_ID, createdAt: { lte: new Date('2026-12-31') } },
        }),
      );
    });

    it('caps at 100k rows', async () => {
      const { service, findMany } = makeExportService();

      // Every batch returns a full 1000 rows; the generator must stop after
      // exactly 100 batches (100_000 rows), not keep querying.
      const batch = Array.from({ length: 1000 }, (_, i) => ({
        id: BigInt(1000 - i),
        actorType: 'user',
        actorUserId: USER_ID,
        action: 'org.created',
        resourceType: 'organization',
        resourceId: null,
        ip: null,
        userAgent: null,
        metadata: null,
        createdAt: new Date('2026-11-12T00:00:00.000Z'),
        actor: null,
      }));
      findMany.mockResolvedValue(batch);

      const results: unknown[] = [];
      for await (const entry of service.export({ orgId: ORG_ID })) {
        results.push(entry);
      }

      expect(results).toHaveLength(100_000);
      expect(findMany).toHaveBeenCalledTimes(100);
    });

    it('stops immediately when no data exists', async () => {
      const { service, findMany } = makeExportService();
      findMany.mockResolvedValue([]);

      const results: unknown[] = [];
      for await (const entry of service.export({ orgId: ORG_ID })) {
        results.push(entry);
      }

      expect(results).toHaveLength(0);
      expect(findMany).toHaveBeenCalledTimes(1);
    });
  });
});
