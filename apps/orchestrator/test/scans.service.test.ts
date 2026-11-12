import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { Repository, Scan } from '@prisma/client';
import type { OrgPlan } from '@prisma/client';
import {
  ScansService,
  requestHash,
  usageEventId,
  usageFor,
} from '../src/modules/scans/scans.service.js';
import type { ScansRepository } from '../src/modules/scans/scans.repository.js';
import type { RepositoriesRepository } from '../src/modules/repos/repositories.repository.js';
import type { RepoResolverService } from '../src/modules/repos/repo-resolver.service.js';
import type { OrganizationsRepository } from '../src/modules/identity/organizations.repository.js';
import type { QueueService } from '../src/queue/queue.service.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';
import type { ScanScoringService } from '../src/modules/scoring/scan-scoring.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '55555555-5555-4555-8555-555555555555';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '22222222-2222-4222-9222-222222222222';
const URL = 'https://github.com/acme/payments-service';

const ORG = { id: ORG_ID, name: 'Acme', slug: 'acme', plan: 'free' as OrgPlan };

function repository(overrides: Partial<Repository> = {}): Repository {
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
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function scan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: SCAN_ID,
    orgId: ORG_ID,
    repositoryId: REPO_ID,
    requestedBy: null,
    apiKeyId: null,
    trigger: 'manual',
    status: 'queued',
    ref: 'main',
    commitSha: null,
    scannerVersions: {},
    rulePackVersion: null,
    scoringVersion: null,
    score: null,
    grade: null,
    sectionScores: {},
    counts: {},
    coverage: {},
    coverageStatus: null,
    facts: {},
    errorCode: null,
    errorMessage: null,
    idempotencyKey: null,
    idempotencyHash: null,
    jobName: null,
    secretName: null,
    queuedAt: new Date('2026-11-12T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    durationMs: null,
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    updatedAt: new Date('2026-11-12T00:00:00.000Z'),
    ...overrides,
  };
}

