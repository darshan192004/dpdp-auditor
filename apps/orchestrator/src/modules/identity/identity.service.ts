import { Injectable } from '@nestjs/common';
import type { Membership, Organization, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  addMemberByEmailSchema,
  addMembershipSchema,
  changeRoleSchema,
  createOrganizationSchema,
  githubProfileSchema,
  updateOrganizationSchema,
  type AddMemberByEmailInput,
  type AddMembershipInput,
  type ChangeRoleInput,
  type CreateOrganizationInput,
  type GithubProfileInput,
  type MemberRole,
  type MembershipStatus,
  type UpdateOrganizationInput,
} from './identity.schemas.js';
import { MembershipsRepository } from './memberships.repository.js';
import { OrganizationsRepository } from './organizations.repository.js';
import { UsersRepository } from './users.repository.js';

export interface CreatedOrganization {
  organization: Organization;
  membership: Membership;
}

/** Wire shape for `/api/v1/me` (api.md §2/§8); never includes secrets. */
export interface UserView {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  plan: string;
  retentionDays: number;
}

export interface MembershipView {
  orgId: string;
  role: MemberRole;
  status: MembershipStatus;
  organization: OrganizationView;
}

export interface MeView {
  user: UserView;
  memberships: MembershipView[];
}

/** api.md §7.2: organisation profile for the settings page. */
export interface OrgDetailView extends OrganizationView {
  dataRegion: string;
  scanConcurrency: number;
  settings: unknown;
  role: MemberRole;
}

/** api.md §7.3: one member row. */
export interface MemberView {
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
  status: MembershipStatus;
  lastLoginAt: string | null;
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
    private readonly audit: AuditService,
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
        const user = await this.users.updateProfile(
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
        await this.recordLogin(user, tx);
        return user;
      }

