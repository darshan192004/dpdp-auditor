import { Injectable } from '@nestjs/common';
import type { Organization, Repository, Scan, ScanEvent } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ApiError } from '../../common/api-error.js';
import { monthStart, PLAN_LIMITS } from '../../common/plan-limits.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QueueService } from '../../queue/queue.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OrganizationsRepository } from '../identity/organizations.repository.js';
// Value imports: `emitDecoratorMetadata` needs runtime refs for Nest DI.
import { RepoResolverService } from '../repos/repo-resolver.service.js';
import { RepositoriesRepository } from '../repos/repositories.repository.js';
import {
  ACTIVE_SCAN_STATUSES,
  cancelScanSchema,
  completeScanSchema,
  createScanSchema,
  findingsBatchSchema,
  listScansSchema,
  type CancelScanInput,
  type CompleteScan,
  type CompleteScanInput,
  type CreateScan,
  type CreateScanInput,
  type FindingsBatchInput,
  type ListScansInput,
} from './scan.schemas.js';
import { ScansRepository } from './scans.repository.js';

/** api.md §10.4: at most 500 findings or 1 MB per batch, 100 batches per scan. */
export const MAX_FINDINGS_PER_BATCH = 500;
export const MAX_BATCH_BYTES = 1024 * 1024;
export const MAX_BATCHES_PER_SCAN = 100;

export interface CreateScanResult {
  scanId: string;
  status: string;
  createdAt: Date;
  replayed: boolean;
}

export interface ScanEventView {
  type: string;
  at: Date;
  payload: unknown;
}

/**
 * P3-14 / P3-17 / P3-18 / P3-20 / P3-22 / P3-23 / P3-25.
 *
 * Scan creation is idempotent per `(orgId, Idempotency-Key)`, enforces one
 * active scan per repository+ref, and applies the plan's monthly quota. Runner
 * callbacks are accepted only while the scan is active, insert findings in one
 * transaction, and meter resource usage exactly once per scan.
 */
