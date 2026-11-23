import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { auditEntrySchema, type AuditEntry, type AuditEntryInput } from './audit-entry.schema.js';

export interface AuditListFilters {
  orgId: string;
  action?: string;
  actionContains?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditListResult {
  entries: Array<{
    id: bigint;
    actorType: string;
    actorUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    ip: string | null;
    userAgent: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    actor: { name: string | null; email: string | null } | null;
  }>;
  total: number;
}

export interface AuditExportFilters {
  orgId: string;
  action?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append-only: audit rows are never updated or deleted by the application. */
  async record(raw: AuditEntryInput, tx?: Prisma.TransactionClient): Promise<AuditEntry> {
    const entry = auditEntrySchema.parse(raw);
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        orgId: entry.orgId,
        actorType: entry.actorType,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return entry;
  }

  /**
   * List audit logs with pagination and filters (P2-F).
   * Owner and admin roles only (enforced by the controller/BFF).
   */
  async list(filters: AuditListFilters, page: number, pageSize: number): Promise<AuditListResult> {
    const where: Prisma.AuditLogWhereInput = {
      orgId: filters.orgId,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actionContains
        ? {
            AND: [
              {
                action: {
                  contains: filters.actionContains.replace(/[\\%_]/g, '\\$&'),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { name: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { entries, total };
  }

  /**
   * Stream audit logs for export (P2-F). Keyset-paginated, capped at 100k rows.
   * Returns an async generator for NDJSON streaming.
   */
  async *export(filters: AuditExportFilters): AsyncGenerator<{
    id: bigint;
    actorType: string;
    actorUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    ip: string | null;
    userAgent: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    actor: { name: string | null; email: string | null } | null;
  }> {
    const BATCH_SIZE = 1000;
    const MAX_ROWS = 100_000;
    let yielded = 0;
    let lastId: bigint | undefined;

    while (yielded < MAX_ROWS) {
      const where: Prisma.AuditLogWhereInput = {
        orgId: filters.orgId,
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(lastId !== undefined ? { id: { lt: lastId } } : {}),
      };

      const batch = await this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { name: true, email: true } } },
        orderBy: [{ id: 'desc' }],
        take: Math.min(BATCH_SIZE, MAX_ROWS - yielded),
      });

      if (batch.length === 0) break;

      for (const entry of batch) {
        yield entry;
        yielded++;
      }

      lastId = batch[batch.length - 1]!.id;

      if (batch.length < BATCH_SIZE) break;
    }
  }
}
