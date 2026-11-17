import { afterAll, beforeAll, expect, it } from 'vitest';
import { ReportsRepository } from '../../src/modules/reports/reports.repository.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { describeDb, makeClient } from './helpers/db.js';

describeDb('concurrent report quota reservations', () => {
  const prisma = makeClient();
  const reports = new ReportsRepository(prisma as unknown as PrismaService);
  let orgId: string;
  let scanId: string;
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: 'Report reservations', slug: `report-reservations-${Date.now()}` },
    });
    orgId = org.id;
    const repository = await prisma.repository.create({
      data: {
        orgId,
        owner: 'fixture',
        name: 'report-test',
        fullName: 'fixture/report-test',
        githubRepoId: BigInt(Date.now()),
        defaultBranch: 'main',
        visibility: 'public',
      },
    });
    const scan = await prisma.scan.create({
      data: { orgId, repositoryId: repository.id, status: 'completed' },
    });
    scanId = scan.id;
  });
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });
  it('admits only one of two concurrent reservations at the last quota slot', async () => {
    const input = { orgId, scanId, template: 'standard' as const };
    const results = await Promise.allSettled([
      reports.reserve({ ...input, idempotencyKey: 'concurrent-key-one' }, 1, new Date(0)),
      reports.reserve({ ...input, idempotencyKey: 'concurrent-key-two' }, 1, new Date(0)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'PLAN_LIMIT_EXCEEDED' },
    });
    expect(await prisma.report.count({ where: { orgId } })).toBe(1);
  });
  it('deduplicates concurrent retry keys without adding quota or another report', async () => {
    await prisma.report.deleteMany({ where: { orgId } });
    const input = {
      orgId,
      scanId,
      template: 'standard' as const,
      idempotencyKey: 'same-retry-key',
    };
    const [first, retry] = await Promise.all([
      reports.reserve(input, 1, new Date(0)),
      reports.reserve(input, 1, new Date(0)),
    ]);
    expect(first.id).toBe(retry.id);
    expect(await prisma.report.count({ where: { orgId } })).toBe(1);
  });
});
