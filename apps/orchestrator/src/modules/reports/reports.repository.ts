import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The view model needs the scan, its repository, and the organisation branding. */
  findById(orgId: string, reportId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.report.findFirst({
      where: { id: reportId, orgId },
      include: {
        scan: { include: { repository: true } },
        organization: true,
      },
    });
  }

  /** Most recent report for a scan (idempotent re-request → existing ready report). */
  findByScanId(orgId: string, scanId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.report.findFirst({
      where: { scanId, orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** P5-20: create a queued report for a scan. */
  create(
    record: {
      orgId: string;
      scanId: string;
      templateVersion: string;
      requestedBy?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.report.create({
      data: {
        orgId: record.orgId,
        scanId: record.scanId,
        templateVersion: record.templateVersion,
        ...(record.requestedBy ? { requestedBy: record.requestedBy } : {}),
      },
    });
  }

  /** P5-19/§10.6: mark a report ready with storage metadata. */
  markComplete(
    reportId: string,
    record: {
      storageKey: string;
      sha256: string;
      sizeBytes: bigint;
      expiresAt: Date;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.report.update({
      where: { id: reportId },
      data: {
        storageKey: record.storageKey,
        sha256: record.sha256,
        sizeBytes: record.sizeBytes,
        expiresAt: record.expiresAt,
        status: 'ready',
      },
    });
  }

  /** P5-17: mark a report rendering (worker picked the job up). */
  markRendering(reportId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.report.update({
      where: { id: reportId },
      data: { status: 'rendering' },
    });
  }

  /** P5-17/§10.6: mark a report failed (renderer exhausted retries). */
  markFailed(reportId: string, errorMessage: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.report.update({
      where: { id: reportId },
      data: { status: 'failed', errorMessage },
    });
  }

  /** P5-29: count reports created in the current month for quota enforcement. */
  countCreatedSince(orgId: string, since: Date, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    return client.report.count({ where: { orgId, createdAt: { gte: since } } });
  }
}
