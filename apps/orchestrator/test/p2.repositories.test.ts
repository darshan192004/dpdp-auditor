import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { ApiKeysRepository } from '../src/modules/api-keys/api-keys.repository.js';
import { InvitesRepository } from '../src/modules/invites/invites.repository.js';
import { RepositoriesRepository } from '../src/modules/repos/repositories.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ID = '77777777-7777-4777-8777-777777777777';

describe('ApiKeysRepository', () => {
  function make() {
    const apiKey = {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    };
    const prisma = { apiKey } as unknown as PrismaService;
    return { repo: new ApiKeysRepository(prisma), apiKey };
  }

  it('creates a key with nullable fields defaulted', async () => {
    const { repo, apiKey } = make();
    await repo.create({
      orgId: ORG_ID,
      name: 'CI',
      keyPrefix: 'dpk_live_aaaa',
      keyHash: 'a'.repeat(64),
      scopes: ['scan:read'],
    });

    expect(apiKey.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        name: 'CI',
        keyPrefix: 'dpk_live_aaaa',
        keyHash: 'a'.repeat(64),
        scopes: ['scan:read'],
        createdBy: null,
        expiresAt: null,
      },
    });
  });

  it('lists, finds, revokes, and touches keys', async () => {
    const { repo, apiKey } = make();
    await repo.listForOrg(ORG_ID);
    await repo.findById(ORG_ID, ID);
    await repo.findActiveByPrefix('dpk_live_aaaa');
    await repo.revoke(ID);
    await repo.touchLastUsed(ID);

    expect(apiKey.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID },
      orderBy: { createdAt: 'desc' },
    });
    expect(apiKey.findFirst).toHaveBeenNthCalledWith(1, { where: { id: ID, orgId: ORG_ID } });
    expect(apiKey.findFirst).toHaveBeenNthCalledWith(2, {
      where: { keyPrefix: 'dpk_live_aaaa', revokedAt: null },
    });
    expect(apiKey.update).toHaveBeenNthCalledWith(1, {
      where: { id: ID },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(apiKey.update).toHaveBeenNthCalledWith(2, {
      where: { id: ID },
      data: { lastUsedAt: expect.any(Date) as Date },
    });
  });

  it('uses a caller-provided transaction client', async () => {
    const { repo } = make();
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = { apiKey: { findMany } } as unknown as Prisma.TransactionClient;
    await repo.listForOrg(ORG_ID, tx);
    expect(findMany).toHaveBeenCalledOnce();
  });
});

