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
});