@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scans: ScansRepository,
    private readonly repositories: RepositoriesRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly resolver: RepoResolverService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

  async create(raw: CreateScanInput): Promise<CreateScanResult> {
    const input = createScanSchema.parse(raw);
    const organization = await this.requireOrganization(input.orgId);
    const repository = await this.resolveRepository(organization, input);
    const ref = input.ref ?? repository.defaultBranch;
    const idempotencyHash = requestHash(repository.id, ref, input.profile);

    if (input.idempotencyKey) {
      const existing = await this.scans.findByIdempotencyKey(organization.id, input.idempotencyKey);
      if (existing) {
        if (existing.idempotencyHash !== idempotencyHash) {
          throw new ApiError(
            'IDEMPOTENCY_CONFLICT',
            'This Idempotency-Key was already used with a different request.',
          );
        }
        return replay(existing);
      }
    }

    await this.assertQuota(organization);
    const active = await this.scans.findActiveForRef(
      organization.id,
      repository.id,
      ref,
      ACTIVE_SCAN_STATUSES,
    );
    if (active) {
      throw new ApiError(
        'SCAN_IN_PROGRESS',
        'A scan is already running for this repository and ref.',
      );
    }

    const scan = await this.prisma.$transaction(async (tx) => {
      const created = await this.scans.create(
        {
          orgId: organization.id,
          repositoryId: repository.id,
          requestedBy: input.requestedBy ?? null,
          apiKeyId: input.apiKeyId ?? null,
          ref,
          trigger: input.apiKeyId ? 'api' : 'manual',
          idempotencyKey: input.idempotencyKey ?? null,
          idempotencyHash: input.idempotencyKey ? idempotencyHash : null,
        },
        tx,
      );
      await this.scans.appendEvent(
        created.id,
        organization.id,
        'queued',
        { ref, profile: input.profile, repository: repository.fullName },
        tx,
      );
      return created;
    });

    try {
      await this.queue.enqueue('scan.execute', 'execute', {
        scanId: scan.id,
        orgId: organization.id,
        profile: input.profile,
      });
    } catch (error) {
      // No orphaned queued scans: the row is only useful if a job exists.
      await this.scans.update(scan.id, {
        status: 'failed',
        errorCode: 'UPSTREAM_UNAVAILABLE',
        errorMessage: 'The scan queue is unavailable.',
        completedAt: new Date(),
      });
      await this.scans.appendEvent(scan.id, organization.id, 'failed', {
        code: 'UPSTREAM_UNAVAILABLE',
      });
      throw error;
    }

    return { scanId: scan.id, status: scan.status, createdAt: scan.createdAt, replayed: false };
  }

  async detail(orgId: string, scanId: string) {
    const scan = await this.requireScan(orgId, scanId);
    return toDetail(scan);
  }

  async list(raw: ListScansInput) {
    const input = listScansSchema.parse(raw);
    const { items, total } = await this.scans.list(input.orgId, input);
    return {
      items: items.map(toSummary),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  async events(orgId: string, scanId: string): Promise<ScanEventView[]> {
    await this.requireScan(orgId, scanId);
    const events = await this.scans.listEvents(scanId);
    return events.map(toEventView);
  }

  /** api.md §3.4: only a non-terminal scan can be cancelled. */
  async cancel(orgId: string, scanId: string, raw: Omit<CancelScanInput, 'orgId'>) {
    const input = cancelScanSchema.parse({ orgId, ...raw });
    const scan = await this.requireScan(orgId, scanId);
    if (!isActive(scan.status)) {
      throw new ApiError('INVALID_STATE_TRANSITION', 'Only a running scan can be cancelled.');
    }

    const cancelledAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.scans.update(
        scan.id,
        { status: 'cancelled', completedAt: cancelledAt, errorCode: null, errorMessage: null },
        tx,
      );
      await this.scans.appendEvent(
        scan.id,
        orgId,
        'cancelled',
        { reason: input.reason ?? null },
        tx,
      );
      await this.audit.record(
        {
          orgId,
          actorType: 'system',
          action: 'scan.cancelled',
          resourceType: 'scan',
          resourceId: scan.id,
          metadata: { reason: input.reason ?? null },
        },
        tx,
      );
    });

    return { id: scan.id, status: 'cancelled', cancelledAt };
  }

  /** api.md §10.4: batched, idempotent findings upload from the runner. */
  async recordFindings(
    orgId: string,
    scanId: string,
    raw: FindingsBatchInput,
  ): Promise<{ accepted: number; duplicates: number }> {
    const scan = await this.requireScan(orgId, scanId);
    if (!isActive(scan.status)) {
      throw new ApiError('INVALID_STATE_TRANSITION', 'The scan is no longer accepting findings.');
    }

    const batch = findingsBatchSchema.parse(raw);
    if (batch.findings.length > MAX_FINDINGS_PER_BATCH) {
      throw new ApiError(
        'PAYLOAD_TOO_LARGE',
        `A batch may contain at most ${MAX_FINDINGS_PER_BATCH} findings.`,
      );
    }
    if (Buffer.byteLength(JSON.stringify(batch), 'utf8') > MAX_BATCH_BYTES) {
      throw new ApiError('PAYLOAD_TOO_LARGE', 'A batch may not exceed 1 MB.');
    }
    if ((await this.scans.countBatches(scan.id)) >= MAX_BATCHES_PER_SCAN) {
      throw new ApiError('RATE_LIMITED', 'This scan has reached its batch limit.');
    }
    if (await this.scans.findBatch(scan.id, batch.batchId)) {
      return { accepted: 0, duplicates: batch.findings.length };
    }

    return this.prisma.$transaction(async (tx) => {
      const counts = await this.scans.insertFindings(scan.id, orgId, batch, tx);
      await this.scans.appendEvent(
        scan.id,
        orgId,
        'findings_batch',
        {
          batchId: batch.batchId,
          scanner: batch.scanner,
          accepted: counts.accepted,
          duplicates: counts.duplicates,
        },
        tx,
      );
      if (scan.status === 'queued' || scan.status === 'cloning') {
        await this.scans.update(
          scan.id,
          { status: 'scanning', startedAt: scan.startedAt ?? new Date() },
          tx,
        );
      }
      return counts;
    });
  }

  /** api.md §10.5: recompute coverage, record usage, and move to `mapping`. */
  async complete(orgId: string, scanId: string, raw: CompleteScanInput) {
    const scan = await this.requireScan(orgId, scanId);
    if (!isActive(scan.status)) {
      throw new ApiError('INVALID_STATE_TRANSITION', 'The scan is already terminal.');
    }

    const input = completeScanSchema.parse(raw);
    const coverage = Object.fromEntries(
      input.scanners.map((scanner) => [scanner.name, scanner.status]),
    );
    const scannerVersions = Object.fromEntries(
      input.scanners
        .filter((scanner) => scanner.version !== undefined)
        .map((scanner) => [scanner.name, scanner.version as string]),
    );

    await this.prisma.$transaction(async (tx) => {
      await this.scans.update(
        scan.id,
        {
          status: 'mapping',
          coverage,
          scannerVersions,
          ...(input.commitSha ? { commitSha: input.commitSha } : {}),
          startedAt: scan.startedAt ?? new Date(),
        },
        tx,
      );
      for (const scanner of input.scanners) {
        await this.scans.appendEvent(
          scan.id,
          orgId,
          scannerEventType(scanner.status),
          {
            scanner: scanner.name,
            findings: scanner.findings,
            ...(scanner.durationMs === undefined ? {} : { durationMs: scanner.durationMs }),
          },
          tx,
        );
      }
      await this.scans.appendEvent(scan.id, orgId, 'mapping_started', { coverage }, tx);
      await this.scans.recordUsage(
        usageFor(scan.id, orgId, input.scanners, input.workspaceBytes ?? 0),
        tx,
      );
    });

    return { scanId: scan.id, status: 'mapping', coverage };
  }

  private async resolveRepository(
    organization: Organization,
    input: CreateScan,
  ): Promise<Repository> {
    if (input.repositoryId) {
      const repository = await this.repositories.findActiveById(
        organization.id,
        input.repositoryId,
      );
      if (!repository) throw new ApiError('NOT_FOUND', 'The repository does not exist.');
      return repository;
    }

    const resolved = await this.resolver.resolve(input.githubUrl as string, organization.plan);
    const existing = await this.repositories.findActiveByFullName(
      organization.id,
      resolved.fullName,
    );
    if (existing) return existing;

    return this.repositories.create({
      orgId: organization.id,
      owner: resolved.owner,
      name: resolved.name,
      fullName: resolved.fullName,
      githubRepoId: resolved.githubRepoId,
      defaultBranch: resolved.defaultBranch,
      visibility: resolved.visibility,
      language: resolved.language,
      sizeKb: resolved.sizeKb,
      connectedBy: input.requestedBy ?? null,
    });
  }

  private async assertQuota(organization: Organization): Promise<void> {
    const limit = PLAN_LIMITS[organization.plan].scansPerMonth;
    if (limit === null) return;

    const used = await this.scans.countCreatedSince(organization.id, monthStart(new Date()));
    if (used >= limit) {
      throw new ApiError(
        'PLAN_LIMIT_EXCEEDED',
        `The ${organization.plan} plan allows ${limit} scans per month.`,
      );
    }
  }

  private async requireOrganization(orgId: string): Promise<Organization> {
    const organization = await this.organizations.findById(orgId);
    if (!organization) throw new ApiError('NOT_FOUND', 'The organisation does not exist.');
    return organization;
  }

  private async requireScan(orgId: string, scanId: string) {
    const scan = await this.scans.findById(orgId, scanId);
    if (!scan) throw new ApiError('NOT_FOUND', 'The scan does not exist.');
    return scan;
  }
}

