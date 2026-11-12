import { Injectable } from '@nestjs/common';
import type { MembershipInvite, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MemberRole } from '../identity/identity.schemas.js';

export interface CreateInviteRecord {
  orgId: string;
  email: string;
  role: MemberRole;
  tokenHash: string;
  invitedBy?: string | null;
  expiresAt: Date;
}

/** Data access for `membership_invites` (database.md §4.3, P2-21). */
@Injectable()
export class InvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateInviteRecord, tx?: Prisma.TransactionClient): Promise<MembershipInvite> {
    return this.client(tx).membershipInvite.create({
      data: {
        orgId: input.orgId,
        email: input.email,
        role: input.role,
        tokenHash: input.tokenHash,
        invitedBy: input.invitedBy ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  findActiveByHash(
    tokenHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MembershipInvite | null> {
    return this.client(tx).membershipInvite.findFirst({
      where: { tokenHash, acceptedAt: null },
    });
  }

  listPending(
    orgId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<MembershipInvite[]> {
    return this.client(tx).membershipInvite.findMany({
      where: { orgId, acceptedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
    });
  }

  deletePendingForEmail(
    orgId: string,
    email: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return this.client(tx)
      .membershipInvite.deleteMany({ where: { orgId, email, acceptedAt: null } })
      .then((result) => result.count);
  }

  markAccepted(id: string, tx?: Prisma.TransactionClient): Promise<MembershipInvite> {
    return this.client(tx).membershipInvite.update({
      where: { id },
      data: { acceptedAt: new Date() },
    });
  }

  /** P2-21 expiry cleanup; safe to run repeatedly. */
  async deleteExpired(now: Date, tx?: Prisma.TransactionClient): Promise<number> {
    const result = await this.client(tx).membershipInvite.deleteMany({
      where: { acceptedAt: null, expiresAt: { lte: now } },
    });
    return result.count;
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}
