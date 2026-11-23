import { Worker, QueueEvents, UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createReportRenderWorker } from '../../src/modules/reports/report-render.worker.js';
import type { ReportStorageService } from '../../src/modules/reports/report-storage.service.js';
import type { Env } from '../../src/config/env.js';
import { ReportsService } from '../../src/modules/reports/reports.service.js';
import { QueueService } from '../../src/queue/queue.service.js';
import { redisConnectionOptions } from '../../src/queue/queues.js';

const redisUrl = process.env.REDIS_TEST_URL || null;

(redisUrl ? describe : describe.skip)('retained report job recovery', () => {
  it('retries a retained failed render ID instead of leaving the queued report stuck', async () => {
    const env = { REDIS_URL: redisUrl! } as Env;
    const queueService = new QueueService(env);
    const queue = queueService.queue('report.render');
    const events = new QueueEvents('report.render', { connection: redisConnectionOptions(env) });
    let firstAttempt = true;
    const worker = new Worker(
      'report.render',
      async () => {
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error('database unavailable');
        }
        return 'render recovered';
      },
      { connection: redisConnectionOptions(env) },
    );
    const report = {
      id: `report-recovery-${Date.now()}`,
      orgId: 'org',
      scanId: 'scan',
      templateVersion: 'standard',
    };
    try {
      await events.waitUntilReady();
      const job = await queue.add(
        'render',
        { reportId: report.id },
        { jobId: report.id, attempts: 1, removeOnFail: false },
      );
      await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow('database unavailable');
      expect(await job.getState()).toBe('failed');
      const service = new ReportsService(
        {
          pending: async () => [report],
          rendering: async () => [],
        } as unknown as ConstructorParameters<typeof ReportsService>[0],
        {} as ConstructorParameters<typeof ReportsService>[1],
        {} as ConstructorParameters<typeof ReportsService>[2],
        {} as ConstructorParameters<typeof ReportsService>[3],
        queueService,
        {} as ConstructorParameters<typeof ReportsService>[5],
        {} as ConstructorParameters<typeof ReportsService>[6],
        {} as ConstructorParameters<typeof ReportsService>[7],
      );
      await service.recoverQueued();
      expect(await job.waitUntilFinished(events, 10_000)).toBe('render recovered');
      expect((await queue.getJob(report.id))?.id).toBe(job.id);
    } finally {
      await worker.close();
      await events.close();
      await (await queue.getJob(report.id))?.remove();
      await queueService.onModuleDestroy();
    }
  });
  it('marks an unrecoverable render failure failed before the retry budget is exhausted', async () => {
    const env = { REDIS_URL: redisUrl! } as Env;
    const queueService = new QueueService(env);
    const queue = queueService.queue('report.render');
    const events = new QueueEvents('report.render', { connection: redisConnectionOptions(env) });
    const reportId = `report-unrecoverable-${Date.now()}`;
    const reports = {
      markRendering: vi.fn().mockRejectedValue(new UnrecoverableError('terminal render failure')),
      viewModel: vi.fn(),
      complete: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const worker = createReportRenderWorker(
      env,
      reports as unknown as ReportsService,
      {} as ReportStorageService,
    );
    try {
      await events.waitUntilReady();
      await worker.waitUntilReady();
      const job = await queue.add(
        'render',
        { reportId, orgId: 'org' },
        { jobId: reportId, attempts: 3, removeOnFail: false },
      );
      await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(
        'terminal render failure',
      );
      const failed = await queue.getJob(reportId);
      expect(await failed?.getState()).toBe('failed');
      expect(failed?.attemptsMade).toBe(1);
      expect(failed?.opts.attempts).toBe(3);
      // The worker's asynchronous failed listener runs separately from QueueEvents.
      await expect
        .poll(() => reports.markFailed.mock.calls)
        .toEqual([[reportId, 'Rendering failed.']]);
      expect(reports.viewModel).not.toHaveBeenCalled();
      expect(reports.complete).not.toHaveBeenCalled();
    } finally {
      await worker.close();
      await events.close();
      await (await queue.getJob(reportId))?.remove();
      await queueService.onModuleDestroy();
    }
  });
  it('reconciles a retained terminal failure after the failure listener loses its database write', async () => {
    const env = { REDIS_URL: redisUrl! } as Env;
    const queueService = new QueueService(env);
    const queue = queueService.queue('report.render');
    const enqueue = vi.spyOn(queueService, 'enqueue');
    const events = new QueueEvents('report.render', { connection: redisConnectionOptions(env) });
    const reportId = `report-reconcile-${Date.now()}`;
    let status = 'rendering';
    const repository = {
      pending: async () => [],
      rendering: async () => (status === 'rendering' ? [{ id: reportId, orgId: 'org' }] : []),
      markFailed: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockImplementation(async () => {
          status = 'failed';
        }),
    };
    const service = new ReportsService(
      repository as unknown as ConstructorParameters<typeof ReportsService>[0],
      {} as ConstructorParameters<typeof ReportsService>[1],
      {} as ConstructorParameters<typeof ReportsService>[2],
      {} as ConstructorParameters<typeof ReportsService>[3],
      queueService,
      {} as ConstructorParameters<typeof ReportsService>[5],
      {} as ConstructorParameters<typeof ReportsService>[6],
      {} as ConstructorParameters<typeof ReportsService>[7],
    );
    vi.spyOn(service, 'markRendering').mockRejectedValue(
      new UnrecoverableError('terminal render failure'),
    );
    const complete = vi.spyOn(service, 'complete');
    const worker = createReportRenderWorker(env, service, {} as ReportStorageService);
    try {
      await events.waitUntilReady();
      await worker.waitUntilReady();
      const job = await queue.add(
        'render',
        { reportId, orgId: 'org' },
        { jobId: reportId, attempts: 3, removeOnFail: false },
      );
      await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(
        'terminal render failure',
      );
      // A Redis failure event does not await the worker's asynchronous listener.
      await expect.poll(() => repository.markFailed.mock.calls.length, { timeout: 10_000 }).toBe(1);
      expect(status).toBe('rendering');
      expect(await job.getState()).toBe('failed');
      await service.recoverQueued();
      expect(status).toBe('failed');
      expect(repository.markFailed).toHaveBeenCalledTimes(2);
      expect(repository.markFailed).toHaveBeenLastCalledWith(reportId, 'Rendering failed.');
      await service.recoverQueued();
      expect(repository.markFailed).toHaveBeenCalledTimes(2);
      expect(enqueue).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
    } finally {
      await worker.close();
      await events.close();
      await (await queue.getJob(reportId))?.remove();
      await queueService.onModuleDestroy();
    }
  });
  it('leaves waiting, active, delayed and completed render jobs unchanged during reconciliation', async () => {
    const env = { REDIS_URL: redisUrl! } as Env;
    const queueService = new QueueService(env);
    const queue = queueService.queue('report.render');
    const enqueue = vi.spyOn(queueService, 'enqueue');
    const events = new QueueEvents('report.render', { connection: redisConnectionOptions(env) });
    const prefix = `report-states-${Date.now()}`;
    const ids = ['completed', 'active', 'waiting', 'delayed'].map((state) => `${prefix}-${state}`);
    let releaseActive: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });
    const worker = new Worker(
      'report.render',
      async (job) => {
        if (job.name === 'hold') {
          await gate;
        }
        return true;
      },
      { connection: redisConnectionOptions(env), concurrency: 1 },
    );
    const repository = {
      pending: async () => [],
      rendering: async () =>
        ids.map((id) => ({ id, orgId: 'org', scanId: 'scan', templateVersion: 'standard' })),
      markFailed: vi.fn(),
    };
    const service = new ReportsService(
      repository as unknown as ConstructorParameters<typeof ReportsService>[0],
      {} as ConstructorParameters<typeof ReportsService>[1],
      {} as ConstructorParameters<typeof ReportsService>[2],
      {} as ConstructorParameters<typeof ReportsService>[3],
      queueService,
      {} as ConstructorParameters<typeof ReportsService>[5],
      {} as ConstructorParameters<typeof ReportsService>[6],
      {} as ConstructorParameters<typeof ReportsService>[7],
    );
    try {
      await events.waitUntilReady();
      await worker.waitUntilReady();
      const completed = await queue.add('render', {}, { jobId: ids[0]! });
      await completed.waitUntilFinished(events, 10_000);
      const active = await queue.add('hold', {}, { jobId: ids[1]! });
      await expect.poll(() => active.getState(), { timeout: 10_000 }).toBe('active');
      const waiting = await queue.add('render', {}, { jobId: ids[2]! });
      const delayed = await queue.add('render', {}, { jobId: ids[3]!, delay: 60_000 });
      expect(await completed.getState()).toBe('completed');
      expect(await active.getState()).toBe('active');
      expect(await waiting.getState()).toBe('waiting');
      expect(await delayed.getState()).toBe('delayed');
      await service.recoverQueued();
      expect(repository.markFailed).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
      expect(await completed.getState()).toBe('completed');
      expect(await active.getState()).toBe('active');
      expect(await waiting.getState()).toBe('waiting');
      expect(await delayed.getState()).toBe('delayed');
    } finally {
      releaseActive();
      await worker.close();
      await events.close();
      for (const id of ids) await (await queue.getJob(id))?.remove();
      await queueService.onModuleDestroy();
    }
  });
  it('recreates a removed failed render job with the existing report ID and preserves a ready-state race', async () => {
    const env = { REDIS_URL: redisUrl! } as Env;
    const queueService = new QueueService(env);
    const queue = queueService.queue('report.render');
    const enqueue = vi.spyOn(queueService, 'enqueue');
    const events = new QueueEvents('report.render', { connection: redisConnectionOptions(env) });
    const report = {
      id: `report-removed-${Date.now()}`,
      orgId: 'org',
      scanId: 'scan',
      templateVersion: 'standard',
    };
    let status = 'rendering';
    let firstAttempt = true;
    const processedIds: (string | undefined)[] = [];
    const worker = new Worker(
      'report.render',
      async (job) => {
        processedIds.push(job.id);
        if (firstAttempt) {
          firstAttempt = false;
          throw new UnrecoverableError('terminal failure removed from Redis');
        }
        expect(status).toBe('queued');
        status = 'ready';
        return 'ready';
      },
      { connection: redisConnectionOptions(env) },
    );
    const repository = {
      pending: async () => [],
      rendering: vi.fn(async () => (status === 'rendering' ? [report] : [])),
      requeueRendering: vi.fn(async () => {
        if (status !== 'rendering') return { count: 0 };
        status = 'queued';
        return { count: 1 };
      }),
      markFailed: vi.fn(),
      create: vi.fn(),
      reserve: vi.fn(),
      countCreatedSince: vi.fn(),
    };
    const service = new ReportsService(
      repository as unknown as ConstructorParameters<typeof ReportsService>[0],
      {} as ConstructorParameters<typeof ReportsService>[1],
      {} as ConstructorParameters<typeof ReportsService>[2],
      {} as ConstructorParameters<typeof ReportsService>[3],
      queueService,
      {} as ConstructorParameters<typeof ReportsService>[5],
      {} as ConstructorParameters<typeof ReportsService>[6],
      {} as ConstructorParameters<typeof ReportsService>[7],
    );
    try {
      await events.waitUntilReady();
      await worker.waitUntilReady();
      const failed = await queue.add(
        'render',
        { reportId: report.id },
        { jobId: report.id, attempts: 3, removeOnFail: true },
      );
      await expect(failed.waitUntilFinished(events, 10_000)).rejects.toThrow();
      await expect.poll(() => queue.getJob(report.id), { timeout: 10_000 }).toBeUndefined();
      expect(status).toBe('rendering');
      await service.recoverQueued();
      const recovered = await queue.getJob(report.id);
      expect(recovered?.id).toBe(report.id);
      expect(await recovered?.waitUntilFinished(events, 10_000)).toBe('ready');
      expect(status).toBe('ready');
      expect(processedIds).toEqual([report.id, report.id]);
      expect(enqueue).toHaveBeenCalledExactlyOnceWith(
        'report.render',
        'render',
        {
          reportId: report.id,
          orgId: report.orgId,
          scanId: report.scanId,
          template: report.templateVersion,
        },
        { jobId: report.id },
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.reserve).not.toHaveBeenCalled();
      expect(repository.countCreatedSince).not.toHaveBeenCalled();
      expect(repository.markFailed).not.toHaveBeenCalled();

      // A stale rendering snapshot loses the compare-and-set after readiness commits.
      repository.rendering.mockResolvedValue([{ ...report, id: `${report.id}-ready-race` }]);
      await service.recoverQueued();
      expect(repository.requeueRendering).toHaveBeenLastCalledWith(`${report.id}-ready-race`);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(status).toBe('ready');
    } finally {
      await worker.close();
      await events.close();
      await (await queue.getJob(report.id))?.remove();
      await queueService.onModuleDestroy();
    }
  });
});
