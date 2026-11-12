import { Injectable } from '@nestjs/common';
import type { Prisma, Repository } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RepoVisibilityValue } from './repo.schemas.js';

export interface CreateRepositoryRecord {
  orgId: string;
  owner: string;
  name: string;
  fullName: string;
  githubRepoId?: bigint | null;
  defaultBranch: string;
  visibility: RepoVisibilityValue;
  language?: string | null;
  sizeKb?: number | null;
  connectedBy?: string | null;
}

export interface RepositoryStats {
  totalScans: number;
  averageScore: number | null;
  lastScore: number | null;
  trend: 'up' | 'down' | 'flat' | null;
}

export interface RepositoryListResult {
  items: Repository[];
  total: number;
}

/** Data access for `repositories` (database.md §4.5). */
@Injectable()
export class RepositoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateRepositoryRecord, tx?: Prisma.TransactionClient): Promise<Repository> {
    return this.client(tx).repository.create({
      data: {
        orgId: input.orgId,
        owner: input.owner,
        name: input.name,
        fullName: input.fullName,
        githubRepoId: input.githubRepoId ?? null,
        defaultBranch: input.defaultBranch,
        visibility: input.visibility,
        language: input.language ?? null,
        sizeKb: input.sizeKb ?? null,
        connectedBy: input.connectedBy ?? null,
      },
    });
  }

  reactivate(
    id: string,
    input: CreateRepositoryRecord,
    tx?: Prisma.TransactionClient,
  ): Promise<Repository> {
    return this.client(tx).repository.update({
      where: { id },
      data: {
        owner: input.owner,
        name: input.name,
        fullName: input.fullName,
        githubRepoId: input.githubRepoId ?? null,
        defaultBranch: input.defaultBranch,
        visibility: input.visibility,
        language: input.language ?? null,
        sizeKb: input.sizeKb ?? null,
        connectedBy: input.connectedBy ?? null,
        deletedAt: null,
      },
    });
  }

  findActiveByFullName(
    orgId: string,
    fullName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Repository | null> {
    return this.client(tx).repository.findFirst({
      where: { orgId, fullName, deletedAt: null },
    });
  }

  findDeletedByFullName(
    orgId: string,
    fullName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Repository | null> {
    return this.client(tx).repository.findFirst({
      where: { orgId, fullName, deletedAt: { not: null } },
    });
  }

  findActiveById(
    orgId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Repository | null> {
    return this.client(tx).repository.findFirst({
      where: { id, orgId, deletedAt: null },
    });
  }

  async listForOrg(
    orgId: string,
    page: number,
    pageSize: number,
    tx?: Prisma.TransactionClient,
  ): Promise<RepositoryListResult> {
    const client = this.client(tx);
    const where: Prisma.RepositoryWhereInput = { orgId, deletedAt: null };
    const [items, total] = await Promise.all([
      client.repository.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      client.repository.count({ where }),
    ]);
    return { items, total };
  }

  softDelete(id: string, tx?: Prisma.TransactionClient): Promise<Repository> {
    return this.client(tx).repository.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Active = a scan that has not reached a terminal state yet (api.md §5.5). */
  countActiveScans(
    orgId: string,
    repositoryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return this.client(tx).scan.count({
      where: {
        orgId,
        repositoryId,
        status: { in: ['queued', 'cloning', 'scanning', 'mapping'] },
      },
    });
  }

  async stats(repositoryId: string, tx?: Prisma.TransactionClient): Promise<RepositoryStats> {
    const client = this.client(tx);
    const [totalScans, recent] = await Promise.all([
      client.scan.count({ where: { repositoryId } }),
      client.scan.findMany({
        where: { repositoryId, status: 'completed', score: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { score: true },
      }),
    ]);

    const scores = recent
      .map((scan) => (scan.score === null ? null : Number(scan.score)))
      .filter((score): score is number => score !== null);
    if (scores.length === 0) {
      return { totalScans, averageScore: null, lastScore: null, trend: null };
    }

    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const lastScore = scores[0] ?? null;
    const oldest = scores[scores.length - 1] ?? null;
    const trend =
      lastScore === null || oldest === null || scores.length < 2
        ? null
        : lastScore > oldest
          ? 'up'
          : lastScore < oldest
            ? 'down'
            : 'flat';
    return { totalScans, averageScore, lastScore, trend };
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}
