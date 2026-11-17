import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import type { CreateReportInput } from './report.schemas.js';
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

  /** Lock the tenant row so quota reservation and idempotent creation are atomic. */
  reserve(input: CreateReportInput, limit: number | null, since: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${input.orgId}::uuid FOR UPDATE`;
      if (input.idempotencyKey) {
        const existing = await tx.report.findUnique({
          where: {
            orgId_idempotencyKey: { orgId: input.orgId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existing) {
          if (existing.scanId !== input.scanId || existing.templateVersion !== input.template) {
            throw new ApiError('CONFLICT', 'The idempotency key was used for a different report.');
          }
          return existing;
        }
      }
      const existing = await tx.report.findFirst({
        where: {
          orgId: input.orgId,
          scanId: input.scanId,
          templateVersion: input.template,
          status: { in: ['queued', 'rendering', 'ready'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      // A supplied key must be persisted even when another request targets the same scan.
      if (existing && !input.idempotencyKey) return existing;
      if (limit !== null && (await this.countCreatedSince(input.orgId, since, tx)) >= limit) {
        throw new ApiError('PLAN_LIMIT_EXCEEDED', 'Monthly report quota exceeded for this plan.');
      }
      return tx.report.create({
        data: {
          orgId: input.orgId,
          scanId: input.scanId,
          templateVersion: input.template,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    });
  }

  pending() {
    return this.prisma.report.findMany({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: 100,
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
    return client.report.updateMany({
      where: { id: reportId, status: { in: ['queued', 'rendering'] } },
      data: { status: 'rendering' },
    });
  }

  /** P5-17/§10.6: mark a report failed (renderer exhausted retries). */
  markFailed(reportId: string, errorMessage: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.report.updateMany({
      where: { id: reportId, status: { in: ['queued', 'rendering'] } },
      data: { status: 'failed', errorMessage },
    });
  }

  /** P5-29: count reports created in the current month for quota enforcement. */
  countCreatedSince(orgId: string, since: Date, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    return client.report.count({ where: { orgId, createdAt: { gte: since } } });
  }
}
