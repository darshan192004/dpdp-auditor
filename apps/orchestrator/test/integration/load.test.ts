import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScansService } from '../../src/modules/scans/scans.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import type { ScansRepository } from '../../src/modules/scans/scans.repository.js';
import type { RepositoriesRepository } from '../../src/modules/repos/repositories.repository.js';
import type { RepoResolverService } from '../../src/modules/repos/repo-resolver.service.js';
import type { OrganizationsRepository } from '../../src/modules/identity/organizations.repository.js';
import type { QueueService } from '../../src/queue/queue.service.js';
import type { AuditService } from '../../src/modules/audit/audit.service.js';
import type { ScanScoringService } from '../../src/modules/scoring/scan-scoring.service.js';
import type { EmailService } from '../../src/modules/reports/email.service.js';

// Minimal constants used across tests
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '55555555-5555-4555-8555-555555555555';

interface ScanRecord {
  id: string;
  orgId: string;
  repositoryId: string;
  requestedBy: string | null;
  apiKeyId: string | null;
  trigger: string;
  status: string;
  ref: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  idempotencyKey: string | null;
  idempotencyHash: string | null;
  repository?: unknown;
}

interface RepoFixture {
  id: string;
  orgId: string;
  owner: string;
  name: string;
  githubRepoId: bigint;
  fullName: string;
  defaultBranch: string;
  visibility: string;
  language: string;
  sizeKb: number;
  isArchived: boolean;
  connectedBy: string | null;
  lastScannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function repository(): RepoFixture {
  return {
    id: REPO_ID,
    orgId: ORG_ID,
    owner: 'acme',
    name: 'demo',
    githubRepoId: 1n,
    fullName: 'acme/demo',
    defaultBranch: 'main',
    visibility: 'public',
    language: 'TypeScript',
    sizeKb: 1024,
    isArchived: false,
    connectedBy: null,
    lastScannedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

type ScanStore = Map<string, ScanRecord>;

function makeService() {
  const scansStore: ScanStore = new Map();

  const prisma = {
    $transaction: vi.fn(async (fn: (tx: object) => unknown) => fn({})),
  } as unknown as PrismaService;

  const scans = {
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockImplementation(async (_orgId: string, scanId: string) => {
      const scan = scansStore.get(scanId);
      if (!scan) return null;
      return { ...scan, repository: repository() } as unknown as never;
    }),
    create: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
      const id = `scan-${Math.random().toString(36).substring(2, 12)}`;
      const now = new Date();
      const scan: ScanRecord = {
        id,
        orgId: data.orgId as string,
        repositoryId: data.repositoryId as string,
        requestedBy: (data.requestedBy as string) ?? null,
        apiKeyId: (data.apiKeyId as string) ?? null,
        trigger: (data.trigger as string) ?? 'manual',
        status: 'queued',
        ref: (data.ref as string) ?? 'main',
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        idempotencyKey: (data.idempotencyKey as string) ?? null,
        idempotencyHash: (data.idempotencyHash as string) ?? null,
      };
      scansStore.set(id, scan);
      return scan;
    }),
    countCreatedSince: vi.fn().mockResolvedValue(0),
    findActiveForRef: vi.fn().mockResolvedValue(null),
    findPreviousCompletedScore: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockImplementation(async (id: string, changes: Record<string, unknown>) => {
      const scan = scansStore.get(id);
      if (!scan) return null;
      Object.assign(scan, changes);
      scan.updatedAt = new Date();
      return scan;
    }),
    appendEvent: vi.fn().mockResolvedValue({}),
    listEvents: vi.fn().mockResolvedValue([]),
    countBatches: vi.fn().mockResolvedValue(0),
    findBatch: vi.fn().mockResolvedValue(null),
    insertFindings: vi.fn().mockResolvedValue({ accepted: 0, duplicates: 0 }),
    recordUsage: vi.fn().mockResolvedValue(true),
  } as unknown as ScansRepository;

  const repositories = {
    findActiveById: vi.fn().mockResolvedValue(repository()),
    findActiveByFullName: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(repository()),
  } as unknown as RepositoriesRepository;

  const organizations = {
    findById: vi.fn().mockResolvedValue({
      id: ORG_ID,
      name: 'Acme',
      slug: 'acme',
      plan: 'free' as never,
    }),
  } as unknown as OrganizationsRepository;

  const resolver = {
    resolve: vi.fn().mockResolvedValue({
      owner: 'acme',
      name: 'demo',
      fullName: 'acme/demo',
      canonicalUrl: 'https://github.com/acme/demo',
      githubRepoId: 1n,
      defaultBranch: 'main',
      sizeKb: 1024,
      sizeBytes: 1024 * 1024,
      visibility: 'public',
      isPublic: true,
      isArchived: false,
      language: 'TypeScript',
    }),
  } as unknown as RepoResolverService;

  const queue = {
    enqueue: vi
      .fn()
      .mockImplementation(
        async (_name: string, _jobName: string, data: Record<string, unknown>) => {
          const delay = Math.random() * 2000 + 500;
          setTimeout(() => {
            scans.update(data.scanId as string, { status: 'completed', completedAt: new Date() });
          }, delay);
          return {} as unknown as never;
        },
      ),
    queue: () => {},
    dlq: () => {},
    onModuleDestroy: async () => {},
  } as unknown as QueueService;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const scoring = { mapAndScore: vi.fn().mockResolvedValue({}) } as unknown as ScanScoringService;
  const email = {
    sendReportReady: vi.fn().mockResolvedValue(undefined),
    sendScanCompleted: vi.fn().mockResolvedValue(undefined),
    sendScanFailed: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmailService;

  const service = new ScansService(
    prisma,
    scans,
    repositories,
    organizations,
    resolver,
    queue,
    audit,
    scoring,
    email,
  );

  return { service, scansStore };
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[idx]!;
}

describe('P6-07 Load test suite', () => {
  afterEach(() => vi.useRealTimers());
  it('handles concurrent and sustained scan load', async () => {
    vi.useFakeTimers();

    const { service, scansStore } = makeService();
    const startTimes = new Map<string, number>();
    const durations: number[] = [];

    // 1. 50 concurrent scans
    const concurrentPromises = Array.from({ length: 50 }).map(() =>
      service.create({ orgId: ORG_ID, repositoryId: REPO_ID }).then((res) => {
        startTimes.set(res.scanId, Date.now());
        return res.scanId;
      }),
    );
    const concurrentIds = await Promise.all(concurrentPromises);

    await vi.advanceTimersByTimeAsync(3_000);

    for (const id of concurrentIds) {
      const scan = scansStore.get(id);
      expect(scan).toBeDefined();
      if (!scan) throw new Error(`Missing scan ${id}`);
      expect(scan.status).toBe('completed');
      const duration = scan.completedAt!.getTime() - startTimes.get(id)!;
      durations.push(duration);
    }

    // 2. Sustained load: 10 scans / minute
    const sustainedIds: string[] = [];
    let created = 0;
    const interval = setInterval(() => {
      created++;
      service.create({ orgId: ORG_ID, repositoryId: REPO_ID }).then((res) => {
        startTimes.set(res.scanId, Date.now());
        sustainedIds.push(res.scanId);
      });
      if (created >= 10) {
        clearInterval(interval);
      }
    }, 6_000);

    await vi.advanceTimersByTimeAsync(61_000);
    await vi.advanceTimersByTimeAsync(3_000);

    for (const id of sustainedIds) {
      const scan = scansStore.get(id);
      expect(scan).toBeDefined();
      if (!scan) throw new Error(`Missing scan ${id}`);
      expect(scan.status).toBe('completed');
      const duration = scan.completedAt!.getTime() - startTimes.get(id)!;
      durations.push(duration);
    }

    // Assertions
    const p95Duration = p95(durations);
    const tenMinutesMs = 10 * 60 * 1_000;
    expect(p95Duration).toBeLessThanOrEqual(tenMinutesMs);

    const anyFailed = [...scansStore.values()].some((s) => s.status === 'failed');
    expect(anyFailed).toBe(false);

    expect(concurrentIds.length).toBe(50);
    expect(sustainedIds.length).toBe(10);

    vi.useRealTimers();
  }, 200_000);
});
