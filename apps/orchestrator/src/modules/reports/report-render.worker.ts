import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
import { ReportStorageService } from './report-storage.service.js';
import { ReportsService } from './reports.service.js';

export const REPORT_RENDER_QUEUE: QueueName = 'report.render';

/** P5-17: In-process renderer worker (stub). Generates a dummy PDF and calls complete. */
export function createReportRenderWorker(
  env: Env,
  reports: ReportsService,
  storage: ReportStorageService,
): Worker {
  const worker = new Worker(
    REPORT_RENDER_QUEUE,
    async (job: Job) => {
      const { reportId, orgId } = job.data as {
        reportId: string;
        orgId: string;
      };

      // Dummy PDF buffer (P5-17 stub; real implementation uses Puppeteer)
      const pdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF',
        'utf8',
      );

      // P5-19: upload to storage, compute SHA-256 + size
      const upload = storage.upload(reportId, pdfBuffer);

      // Mark report ready
      await reports.complete(orgId, reportId, { buffer: pdfBuffer.toString('base64') });

      logger.info({ reportId, storageKey: upload.storageKey }, 'report rendered');
      return true;
    },
    {
      connection: redisConnectionOptions(env),
      settings: WORKER_SETTINGS,
    },
  );

  worker.on('error', (error: Error) => logger.error({ err: error }, 'report.render worker error'));

  worker.on('failed', async (job: Job | undefined, error: Error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const { reportId } = (job?.data ?? {}) as { reportId?: string };
    if (reportId) {
      try {
        await reports.markFailed(reportId, 'Rendering failed.');
      } catch {
        logger.error({ err: error, reportId }, 'failed to mark report as failed');
      }
    }
  });

  return worker;
}

/** Started explicitly from main.ts so tests never dial Redis. */
@Injectable()
export class ReportRenderRunner implements OnApplicationShutdown {
  private worker?: Worker;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reports: ReportsService,
    private readonly storage: ReportStorageService,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.worker = createReportRenderWorker(this.env, this.reports, this.storage);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
