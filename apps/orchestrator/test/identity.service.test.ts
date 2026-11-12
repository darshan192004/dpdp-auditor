import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ApiError } from '../src/common/api-error.js';
import { IdentityService } from '../src/modules/identity/identity.service.js';
import type { MembershipsRepository } from '../src/modules/identity/memberships.repository.js';
import type { OrganizationsRepository } from '../src/modules/identity/organizations.repository.js';
import type { UsersRepository } from '../src/modules/identity/users.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-9222-222222222222';
const OTHER_ID = '33333333-3333-4333-a333-333333333333';

const PROFILE = {
  githubUserId: 42,
  email: 'asha@example.com',
  name: 'Asha',
  avatarUrl: 'https://avatars.example.com/asha.png',
};

const USER = {
  id: USER_ID,
  email: PROFILE.email,
  name: PROFILE.name,
  avatarUrl: PROFILE.avatarUrl,
  githubUserId: 42n,
  deletedAt: null,
};

const ORG = { id: ORG_ID, name: 'Acme', slug: 'acme' };
const MEMBERSHIP = {
  orgId: ORG_ID,
  userId: USER_ID,
  role: 'owner',
  status: 'active',
};

function makeService() {
  const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: vi.fn(async (fn: (client: Prisma.TransactionClient) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const users = {
    findByGithubId: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateProfile: vi.fn(),
  };
  const organizations = {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
  };
  const memberships = {
    find: vi.fn(),
    create: vi.fn(),
    updateRole: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    countActiveOwners: vi.fn(),
    listForOrg: vi.fn(),
    listActiveForUser: vi.fn(),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new IdentityService(
    prisma,
    users as unknown as UsersRepository,
    organizations as unknown as OrganizationsRepository,
    memberships as unknown as MembershipsRepository,
    audit as unknown as AuditService,
  );
  return { service, tx, users, organizations, memberships, audit };
}

describe('IdentityService', () => {
  describe('upsertGithubUser', () => {
    it('refreshes a returning user matched by GitHub id', async () => {
      const { service, tx, users } = makeService();
      users.findByGithubId.mockResolvedValue(USER);
      users.updateProfile.mockResolvedValue(USER);

      await service.upsertGithubUser(PROFILE);

      expect(users.findByGithubId).toHaveBeenCalledWith(42n, tx);
      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(users.updateProfile).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          email: PROFILE.email,
          name: PROFILE.name,
          avatarUrl: PROFILE.avatarUrl,
          deletedAt: null,
        }),
        tx,
      );
    });

    it('links a GitHub id onto an existing email instead of duplicating the user', async () => {
      const { service, tx, users } = makeService();
      users.findByGithubId.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue({ ...USER, githubUserId: null, name: null });
      users.updateProfile.mockResolvedValue(USER);

      await service.upsertGithubUser(PROFILE);

      expect(users.updateProfile).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          githubUserId: 42n,
          name: PROFILE.name,
          avatarUrl: PROFILE.avatarUrl,
          deletedAt: null,
        }),
        tx,
      );
      expect(users.create).not.toHaveBeenCalled();
    });

    it('creates the user when neither GitHub id nor email exists', async () => {
      const { service, tx, users } = makeService();
      users.findByGithubId.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue(USER);

      await service.upsertGithubUser(PROFILE);

      expect(users.create).toHaveBeenCalledWith(
        {
          email: PROFILE.email,
          name: PROFILE.name,
          avatarUrl: PROFILE.avatarUrl,
          githubUserId: 42n,
        },
        tx,
      );
    });

    it('rejects a profile without an email', async () => {
      const { service } = makeService();
      await expect(
        service.upsertGithubUser({ ...PROFILE, email: 'not-an-email' }),
      ).rejects.toThrow();
    });
  });

  describe('createOrganization', () => {
    it('creates the organisation and an active owner membership in one transaction', async () => {
      const { service, tx, users, organizations, memberships } = makeService();
      users.findById.mockResolvedValue(USER);
      organizations.findBySlug.mockResolvedValue(null);
      organizations.create.mockResolvedValue(ORG);
      memberships.create.mockResolvedValue(MEMBERSHIP);

      const result = await service.createOrganization({
        name: 'Acme',
        slug: 'acme',
        ownerUserId: USER_ID,
      });

      expect(organizations.create).toHaveBeenCalledWith({ name: 'Acme', slug: 'acme' }, tx);
      expect(memberships.create).toHaveBeenCalledWith(
        { orgId: ORG_ID, userId: USER_ID, role: 'owner', status: 'active' },
        tx,
      );
      expect(result).toEqual({ organization: ORG, membership: MEMBERSHIP });
    });

    it('rejects a slug that is already taken', async () => {
      const { service, users, organizations } = makeService();
      users.findById.mockResolvedValue(USER);
      organizations.findBySlug.mockResolvedValue(ORG);

      await expect(
        service.createOrganization({ name: 'Acme', slug: 'acme', ownerUserId: USER_ID }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects an owner that does not exist', async () => {
      const { service, users } = makeService();
      users.findById.mockResolvedValue(null);

      await expect(
        service.createOrganization({ name: 'Acme', slug: 'acme', ownerUserId: USER_ID }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects a soft-deleted owner', async () => {
      const { service, users } = makeService();
      users.findById.mockResolvedValue({ ...USER, deletedAt: new Date() });

      await expect(
        service.createOrganization({ name: 'Acme', slug: 'acme', ownerUserId: USER_ID }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('maps a unique-index race to CONFLICT', async () => {
      const { service, users, organizations } = makeService();
      users.findById.mockResolvedValue(USER);
      organizations.findBySlug.mockResolvedValue(null);
      organizations.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      await expect(
        service.createOrganization({ name: 'Acme', slug: 'acme', ownerUserId: USER_ID }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rethrows unrelated database errors', async () => {
      const { service, users, organizations } = makeService();
      users.findById.mockResolvedValue(USER);
      organizations.findBySlug.mockResolvedValue(null);
      organizations.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.createOrganization({ name: 'Acme', slug: 'acme', ownerUserId: USER_ID }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('addMember', () => {
    const INPUT = { orgId: ORG_ID, userId: OTHER_ID, role: 'viewer' as const };

    it('creates an invited membership with defaults', async () => {
      const { service, tx, users, organizations, memberships } = makeService();
      organizations.findById.mockResolvedValue(ORG);
      users.findById.mockResolvedValue(USER);
      memberships.find.mockResolvedValue(null);
      memberships.create.mockResolvedValue({ ...MEMBERSHIP, userId: OTHER_ID });

      await service.addMember(INPUT);

      expect(memberships.create).toHaveBeenCalledWith(
        {
          orgId: ORG_ID,
          userId: OTHER_ID,
          role: 'viewer',
          status: 'invited',
          invitedBy: null,
        },
        tx,
      );
    });

    it('rejects an existing membership', async () => {
      const { service, users, organizations, memberships } = makeService();
      organizations.findById.mockResolvedValue(ORG);
      users.findById.mockResolvedValue(USER);
      memberships.find.mockResolvedValue(MEMBERSHIP);

      await expect(service.addMember(INPUT)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('maps a unique-index race to CONFLICT', async () => {
      const { service, users, organizations, memberships } = makeService();
      organizations.findById.mockResolvedValue(ORG);
      users.findById.mockResolvedValue(USER);
      memberships.find.mockResolvedValue(null);
      memberships.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      await expect(service.addMember(INPUT)).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects an unknown organisation', async () => {
      const { service, users, organizations, memberships } = makeService();
      organizations.findById.mockResolvedValue(null);
      users.findById.mockResolvedValue(USER);
      memberships.find.mockResolvedValue(null);

      await expect(service.addMember(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects an unknown user', async () => {
      const { service, users, organizations, memberships } = makeService();
      organizations.findById.mockResolvedValue(ORG);
      users.findById.mockResolvedValue(null);
      memberships.find.mockResolvedValue(null);

      await expect(service.addMember(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('changeRole', () => {
    const INPUT = { orgId: ORG_ID, userId: USER_ID, role: 'admin' as const };

    it('demotes an owner when another active owner remains', async () => {
      const { service, tx, memberships } = makeService();
      memberships.find.mockResolvedValue(MEMBERSHIP);
      memberships.countActiveOwners.mockResolvedValue(2);
      memberships.updateRole.mockResolvedValue({ ...MEMBERSHIP, role: 'admin' });

      await service.changeRole(INPUT);

      expect(memberships.countActiveOwners).toHaveBeenCalledWith(ORG_ID, tx);
      expect(memberships.updateRole).toHaveBeenCalledWith(ORG_ID, USER_ID, 'admin', tx);
    });

    it('refuses to demote the last active owner', async () => {
      const { service, memberships } = makeService();
      memberships.find.mockResolvedValue(MEMBERSHIP);
      memberships.countActiveOwners.mockResolvedValue(1);

      await expect(service.changeRole(INPUT)).rejects.toMatchObject({ code: 'LAST_OWNER' });
      expect(memberships.updateRole).not.toHaveBeenCalled();
    });

    it('does not run the owner guard for non-owners', async () => {
      const { service, memberships } = makeService();
      memberships.find.mockResolvedValue({ ...MEMBERSHIP, role: 'viewer' });
      memberships.updateRole.mockResolvedValue({ ...MEMBERSHIP, role: 'admin' });

      await service.changeRole(INPUT);

      expect(memberships.countActiveOwners).not.toHaveBeenCalled();
    });

    it('rejects a missing membership', async () => {
      const { service, memberships } = makeService();
      memberships.find.mockResolvedValue(null);

      await expect(service.changeRole(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('removeMember', () => {
    it('deletes a non-owner membership', async () => {
      const { service, tx, memberships } = makeService();
      memberships.find.mockResolvedValue({ ...MEMBERSHIP, role: 'viewer' });
      memberships.delete.mockResolvedValue(MEMBERSHIP);

      await service.removeMember(ORG_ID, USER_ID);

      expect(memberships.delete).toHaveBeenCalledWith(ORG_ID, USER_ID, tx);
    });

    it('refuses to remove the last active owner', async () => {
      const { service, memberships } = makeService();
      memberships.find.mockResolvedValue(MEMBERSHIP);
      memberships.countActiveOwners.mockResolvedValue(1);

      await expect(service.removeMember(ORG_ID, USER_ID)).rejects.toMatchObject({
        code: 'LAST_OWNER',
      });
      expect(memberships.delete).not.toHaveBeenCalled();
    });

    it('rejects a missing membership', async () => {
      const { service, memberships } = makeService();
      memberships.find.mockResolvedValue(null);

      await expect(service.removeMember(ORG_ID, USER_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('activateMember', () => {
    it('activates a pending membership', async () => {
      const { service, tx, memberships } = makeService();
      memberships.find.mockResolvedValue({ ...MEMBERSHIP, status: 'invited' });
      memberships.updateStatus.mockResolvedValue(MEMBERSHIP);

      await service.activateMember(ORG_ID, USER_ID);

      expect(memberships.updateStatus).toHaveBeenCalledWith(ORG_ID, USER_ID, 'active', tx);
    });

    it('rejects a missing membership', async () => {
      const { service, memberships } = makeService();
      memberships.find.mockResolvedValue(null);

      await expect(service.activateMember(ORG_ID, USER_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('read helpers', () => {
    it('lists members, organisations, and a single membership', async () => {
      const { service, memberships } = makeService();
      memberships.listForOrg.mockResolvedValue([MEMBERSHIP]);
      memberships.listActiveForUser.mockResolvedValue([MEMBERSHIP]);
      memberships.find.mockResolvedValue(MEMBERSHIP);

      await expect(service.listMembers(ORG_ID)).resolves.toEqual([MEMBERSHIP]);
      await expect(service.listUserOrganizations(USER_ID)).resolves.toEqual([MEMBERSHIP]);
      await expect(service.getMembership(ORG_ID, USER_ID)).resolves.toBe(MEMBERSHIP);
    });
  });

  it('exposes ApiError codes to the global filter', () => {
    const error = new ApiError('LAST_OWNER', 'keep an owner');
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe('LAST_OWNER');
  });
});
