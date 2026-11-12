import { Injectable } from '@nestjs/common';
import type { Membership, Organization, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addMembershipSchema,
  changeRoleSchema,
  createOrganizationSchema,
  githubProfileSchema,
  type AddMembershipInput,
  type ChangeRoleInput,
  type CreateOrganizationInput,
  type GithubProfileInput,
} from './identity.schemas.js';
import { MembershipsRepository } from './memberships.repository.js';
import { OrganizationsRepository } from './organizations.repository.js';
import { UsersRepository } from './users.repository.js';

export interface CreatedOrganization {
  organization: Organization;
  membership: Membership;
}

/**
 * Identity services (docs/database.md §4.1–4.3). Every multi-row write runs in
 * one transaction so the owner invariant and the audit trail never drift.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly memberships: MembershipsRepository,
  ) {}

  /**
   * database.md §4.2: `github_user_id` is the stable external identity and
   * email is the join key for invitations. A returning user is matched by
   * GitHub id first; an existing email links the GitHub id instead of
   * creating a duplicate account.
   */
  async upsertGithubUser(raw: GithubProfileInput): Promise<User> {
    const profile = githubProfileSchema.parse(raw);
    const lastLoginAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const byGithubId = await this.users.findByGithubId(profile.githubUserId, tx);
      if (byGithubId) {
        return this.users.updateProfile(
          byGithubId.id,
          {
            email: profile.email,
            name: profile.name ?? null,
            avatarUrl: profile.avatarUrl ?? null,
            lastLoginAt,
            deletedAt: null,
          },
          tx,
        );
      }

      const byEmail = await this.users.findByEmail(profile.email, tx);
      if (byEmail) {
        return this.users.updateProfile(
          byEmail.id,
          {
            githubUserId: profile.githubUserId,
            name: profile.name ?? byEmail.name,
            avatarUrl: profile.avatarUrl ?? byEmail.avatarUrl,
            lastLoginAt,
            deletedAt: null,
          },
          tx,
        );
      }

      return this.users.create(
        {
          email: profile.email,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          githubUserId: profile.githubUserId,
        },
        tx,
      );
    });
  }

  /** P2-06 onboarding: the creator becomes the active owner (database.md §4.3). */
  async createOrganization(raw: CreateOrganizationInput): Promise<CreatedOrganization> {
    const input = createOrganizationSchema.parse(raw);

    return this.prisma.$transaction(async (tx) => {
      const owner = await this.users.findById(input.ownerUserId, tx);
      if (!owner || owner.deletedAt) {
        throw new ApiError('NOT_FOUND', 'The user does not exist.');
      }

      const slugTaken = await this.organizations.findBySlug(input.slug, tx);
      if (slugTaken) {
        throw new ApiError('CONFLICT', 'That organisation slug is already taken.');
      }

      try {
        const organization = await this.organizations.create(
          { name: input.name, slug: input.slug },
          tx,
        );
        const membership = await this.memberships.create(
          {
            orgId: organization.id,
            userId: owner.id,
            role: 'owner',
            status: 'active',
          },
          tx,
        );
        return { organization, membership };
      } catch (error) {
        // The pre-check above is advisory; the unique index is authoritative.
        if (isUniqueViolation(error)) {
          throw new ApiError('CONFLICT', 'That organisation slug is already taken.');
        }
        throw error;
      }
    });
  }

  async addMember(raw: AddMembershipInput): Promise<Membership> {
    const input = addMembershipSchema.parse(raw);

    return this.prisma.$transaction(async (tx) => {
      const organization = await this.organizations.findById(input.orgId, tx);
      const user = await this.users.findById(input.userId, tx);
      const existing = await this.memberships.find(input.orgId, input.userId, tx);
      if (!organization) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');
      if (!user || user.deletedAt) throw new ApiError('NOT_FOUND', 'The user does not exist.');
      if (existing) throw new ApiError('CONFLICT', 'The user is already a member.');

      try {
        return await this.memberships.create(
          {
            orgId: input.orgId,
            userId: input.userId,
            role: input.role,
            status: input.status,
            invitedBy: input.invitedBy ?? null,
          },
          tx,
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ApiError('CONFLICT', 'The user is already a member.');
        }
        throw error;
      }
    });
  }

  /** database.md §4.3: the last active owner can never be demoted. */
  async changeRole(raw: ChangeRoleInput): Promise<Membership> {
    const input = changeRoleSchema.parse(raw);

    return this.prisma.$transaction(async (tx) => {
      const membership = await this.requireMembership(input.orgId, input.userId, tx);
      if (membership.role === 'owner' && membership.status === 'active' && input.role !== 'owner') {
        await this.assertNotLastOwner(input.orgId, tx);
      }
      return this.memberships.updateRole(input.orgId, input.userId, input.role, tx);
    });
  }

  /** database.md §4.3: the last active owner can never be removed. */
  async removeMember(orgId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const membership = await this.requireMembership(orgId, userId, tx);
      if (membership.role === 'owner' && membership.status === 'active') {
        await this.assertNotLastOwner(orgId, tx);
      }
      await this.memberships.delete(orgId, userId, tx);
    });
  }

  /** P2-21 invitation acceptance activates a pending membership. */
  async activateMember(orgId: string, userId: string): Promise<Membership> {
    return this.prisma.$transaction(async (tx) => {
      await this.requireMembership(orgId, userId, tx);
      return this.memberships.updateStatus(orgId, userId, 'active', tx);
    });
  }

  listMembers(orgId: string): Promise<Membership[]> {
    return this.memberships.listForOrg(orgId);
  }

  listUserOrganizations(userId: string): Promise<Membership[]> {
    return this.memberships.listActiveForUser(userId);
  }

  getMembership(orgId: string, userId: string): Promise<Membership | null> {
    return this.memberships.find(orgId, userId);
  }

  private async requireMembership(
    orgId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Membership> {
    const membership = await this.memberships.find(orgId, userId, tx);
    if (!membership) throw new ApiError('NOT_FOUND', 'The membership does not exist.');
    return membership;
  }

  private async assertNotLastOwner(orgId: string, tx: Prisma.TransactionClient): Promise<void> {
    const owners = await this.memberships.countActiveOwners(orgId, tx);
    if (owners <= 1) {
      throw new ApiError('LAST_OWNER', 'An organisation must keep at least one owner.');
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
