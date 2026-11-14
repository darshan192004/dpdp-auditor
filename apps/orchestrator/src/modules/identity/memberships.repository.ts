import { Injectable } from '@nestjs/common';
import type { Membership, Organization, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MemberRole, MembershipStatus } from './identity.schemas.js';

export interface CreateMembershipRecord {
  orgId: string;
  userId: string;
  role: MemberRole;
  status: MembershipStatus;
  invitedBy?: string | null;
}

/** Data access for `memberships` (database.md §4.3). */
@Injectable()
export class MembershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForOrg(
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<(Membership & { user: User })[]> {
    return this.client(tx).membership.findMany({
      where: { orgId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  listActiveForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<(Membership & { organization: Organization })[]> {
    return this.client(tx).membership.findMany({
      where: { userId, status: 'active' },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  find(orgId: string, userId: string, tx?: Prisma.TransactionClient): Promise<Membership | null> {
    return this.client(tx).membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
  }

  create(input: CreateMembershipRecord, tx?: Prisma.TransactionClient): Promise<Membership> {
    return this.client(tx).membership.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        role: input.role,
        status: input.status,
        invitedBy: input.invitedBy ?? null,
      },
    });
  }

  updateRole(
    orgId: string,
    userId: string,
    role: MemberRole,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership> {
    return this.client(tx).membership.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role },
    });
  }

  updateStatus(
    orgId: string,
    userId: string,
    status: MembershipStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership> {
    return this.client(tx).membership.update({
      where: { orgId_userId: { orgId, userId } },
      data: { status },
    });
  }

  delete(orgId: string, userId: string, tx?: Prisma.TransactionClient): Promise<Membership> {
    return this.client(tx).membership.delete({
      where: { orgId_userId: { orgId, userId } },
    });
  }

  /** Business rule (database.md §4.3): an org always keeps at least one owner. */
  countActiveOwners(orgId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return this.client(tx).membership.count({
      where: { orgId, role: 'owner', status: 'active' },
    });
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}