      const byEmail = await this.users.findByEmail(profile.email, tx);
      if (byEmail) {
        const user = await this.users.updateProfile(
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
        await this.recordLogin(user, tx);
        return user;
      }

      const user = await this.users.create(
        {
          email: profile.email,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          githubUserId: profile.githubUserId,
        },
        tx,
      );
      await this.recordLogin(user, tx);
      return user;
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
        await this.audit.record(
          {
            orgId: organization.id,
            actorType: 'user',
            actorUserId: owner.id,
            action: 'org.created',
            resourceType: 'organization',
            resourceId: organization.id,
            metadata: { slug: organization.slug, name: organization.name },
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

  /**
   * Onboarding (`POST /api/v1/org`): the signed-in user is always the owner;
   * the client never supplies `ownerUserId`.
   */
  async createOrganizationForUser(
    ownerUserId: string,
    raw: Pick<CreateOrganizationInput, 'name' | 'slug'>,
  ): Promise<OrgDetailView> {
    const { organization, membership } = await this.createOrganization({
      ...raw,
      ownerUserId,
    });
    return toOrgDetailView(organization, membership.role);
  }

  /** api.md §7.2: the org profile plus the caller's role. */
  async getOrganization(orgId: string, userId: string): Promise<OrgDetailView> {
    const organization = await this.organizations.findById(orgId);
    if (!organization) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');
    const membership = await this.requireRole(orgId, userId, [
      'owner',
      'admin',
      'auditor',
      'viewer',
    ]);
    return toOrgDetailView(organization, membership.role);
  }

  /**
   * api.md §7.2: profile/retention/notification edits only. Plan and region
   * are billing operations, so they are rejected here rather than silently
   * ignored (a strict schema would turn them into a 422 instead of a 403).
   */
  async updateOrganization(
    orgId: string,
    actorUserId: string,
    raw: UpdateOrganizationInput,
  ): Promise<OrgDetailView> {
    assertNoBillingFields(raw);
    const input = updateOrganizationSchema.parse(raw);

    return this.prisma.$transaction(async (tx) => {
      const actor = await this.requireRole(orgId, actorUserId, ['owner', 'admin'], tx);
      const organization = await this.organizations.findById(orgId, tx);
      if (!organization) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');

      const updated = await this.organizations.update(
        orgId,
        {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.retentionDays === undefined ? {} : { retentionDays: input.retentionDays }),
          ...(input.settings === undefined ? {} : { settings: input.settings }),
        },
        tx,
      );
      await this.audit.record(
        {
          orgId,
          actorType: 'user',
          actorUserId,
          action: 'org.updated',
          resourceType: 'organization',
          resourceId: orgId,
          metadata: {
            name: updated.name,
            retentionDays: updated.retentionDays,
            settings: updated.settings,
          },
        },
        tx,
      );
      return toOrgDetailView(updated, actor.role);
    });
  }

  /** api.md §7.3: any active member may read the member list. */
  async listMemberViews(orgId: string, actorUserId: string): Promise<MemberView[]> {
    await this.requireRole(orgId, actorUserId, ['owner', 'admin', 'auditor', 'viewer']);
    const memberships = await this.memberships.listForOrg(orgId);
    return memberships.map(toMemberView);
  }

  /**
   * api.md §7.3: existing accounts are added immediately. Unknown emails need
   * the invitation flow (P2-D), so this returns `NOT_FOUND` until then.
   */
  async addMemberByEmail(
    orgId: string,
    actorUserId: string,
    raw: AddMemberByEmailInput,
  ): Promise<MemberView> {
    const input = addMemberByEmailSchema.parse(raw);

    return this.prisma.$transaction(async (tx) => {
      const actor = await this.requireRole(orgId, actorUserId, ['owner', 'admin'], tx);
      if (input.role === 'owner' && actor.role !== 'owner') {
        throw new ApiError('FORBIDDEN', 'Only an owner can grant the owner role.');
      }

      const user = await this.users.findByEmail(input.email, tx);
      if (!user || user.deletedAt) {
        throw new ApiError('NOT_FOUND', 'No account exists for that email yet.');
      }
      const existing = await this.memberships.find(orgId, user.id, tx);
      if (existing) throw new ApiError('CONFLICT', 'The user is already a member.');

      try {
        const membership = await this.memberships.create(
          {
            orgId,
            userId: user.id,
            role: input.role,
            status: 'active',
            invitedBy: actorUserId,
          },
          tx,
        );
        await this.audit.record(
          {
            orgId,
            actorType: 'user',
            actorUserId,
            action: 'member.invited',
            resourceType: 'membership',
            resourceId: user.id,
            metadata: { role: membership.role, status: membership.status },
          },
          tx,
        );
        return toMemberView({ ...membership, user });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ApiError('CONFLICT', 'The user is already a member.');
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
        const membership = await this.memberships.create(
          {
            orgId: input.orgId,
            userId: input.userId,
            role: input.role,
            status: input.status,
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
            resourceId: membership.userId,
            metadata: { role: membership.role, status: membership.status },
          },
          tx,
        );
        return membership;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ApiError('CONFLICT', 'The user is already a member.');
        }
        throw error;
      }
    });
  }

  /** database.md §4.3: the last active owner can never be demoted. */
  async changeRole(raw: ChangeRoleInput, actorUserId?: string): Promise<Membership> {
    const input = changeRoleSchema.parse(raw);

    return this.prisma.$transaction(async (tx) => {
      const actor = actorUserId
        ? await this.requireRole(input.orgId, actorUserId, ['owner', 'admin'], tx)
        : null;
      const membership = await this.requireMembership(input.orgId, input.userId, tx);
      if (actor && actor.role !== 'owner') {
        if (membership.role === 'owner') {
          throw new ApiError('FORBIDDEN', 'Only an owner can change an owner.');
        }
        if (input.role === 'owner') {
          throw new ApiError('FORBIDDEN', 'Only an owner can grant the owner role.');
        }
      }
      if (membership.role === 'owner' && membership.status === 'active' && input.role !== 'owner') {
        await this.assertNotLastOwner(input.orgId, tx);
      }
      const updated = await this.memberships.updateRole(input.orgId, input.userId, input.role, tx);
      await this.audit.record(
        {
          orgId: input.orgId,
          actorType: actor ? 'user' : 'system',
          actorUserId: actor ? actorUserId : null,
          action: 'member.role_changed',
          resourceType: 'membership',
          resourceId: input.userId,
          metadata: { from: membership.role, to: input.role },
        },
        tx,
      );
      return updated;
    });
  }

  /** database.md §4.3: the last active owner can never be removed. */
  async removeMember(orgId: string, userId: string, actorUserId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const actor = actorUserId
        ? await this.requireRole(orgId, actorUserId, ['owner', 'admin'], tx)
        : null;
      const membership = await this.requireMembership(orgId, userId, tx);
      if (actor && actor.role !== 'owner' && membership.role === 'owner') {
        throw new ApiError('FORBIDDEN', 'Only an owner can remove an owner.');
      }
      if (membership.role === 'owner' && membership.status === 'active') {
        await this.assertNotLastOwner(orgId, tx);
      }
      await this.memberships.delete(orgId, userId, tx);
      await this.audit.record(
        {
          orgId,
          actorType: actor ? 'user' : 'system',
          actorUserId: actor ? actorUserId : null,
          action: 'member.removed',
          resourceType: 'membership',
          resourceId: userId,
          metadata: { role: membership.role },
        },
        tx,
      );
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

  /**
   * Everything `/api/v1/me` needs, in one call: the user, their active
   * memberships (with the organisation each grants access to), and the role
   * the UI gates on. Feature flags are added by the controller.
   */
  async me(userId: string): Promise<MeView> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) {
      throw new ApiError('UNAUTHENTICATED', 'The user is no longer active.');
    }
    const memberships = await this.memberships.listActiveForUser(userId);
    return {
      user: toUserView(user),
      memberships: memberships.map((membership) => ({
        orgId: membership.orgId,
        role: membership.role,
        status: membership.status,
        organization: toOrganizationView(membership.organization),
      })),
    };
  }

