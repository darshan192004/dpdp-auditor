import { Injectable } from '@nestjs/common';
import { Prisma, type ScannerFinding } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { sectionCodePrefix, type ListFindings } from './findings.schemas.js';

/** Data access for `scanner_findings` and `remediation_logs`. */
@Injectable()
export class FindingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(orgId: string, id: string, tx?: Prisma.TransactionClient) {
    return this.client(tx).scannerFinding.findFirst({ where: { id, orgId } });
  }

  async list(orgId: string, input: ListFindings, tx?: Prisma.TransactionClient) {
    const where: Prisma.ScannerFindingWhereInput = {
      orgId,
      scanId: input.scanId,
      ...(input.severity?.length ? { severity: { in: input.severity } } : {}),
      ...(input.scanner?.length ? { scanner: { in: input.scanner } } : {}),
      ...(input.status?.length ? { status: { in: input.status } } : {}),
      ...(input.file ? { filePath: { startsWith: input.file } } : {}),
      ...(input.section?.length
        ? {
            OR: input.section.map((section) => ({
              controlCode: { startsWith: sectionCodePrefix(section) },
            })),
          }
        : {}),
      ...(input.q
        ? {
            AND: {
              OR: [
                { message: { contains: input.q, mode: 'insensitive' } },
                { scannerRuleId: { contains: input.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.scannerFinding.findMany({
        where,
        include: { dpdpaRule: true },
        orderBy: orderBy(input.sort),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      client.scannerFinding.count({ where }),
    ]);
    return { items, total };
  }

  update(
    id: string,
    data: Prisma.ScannerFindingUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ScannerFinding> {
    return this.client(tx).scannerFinding.update({ where: { id }, data });
  }

  addRemediationLog(
    input: {
      findingId: string;
      orgId: string;
      actorUserId?: string | null;
      action: string;
      note?: string | null;
      externalUrl?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.client(tx).remediationLog.create({
      data: {
        findingId: input.findingId,
        orgId: input.orgId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        note: input.note ?? null,
        externalUrl: input.externalUrl ?? null,
      },
    });
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}

function orderBy(sort: ListFindings['sort']): Prisma.ScannerFindingOrderByWithRelationInput {
  switch (sort) {
    case 'file':
      return { filePath: 'asc' };
    case '-lineStart':
      return { lineStart: 'desc' };
    case '-createdAt':
      return { createdAt: 'desc' };
    case '-severity':
    default:
      return { severity: 'desc' };
  }
}
