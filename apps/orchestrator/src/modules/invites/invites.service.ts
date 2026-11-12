import { Injectable } from '@nestjs/common';
import type { Membership, MembershipInvite } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { memberRoleSchema } from '../identity/identity.schemas.js';
import { MembershipsRepository } from '../identity/memberships.repository.js';
import { OrganizationsRepository } from '../identity/organizations.repository.js';
import { UsersRepository } from '../identity/users.repository.js';
import { InvitesRepository } from './invites.repository.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const createInviteSchema = z.strictObject({
  orgId: z.uuid(),
  email: z.email().max(320),
  role: memberRoleSchema.default('viewer'),
  invitedBy: z.uuid().nullable().optional(),
});
export type CreateInviteInput = z.input<typeof createInviteSchema>;

export const acceptInviteSchema = z.strictObject({
  token: z.string().min(20).max(200),
  userId: z.uuid(),
});
export type AcceptInviteInput = z.input<typeof acceptInviteSchema>;

export type CreateInviteResult =
  | { kind: 'member'; membership: Membership }
  | { kind: 'invite'; invite: MembershipInvite; token: string };

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * P2-21 invitation flow. Existing users are added immediately; unknown emails
 * receive a hashed, 7-day token. Accepting a token requires the signed-in
 * user's email to match the invited address.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesRepository,
    private readonly users: UsersRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly audit: AuditService,
  ) {}

  async createInvite(raw: CreateInviteInput): Promise<CreateInviteResult> {
    const input = createInviteSchema.parse(raw);
    const organization = await this.organizations.findById(input.orgId);
    if (!organization) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');

    const existingUser = await this.users.findByEmail(input.email);
    if (existingUser && !existingUser.deletedAt) {
      const membership = await this.prisma.$transaction(async (tx) => {
        const current = await this.memberships.find(input.orgId, existingUser.id, tx);
        const saved = current
          ? await this.memberships.updateStatus(input.orgId, existingUser.id, 'active', tx)
          : await this.memberships.create(
              {
                orgId: input.orgId,
                userId: existingUser.id,
                role: input.role,
                status: 'active',
                invitedBy: input.invitedBy ?? null,
              },
              tx,
            );
        await this.audit.record(
          {
            orgId: input.orgId,
            actorType: input.invitedBy ? 'user' : 'system',
            actorUserId: input.invitedBy ?? null,
            action: 'member.invited',
            resourceType: 'membership',
            resourceId: saved.userId,
            metadata: { email: input.email, role: input.role, existingUser: true },
          },
          tx,
        );
        return saved;
      });
      return { kind: 'member', membership };
    }

    const token = randomBytes(32).toString('base64url');
    const invite = await this.prisma.$transaction(async (tx) => {
      // Re-inviting replaces the previous pending token for the same address.
      await this.invites.deletePendingForEmail(input.orgId, input.email, tx);
      const created = await this.invites.create(
        {
          orgId: input.orgId,
          email: input.email,
          role: input.role,
          tokenHash: hashInviteToken(token),
          invitedBy: input.invitedBy ?? null,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
        tx,
      );
      await this.audit.record(
        {
          orgId: input.orgId,
          actorType: input.invitedBy ? 'user' : 'system',
          actorUserId: input.invitedBy ?? null,
          action: 'member.invited',
          resourceType: 'invite',
          resourceId: created.id,
          metadata: { email: input.email, role: input.role, existingUser: false },
        },
        tx,
      );
      return created;
    });
    return { kind: 'invite', invite, token };
  }

  async acceptInvite(raw: AcceptInviteInput): Promise<Membership> {
    const input = acceptInviteSchema.parse(raw);
    const tokenHash = hashInviteToken(input.token);

    return this.prisma.$transaction(async (tx) => {
      const invite = await this.invites.findActiveByHash(tokenHash, tx);
      if (!invite || invite.expiresAt.getTime() <= Date.now()) {
        throw new ApiError('NOT_FOUND', 'The invitation is invalid or has expired.');
      }

      const user = await this.users.findById(input.userId, tx);
      if (!user || user.deletedAt) throw new ApiError('NOT_FOUND', 'The user does not exist.');
      if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new ApiError('FORBIDDEN', 'This invitation was issued to a different email address.');
      }

      const current = await this.memberships.find(invite.orgId, user.id, tx);
      const membership = current
        ? await this.memberships.updateStatus(invite.orgId, user.id, 'active', tx)
        : await this.memberships.create(
            {
              orgId: invite.orgId,
              userId: user.id,
              role: invite.role,
              status: 'active',
              invitedBy: invite.invitedBy,
            },
            tx,
          );

      await this.invites.markAccepted(invite.id, tx);
      await this.audit.record(
        {
          orgId: invite.orgId,
          actorType: 'user',
          actorUserId: user.id,
          action: 'member.joined',
          resourceType: 'membership',
          resourceId: user.id,
          metadata: { role: membership.role },
        },
        tx,
      );
      return membership;
    });
  }

  listPending(orgId: string): Promise<MembershipInvite[]> {
    return this.invites.listPending(orgId, new Date());
  }

  /** P2-21 expiry cleanup; the hourly retention pass can call this. */
  cleanupExpired(now: Date = new Date()): Promise<number> {
    return this.invites.deleteExpired(now);
  }
}
