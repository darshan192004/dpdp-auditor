import { Injectable } from '@nestjs/common';
import { Prisma, type Scan, type ScanEvent, type ScanStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FindingsBatch } from './scan.schemas.js';

export interface CreateScanRecord {
  orgId: string;
  repositoryId: string;
  requestedBy?: string | null;
  apiKeyId?: string | null;
  ref: string;
  trigger: 'manual' | 'api';
  idempotencyKey?: string | null;
  idempotencyHash?: string | null;
}

export interface ScanFilters {
  repositoryId?: string | undefined;
  status?: ScanStatus[] | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page: number;
  pageSize: number;
  sort: 'createdAt' | '-createdAt' | 'score' | '-score';
}

export interface UsageRecord {
  orgId: string;
  scanId: string;
  eventType: 'scan_completed' | 'scan_failed' | 'report_rendered' | 'storage_byte_hour';
  eventId: string;
  quantity: number;
  metadata: Prisma.InputJsonValue;
}

/** Data access for `scans`, `scan_events`, `scanner_findings`, `usage_events`. */
@Injectable()
export class ScansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByIdempotencyKey(
    orgId: string,
    idempotencyKey: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Scan | null> {
    return this.client(tx).scan.findFirst({ where: { orgId, idempotencyKey } });
  }

  findById(orgId: string, id: string, tx?: Prisma.TransactionClient) {
    return this.client(tx).scan.findFirst({
      where: { id, orgId },
      include: { repository: true },
    });
  }

  create(input: CreateScanRecord, tx?: Prisma.TransactionClient): Promise<Scan> {
    return this.client(tx).scan.create({
      data: {
        orgId: input.orgId,
        repositoryId: input.repositoryId,
        requestedBy: input.requestedBy ?? null,
        apiKeyId: input.apiKeyId ?? null,
        ref: input.ref,
        trigger: input.trigger,
        idempotencyKey: input.idempotencyKey ?? null,
        idempotencyHash: input.idempotencyHash ?? null,
      },
    });
  }

  countCreatedSince(orgId: string, since: Date, tx?: Prisma.TransactionClient): Promise<number> {
    return this.client(tx).scan.count({ where: { orgId, createdAt: { gte: since } } });
  }

  findActiveForRef(
    orgId: string,
    repositoryId: string,
    ref: string,
    statuses: readonly ScanStatus[],
    tx?: Prisma.TransactionClient,
  ): Promise<Scan | null> {
    return this.client(tx).scan.findFirst({
      where: { orgId, repositoryId, ref, status: { in: [...statuses] } },
    });
  }

  async list(orgId: string, filters: ScanFilters, tx?: Prisma.TransactionClient) {
    const where: Prisma.ScanWhereInput = {
      orgId,
      ...(filters.repositoryId ? { repositoryId: filters.repositoryId } : {}),
      ...(filters.status?.length ? { status: { in: filters.status } } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };
    const orderBy: Prisma.ScanOrderByWithRelationInput = filters.sort.startsWith('-')
      ? { [filters.sort.slice(1)]: 'desc' }
      : { [filters.sort]: 'asc' };
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.scan.findMany({
        where,
        include: { repository: true },
        orderBy,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      client.scan.count({ where }),
    ]);
    return { items, total };
  }

  update(id: string, data: Prisma.ScanUpdateInput, tx?: Prisma.TransactionClient): Promise<Scan> {
    return this.client(tx).scan.update({ where: { id }, data });
  }

  appendEvent(
    scanId: string,
    orgId: string,
    type: string,
    payload: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ): Promise<ScanEvent> {
    return this.client(tx).scanEvent.create({ data: { scanId, orgId, type, payload } });
  }

  listEvents(scanId: string, tx?: Prisma.TransactionClient): Promise<ScanEvent[]> {
    return this.client(tx).scanEvent.findMany({
      where: { scanId },
      orderBy: { id: 'asc' },
    });
  }

  countBatches(scanId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return this.client(tx).scanEvent.count({ where: { scanId, type: 'findings_batch' } });
  }

  /** Batch ids are recorded as scan events, so no extra table is needed. */
  findBatch(
    scanId: string,
    batchId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ScanEvent | null> {
    return this.client(tx).scanEvent.findFirst({
      where: { scanId, type: 'findings_batch', payload: { path: ['batchId'], equals: batchId } },
    });
  }

  async insertFindings(
    scanId: string,
    orgId: string,
    batch: FindingsBatch,
    tx?: Prisma.TransactionClient,
  ): Promise<{ accepted: number; duplicates: number }> {
    const rows: Prisma.ScannerFindingCreateManyInput[] = batch.findings.map((finding) => ({
      scanId,
      orgId,
      scanner: batch.scanner,
      scannerRuleId: finding.scannerRuleId,
      scannerRuleVersion: finding.scannerRuleVersion ?? batch.scannerVersion,
      severity: finding.severity,
      filePath: finding.filePath ?? null,
      lineStart: finding.lineStart ?? null,
      lineEnd: finding.lineEnd ?? null,
      message: finding.message,
      evidenceRedacted: finding.evidenceRedacted ?? null,
      evidenceHash: finding.evidenceHash ?? null,
      fingerprint: finding.fingerprint,
      context: finding.context as Prisma.InputJsonValue,
    }));
    if (rows.length === 0) return { accepted: 0, duplicates: 0 };

    const result = await this.client(tx).scannerFinding.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { accepted: result.count, duplicates: rows.length - result.count };
  }

  /**
   * usage_events enforces `UNIQUE (org_id, event_id)`; a unique violation means
   * the event was already metered, which api.md §10 defines as success.
   */
  async recordUsage(record: UsageRecord, tx?: Prisma.TransactionClient): Promise<boolean> {
    try {
      await this.client(tx).usageEvent.create({
        data: {
          orgId: record.orgId,
          scanId: record.scanId,
          eventType: record.eventType,
          eventId: record.eventId,
          quantity: record.quantity,
          metadata: record.metadata,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