  getMembership(orgId: string, userId: string): Promise<Membership | null> {
    return this.memberships.find(orgId, userId);
  }

  private async recordLogin(user: User, tx: Prisma.TransactionClient): Promise<void> {
    await this.audit.record(
      {
        orgId: null,
        actorType: 'user',
        actorUserId: user.id,
        action: 'auth.login',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { method: 'github' },
      },
      tx,
    );
  }

  private async requireRole(
    orgId: string,
    userId: string,
    allowed: readonly MemberRole[],
    tx?: Prisma.TransactionClient,
  ): Promise<Membership> {
    const membership = await this.memberships.find(orgId, userId, tx);
    if (!membership || membership.status !== 'active') {
      // Cross-tenant and non-member callers get the same answer as a missing
      // organisation: never confirm that someone else's org exists.
      throw new ApiError('NOT_FOUND', 'The organisation does not exist.');
    }
    if (!allowed.includes(membership.role)) {
      throw new ApiError('FORBIDDEN', 'Your role cannot perform this action.');
    }
    return membership;
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

function toUserView(user: User): UserView {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
}

function toOrganizationView(organization: Organization): OrganizationView {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    plan: organization.plan,
    retentionDays: organization.retentionDays,
  };
}

function toOrgDetailView(organization: Organization, role: MemberRole): OrgDetailView {
  return {
    ...toOrganizationView(organization),
    dataRegion: organization.dataRegion,
    scanConcurrency: organization.scanConcurrency,
    settings: organization.settings,
    role,
  };
}

function toMemberView(membership: Membership & { user: User }): MemberView {
  return {
    userId: membership.userId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    status: membership.status,
    lastLoginAt: membership.user.lastLoginAt ? membership.user.lastLoginAt.toISOString() : null,
  };
}

/** api.md §7.2: plan/region are billing fields, not org-settings fields. */
function assertNoBillingFields(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return;
  if ('plan' in raw || 'dataRegion' in raw) {
    throw new ApiError('FORBIDDEN', 'Plan and data-region changes are billing operations.');
  }
}
