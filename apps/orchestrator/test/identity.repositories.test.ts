import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { MembershipsRepository } from '../src/modules/identity/memberships.repository.js';
import { OrganizationsRepository } from '../src/modules/identity/organizations.repository.js';
import { UsersRepository } from '../src/modules/identity/users.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-9222-222222222222';
const OTHER_ID = '33333333-3333-4333-a333-333333333333';

describe('UsersRepository', () => {
  function make() {
    const user = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    };
    const prisma = { user } as unknown as PrismaService;
    return { repo: new UsersRepository(prisma), user };
  }

  it('looks up by github id, email, and id', async () => {
    const { repo, user } = make();
    await repo.findByGithubId(42n);
    await repo.findByEmail('asha@example.com');
    await repo.findById(USER_ID);

    expect(user.findUnique).toHaveBeenNthCalledWith(1, { where: { githubUserId: 42n } });
    expect(user.findUnique).toHaveBeenNthCalledWith(2, { where: { email: 'asha@example.com' } });
    expect(user.findUnique).toHaveBeenNthCalledWith(3, { where: { id: USER_ID } });
  });

  it('creates a user with nullable profile fields defaulted to null', async () => {
    const { repo, user } = make();
    await repo.create({ email: 'asha@example.com' });

    expect(user.create).toHaveBeenCalledWith({
      data: {
        email: 'asha@example.com',
        name: null,
        avatarUrl: null,
        githubUserId: null,
      },
    });
  });

  it('only sends defined profile fields on update', async () => {
    const { repo, user } = make();
    await repo.updateProfile(USER_ID, { name: 'Asha' });

    expect(user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { name: 'Asha' },
    });
  });

  it('sends every provided field on update', async () => {
    const { repo, user } = make();
    const lastLoginAt = new Date('2026-11-12T00:00:00.000Z');
    await repo.updateProfile(USER_ID, {
      email: 'asha@example.com',
      name: 'Asha',
      avatarUrl: 'https://avatars.example.com/asha.png',
      githubUserId: 42n,
      lastLoginAt,
      deletedAt: null,
    });

    expect(user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        email: 'asha@example.com',
        name: 'Asha',
        avatarUrl: 'https://avatars.example.com/asha.png',
        githubUserId: 42n,
        lastLoginAt,
        deletedAt: null,
      },
    });
  });

  it('creates a user with every profile field', async () => {
    const { repo, user } = make();
    await repo.create({
      email: 'asha@example.com',
      name: 'Asha',
      avatarUrl: 'https://avatars.example.com/asha.png',
      githubUserId: 42n,
    });

    expect(user.create).toHaveBeenCalledWith({
      data: {
        email: 'asha@example.com',
        name: 'Asha',
        avatarUrl: 'https://avatars.example.com/asha.png',
        githubUserId: 42n,
      },
    });
  });

  it('soft deletes by stamping deletedAt', async () => {
    const { repo, user } = make();
    await repo.softDelete(USER_ID);

    expect(user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { deletedAt: expect.any(Date) as Date },
    });
  });

  it('uses a caller-provided transaction client', async () => {
    const { repo } = make();
    const findUnique = vi.fn().mockResolvedValue(null);
    const tx = { user: { findUnique } } as unknown as Prisma.TransactionClient;

    await repo.findById(USER_ID, tx);

    expect(findUnique).toHaveBeenCalledOnce();
  });
});

