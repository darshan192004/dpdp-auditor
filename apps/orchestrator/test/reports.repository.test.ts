import { describe, it, expect, vi } from 'vitest';
import { ReportsRepository } from '../src/modules/reports/reports.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { Prisma } from '@prisma/client';

function client() {
  return {
    report: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(3),
    },
  };
}

describe.each([false, true])('ReportsRepository (transaction: %s)', (transaction) => {
  it('scopes reads and quota counts to the organization on the selected client', async () => {
    const base = client();
    const tx = client();
    const selected = transaction ? tx : base;
    const repo = new ReportsRepository(base as unknown as PrismaService);
    const arg = transaction ? (tx as unknown as Prisma.TransactionClient) : undefined;
    await repo.findById('org', 'report', arg);
    expect(selected.report.findFirst).toHaveBeenCalledWith({
      where: { id: 'report', orgId: 'org' },
      include: { scan: { include: { repository: true } }, organization: true },
    });
    await repo.findByScanId('org', 'scan', arg);
    expect(selected.report.findFirst).toHaveBeenLastCalledWith({
      where: { scanId: 'scan', orgId: 'org' },
      orderBy: { createdAt: 'desc' },
    });
    const since = new Date('2026-11-01');
    expect(await repo.countCreatedSince('org', since, arg)).toBe(3);
    expect(selected.report.count).toHaveBeenCalledWith({
      where: { orgId: 'org', createdAt: { gte: since } },
    });
    if (transaction) expect(base.report.findFirst).not.toHaveBeenCalled();
  });
  it('persists lifecycle transitions and optional requester', async () => {
    const base = client();
    const tx = client();
    const selected = transaction ? tx : base;
    const repo = new ReportsRepository(base as unknown as PrismaService);
    const arg = transaction ? (tx as unknown as Prisma.TransactionClient) : undefined;
    for (const requestedBy of [null, 'user']) {
      await repo.create(
        { orgId: 'org', scanId: 'scan', templateVersion: 'standard', requestedBy },
        arg,
      );
      expect(selected.report.create).toHaveBeenLastCalledWith({
        data: {
          orgId: 'org',
          scanId: 'scan',
          templateVersion: 'standard',
          ...(requestedBy ? { requestedBy } : {}),
        },
      });
    }
    const metadata = { storageKey: 'key', sha256: 'hash', sizeBytes: 100n, expiresAt: new Date(0) };
    await repo.markComplete('report', metadata, arg);
    expect(selected.report.update).toHaveBeenLastCalledWith({
      where: { id: 'report' },
      data: { ...metadata, status: 'ready' },
    });
    await repo.markRendering('report', arg);
    expect(selected.report.update).toHaveBeenLastCalledWith({
      where: { id: 'report' },
      data: { status: 'rendering' },
    });
    await repo.markFailed('report', 'timeout', arg);
    expect(selected.report.update).toHaveBeenLastCalledWith({
      where: { id: 'report' },
      data: { status: 'failed', errorMessage: 'timeout' },
    });
    if (transaction) expect(base.report.update).not.toHaveBeenCalled();
  });
});
