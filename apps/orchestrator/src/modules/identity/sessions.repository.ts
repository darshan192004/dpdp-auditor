import { Injectable } from '@nestjs/common';
import type { Prisma, Session } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateSessionRecord {
  userId: string;
  activeOrgId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  absoluteExpiresAt: Date;
}

/**
 * Data access for `sessions` (database.md §4.4). The sealed cookie only carries
 * the session id; revocation, absolute expiry, and idle expiry live here.
 */
@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateSessionRecord, tx?: Prisma.TransactionClient): Promise<Session> {
    return this.client(tx).session.create({
      data: {
        userId: input.userId,
        activeOrgId: input.activeOrgId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        absoluteExpiresAt: input.absoluteExpiresAt,
      },
    });
  }

  findById(id: string, tx?: Prisma.TransactionClient): Promise<Session | null> {
    return this.client(tx).session.findUnique({ where: { id } });
  }

  touch(id: string, lastSeenAt: Date, tx?: Prisma.TransactionClient): Promise<Session> {
    return this.client(tx).session.update({ where: { id }, data: { lastSeenAt } });
  }

  revoke(id: string, revokedAt: Date, tx?: Prisma.TransactionClient): Promise<Session> {
    return this.client(tx).session.update({ where: { id }, data: { revokedAt } });
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}
