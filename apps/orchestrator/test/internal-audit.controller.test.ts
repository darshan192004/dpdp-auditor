import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { InternalAuditController } from '../src/modules/audit/internal-audit.controller.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';
import { ApiError } from '../src/common/api-error.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-9222-222222222222';

function makeService() {
  const list = vi.fn().mockResolvedValue({ entries: [], total: 0 });
  const record = vi.fn().mockResolvedValue({});
  const exportGen = vi.fn();
  return {
    audit: { list, record, export: exportGen } as unknown as AuditService,
    list,
    record,
    exportGen,
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(1),
    actorType: 'user',
    actorUserId: USER_ID,
    action: 'org.created',
    resourceType: 'organization',
    resourceId: '33333333-3333-4333-a333-333333333333',
    ip: '203.0.113.7',
    userAgent: 'vitest',
    metadata: { slug: 'acme' },
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    actor: { name: 'Asha', email: 'asha@example.com' },
    ...overrides,
  };
}

function* gen(entries: unknown[]) {
  for (const entry of entries) yield entry;
}

describe('InternalAuditController.list', () => {
  it('lists audit logs with defaults', async () => {
    const { audit, list } = makeService();
    const controller = new InternalAuditController(audit);
    list.mockResolvedValue({ entries: [makeEntry()], total: 1 });

    const result = await controller.list(ORG_ID, USER_ID, {});

    expect(list).toHaveBeenCalledWith({ orgId: ORG_ID }, 1, 50);
    expect(result.data).toEqual([
      {
        id: 1,
        actor: { type: 'user', id: USER_ID, name: 'Asha' },
        action: 'org.created',
        resource: { type: 'organization', id: '33333333-3333-4333-a333-333333333333' },
        ip: '203.0.113.7',
        userAgent: 'vitest',
        metadata: { slug: 'acme' },
        createdAt: '2026-11-12T00:00:00.000Z',
      },
    ]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 1, totalPages: 1 });
  });

  it('forwards filter and pagination params', async () => {
    const { audit, list } = makeService();
    const controller = new InternalAuditController(audit);
    list.mockResolvedValue({ entries: [], total: 0 });

    await controller.list(ORG_ID, USER_ID, {
      action: 'scan.started',
      actorUserId: USER_ID,
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-30T00:00:00.000Z',
      page: '2',
      pageSize: '25',
    });

    expect(list).toHaveBeenCalledWith(
      {
        orgId: ORG_ID,
        action: 'scan.started',
        actorUserId: USER_ID,
        from: new Date('2026-11-01T00:00:00.000Z'),
        to: new Date('2026-11-30T00:00:00.000Z'),
      },
      2,
      25,
    );
  });

  it('rejects missing org id', async () => {
    const { audit } = makeService();
    const controller = new InternalAuditController(audit);

    await expect(controller.list(undefined, USER_ID, {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects page below 1', async () => {
    const { audit } = makeService();
    const controller = new InternalAuditController(audit);

    await expect(controller.list(ORG_ID, USER_ID, { page: '0' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects pageSize outside 1..100', async () => {
    const { audit } = makeService();
    const controller = new InternalAuditController(audit);

    await expect(controller.list(ORG_ID, USER_ID, { pageSize: '0' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(controller.list(ORG_ID, USER_ID, { pageSize: '101' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('nulls out actor name when actor is missing', async () => {
    const { audit, list } = makeService();
    const controller = new InternalAuditController(audit);
    list.mockResolvedValue({ entries: [makeEntry({ actor: null })], total: 1 });

    const result = await controller.list(ORG_ID, USER_ID, {});
    expect(result.data[0].actor.name).toBeNull();
  });
});

describe('InternalAuditController.export', () => {
  it('streams NDJSON rows and emits audit.exported', async () => {
    const { audit, exportGen, record } = makeService();
    const controller = new InternalAuditController(audit);
    exportGen.mockReturnValue(gen([makeEntry({ id: BigInt(1) }), makeEntry({ id: BigInt(2) })]));

    const file = await controller.export(ORG_ID, USER_ID, {});
    const chunks: string[] = [];
    for await (const chunk of (file as unknown as { getStream(): Readable }).getStream()) {
      chunks.push(String(chunk));
    }

    expect(chunks.join('')).toBe(
      JSON.stringify({
        id: 1,
        actor: { type: 'user', id: USER_ID, name: 'Asha' },
        action: 'org.created',
        resource: { type: 'organization', id: '33333333-3333-4333-a333-333333333333' },
        ip: '203.0.113.7',
        userAgent: 'vitest',
        metadata: { slug: 'acme' },
        createdAt: '2026-11-12T00:00:00.000Z',
      }) +
        '\n' +
        JSON.stringify({
          id: 2,
          actor: { type: 'user', id: USER_ID, name: 'Asha' },
          action: 'org.created',
          resource: { type: 'organization', id: '33333333-3333-4333-a333-333333333333' },
          ip: '203.0.113.7',
          userAgent: 'vitest',
          metadata: { slug: 'acme' },
          createdAt: '2026-11-12T00:00:00.000Z',
        }) +
        '\n',
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'audit.exported',
        orgId: ORG_ID,
        actorUserId: USER_ID,
        metadata: expect.objectContaining({ rowCount: 2, truncated: false }),
      }),
    );
  });

  it('rejects missing org id before touching the service', async () => {
    const { audit, exportGen } = makeService();
    const controller = new InternalAuditController(audit);

    await expect(controller.export(undefined, USER_ID, {})).rejects.toThrow(ApiError);
    expect(exportGen).not.toHaveBeenCalled();
  });

  it('rejects missing user id before touching the service', async () => {
    const { audit, exportGen } = makeService();
    const controller = new InternalAuditController(audit);

    await expect(controller.export(ORG_ID, undefined, {})).rejects.toThrow(ApiError);
    expect(exportGen).not.toHaveBeenCalled();
  });

  it('forwards export filters', async () => {
    const { audit, exportGen } = makeService();
    const controller = new InternalAuditController(audit);
    exportGen.mockReturnValue(gen([]));

    const file = await controller.export(ORG_ID, USER_ID, {
      action: 'scan.completed',
      actorUserId: USER_ID,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    });
    const chunks: string[] = [];
    for await (const chunk of (file as unknown as { getStream(): Readable }).getStream()) {
      chunks.push(String(chunk));
    }

    expect(exportGen).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        action: 'scan.completed',
        actorUserId: USER_ID,
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-12-31T00:00:00.000Z'),
      }),
    );
    expect(chunks.join('')).toBe('');
  });

  it('emits a truncation record when the row cap is hit', async () => {
    const { audit, exportGen, record } = makeService();
    const controller = new InternalAuditController(audit);
    // Generate 100_001 entries (MAX_ROWS + 1) to trigger the truncation branch.
    exportGen.mockReturnValue(
      (async function* () {
        for (let i = 0; i <= 100_000; i++) {
          yield makeEntry({ id: BigInt(i + 1), createdAt: new Date('2026-11-12T00:00:00.000Z') });
        }
      })(),
    );

    const file = await controller.export(ORG_ID, USER_ID, {});
    const chunks: string[] = [];
    for await (const chunk of (file as unknown as { getStream(): Readable }).getStream()) {
      chunks.push(String(chunk));
    }

    const lines = chunks.join('').trimEnd().split('\n');
    expect(lines).toHaveLength(100_001); // 100_000 data rows + 1 truncation record
    expect(JSON.parse(lines[100_000]!)).toEqual({
      truncated: true,
      nextFrom: '2026-11-12T00:00:00.000Z',
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'audit.exported',
        metadata: expect.objectContaining({ rowCount: 100_000, truncated: true }),
      }),
    );
  });

  it('handles entries with no actor', async () => {
    const { audit, exportGen } = makeService();
    const controller = new InternalAuditController(audit);
    exportGen.mockReturnValue(gen([makeEntry({ actor: null })]));

    const file = await controller.export(ORG_ID, USER_ID, {});
    const chunks: string[] = [];
    for await (const chunk of (file as unknown as { getStream(): Readable }).getStream()) {
      chunks.push(String(chunk));
    }

    const parsed = JSON.parse(chunks.join(''));
    expect(parsed.actor.name).toBeNull();
  });
});