describe('OrganizationsRepository', () => {
  function make() {
    const organization = {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    };
    const prisma = { organization } as unknown as PrismaService;
    return { repo: new OrganizationsRepository(prisma), organization };
  }

  it('creates with the provided name and slug', async () => {
    const { repo, organization } = make();
    await repo.create({ name: 'Acme', slug: 'acme' });

    expect(organization.create).toHaveBeenCalledWith({
      data: { name: 'Acme', slug: 'acme' },
    });
  });

  it('only finds organisations that are not soft deleted', async () => {
    const { repo, organization } = make();
    await repo.findById(ORG_ID);
    await repo.findBySlug('acme');

    expect(organization.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: ORG_ID, deletedAt: null },
    });
    expect(organization.findFirst).toHaveBeenNthCalledWith(2, {
      where: { slug: 'acme', deletedAt: null },
    });
  });

  it('only sends defined update fields', async () => {
    const { repo, organization } = make();
    await repo.update(ORG_ID, { retentionDays: 30, settings: { theme: 'dark' } });

    expect(organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { retentionDays: 30, settings: { theme: 'dark' } },
    });
  });

  it('sends the name when it is part of the update', async () => {
    const { repo, organization } = make();
    await repo.update(ORG_ID, { name: 'Acme Two' });

    expect(organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { name: 'Acme Two' },
    });
  });

  it('soft deletes by stamping deletedAt', async () => {
    const { repo, organization } = make();
    await repo.softDelete(ORG_ID);

    expect(organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { deletedAt: expect.any(Date) as Date },
    });
  });

  it('uses a caller-provided transaction client', async () => {
    const { repo } = make();
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { organization: { findFirst } } as unknown as Prisma.TransactionClient;

    await repo.findById(ORG_ID, tx);

    expect(findFirst).toHaveBeenCalledOnce();
  });
});

describe('MembershipsRepository', () => {
  function make() {
    const membership = {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    };
    const prisma = { membership } as unknown as PrismaService;
    return { repo: new MembershipsRepository(prisma), membership };
  }

  it('lists org members with their user and user organisations with the org', async () => {
    const { repo, membership } = make();
    await repo.listForOrg(ORG_ID);
    await repo.listActiveForUser(USER_ID);

    expect(membership.findMany).toHaveBeenNthCalledWith(1, {
      where: { orgId: ORG_ID },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(membership.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: USER_ID, status: 'active' },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('finds a membership by its composite key', async () => {
    const { repo, membership } = make();
    await repo.find(ORG_ID, USER_ID);

    expect(membership.findUnique).toHaveBeenCalledWith({
      where: { orgId_userId: { orgId: ORG_ID, userId: USER_ID } },
    });
  });

  it('creates with invitedBy defaulted to null', async () => {
    const { repo, membership } = make();
    await repo.create({
      orgId: ORG_ID,
      userId: USER_ID,
      role: 'viewer',
      status: 'invited',
    });

    expect(membership.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        userId: USER_ID,
        role: 'viewer',
        status: 'invited',
        invitedBy: null,
      },
    });
  });

  it('creates with an inviter when provided', async () => {
    const { repo, membership } = make();
    await repo.create({
      orgId: ORG_ID,
      userId: USER_ID,
      role: 'auditor',
      status: 'active',
      invitedBy: OTHER_ID,
    });

    expect(membership.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        userId: USER_ID,
        role: 'auditor',
        status: 'active',
        invitedBy: OTHER_ID,
      },
    });
  });

  it('updates role and status by composite key', async () => {
    const { repo, membership } = make();
    await repo.updateRole(ORG_ID, USER_ID, 'admin');
    await repo.updateStatus(ORG_ID, USER_ID, 'suspended');

    expect(membership.update).toHaveBeenNthCalledWith(1, {
      where: { orgId_userId: { orgId: ORG_ID, userId: USER_ID } },
      data: { role: 'admin' },
    });
    expect(membership.update).toHaveBeenNthCalledWith(2, {
      where: { orgId_userId: { orgId: ORG_ID, userId: USER_ID } },
      data: { status: 'suspended' },
    });
  });

  it('deletes by composite key', async () => {
    const { repo, membership } = make();
    await repo.delete(ORG_ID, USER_ID);

    expect(membership.delete).toHaveBeenCalledWith({
      where: { orgId_userId: { orgId: ORG_ID, userId: USER_ID } },
    });
  });

  it('counts only active owners', async () => {
    const { repo, membership } = make();
    await repo.countActiveOwners(ORG_ID);

    expect(membership.count).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, role: 'owner', status: 'active' },
    });
  });

  it('uses a caller-provided transaction client', async () => {
    const { repo } = make();
    const findUnique = vi.fn().mockResolvedValue(null);
    const tx = { membership: { findUnique } } as unknown as Prisma.TransactionClient;

    await repo.find(ORG_ID, USER_ID, tx);

    expect(findUnique).toHaveBeenCalledOnce();
  });
});