describe('RepositoriesRepository', () => {
  function make() {
    const repository = {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    const scan = {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    };
    const prisma = { repository, scan } as unknown as PrismaService;
    return { repo: new RepositoriesRepository(prisma), repository, scan };
  }

  const INPUT = {
    orgId: ORG_ID,
    owner: 'acme',
    name: 'repo',
    fullName: 'acme/repo',
    defaultBranch: 'main',
    visibility: 'public' as const,
  };

  it('creates and reactivates repositories', async () => {
    const { repo, repository } = make();
    await repo.create(INPUT);
    await repo.reactivate(ID, INPUT);

    expect(repository.create).toHaveBeenCalledWith({
      data: {
        ...INPUT,
        githubRepoId: null,
        language: null,
        sizeKb: null,
        connectedBy: null,
      },
    });
    expect(repository.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: {
        owner: 'acme',
        name: 'repo',
        fullName: 'acme/repo',
        defaultBranch: 'main',
        visibility: 'public',
        githubRepoId: null,
        language: null,
        sizeKb: null,
        connectedBy: null,
        deletedAt: null,
      },
    });
  });

  it('finds active and deleted repositories', async () => {
    const { repo, repository } = make();
    await repo.findActiveByFullName(ORG_ID, 'acme/repo');
    await repo.findDeletedByFullName(ORG_ID, 'acme/repo');
    await repo.findActiveById(ORG_ID, ID);

    expect(repository.findFirst).toHaveBeenNthCalledWith(1, {
      where: { orgId: ORG_ID, fullName: 'acme/repo', deletedAt: null },
    });
    expect(repository.findFirst).toHaveBeenNthCalledWith(2, {
      where: { orgId: ORG_ID, fullName: 'acme/repo', deletedAt: { not: null } },
    });
    expect(repository.findFirst).toHaveBeenNthCalledWith(3, {
      where: { id: ID, orgId: ORG_ID, deletedAt: null },
    });
  });

  it('lists a page and counts the total', async () => {
    const { repo, repository } = make();
    repository.count.mockResolvedValue(3);

    await expect(repo.listForOrg(ORG_ID, 2, 2)).resolves.toEqual({ items: [], total: 3 });

    expect(repository.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: 2,
      take: 2,
    });
  });

  it('soft deletes, counts active scans, and uses a transaction client', async () => {
    const { repo, repository } = make();
    await repo.softDelete(ID);
    expect(repository.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) as Date },
    });

    const count = vi.fn().mockResolvedValue(1);
    const tx = { scan: { count } } as unknown as Prisma.TransactionClient;
    await expect(repo.countActiveScans(ORG_ID, ID, tx)).resolves.toBe(1);
    expect(count).toHaveBeenCalledWith({
      where: {
        orgId: ORG_ID,
        repositoryId: ID,
        status: { in: ['queued', 'cloning', 'scanning', 'mapping'] },
      },
    });
  });

  it('computes stats with no completed scans', async () => {
    const { repo } = make();
    await expect(repo.stats(ID)).resolves.toEqual({
      totalScans: 0,
      averageScore: null,
      lastScore: null,
      trend: null,
    });
  });

  it('computes stats and a trend from recent scores', async () => {
    const { repo, scan } = make();
    scan.count.mockResolvedValue(4);
    scan.findMany.mockResolvedValue([{ score: 90 }, { score: null }, { score: 70 }]);

    await expect(repo.stats(ID)).resolves.toEqual({
      totalScans: 4,
      averageScore: 80,
      lastScore: 90,
      trend: 'up',
    });
  });

  it('reports a downward trend and a flat single score', async () => {
    const { repo, scan } = make();
    scan.findMany.mockResolvedValue([{ score: 60 }, { score: 80 }]);
    await expect(repo.stats(ID)).resolves.toMatchObject({ trend: 'down' });

    scan.findMany.mockResolvedValue([{ score: 80 }]);
    await expect(repo.stats(ID)).resolves.toMatchObject({ trend: null, lastScore: 80 });
  });
});

describe('InvitesRepository', () => {
  function make() {
    const membershipInvite = {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    };
    const prisma = { membershipInvite } as unknown as PrismaService;
    return { repo: new InvitesRepository(prisma), membershipInvite };
  }

  it('creates an invite with nullable fields defaulted', async () => {
    const { repo, membershipInvite } = make();
    const expiresAt = new Date('2026-11-19T00:00:00.000Z');
    await repo.create({
      orgId: ORG_ID,
      email: 'asha@example.com',
      role: 'viewer',
      tokenHash: 'a'.repeat(64),
      expiresAt,
    });

    expect(membershipInvite.create).toHaveBeenCalledWith({
      data: {
        orgId: ORG_ID,
        email: 'asha@example.com',
        role: 'viewer',
        tokenHash: 'a'.repeat(64),
        invitedBy: null,
        expiresAt,
      },
    });
  });

  it('finds active invites and lists pending ones', async () => {
    const { repo, membershipInvite } = make();
    const now = new Date('2026-11-12T00:00:00.000Z');
    await repo.findActiveByHash('a'.repeat(64));
    await repo.listPending(ORG_ID, now);

    expect(membershipInvite.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: 'a'.repeat(64), acceptedAt: null },
    });
    expect(membershipInvite.findMany).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, acceptedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('replaces pending invites, accepts, and expires them', async () => {
    const { repo, membershipInvite } = make();
    membershipInvite.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 3 });

    await expect(repo.deletePendingForEmail(ORG_ID, 'asha@example.com')).resolves.toBe(1);
    await repo.markAccepted(ID);
    await expect(repo.deleteExpired(new Date('2026-11-12T00:00:00.000Z'))).resolves.toBe(3);

    expect(membershipInvite.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { orgId: ORG_ID, email: 'asha@example.com', acceptedAt: null },
    });
    expect(membershipInvite.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { acceptedAt: expect.any(Date) as Date },
    });
    expect(membershipInvite.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { acceptedAt: null, expiresAt: { lte: new Date('2026-11-12T00:00:00.000Z') } },
    });
  });

  it('uses a caller-provided transaction client', async () => {
    const { repo } = make();
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { membershipInvite: { findFirst } } as unknown as Prisma.TransactionClient;
    await repo.findActiveByHash('a'.repeat(64), tx);
    expect(findFirst).toHaveBeenCalledOnce();
  });
});
