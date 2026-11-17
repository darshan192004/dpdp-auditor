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
        { pending: async () => [report] } as unknown as ConstructorParameters<
          typeof ReportsService
        >[0],
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
});
