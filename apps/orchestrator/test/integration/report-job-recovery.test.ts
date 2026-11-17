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
  it('leaves waiting, active, completed and missing render jobs unchanged during reconciliation', async () => {
    const env = { REDIS_URL: redisUrl! } as Env;
    const queueService = new QueueService(env);
    const queue = queueService.queue('report.render');
    const enqueue = vi.spyOn(queueService, 'enqueue');
    const events = new QueueEvents('report.render', { connection: redisConnectionOptions(env) });
    const prefix = `report-states-${Date.now()}`;
    const ids = ['completed', 'active', 'waiting', 'missing'].map((state) => `${prefix}-${state}`);
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
      rendering: async () => ids.map((id) => ({ id, orgId: 'org' })),
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
      expect(await completed.getState()).toBe('completed');
      expect(await active.getState()).toBe('active');
      expect(await waiting.getState()).toBe('waiting');
      expect(await queue.getJob(ids[3]!)).toBeUndefined();
      await service.recoverQueued();
      expect(repository.markFailed).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
      expect(await completed.getState()).toBe('completed');
      expect(await active.getState()).toBe('active');
      expect(await waiting.getState()).toBe('waiting');
      expect(await queue.getJob(ids[3]!)).toBeUndefined();
    } finally {
      releaseActive();
      await worker.close();
      await events.close();
      for (const id of ids) await (await queue.getJob(id))?.remove();
      await queueService.onModuleDestroy();
    }
  });
});
