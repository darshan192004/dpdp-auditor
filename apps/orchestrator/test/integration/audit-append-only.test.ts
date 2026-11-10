import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { describeDb, dbUrl } from './helpers/db.js';

const RUNTIME_PASSWORD = 'test-only-runtime-password';

describeDb('audit_logs append-only + RLS', () => {
  const owner = new PrismaClient({ datasourceUrl: dbUrl! });
  let runtime: PrismaClient;
  let orgId: string;

  beforeAll(async () => {
    // Literal-only template: Prisma parameterizes interpolations and
    // PostgreSQL rejects parameters in DDL (ALTER ROLE), so no ${} here.
    await owner.$executeRaw`ALTER ROLE dpdpa_runtime PASSWORD 'test-only-runtime-password'`;
    const url = new URL(dbUrl!);
    url.username = 'dpdpa_runtime';
    url.password = RUNTIME_PASSWORD;
    runtime = new PrismaClient({ datasourceUrl: url.toString() });
    const org = await owner.organization.create({
      data: { name: 'Audit RLS Org', slug: `audit-rls-${Date.now()}` },
    });
    orgId = org.id;
    const service = new AuditService(owner as unknown as PrismaService);
    await service.record({
      orgId,
      actorType: 'system',
      action: 'org.created',
      resourceType: 'organization',
      resourceId: orgId,
      metadata: {},
    });
  });

  afterAll(async () => {
    await owner.auditLog.deleteMany({ where: { orgId } });
    await owner.organization.delete({ where: { id: orgId } });
    await runtime.$disconnect();
    await owner.$disconnect();
  });

  it('returns zero audit rows without SET LOCAL app.current_org', async () => {
    const rows = await runtime.auditLog.findMany({ where: { orgId } });
    expect(rows).toEqual([]);
  });

  it('returns the rows once the org is set in the transaction', async () => {
    const rows = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
      return tx.auditLog.findMany({ where: { orgId } });
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects an insert without the org context (RLS WITH CHECK)', async () => {
    await expect(
      runtime.auditLog.create({
        data: { actorType: 'system', action: 'x.y', resourceType: 'thing' },
      }),
    ).rejects.toThrow(/row-level security|42501/);
  });

  it('refuses UPDATE and DELETE on audit_logs (append-only)', async () => {
    // SELECT needs the org context (RLS USING); UPDATE/DELETE are refused by
    // the missing table privilege (42501) before RLS is even evaluated.
    const orgRow = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
      return tx.auditLog.findFirst({ where: { orgId } });
    });
    expect(orgRow).not.toBeNull();
    await expect(
      runtime.auditLog.update({ where: { id: orgRow!.id }, data: { action: 'tampered.edit' } }),
    ).rejects.toThrow(/permission denied|42501/);
    await expect(runtime.auditLog.delete({ where: { id: orgRow!.id } })).rejects.toThrow(
      /permission denied|42501/,
    );
  });
});