function make(options?: { scan?: Scan | null; repo?: Repository | null; org?: typeof ORG | null }) {
  const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: vi.fn(async (fn: (client: Prisma.TransactionClient) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const scans = {
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findById: vi
      .fn()
      .mockResolvedValue(
        options?.scan === null ? null : { ...(options?.scan ?? scan()), repository: repository() },
      ),
    create: vi.fn().mockResolvedValue(scan()),
    countCreatedSince: vi.fn().mockResolvedValue(0),
    findActiveForRef: vi.fn().mockResolvedValue(null),
    findPreviousCompletedScore: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    update: vi.fn().mockResolvedValue(scan()),
    appendEvent: vi.fn().mockResolvedValue({}),
    listEvents: vi.fn().mockResolvedValue([]),
    countBatches: vi.fn().mockResolvedValue(0),
    findBatch: vi.fn().mockResolvedValue(null),
    insertFindings: vi.fn().mockResolvedValue({ accepted: 1, duplicates: 0 }),
    recordUsage: vi.fn().mockResolvedValue(true),
  };
  const repositories = {
    findActiveById: vi.fn().mockResolvedValue(options?.repo === null ? null : repository()),
    findActiveByFullName: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(repository()),
  };
  const organizations = {
    findById: vi.fn().mockResolvedValue(options?.org === null ? null : (options?.org ?? ORG)),
  };
  const resolver = {
    resolve: vi.fn().mockResolvedValue({
      owner: 'acme',
      name: 'payments-service',
      fullName: 'acme/payments-service',
      canonicalUrl: URL,
      githubRepoId: 1n,
      defaultBranch: 'main',
      sizeKb: 1024,
      sizeBytes: 1024 * 1024,
      visibility: 'public',
      isPublic: true,
      isArchived: false,
      language: 'TypeScript',
    }),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue({}) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const scoring = {
    mapAndScore: vi.fn().mockResolvedValue({
      score: 100,
      grade: 'A',
      sectionScores: { '8(4)': 100 },
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      coverage: 'full',
      rulePackVersion: 'dpdpa-2026.10.1',
      scoringVersion: '1.0.0',
      findings: { mapped: 0, unmapped: 0, new: 0, persistent: 0, reopened: 0, resolved: 0 },
    }),
    scorePersisted: vi.fn().mockResolvedValue({
      loaded: { pack: 'dpdpa-2026.10.1', scoringVersion: '1.0.0' },
      result: {
        score: 72.5,
        grade: 'C',
        sectionScores: { '8(4)': 66.67 },
        counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
        coverage: 'full',
      },
    }),
  };

  const service = new ScansService(
    prisma,
    scans as unknown as ScansRepository,
    repositories as unknown as RepositoriesRepository,
    organizations as unknown as OrganizationsRepository,
    resolver as unknown as RepoResolverService,
    queue as unknown as QueueService,
    audit as unknown as AuditService,
    scoring as unknown as ScanScoringService,
  );
  return { service, tx, scans, repositories, organizations, resolver, queue, audit, scoring };
}

describe('ScansService.create', () => {
  it('creates a queued scan for a saved repository and enqueues a job', async () => {
    const { service, scans, queue, tx } = make();

    await expect(
      service.create({ orgId: ORG_ID, repositoryId: REPO_ID, requestedBy: USER_ID }),
    ).resolves.toEqual({
      scanId: SCAN_ID,
      status: 'queued',
      createdAt: scan().createdAt,
      replayed: false,
    });

    expect(scans.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        repositoryId: REPO_ID,
        ref: 'main',
        trigger: 'manual',
        requestedBy: USER_ID,
      }),
      tx,
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'queued',
      { ref: 'main', profile: 'standard', repository: 'acme/payments-service' },
      tx,
    );
    expect(queue.enqueue).toHaveBeenCalledWith('scan.execute', 'execute', {
      scanId: SCAN_ID,
      orgId: ORG_ID,
      profile: 'standard',
    });
  });

  it('marks API-key scans with the api trigger', async () => {
    const { service, scans } = make();
    await service.create({ orgId: ORG_ID, repositoryId: REPO_ID, apiKeyId: USER_ID });
    expect(scans.create).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'api', apiKeyId: USER_ID }),
      expect.anything(),
    );
  });

  it('resolves a githubUrl and creates the repository when it is not saved', async () => {
    const { service, repositories, resolver } = make();

    await service.create({ orgId: ORG_ID, githubUrl: URL });

    expect(resolver.resolve).toHaveBeenCalledWith(URL, 'free');
    expect(repositories.create).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, fullName: 'acme/payments-service' }),
    );
  });

  it('reuses an existing repository for the same URL', async () => {
    const { service, repositories } = make();
    repositories.findActiveByFullName.mockResolvedValue(repository());

    await service.create({ orgId: ORG_ID, githubUrl: URL });

    expect(repositories.create).not.toHaveBeenCalled();
  });

  it('replays an idempotent request with the same body', async () => {
    const { service, scans, queue } = make();
    const hash = requestHash(REPO_ID, 'main', 'standard');
    scans.findByIdempotencyKey.mockResolvedValue(
      scan({ idempotencyKey: 'key-1', idempotencyHash: hash, status: 'scanning' }),
    );

    await expect(
      service.create({ orgId: ORG_ID, repositoryId: REPO_ID, idempotencyKey: 'key-1' }),
    ).resolves.toMatchObject({ replayed: true, status: 'scanning' });
    expect(scans.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a reused key with a different body', async () => {
    const { service, scans } = make();
    scans.findByIdempotencyKey.mockResolvedValue(
      scan({ idempotencyKey: 'key-1', idempotencyHash: requestHash(REPO_ID, 'dev', 'standard') }),
    );

    await expect(
      service.create({ orgId: ORG_ID, repositoryId: REPO_ID, idempotencyKey: 'key-1' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('enforces the monthly plan quota', async () => {
    const { service, scans } = make();
    scans.countCreatedSince.mockResolvedValue(5);

    await expect(service.create({ orgId: ORG_ID, repositoryId: REPO_ID })).rejects.toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
    });
    expect(scans.countCreatedSince).toHaveBeenCalledWith(ORG_ID, expect.any(Date));
  });

  it('does not count scans for unlimited plans', async () => {
    const { service, scans } = make({ org: { ...ORG, plan: 'enterprise' } });
    await service.create({ orgId: ORG_ID, repositoryId: REPO_ID });
    expect(scans.countCreatedSince).not.toHaveBeenCalled();
  });

  it('rejects a second active scan for the same ref', async () => {
    const { service, scans } = make();
    scans.findActiveForRef.mockResolvedValue(scan({ status: 'scanning' }));

    await expect(service.create({ orgId: ORG_ID, repositoryId: REPO_ID })).rejects.toMatchObject({
      code: 'SCAN_IN_PROGRESS',
    });
  });

  it('rejects unknown organisations and repositories', async () => {
    const missingOrg = make({ org: null });
    await expect(
      missingOrg.service.create({ orgId: ORG_ID, repositoryId: REPO_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const missingRepo = make({ repo: null });
    await expect(
      missingRepo.service.create({ orgId: ORG_ID, repositoryId: REPO_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('validates the request body', async () => {
    const { service } = make();
    await expect(service.create({ orgId: ORG_ID })).rejects.toThrow();
    await expect(
      service.create({ orgId: ORG_ID, repositoryId: REPO_ID, githubUrl: URL }),
    ).rejects.toThrow();
    await expect(
      service.create({ orgId: ORG_ID, repositoryId: REPO_ID, ref: 'bad ref!' }),
    ).rejects.toThrow();
  });

  it('fails the scan when the queue is unavailable', async () => {
    const { service, scans, queue } = make();
    const error = new Error('queue down');
    queue.enqueue.mockRejectedValue(error);

    await expect(service.create({ orgId: ORG_ID, repositoryId: REPO_ID })).rejects.toThrow(
      'queue down',
    );
    expect(scans.update).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({ status: 'failed', errorCode: 'UPSTREAM_UNAVAILABLE' }),
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(SCAN_ID, ORG_ID, 'failed', {
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });
});

describe('ScansService reads', () => {
  it('returns scan detail with repository and links', async () => {
    const { service } = make();
    await expect(service.detail(ORG_ID, SCAN_ID)).resolves.toMatchObject({
      id: SCAN_ID,
      repository: { id: REPO_ID, fullName: 'acme/payments-service' },
      status: 'queued',
      timestamps: { queuedAt: scan().queuedAt },
      links: { events: `/api/v1/scan/${SCAN_ID}/events` },
    });
  });

  it('maps an error code into the error object', async () => {
    const { service } = make({
      scan: scan({ status: 'failed', errorCode: 'INTERNAL_ERROR', errorMessage: 'boom' }),
    });
    await expect(service.detail(ORG_ID, SCAN_ID)).resolves.toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });
  });

  it('adds the previous completed score to a completed scan', async () => {
    const { service, scans } = make({
      scan: scan({ status: 'completed', score: new Prisma.Decimal(72.5), grade: 'C' }),
    });
    scans.findPreviousCompletedScore.mockResolvedValue({
      score: new Prisma.Decimal(68.3),
    });

    await expect(service.detail(ORG_ID, SCAN_ID)).resolves.toMatchObject({
      score: 72.5,
      grade: 'C',
      previousScore: 68.3,
    });
    expect(scans.findPreviousCompletedScore).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ id: SCAN_ID, repositoryId: REPO_ID }),
    );
  });

  it('reports no previous score for the first completed scan', async () => {
    const { service } = make({
      scan: scan({ status: 'completed', score: new Prisma.Decimal(72.5), grade: 'C' }),
    });

    await expect(service.detail(ORG_ID, SCAN_ID)).resolves.toMatchObject({
      previousScore: null,
    });
  });

  it('does not look up a previous score for an unfinished scan', async () => {
    const { service, scans } = make();

    await service.detail(ORG_ID, SCAN_ID);

    expect(scans.findPreviousCompletedScore).not.toHaveBeenCalled();
  });

  it('rejects an unknown scan', async () => {
    const { service } = make({ scan: null });
    await expect(service.detail(ORG_ID, SCAN_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.events(ORG_ID, SCAN_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists scans with pagination and a numeric score', async () => {
    const { service, scans } = make();
    scans.list.mockResolvedValue({
      items: [
        { ...scan({ score: '72.40' as unknown as Scan['score'] }), repository: repository() },
      ],
      total: 3,
    });

    const result = await service.list({ orgId: ORG_ID, page: 2, pageSize: 2 });

    expect(scans.list).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ page: 2, pageSize: 2 }),
    );
    expect(result.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(result.items[0]).toMatchObject({
      id: SCAN_ID,
      repositoryFullName: 'acme/payments-service',
      score: 72.4,
    });
  });

  it('maps scan events to the timeline shape', async () => {
    const { service, scans } = make();
    scans.listEvents.mockResolvedValue([
      {
        id: 1n,
        scanId: SCAN_ID,
        orgId: ORG_ID,
        type: 'queued',
        payload: {},
        createdAt: new Date('2026-11-12T00:00:00.000Z'),
      },
    ]);

    await expect(service.events(ORG_ID, SCAN_ID)).resolves.toEqual([
      { type: 'queued', at: new Date('2026-11-12T00:00:00.000Z'), payload: {} },
    ]);
  });
});

describe('ScansService.cancel', () => {
  it('cancels an active scan, appends an event, and audits', async () => {
    const { service, scans, audit, tx } = make();

    const result = await service.cancel(ORG_ID, SCAN_ID, { reason: 'superseded' });

    expect(result).toMatchObject({ id: SCAN_ID, status: 'cancelled' });
    expect(scans.update).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({ status: 'cancelled', completedAt: expect.any(Date) }),
      tx,
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'cancelled',
      { reason: 'superseded' },
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'scan.cancelled', resourceId: SCAN_ID }),
      tx,
    );
  });

  it('rejects cancelling a terminal scan', async () => {
    const { service } = make({ scan: scan({ status: 'completed' }) });
    await expect(service.cancel(ORG_ID, SCAN_ID, {})).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });
});

describe('ScansService.recordFindings', () => {
  const BATCH = {
    batchId: 'bat_1',
    scanner: 'semgrep' as const,
    scannerVersion: '1.95.0',
    findings: [
      {
        scannerRuleId: 'rule-1',
        severity: 'high' as const,
        message: 'Personal data logged',
        fingerprint: 'fpt_1',
      },
    ],
  };

  it('inserts a batch, records the batch id, and starts scanning', async () => {
    const { service, scans, tx } = make();

    await expect(service.recordFindings(ORG_ID, SCAN_ID, BATCH)).resolves.toEqual({
      accepted: 1,
      duplicates: 0,
    });

    expect(scans.insertFindings).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      expect.objectContaining({ batchId: 'bat_1' }),
      tx,
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'findings_batch',
      expect.objectContaining({ batchId: 'bat_1', accepted: 1 }),
      tx,
    );
    expect(scans.update).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({ status: 'scanning' }),
      tx,
    );
  });

  it('does not restart a scan that is already scanning', async () => {
    const { service, scans } = make({ scan: scan({ status: 'scanning' }) });
    await service.recordFindings(ORG_ID, SCAN_ID, BATCH);
    expect(scans.update).not.toHaveBeenCalled();
  });

  it('treats a replayed batch as a duplicate', async () => {
    const { service, scans } = make();
    scans.findBatch.mockResolvedValue({} as never);

    await expect(service.recordFindings(ORG_ID, SCAN_ID, BATCH)).resolves.toEqual({
      accepted: 0,
      duplicates: 1,
    });
    expect(scans.insertFindings).not.toHaveBeenCalled();
  });

  it('rejects oversized batches and scans that are no longer active', async () => {
    const { service } = make();
    const tooMany = {
      ...BATCH,
      findings: Array.from({ length: 501 }, (_, index) => ({
        ...BATCH.findings[0]!,
        fingerprint: `fpt_${index}`,
      })),
    };
    await expect(service.recordFindings(ORG_ID, SCAN_ID, tooMany)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });

    const tooBig = {
      ...BATCH,
      findings: [{ ...BATCH.findings[0]!, context: { blob: 'x'.repeat(1024 * 1024) } }],
    };
    await expect(service.recordFindings(ORG_ID, SCAN_ID, tooBig)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });

    const terminal = make({ scan: scan({ status: 'cancelled' }) });
    await expect(terminal.service.recordFindings(ORG_ID, SCAN_ID, BATCH)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('rejects a scan that reached its batch limit', async () => {
    const { service, scans } = make();
    scans.countBatches.mockResolvedValue(100);
    await expect(service.recordFindings(ORG_ID, SCAN_ID, BATCH)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('ScansService.complete', () => {
  const COMPLETION = {
    scanners: [
      {
        name: 'semgrep' as const,
        status: 'completed' as const,
        version: '1.95.0',
        durationMs: 60_000,
        findings: 2,
      },
      {
        name: 'gitleaks' as const,
        status: 'timed_out' as const,
        version: '8.21.2',
        durationMs: 30_000,
        findings: 0,
      },
    ],
    commitSha: 'a'.repeat(40),
    workspaceBytes: 1024 ** 3,
  };

  it('maps and scores the scan, records coverage, events, and usage', async () => {
    const { service, scans, tx } = make();

    await expect(service.complete(ORG_ID, SCAN_ID, COMPLETION)).resolves.toEqual({
      scanId: SCAN_ID,
      status: 'completed',
      coverage: { semgrep: 'completed', gitleaks: 'timed_out' },
      score: 100,
      grade: 'A',
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    });

    expect(scans.update).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({
        status: 'mapping',
        coverage: { semgrep: 'completed', gitleaks: 'timed_out' },
        scannerVersions: { semgrep: '1.95.0', gitleaks: '8.21.2' },
        commitSha: 'a'.repeat(40),
      }),
      tx,
    );
    expect(scans.update).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({
        status: 'completed',
        grade: 'A',
        coverageStatus: 'full',
        rulePackVersion: 'dpdpa-2026.10.1',
        scoringVersion: '1.0.0',
      }),
      tx,
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'score_computed',
      expect.objectContaining({ score: 100, grade: 'A', coverage: 'full' }),
      tx,
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'scanner_completed',
      expect.objectContaining({ scanner: 'semgrep', findings: 2 }),
      tx,
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'scanner_timed_out',
      expect.objectContaining({ scanner: 'gitleaks' }),
      tx,
    );
    expect(scans.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        scanId: SCAN_ID,
        eventType: 'storage_byte_hour',
        quantity: 0.025,
      }),
      tx,
    );
  });

  it('rejects a callback for a terminal scan', async () => {
    const { service } = make({ scan: scan({ status: 'cancelled' }) });
    await expect(service.complete(ORG_ID, SCAN_ID, COMPLETION)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('validates the completion payload', async () => {
    const { service } = make();
    await expect(service.complete(ORG_ID, SCAN_ID, { scanners: [] })).rejects.toThrow();
  });
});

describe('ScansService.rescore (P4-24)', () => {
  it('derives a score and records it without rewriting the scan row', async () => {
    const { service, scans, scoring, audit, tx } = make({
      scan: scan({
        status: 'completed',
        score: { toString: () => '90.00' } as unknown as Scan['score'],
        grade: 'A',
        sectionScores: { '8(4)': 90 },
        counts: { critical: 0, high: 1, medium: 0, low: 0, info: 0, total: 1 },
        coverage: { semgrep: 'completed' },
        coverageStatus: 'full',
        facts: { languages: ['python'], frameworks: [], resourceTypes: [] },
      }),
    });

    const result = await service.rescore(ORG_ID, SCAN_ID);

    expect(scoring.scorePersisted).toHaveBeenCalledWith(
      expect.objectContaining({ id: SCAN_ID }),
      { languages: ['python'], frameworks: [], resourceTypes: [] },
      tx,
    );
    expect(scans.update).not.toHaveBeenCalled();
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'score_recomputed',
      {
        original: {
          score: 90,
          grade: 'A',
          sectionScores: { '8(4)': 90 },
          counts: { critical: 0, high: 1, medium: 0, low: 0, info: 0, total: 1 },
        },
        derived: {
          score: 72.5,
          grade: 'C',
          coverage: 'full',
          sectionScores: { '8(4)': 66.67 },
          counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
        },
      },
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scan.rescored',
        resourceType: 'scan',
        resourceId: SCAN_ID,
        metadata: {
          originalScore: 90,
          originalGrade: 'A',
          derivedScore: 72.5,
          derivedGrade: 'C',
        },
      }),
      tx,
    );
    expect(result).toMatchObject({
      scanId: SCAN_ID,
      status: 'completed',
      derived: { score: 72.5, grade: 'C' },
    });
  });

  it('rejects a scan that has not completed', async () => {
    const { service, scoring } = make({ scan: scan({ status: 'scanning' }) });

    await expect(service.rescore(ORG_ID, SCAN_ID)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    expect(scoring.scorePersisted).not.toHaveBeenCalled();
  });

  it('rejects a scan from another organisation', async () => {
    const { service } = make({ scan: null });

    await expect(service.rescore(ORG_ID, SCAN_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('scan metering helpers', () => {
  it('derives a stable uuid-shaped event id per scan', () => {
    const id = usageEventId(SCAN_ID);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(usageEventId(SCAN_ID)).toBe(id);
    expect(usageEventId('other')).not.toBe(id);
  });

  it('computes GiB-hours and CPU time', () => {
    const usage = usageFor(
      SCAN_ID,
      ORG_ID,
      [
        { name: 'semgrep', status: 'completed', findings: 1, durationMs: 3_600_000 },
        { name: 'checkov', status: 'completed', findings: 0 },
      ],
      2 * 1024 ** 3,
    );
    expect(usage.quantity).toBe(2);
    expect(usage.metadata).toEqual({
      cpuMillis: 3_600_000,
      workspaceBytes: 2 * 1024 ** 3,
      scanners: { semgrep: 3_600_000, checkov: null },
    });
  });
});
