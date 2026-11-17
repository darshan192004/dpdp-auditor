import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportStorageService } from '../../src/modules/reports/report-storage.service.js';
import type { Env } from '../../src/config/env.js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ReportsService } from '../../src/modules/reports/reports.service.js';
import { ScansRepository } from '../../src/modules/scans/scans.repository.js';
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
  it('rolls back readiness when metering fails and records usage on a successful retry', async () => {
    await prisma.report.deleteMany({ where: { orgId } });
    const report = await prisma.report.create({
      data: { orgId, scanId, templateVersion: 'standard', status: 'rendering' },
    });
    const scans = new ScansRepository(prisma as unknown as PrismaService);
    const recordUsage = scans.recordUsage.bind(scans);
    // A rejected usage FK simulates a real DB metering error after the report update.
    vi.spyOn(scans, 'recordUsage').mockImplementationOnce((record, tx) =>
      recordUsage({ ...record, scanId: randomUUID() }, tx),
    );
    const service = new ReportsService(
      reports,
      {} as ConstructorParameters<typeof ReportsService>[1],
      scans,
      {} as ConstructorParameters<typeof ReportsService>[3],
      {} as ConstructorParameters<typeof ReportsService>[4],
      {
        upload: () => ({
          storageKey: `reports/${report.id}.pdf`,
          sha256: 'a'.repeat(64),
          sizeBytes: 9,
          expiresAt: new Date(Date.now() + 60_000),
          downloadUrl: '/test-download',
        }),
      } as unknown as ConstructorParameters<typeof ReportsService>[5],
      { findById: async () => null } as unknown as ConstructorParameters<typeof ReportsService>[6],
      {} as ConstructorParameters<typeof ReportsService>[7],
    );
    const body = { buffer: Buffer.from('%PDF-test').toString('base64') };
    await expect(service.complete(orgId, report.id, body)).rejects.toThrow();
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toMatchObject({
      status: 'rendering',
      storageKey: null,
    });
    expect(await prisma.usageEvent.count({ where: { orgId, eventType: 'report_rendered' } })).toBe(
      0,
    );
    await service.complete(orgId, report.id, body);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toMatchObject({
      status: 'ready',
    });
    expect(await prisma.usageEvent.count({ where: { orgId, eventType: 'report_rendered' } })).toBe(
      1,
    );
  });
  it('keeps duplicate usage non-aborting inside a transaction', async () => {
    const scans = new ScansRepository(prisma as unknown as PrismaService);
    const record = {
      orgId,
      scanId,
      eventType: 'report_rendered' as const,
      eventId: randomUUID(),
      quantity: 1,
      metadata: {},
    };
    const result = await prisma.$transaction(async (tx) => {
      const first = await scans.recordUsage(record, tx);
      const duplicate = await scans.recordUsage(record, tx);
      // This read fails with 25P02 if duplicate insertion aborted PostgreSQL's transaction.
      const count = await tx.usageEvent.count({ where: { orgId, eventId: record.eventId } });
      return { first, duplicate, count };
    });
    expect(result).toEqual({ first: true, duplicate: false, count: 1 });
    expect(await prisma.usageEvent.count({ where: { orgId, eventId: record.eventId } })).toBe(1);
  });
  it('preserves committed PDF bytes and meters/notifies once under concurrent and repeated completions', async () => {
    const report = await prisma.report.create({
      data: { orgId, scanId, templateVersion: 'standard', status: 'rendering' },
    });
    const directory = mkdtempSync(join(tmpdir(), 'report-completion-'));
    const storage = new ReportStorageService({
      REPORTS_STORAGE_DIR: directory,
      ORCHESTRATOR_HMAC_KEY: 'test-only-key'.repeat(4),
    } as Env);
    const upload = vi.spyOn(storage, 'upload');
    const email = { sendReportReady: vi.fn() };
    const service = new ReportsService(
      reports,
      {} as ConstructorParameters<typeof ReportsService>[1],
      new ScansRepository(prisma as unknown as PrismaService),
      {} as ConstructorParameters<typeof ReportsService>[3],
      {} as ConstructorParameters<typeof ReportsService>[4],
      storage,
      { findById: async () => ({ slug: 'fixture' }) } as unknown as ConstructorParameters<
        typeof ReportsService
      >[6],
      email as unknown as ConstructorParameters<typeof ReportsService>[7],
    );
    const body = (text: string) => ({ buffer: Buffer.from(text).toString('base64') });
    try {
      const [first, concurrent] = await Promise.all([
        service.complete(orgId, report.id, body('%PDF-first')),
        service.complete(orgId, report.id, body('%PDF-concurrent')),
      ]);
      const repeated = await service.complete(orgId, report.id, body('%PDF-repeated'));
      const stored = readFileSync(join(directory, report.id, 'report.pdf'));
      const hash = createHash('sha256').update(stored).digest('hex');
      expect([first.sha256, concurrent.sha256, repeated.sha256]).toEqual([hash, hash, hash]);
      expect(upload).toHaveBeenCalledOnce();
      expect(email.sendReportReady).toHaveBeenCalledOnce();
      expect(await prisma.report.findUnique({ where: { id: report.id } })).toMatchObject({
        status: 'ready',
        sha256: hash,
        sizeBytes: BigInt(stored.length),
      });
      const eventId = createHash('sha256')
        .update(`report_rendered:${report.id}`)
        .digest('hex')
        .slice(0, 32);
      expect(await prisma.usageEvent.count({ where: { orgId, eventId } })).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('repairs only rendering rows and preserves completed report identity and metadata', async () => {
    const report = await prisma.report.create({
      data: {
        orgId,
        scanId,
        templateVersion: 'standard',
        status: 'rendering',
        idempotencyKey: 'repair-missing-job',
      },
    });
    expect((await reports.requeueRendering(report.id)).count).toBe(1);
    expect((await reports.requeueRendering(report.id)).count).toBe(0);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toMatchObject({
      id: report.id,
      orgId,
      scanId,
      status: 'queued',
      idempotencyKey: 'repair-missing-job',
    });
    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: 'ready',
        storageKey: `reports/${report.id}.pdf`,
        sha256: 'a'.repeat(64),
        sizeBytes: 9n,
      },
    });
    expect((await reports.requeueRendering(report.id)).count).toBe(0);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toMatchObject({
      status: 'ready',
      storageKey: `reports/${report.id}.pdf`,
      sha256: 'a'.repeat(64),
      sizeBytes: 9n,
    });
    for (const status of ['failed', 'expired'] as const) {
      await prisma.report.update({ where: { id: report.id }, data: { status } });
      expect((await reports.requeueRendering(report.id)).count).toBe(0);
    }
  });
});
