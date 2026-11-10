import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { auditEntrySchema, type AuditEntry, type AuditEntryInput } from './audit-entry.schema.js';

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
}
