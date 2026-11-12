import { describe, expect, it, vi } from 'vitest';
import type { Prisma, Repository } from '@prisma/client';
import { ReposService } from '../src/modules/repos/repos.service.js';
import type { RepositoriesRepository } from '../src/modules/repos/repositories.repository.js';
import type { RepoResolverService } from '../src/modules/repos/repo-resolver.service.js';
import type { OrganizationsRepository } from '../src/modules/identity/organizations.repository.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '22222222-2222-4222-9222-222222222222';
const URL = 'https://github.com/acme/payments-service';

const ORG = { id: ORG_ID, name: 'Acme', slug: 'acme', plan: 'free' };
const RESOLVED = {
  owner: 'acme',
  name: 'payments-service',
  fullName: 'acme/payments-service',
  canonicalUrl: URL,
  githubRepoId: 1n,
  defaultBranch: 'main',
  sizeKb: 1024,
  sizeBytes: 1024 * 1024,
  visibility: 'public' as const,
  isPublic: true,
  isArchived: false,
  language: 'TypeScript',
};

function repo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: REPO_ID,
    orgId: ORG_ID,
    owner: 'acme',
    name: 'payments-service',
    githubRepoId: 1n,
    fullName: 'acme/payments-service',
    defaultBranch: 'main',
    visibility: 'public',
    language: 'TypeScript',
    sizeKb: 1024,
    isArchived: false,
    connectedBy: USER_ID,
    lastScannedAt: null,
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    updatedAt: new Date('2026-11-12T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as Repository;
}

function make() {
  const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: vi.fn(async (fn: (client: Prisma.TransactionClient) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const organizations = { findById: vi.fn().mockResolvedValue(ORG) };
  const repos = {
    findActiveByFullName: vi.fn().mockResolvedValue(null),
    findDeletedByFullName: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(repo()),
    reactivate: vi.fn().mockResolvedValue(repo()),
    findActiveById: vi.fn().mockResolvedValue(repo()),
    listForOrg: vi.fn().mockResolvedValue({ items: [repo()], total: 3 }),
    stats: vi.fn().mockResolvedValue({
      totalScans: 2,
      averageScore: 80,
      lastScore: 85,
      trend: 'up',
    }),
    countActiveScans: vi.fn().mockResolvedValue(0),
    softDelete: vi.fn().mockResolvedValue(repo({ deletedAt: new Date() })),
  };
  const resolver = { resolve: vi.fn().mockResolvedValue(RESOLVED) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new ReposService(
    prisma,
    organizations as unknown as OrganizationsRepository,
    repos as unknown as RepositoriesRepository,
    resolver as unknown as RepoResolverService,
    audit as unknown as AuditService,
  );
  return { service, tx, organizations, repos, resolver, audit };
}

describe('ReposService.resolve', () => {
  it('returns the resolve preview', async () => {
    const { service, resolver } = make();
    await expect(service.resolve({ orgId: ORG_ID, githubUrl: URL })).resolves.toEqual({
      fullName: 'acme/payments-service',
      defaultBranch: 'main',
      sizeBytes: 1024 * 1024,
      visibility: 'public',
      isPublic: true,
    });
    expect(resolver.resolve).toHaveBeenCalledWith(URL, 'free');
  });

  it('rejects an unknown organisation', async () => {
    const { service, organizations } = make();
    organizations.findById.mockResolvedValue(null);
    await expect(service.resolve({ orgId: ORG_ID, githubUrl: URL })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('ReposService.save', () => {
  it('creates a new repository and audits the connection', async () => {
    const { service, repos, audit, tx } = make();

    const saved = await service.save({ orgId: ORG_ID, githubUrl: URL, actorUserId: USER_ID });

    expect(repos.create).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, fullName: 'acme/payments-service' }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'repo.connected', resourceId: REPO_ID }),
      tx,
    );
    expect(saved).toMatchObject({ id: REPO_ID, fullName: 'acme/payments-service' });
  });

  it('reactivates a soft-deleted repository', async () => {
    const { service, repos } = make();
    repos.findDeletedByFullName.mockResolvedValue(repo({ deletedAt: new Date() }));

    await service.save({ orgId: ORG_ID, githubUrl: URL });

    expect(repos.reactivate).toHaveBeenCalledWith(REPO_ID, expect.any(Object), expect.anything());
    expect(repos.create).not.toHaveBeenCalled();
  });

  it('rejects a repository that is already connected', async () => {
    const { service, repos } = make();
    repos.findActiveByFullName.mockResolvedValue(repo());

    await expect(service.save({ orgId: ORG_ID, githubUrl: URL })).rejects.toMatchObject({
      code: 'REPO_ALREADY_CONNECTED',
    });
  });
});

describe('ReposService.list and detail', () => {
  it('paginates the repository list', async () => {
    const { service, repos } = make();
    const result = await service.list({ orgId: ORG_ID, page: 2, pageSize: 2 });
    expect(repos.listForOrg).toHaveBeenCalledWith(ORG_ID, 2, 2);
    expect(result.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(result.items).toHaveLength(1);
  });

  it('returns repository detail with stats', async () => {
    const { service } = make();
    await expect(service.detail(ORG_ID, REPO_ID)).resolves.toMatchObject({
      id: REPO_ID,
      stats: { totalScans: 2, trend: 'up' },
    });
  });

  it('rejects an unknown repository', async () => {
    const { service, repos } = make();
    repos.findActiveById.mockResolvedValue(null);
    await expect(service.detail(ORG_ID, REPO_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ReposService.disconnect', () => {
  it('soft deletes a repository and audits the disconnection', async () => {
    const { service, repos, audit, tx } = make();

    await service.disconnect({ orgId: ORG_ID, repoId: REPO_ID, actorUserId: USER_ID });

    expect(repos.softDelete).toHaveBeenCalledWith(REPO_ID, tx);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'repo.disconnected',
        metadata: { fullName: 'acme/payments-service', forced: false },
      }),
      tx,
    );
  });

  it('rejects disconnecting while a scan is active unless forced', async () => {
    const { service, repos } = make();
    repos.countActiveScans.mockResolvedValue(1);

    await expect(service.disconnect({ orgId: ORG_ID, repoId: REPO_ID })).rejects.toMatchObject({
      code: 'SCAN_IN_PROGRESS',
    });

    await expect(
      service.disconnect({ orgId: ORG_ID, repoId: REPO_ID, force: true }),
    ).resolves.toBeUndefined();
    expect(repos.softDelete).toHaveBeenCalled();
  });

  it('rejects an unknown repository', async () => {
    const { service, repos } = make();
    repos.findActiveById.mockResolvedValue(null);
    await expect(service.disconnect({ orgId: ORG_ID, repoId: REPO_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
