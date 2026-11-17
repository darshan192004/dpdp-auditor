import { Worker, QueueEvents } from 'bullmq';
import { describe, expect, it } from 'vitest';
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
});