function isActive(status: string): boolean {
  return (ACTIVE_SCAN_STATUSES as readonly string[]).includes(status);
}

function replay(scan: Scan): CreateScanResult {
  return { scanId: scan.id, status: scan.status, createdAt: scan.createdAt, replayed: true };
}

/** Digest of the fields that define a scan request, for IDEMPOTENCY_CONFLICT. */
export function requestHash(repositoryId: string, ref: string, profile: string): string {
  return createHash('sha256').update(`${repositoryId}:${ref}:${profile}`, 'utf8').digest('hex');
}

/** Stable per-scan id so a replayed completion callback cannot double-meter. */
export function usageEventId(scanId: string): string {
  const hex = createHash('sha256').update(`usage:${scanId}`, 'utf8').digest('hex').slice(0, 32);
  const chars = hex.split('');
  chars[12] = '5';
  chars[16] = ((parseInt(chars[16] as string, 16) & 0x3) | 0x8).toString(16);
  const value = chars.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

/**
 * P3-25: per-scan resource accounting. `storage_byte_hour` is the GiB-hour
 * quantity from the completion payload; CPU time rides along in metadata.
 */
export function usageFor(
  scanId: string,
  orgId: string,
  scanners: CompleteScan['scanners'],
  workspaceBytes: number,
) {
  const durationMs = scanners.reduce((total, scanner) => total + (scanner.durationMs ?? 0), 0);
  const gibHours = (workspaceBytes / 1024 ** 3) * (durationMs / 3_600_000);
  return {
    orgId,
    scanId,
    eventType: 'storage_byte_hour' as const,
    eventId: usageEventId(scanId),
    quantity: Math.round(gibHours * 10_000) / 10_000,
    metadata: {
      cpuMillis: durationMs,
      workspaceBytes,
      scanners: Object.fromEntries(
        scanners.map((scanner) => [scanner.name, scanner.durationMs ?? null]),
      ),
    },
  };
}

export function scannerEventType(status: string): string {
  return status === 'completed' ? 'scanner_completed' : `scanner_${status}`;
}

type ScanWithRepository = Scan & { repository: Repository };

function toSummary(scan: ScanWithRepository) {
  return {
    id: scan.id,
    repositoryId: scan.repositoryId,
    repositoryFullName: scan.repository.fullName,
    status: scan.status,
    score: scan.score === null ? null : Number(scan.score),
    grade: scan.grade,
    counts: scan.counts,
    createdAt: scan.createdAt,
    completedAt: scan.completedAt,
  };
}

function toDetail(scan: ScanWithRepository) {
  return {
    id: scan.id,
    repository: {
      id: scan.repository.id,
      fullName: scan.repository.fullName,
      visibility: scan.repository.visibility,
    },
    status: scan.status,
    ref: scan.ref,
    commitSha: scan.commitSha,
    score: scan.score === null ? null : Number(scan.score),
    grade: scan.grade,
    sectionScores: scan.sectionScores,
    counts: scan.counts,
    coverage: scan.coverage,
    scannerVersions: scan.scannerVersions,
    rulePackVersion: scan.rulePackVersion,
    scoringVersion: scan.scoringVersion,
    error: scan.errorCode ? { code: scan.errorCode, message: scan.errorMessage } : null,
    timestamps: {
      queuedAt: scan.queuedAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      durationMs: scan.durationMs,
    },
    links: {
      findings: `/api/v1/scan/${scan.id}/findings`,
      events: `/api/v1/scan/${scan.id}/events`,
      report: '/api/v1/report/pdf',
    },
  };
}

function toEventView(event: ScanEvent): ScanEventView {
  return { type: event.type, at: event.createdAt, payload: event.payload };
}
