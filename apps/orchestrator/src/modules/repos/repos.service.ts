import { Injectable } from '@nestjs/common';
import type { Organization, Repository } from '@prisma/client';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OrganizationsRepository } from '../identity/organizations.repository.js';
import {
  disconnectRepoSchema,
  repoListSchema,
  resolveRepoSchema,
  saveRepoSchema,
  type DisconnectRepoInput,
  type RepoListInput,
  type ResolveRepoInput,
  type SaveRepoInput,
} from './repo.schemas.js';
import type { ResolvedRepo } from './repo-resolver.service.js';
import { RepoResolverService } from './repo-resolver.service.js';
import { RepositoriesRepository } from './repositories.repository.js';

export interface ResolvedRepoView {
  fullName: string;
  defaultBranch: string;
  sizeBytes: number;
  visibility: string;
  isPublic: boolean;
}

export interface SavedRepoView {
  id: string;
  fullName: string;
  defaultBranch: string;
  visibility: string;
  connectedAt: Date;
}

export interface RepoListView {
  items: SavedRepoView[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** P2-09 / P2-12: repository resolution, save, list, detail, and disconnect. */
@Injectable()
export class ReposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsRepository,
    private readonly repos: RepositoriesRepository,
    private readonly resolver: RepoResolverService,
    private readonly audit: AuditService,
  ) {}

  async resolve(raw: ResolveRepoInput): Promise<ResolvedRepoView> {
    const input = resolveRepoSchema.parse(raw);
    const organization = await this.requireOrganization(input.orgId);
    const resolved = await this.resolver.resolve(input.githubUrl, organization.plan);
    return toResolvedView(resolved);
  }

  async save(raw: SaveRepoInput): Promise<SavedRepoView> {
    const input = saveRepoSchema.parse(raw);
    const organization = await this.requireOrganization(input.orgId);
    const resolved = await this.resolver.resolve(input.githubUrl, organization.plan);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.repos.findActiveByFullName(
        organization.id,
        resolved.fullName,
        tx,
      );
      if (existing) {
        throw new ApiError('REPO_ALREADY_CONNECTED', 'That repository is already connected.');
      }

      const record = toRecord(organization.id, resolved, input.actorUserId ?? null);
      const softDeleted = await this.repos.findDeletedByFullName(
        organization.id,
        resolved.fullName,
        tx,
      );
      const saved = softDeleted
        ? await this.repos.reactivate(softDeleted.id, record, tx)
        : await this.repos.create(record, tx);

      await this.audit.record(
        {
          orgId: organization.id,
          actorType: input.actorUserId ? 'user' : 'system',
          actorUserId: input.actorUserId ?? null,
          action: 'repo.connected',
          resourceType: 'repository',
          resourceId: saved.id,
          metadata: { fullName: saved.fullName, defaultBranch: saved.defaultBranch },
        },
        tx,
      );
      return toSavedView(saved);
    });
  }

  async list(raw: RepoListInput): Promise<RepoListView> {
    const input = repoListSchema.parse(raw);
    const { items, total } = await this.repos.listForOrg(input.orgId, input.page, input.pageSize);
    return {
      items: items.map(toSavedView),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  async detail(orgId: string, repoId: string) {
    const repo = await this.repos.findActiveById(orgId, repoId);
    if (!repo) throw new ApiError('NOT_FOUND', 'The repository does not exist.');
    const stats = await this.repos.stats(repo.id);
    return {
      id: repo.id,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
      visibility: repo.visibility,
      language: repo.language,
      sizeKb: repo.sizeKb,
      isArchived: repo.isArchived,
      connectedAt: repo.createdAt,
      lastScannedAt: repo.lastScannedAt,
      stats,
    };
  }

  /**
   * api.md §5.5: soft delete revokes future scans and hands the row to the
   * retention job, which purges repository-derived data on the org schedule.
   */
  async disconnect(raw: DisconnectRepoInput): Promise<void> {
    const input = disconnectRepoSchema.parse(raw);

    await this.prisma.$transaction(async (tx) => {
      const repo = await this.repos.findActiveById(input.orgId, input.repoId, tx);
      if (!repo) throw new ApiError('NOT_FOUND', 'The repository does not exist.');

      const activeScans = await this.repos.countActiveScans(input.orgId, repo.id, tx);
      if (activeScans > 0 && !input.force) {
        throw new ApiError('SCAN_IN_PROGRESS', 'A scan is running for this repository.');
      }

      await this.repos.softDelete(repo.id, tx);
      await this.audit.record(
        {
          orgId: input.orgId,
          actorType: input.actorUserId ? 'user' : 'system',
          actorUserId: input.actorUserId ?? null,
          action: 'repo.disconnected',
          resourceType: 'repository',
          resourceId: repo.id,
          metadata: { fullName: repo.fullName, forced: input.force },
        },
        tx,
      );
    });
  }

  private async requireOrganization(orgId: string): Promise<Organization> {
    const organization = await this.organizations.findById(orgId);
    if (!organization) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');
    return organization;
  }
}

function toRecord(orgId: string, resolved: ResolvedRepo, connectedBy: string | null) {
  return {
    orgId,
    owner: resolved.owner,
    name: resolved.name,
    fullName: resolved.fullName,
    githubRepoId: resolved.githubRepoId,
    defaultBranch: resolved.defaultBranch,
    visibility: resolved.visibility,
    language: resolved.language,
    sizeKb: resolved.sizeKb,
    connectedBy,
  };
}

function toResolvedView(resolved: ResolvedRepo): ResolvedRepoView {
  return {
    fullName: resolved.fullName,
    defaultBranch: resolved.defaultBranch,
    sizeBytes: resolved.sizeBytes,
    visibility: resolved.visibility,
    isPublic: resolved.isPublic,
  };
}

function toSavedView(repo: Repository): SavedRepoView {
  return {
    id: repo.id,
    fullName: repo.fullName,
    defaultBranch: repo.defaultBranch,
    visibility: repo.visibility,
    connectedAt: repo.createdAt,
  };
}
